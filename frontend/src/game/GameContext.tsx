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
  effectiveReward,
  generateBoardContract,
  grantXp,
  jobDurationMs,
  machineSlots,
  normalizeState,
  readyScrap,
  tickContracts,
  tickMachineShop,
  trackCost,
  trackMaxed,
} from "./engine";
import { BuildingKey, GameState, JobType, OfflineSummary, TrackKey } from "./types";

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
  upgradeTrack: (building: BuildingKey, track: TrackKey) => void;
  fulfillContract: (id: string) => void;
  refreshContract: (id: string) => void;
  markTutorialSeen: () => void;
  resetGame: () => void;
  grantCoins: (amount?: number) => void;
  resetUpgrades: () => void;
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

  const showToast = useCallback((msg: string) => setToast({ msg, key: Date.now() }), []);

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

      let chosen: any = null;
      const localTs = localRaw?.last_seen_ts ?? 0;
      const remoteTs = remoteRaw?.last_seen_ts ?? 0;
      if (localRaw && remoteRaw) chosen = localTs >= remoteTs ? localRaw : remoteRaw;
      else chosen = localRaw ?? remoteRaw;

      const base = chosen ? normalizeState(chosen, nowTs, cfg) : createDefaultState(nowTs, cfg);
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
      let s = tickMachineShop(cur, configRef.current, t);
      s = tickContracts(s, configRef.current, t);
      if (s !== cur) {
        setState(s);
        stateRef.current = s;
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ---- persistence ----
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
      return {
        ...prev,
        resources: { ...prev.resources, scrap: prev.resources.scrap + ready },
        buildings: { ...prev.buildings, scrap_yard: { ...sy, baseline_ts: Date.now() } },
      };
    });
  }, [showToast]);

  const startJob = useCallback(
    (type: JobType) => {
      setState((prev) => {
        if (!prev) return prev;
        const cfg = configRef.current;
        const ms = prev.buildings.machine_shop;
        if (ms.jobs.length >= machineSlots(ms, cfg)) {
          showToast("All production slots are busy");
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
              jobs: [...ms.jobs, { type, start_ts: Date.now(), duration_ms: jobDurationMs(cfg, type, ms) }],
            },
          },
        };
      });
    },
    [showToast]
  );

  const upgradeTrack = useCallback(
    (building: BuildingKey, track: TrackKey) => {
      setState((prev) => {
        if (!prev) return prev;
        const cfg = configRef.current;
        const b: any = prev.buildings[building];
        const level = b.upgrades[track];
        if (trackMaxed(cfg, building, track, level)) {
          showToast("Already max level");
          return prev;
        }
        const cost = trackCost(cfg, building, track, level);
        if (prev.resources.coins < cost) {
          showToast(`Need ${cost} Coins`);
          return prev;
        }
        haptic("success");
        const nb: any = { ...b, upgrades: { ...b.upgrades, [track]: level + 1 } };
        if (building === "scrap_yard" && track === "speed") nb.baseline_ts = Date.now();
        return {
          ...prev,
          resources: { ...prev.resources, coins: prev.resources.coins - cost },
          buildings: { ...prev.buildings, [building]: nb },
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
        const isEmergency = prev.emergency?.id === id;
        const contract = isEmergency ? prev.emergency! : prev.contracts.find((c) => c.id === id);
        if (!contract) return prev;
        if (!canFulfill(prev, contract)) {
          haptic("error");
          showToast("Not enough resources");
          return prev;
        }
        haptic("success");
        const depot = prev.buildings.shipping_depot;
        const reward = effectiveReward(contract, depot, cfg);
        const resources = { ...prev.resources } as any;
        contract.requirements.forEach((r) => (resources[r.resource] -= r.qty));
        resources.coins += reward.coins;

        const next: GameState = {
          ...prev,
          resources,
          contracts: isEmergency
            ? prev.contracts
            : prev.contracts.map((c) => (c.id === id ? generateBoardContract(prev.level, cfg, depot) : c)),
          emergency: isEmergency ? null : prev.emergency,
          emergency_next_check_ts: isEmergency
            ? Date.now() + cfg.contracts.emergency.check_interval_seconds * 1000
            : prev.emergency_next_check_ts,
          restoration_points: Math.min(cfg.restoration_goal, prev.restoration_points + reward.restoration),
        };
        const levels = grantXp(next, reward.xp, cfg);
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
      const cfg = configRef.current;
      const depot = prev.buildings.shipping_depot;
      return {
        ...prev,
        contracts: prev.contracts.map((c) => (c.id === id ? generateBoardContract(prev.level, cfg, depot) : c)),
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

  const grantCoins = useCallback(
    (amount?: number) => {
      setState((prev) => {
        if (!prev) return prev;
        const amt = amount ?? configRef.current.dev.grant_coins_amount;
        haptic("success");
        showToast(`+${amt} Coins granted`);
        return { ...prev, resources: { ...prev.resources, coins: prev.resources.coins + amt } };
      });
    },
    [showToast]
  );

  const resetUpgrades = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      haptic("success");
      showToast("Upgrades reset to Level 1");
      return {
        ...prev,
        buildings: {
          scrap_yard: { ...prev.buildings.scrap_yard, baseline_ts: Date.now(), upgrades: { speed: 1, storage: 1 } },
          machine_shop: { ...prev.buildings.machine_shop, upgrades: { speed: 1, slots: 1 } },
          shipping_depot: { upgrades: { rewards: 1, quality: 1 } },
        },
      };
    });
  }, [showToast]);

  const clearOfflineSummary = useCallback(() => {
    haptic("heavy");
    setOfflineSummary(null);
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      loading, now, config, state, offlineSummary, levelUpFlash,
      clearOfflineSummary, collectScrap, startJob, upgradeTrack, fulfillContract,
      refreshContract, markTutorialSeen, resetGame, grantCoins, resetUpgrades, showToast, playerId,
    }),
    [
      loading, now, config, state, offlineSummary, levelUpFlash,
      clearOfflineSummary, collectScrap, startJob, upgradeTrack, fulfillContract,
      refreshContract, markTutorialSeen, resetGame, grantCoins, resetUpgrades, showToast, playerId,
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
  toastWrap: { position: "absolute", bottom: 110, left: 0, right: 0, alignItems: "center" },
  toast: {
    backgroundColor: COLORS.surfaceInverse,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.pill,
    maxWidth: "88%",
    ...SHADOW.card,
  },
  toastText: { color: COLORS.onSurfaceInverse, fontSize: FONT.base, fontWeight: "700", textAlign: "center" },
});
