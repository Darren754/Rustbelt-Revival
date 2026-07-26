import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef as reactUseRef,
  useState,
} from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { storage } from "@/src/utils/storage";
import { COLORS, RADIUS, SPACING, FONT, SHADOW } from "@/src/theme/theme";
import { DEFAULT_CONFIG, GameConfig } from "./config";
import { fetchConfig, loadRemote, saveRemote } from "./api";
import {
  canFulfill,
  computeOffline,
  createDefaultState,
  generateContract,
  grantXp,
  isMaxLevel,
  jobDurationMs,
  normalizeState,
  readyScrap,
  scrapIntervalMs,
  tickMachineShop,
  upgradeCost,
} from "./engine";
import { Contract, GameState, JobType, OfflineSummary } from "./types";

const PLAYER_ID_KEY = "rbr_player_id";
const SAVE_KEY = "rbr_save_v1";

function haptic(kind: "light" | "success" | "heavy" | "selection" | "error") {
  try {
    if (kind === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else if (kind === "heavy") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (kind === "selection") Haptics.selectionAsync();
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

interface GameContextValue {
  loading: boolean;
  now: number;
  config: GameConfig;
  state: GameState | null;
  offlineSummary: OfflineSummary | null;
  levelUpFlash: number;
  clearOfflineSummary: () => void;
  collectScrap: () => void;
  startJob: (type: JobType) => void;
  upgradeBuilding: (building: "scrap_yard" | "machine_shop") => void;
  fulfillContract: (id: string) => void;
  refreshContract: (id: string) => void;
  markTutorialSeen: () => void;
  resetGame: () => void;
  showToast: (msg: string) => void;
  playerId: string | null;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<GameState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [offlineSummary, setOfflineSummary] = useState<OfflineSummary | null>(null);
  const [levelUpFlash, setLevelUpFlash] = useState(0);
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const configRef = reactUseRef<GameConfig>(DEFAULT_CONFIG);
  const stateRef = reactUseRef<GameState | null>(null);
  const playerIdRef = reactUseRef<string | null>(null);
  const remoteSaveTimer = reactUseRef<any>(null);

  configRef.current = config;
  stateRef.current = state;
  playerIdRef.current = playerId;

  const showToast = useCallback((msg: string) => {
    setToast({ msg, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- boot ----
  useEffect(() => {
    (async () => {
      const nowTs = Date.now();
      let pid = await storage.getItem<string>(PLAYER_ID_KEY, "");
      if (!pid) {
        pid = `p_${nowTs.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        await storage.setItem(PLAYER_ID_KEY, pid);
      }
      setPlayerId(pid);

      const cfg = await fetchConfig();
      setConfig(cfg);
      configRef.current = cfg;

      const localRaw = await storage.getItem<any>(SAVE_KEY, null);
      const remote = await loadRemote(pid);
      const remoteRaw = remote?.state ?? null;

      // pick the freshest save
      let chosen: any = null;
      const localTs = localRaw?.last_seen_ts ?? 0;
      const remoteTs = remoteRaw?.last_seen_ts ?? 0;
      if (localRaw && remoteRaw) chosen = localTs >= remoteTs ? localRaw : remoteRaw;
      else chosen = localRaw ?? remoteRaw;

      let base: GameState;
      if (chosen) base = normalizeState(chosen, nowTs, cfg);
      else base = createDefaultState(nowTs, cfg);

      const { state: afterOffline, summary } = computeOffline(base, cfg, nowTs);
      afterOffline.last_seen_ts = nowTs;
      setState(afterOffline);
      stateRef.current = afterOffline;
      if (summary) setOfflineSummary(summary);
      setNow(nowTs);
      setLoading(false);
    })();
  }, []);

  // ---- tick loop ----
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const cur = stateRef.current;
      if (!cur) return;
      const ticked = tickMachineShop(cur, configRef.current, t);
      if (ticked !== cur) {
        setState(ticked);
        stateRef.current = ticked;
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ---- persistence (local immediate, remote debounced) ----
  const persist = useCallback((s: GameState) => {
    const withSeen = { ...s, last_seen_ts: Date.now() };
    storage.setItem(SAVE_KEY, withSeen as any);
    if (remoteSaveTimer.current) clearTimeout(remoteSaveTimer.current);
    remoteSaveTimer.current = setTimeout(() => {
      const pid = playerIdRef.current;
      if (pid) saveRemote(pid, withSeen);
    }, 2500);
  }, []);

  useEffect(() => {
    if (!loading && state) persist(state);
  }, [state, loading, persist]);

  // ---- save on background ----
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        const s = stateRef.current;
        const pid = playerIdRef.current;
        if (s && pid) {
          const withSeen = { ...s, last_seen_ts: Date.now() };
          storage.setItem(SAVE_KEY, withSeen as any);
          saveRemote(pid, withSeen);
        }
      }
    });
    return () => sub.remove();
  }, []);

  // ---- actions ----
  const collectScrap = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const cfg = configRef.current;
      const sy = prev.buildings.scrap_yard;
      const ready = readyScrap(sy, cfg, Date.now());
      if (ready <= 0) {
        showToast("Nothing to collect yet");
        return prev;
      }
      haptic("success");
      const interval = scrapIntervalMs(sy, cfg);
      const consumed = Math.floor(ready / cfg.scrap_yard.produce) * interval;
      return {
        ...prev,
        resources: { ...prev.resources, scrap: prev.resources.scrap + ready },
        buildings: {
          ...prev.buildings,
          scrap_yard: { ...sy, baseline_ts: sy.baseline_ts + consumed },
        },
      };
    });
  }, [showToast]);

  const startJob = useCallback(
    (type: JobType) => {
      setState((prev) => {
        if (!prev) return prev;
        const cfg = configRef.current;
        const ms = prev.buildings.machine_shop;
        if (ms.job) {
          showToast("Machine Shop is busy");
          return prev;
        }
        const recipe = cfg.machine_shop[type];
        const cost = recipe.cost as Record<string, number>;
        for (const k of Object.keys(cost)) {
          if ((prev.resources as any)[k] < cost[k]) {
            showToast(`Need ${cost[k]} ${k === "scrap" ? "Scrap" : "Components"}`);
            return prev;
          }
        }
        haptic("light");
        const resources = { ...prev.resources } as any;
        for (const k of Object.keys(cost)) resources[k] -= cost[k];
        return {
          ...prev,
          resources,
          buildings: {
            ...prev.buildings,
            machine_shop: {
              ...ms,
              job: {
                type,
                start_ts: Date.now(),
                duration_ms: jobDurationMs(type, ms.level, cfg),
              },
            },
          },
        };
      });
    },
    [showToast]
  );

  const upgradeBuilding = useCallback(
    (building: "scrap_yard" | "machine_shop") => {
      setState((prev) => {
        if (!prev) return prev;
        const cfg = configRef.current;
        const b = prev.buildings[building];
        if (isMaxLevel(b.level, cfg)) {
          showToast("Already max level");
          return prev;
        }
        const cost = upgradeCost(b.level, cfg);
        if (prev.resources.coins < cost) {
          showToast(`Need ${cost} Coins`);
          return prev;
        }
        haptic("success");
        const nowTs = Date.now();
        const buildings = { ...prev.buildings };
        if (building === "scrap_yard") {
          // reset accrual anchor so the faster interval applies cleanly
          buildings.scrap_yard = { ...buildings.scrap_yard, level: b.level + 1, baseline_ts: nowTs };
        } else {
          buildings.machine_shop = { ...buildings.machine_shop, level: b.level + 1 };
        }
        return {
          ...prev,
          resources: { ...prev.resources, coins: prev.resources.coins - cost },
          buildings,
        };
      });
    },
    [showToast]
  );

  const fulfillContract = useCallback(
    (id: string) => {
      setState((prev) => {
        if (!prev) return prev;
        const cfg = configRef.current;
        const contract = prev.contracts.find((c) => c.id === id);
        if (!contract) return prev;
        if (!canFulfill(prev, contract)) {
          haptic("error");
          showToast("Not enough resources");
          return prev;
        }
        haptic("success");
        const resources = { ...prev.resources } as any;
        contract.requirements.forEach((r) => (resources[r.resource] -= r.qty));
        resources.coins += contract.reward_coins;

        const next: GameState = {
          ...prev,
          resources,
          contracts: prev.contracts.map((c) =>
            c.id === id ? generateContract(prev.level, cfg) : c
          ),
          restoration_points: Math.min(
            cfg.restoration_goal,
            prev.restoration_points + contract.reward_restoration
          ),
        };
        const levels = grantXp(next, contract.reward_xp, cfg);
        if (levels > 0) {
          haptic("heavy");
          setLevelUpFlash(Date.now());
        }
        if (!next.town_hall_restored && next.restoration_points >= cfg.restoration_goal) {
          next.town_hall_restored = true;
          haptic("heavy");
        }
        return next;
      });
    },
    [showToast]
  );

  const refreshContract = useCallback((id: string) => {
    setState((prev) => {
      if (!prev) return prev;
      haptic("selection");
      return {
        ...prev,
        contracts: prev.contracts.map((c) =>
          c.id === id ? generateContract(prev.level, configRef.current) : c
        ),
      };
    });
  }, []);

  const markTutorialSeen = useCallback(() => {
    setState((prev) => (prev ? { ...prev, tutorial_seen: true } : prev));
  }, []);

  const resetGame = useCallback(() => {
    const nowTs = Date.now();
    const fresh = createDefaultState(nowTs, configRef.current);
    setState(fresh);
    stateRef.current = fresh;
    setOfflineSummary(null);
    haptic("success");
    showToast("New town started");
  }, [showToast]);

  const clearOfflineSummary = useCallback(() => {
    haptic("heavy");
    setOfflineSummary(null);
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      loading,
      now,
      config,
      state,
      offlineSummary,
      levelUpFlash,
      clearOfflineSummary,
      collectScrap,
      startJob,
      upgradeBuilding,
      fulfillContract,
      refreshContract,
      markTutorialSeen,
      resetGame,
      showToast,
      playerId,
    }),
    [
      loading,
      now,
      config,
      state,
      offlineSummary,
      levelUpFlash,
      clearOfflineSummary,
      collectScrap,
      startJob,
      upgradeBuilding,
      fulfillContract,
      refreshContract,
      markTutorialSeen,
      resetGame,
      showToast,
      playerId,
    ]
  );

  return (
    <GameContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {toast && (
          <View pointerEvents="none" style={styles.toastWrap} testID="game-toast">
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toast.msg}</Text>
            </View>
          </View>
        )}
      </View>
    </GameContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastWrap: {
    position: "absolute",
    bottom: 110,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    backgroundColor: COLORS.surfaceInverse,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.pill,
    maxWidth: "88%",
    ...SHADOW.card,
  },
  toastText: {
    color: COLORS.onSurfaceInverse,
    fontSize: FONT.base,
    fontWeight: "700",
    textAlign: "center",
  },
});
