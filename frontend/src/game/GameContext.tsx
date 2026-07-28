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
import LandmarkModal, { LandmarkUnlock } from "@/src/components/LandmarkModal";
import { DEFAULT_CONFIG, GameConfig } from "./config";
import { fetchConfig, loadRemote, saveRemote } from "./api";
import {
  canFulfill,
  computeOffline,
  createAnalytics,
  createDefaultState,
  effectiveReward,
  generateBoardContract,
  generateEmergency,
  grantXp,
  jobDurationMs,
  machineSlots,
  milestoneRewardBuffPct,
  normalizeState,
  readyScrap,
  scrapCapacity,
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
  grantMaterials: () => void;
  grantLevel: () => void;
  forceEmergency: () => void;
  resetUpgrades: () => void;
  resetTracking: () => void;
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
  const [landmarkUnlock, setLandmarkUnlock] = useState<LandmarkUnlock | null>(null);
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const configRef = reactUseRef<GameConfig>(DEFAULT_CONFIG);
  const stateRef = reactUseRef<GameState | null>(null);
  const playerIdRef = reactUseRef<string | null>(null);
  const remoteSaveTimer = reactUseRef<any>(null);
  const analyticsAccumRef = reactUseRef({ idle_ms: 0, slot_active_ms: 0, storage_full_inc: 0, scrap_full: false, last_ts: Date.now() });

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
      // analytics time accumulation (ref only — folded into state every 2s)
      const acc = analyticsAccumRef.current;
      const dt = Math.min(2000, t - acc.last_ts);
      acc.last_ts = t;
      const jobs = cur.buildings.machine_shop.jobs.length;
      if (jobs === 0) acc.idle_ms += dt;
      else acc.slot_active_ms += jobs * dt;
      const ready = readyScrap(cur.buildings.scrap_yard, configRef.current, t);
      const cap = scrapCapacity(cur.buildings.scrap_yard, configRef.current);
      if (ready >= cap) {
        if (!acc.scrap_full) {
          acc.storage_full_inc += 1;
          acc.scrap_full = true;
        }
      } else acc.scrap_full = false;

      let s = tickMachineShop(cur, configRef.current, t);
      s = tickContracts(s, configRef.current, t);
      if (s !== cur) {
        setState(s);
        stateRef.current = s;
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ---- analytics fold (ref -> state every 2s; also detects resource/level firsts) ----
  useEffect(() => {
    const id = setInterval(() => {
      const acc = analyticsAccumRef.current;
      setState((prev) => {
        if (!prev) return prev;
        const a = prev.analytics;
        const rel = Date.now() - a.session_start_ts;
        const firsts = { ...a.firsts };
        if (firsts.scrap == null && prev.resources.scrap > 0) firsts.scrap = rel;
        if (firsts.component == null && prev.resources.components > 0) firsts.component = rel;
        if (firsts.finished_good == null && prev.resources.finished_goods > 0) firsts.finished_good = rel;
        if (firsts.level2 == null && prev.level >= 2) firsts.level2 = rel;
        if (!acc.idle_ms && !acc.slot_active_ms && !acc.storage_full_inc && firsts === a.firsts) return prev;
        const next: GameState = {
          ...prev,
          analytics: {
            ...a,
            firsts,
            machine_idle_ms: a.machine_idle_ms + acc.idle_ms,
            slot_active_ms: a.slot_active_ms + acc.slot_active_ms,
            storage_full_count: a.storage_full_count + acc.storage_full_inc,
          },
        };
        acc.idle_ms = 0;
        acc.slot_active_ms = 0;
        acc.storage_full_inc = 0;
        stateRef.current = next;
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // ---- persistence: local on change; remote on a fixed interval (decoupled from
  // change frequency so analytics ticks never starve cloud saves) + on background ----
  useEffect(() => {
    if (!loading && state) {
      storage.setItem(SAVE_KEY, { ...state, last_seen_ts: Date.now() } as any);
    }
  }, [state, loading]);

  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current;
      const pid = playerIdRef.current;
      if (s && pid) saveRemote(pid, { ...s, last_seen_ts: Date.now() });
    }, 8000);
    return () => clearInterval(id);
  }, []);

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
        analytics: { ...prev.analytics, produced: { ...prev.analytics.produced, scrap: prev.analytics.produced.scrap + ready } },
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
        const rel = Date.now() - prev.analytics.session_start_ts;
        return {
          ...prev,
          resources: { ...prev.resources, coins: prev.resources.coins - cost },
          buildings: { ...prev.buildings, [building]: nb },
          analytics: {
            ...prev.analytics,
            firsts: { ...prev.analytics.firsts, upgrade: prev.analytics.firsts.upgrade ?? rel },
            spent: { ...prev.analytics.spent, coins: prev.analytics.spent.coins + cost },
          },
        };
      });
    },
    [showToast]
  );

  const fulfillContract = useCallback(
    (id: string) => {
      const cfg = configRef.current;
      const prev = stateRef.current;
      if (!prev) return;
      const isEmergency = prev.emergency?.id === id;
      const contract = isEmergency ? prev.emergency! : prev.contracts.find((c) => c.id === id);
      if (!contract) return;
      if (!canFulfill(prev, contract)) {
        haptic("error");
        showToast("Not enough resources");
        return;
      }

      const depot = prev.buildings.shipping_depot;
      const buffPct = milestoneRewardBuffPct(prev.restoration_points, cfg);
      const reward = effectiveReward(contract, depot, cfg, buffPct);
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

      // Restoration milestones: unlock landmark + one-time coin bonus (permanent buff derived from points).
      let unlockedMs: any = null;
      let bonusTotal = 0;
      const crossedPoints: number[] = [];
      for (const ms of cfg.restoration_milestones) {
        if (next.restoration_points >= ms.points && !next.claimed_milestones.includes(ms.points)) {
          next.claimed_milestones = [...next.claimed_milestones, ms.points];
          next.resources.coins += ms.coin_bonus;
          bonusTotal += ms.coin_bonus;
          unlockedMs = ms;
          crossedPoints.push(ms.points);
        }
      }
      const justRestored = !next.town_hall_restored && next.restoration_points >= cfg.restoration_goal;
      if (justRestored) next.town_hall_restored = true;

      // analytics (event-driven)
      const rel = Date.now() - next.analytics.session_start_ts;
      const mt = { ...next.analytics.milestone_times };
      crossedPoints.forEach((p) => (mt[String(p)] = rel));
      next.analytics = {
        ...next.analytics,
        firsts: { ...next.analytics.firsts, contract: next.analytics.firsts.contract ?? rel },
        contracts_by_tier: {
          ...next.analytics.contracts_by_tier,
          [contract.tier]: next.analytics.contracts_by_tier[contract.tier] + 1,
        },
        earned: {
          coins: next.analytics.earned.coins + reward.coins,
          xp: next.analytics.earned.xp + reward.xp,
          restoration: next.analytics.earned.restoration + reward.restoration,
        },
        milestone_coins: next.analytics.milestone_coins + bonusTotal,
        milestone_times: mt,
      };

      setState(next);
      stateRef.current = next;

      // Side-effects OUTSIDE the reducer so they fire exactly once.
      haptic("success");
      if (levels > 0) {
        haptic("heavy");
        setLevelUpFlash(Date.now());
      }
      if (unlockedMs) {
        haptic("heavy");
        setLandmarkUnlock({ ...unlockedMs, bonus_total: bonusTotal, is_final: justRestored });
      }
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
        analytics: { ...prev.analytics, contract_refreshes: prev.analytics.contract_refreshes + 1 },
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

  const grantMaterials = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      haptic("success");
      showToast("+ Materials granted");
      return {
        ...prev,
        resources: {
          ...prev.resources,
          scrap: prev.resources.scrap + 50,
          components: prev.resources.components + 30,
          finished_goods: prev.resources.finished_goods + 20,
        },
      };
    });
  }, [showToast]);

  const grantLevel = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const cfg = configRef.current;
      const level = prev.level + 1;
      haptic("success");
      showToast(`Level ${level} unlocked`);
      const depot = prev.buildings.shipping_depot;
      return {
        ...prev,
        level,
        xp: 0,
        // regenerate the board so newly unlocked tiers can appear immediately
        contracts: Array.from({ length: cfg.contracts.board_size }, () => generateBoardContract(level, cfg, depot)),
      };
    });
  }, [showToast]);

  const forceEmergency = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const cfg = configRef.current;
      haptic("heavy");
      showToast("Emergency contract spawned");
      return { ...prev, emergency: generateEmergency(cfg, prev.buildings.shipping_depot, Date.now()) };
    });
  }, [showToast]);

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

  const resetTracking = useCallback(() => {
    const nowTs = Date.now();
    // reset accumulator so idle/active/full detection restarts cleanly
    analyticsAccumRef.current = { idle_ms: 0, slot_active_ms: 0, storage_full_inc: 0, scrap_full: false, last_ts: nowTs };
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, analytics: createAnalytics(nowTs, prev.level, prev.restoration_points) };
      stateRef.current = next;
      return next;
    });
    haptic("success");
    showToast("Tracking session reset");
  }, [showToast]);

  const value = useMemo<GameContextValue>(
    () => ({
      loading, now, config, state, offlineSummary, levelUpFlash,
      clearOfflineSummary, collectScrap, startJob, upgradeTrack, fulfillContract,
      refreshContract, markTutorialSeen, resetGame, grantCoins, grantMaterials, grantLevel,
      forceEmergency, resetUpgrades, resetTracking, showToast, playerId,
    }),
    [
      loading, now, config, state, offlineSummary, levelUpFlash,
      clearOfflineSummary, collectScrap, startJob, upgradeTrack, fulfillContract,
      refreshContract, markTutorialSeen, resetGame, grantCoins, grantMaterials, grantLevel,
      forceEmergency, resetUpgrades, resetTracking, showToast, playerId,
    ]
  );

  return (
    <GameContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        <LandmarkModal unlock={landmarkUnlock} onClose={() => { haptic("heavy"); setLandmarkUnlock(null); }} />
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
