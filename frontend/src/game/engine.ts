import { GameConfig } from "./config";
import {
  BuildingKey,
  Contract,
  ContractReq,
  GameState,
  JobType,
  MachineShopState,
  MaterialKey,
  OfflineSummary,
  ScrapYardState,
  ShippingDepotState,
  TrackKey,
} from "./types";

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---- upgrade track helpers (fully config-driven) ----
export function trackDef(cfg: GameConfig, building: BuildingKey, track: TrackKey): any {
  return (cfg.upgrades as any)[building][track];
}

export function trackCost(cfg: GameConfig, building: BuildingKey, track: TrackKey, level: number): number {
  const t = trackDef(cfg, building, track);
  return Math.round(t.cost_base * Math.pow(t.cost_growth, level - 1));
}

export function trackMaxed(cfg: GameConfig, building: BuildingKey, track: TrackKey, level: number): boolean {
  return level >= trackDef(cfg, building, track).max_level;
}

// rough building level for the card badge: sum of track progress
export function buildingLevel(building: { upgrades: Record<string, number> }): number {
  return Object.values(building.upgrades).reduce((a, b) => a + (b - 1), 0) + 1;
}

// ---- scrap yard ----
export function scrapIntervalSec(cfg: GameConfig, speedLevel: number): number {
  const f = cfg.upgrades.scrap_yard.speed.factor;
  return cfg.scrap_yard.base_interval * Math.pow(f, speedLevel - 1);
}
export function scrapIntervalMs(sy: ScrapYardState, cfg: GameConfig): number {
  return scrapIntervalSec(cfg, sy.upgrades.speed) * 1000;
}
export function scrapCapacityForLevel(cfg: GameConfig, storageLevel: number): number {
  const s = cfg.upgrades.scrap_yard.storage;
  return s.base_capacity + s.per_level * (storageLevel - 1);
}
export function scrapCapacity(sy: ScrapYardState, cfg: GameConfig): number {
  return scrapCapacityForLevel(cfg, sy.upgrades.storage);
}
export function readyScrap(sy: ScrapYardState, cfg: GameConfig, now: number): number {
  const interval = scrapIntervalMs(sy, cfg);
  const raw = Math.max(0, Math.floor((now - sy.baseline_ts) / interval)) * cfg.scrap_yard.produce;
  return Math.min(raw, scrapCapacity(sy, cfg));
}
export function scrapProgress(sy: ScrapYardState, cfg: GameConfig, now: number): number {
  if (readyScrap(sy, cfg, now) >= scrapCapacity(sy, cfg)) return 1;
  const interval = scrapIntervalMs(sy, cfg);
  const frac = ((now - sy.baseline_ts) % interval) / interval;
  return Math.min(1, Math.max(0, frac));
}

// ---- machine shop ----
export function jobDurationSec(cfg: GameConfig, type: JobType, speedLevel: number): number {
  const f = cfg.upgrades.machine_shop.speed.factor;
  return cfg.machine_shop[type].base_duration * Math.pow(f, speedLevel - 1);
}
export function jobDurationMs(cfg: GameConfig, type: JobType, ms: MachineShopState): number {
  return jobDurationSec(cfg, type, ms.upgrades.speed) * 1000;
}
export function machineSlots(ms: MachineShopState, cfg: GameConfig): number {
  return Math.min(ms.upgrades.slots, cfg.upgrades.machine_shop.slots.max_level);
}
export function jobProgress(job: { start_ts: number; duration_ms: number }, now: number): number {
  return Math.min(1, Math.max(0, (now - job.start_ts) / job.duration_ms));
}
export function jobRemainingMs(job: { start_ts: number; duration_ms: number }, now: number): number {
  return Math.max(0, job.start_ts + job.duration_ms - now);
}

// ---- shipping depot ----
export function depotCoinXpMult(depot: ShippingDepotState, cfg: GameConfig): number {
  const t = cfg.upgrades.shipping_depot.rewards;
  return 1 + t.mult_per_level * (depot.upgrades.rewards - 1);
}
export function depotRewardPct(cfg: GameConfig, level: number): number {
  return Math.round(cfg.upgrades.shipping_depot.rewards.mult_per_level * (level - 1) * 100);
}
export function qualityQtyMult(depot: ShippingDepotState, cfg: GameConfig): number {
  return 1 + cfg.upgrades.shipping_depot.quality.qty_per_level * (depot.upgrades.quality - 1);
}
export function depotQualityPct(cfg: GameConfig, level: number): number {
  return Math.round(cfg.upgrades.shipping_depot.quality.qty_per_level * (level - 1) * 100);
}
export function effectiveReward(contract: Contract, depot: ShippingDepotState, cfg: GameConfig, extraRewardPct = 0) {
  const m = depotCoinXpMult(depot, cfg) * (1 + extraRewardPct / 100);
  return {
    coins: Math.round(contract.reward_coins * m),
    xp: Math.round(contract.reward_xp * m),
    restoration: contract.reward_restoration,
  };
}

// ---- restoration milestones / landmarks ----
export interface LandmarkView {
  points: number;
  landmark: string;
  icon: string;
  coin_bonus: number;
  reward_buff_pct: number;
  unlocked: boolean;
}
export function milestoneRewardBuffPct(restorationPoints: number, cfg: GameConfig): number {
  return cfg.restoration_milestones.reduce(
    (sum, m) => (restorationPoints >= m.points ? sum + m.reward_buff_pct : sum),
    0
  );
}
export function landmarks(restorationPoints: number, cfg: GameConfig): LandmarkView[] {
  return cfg.restoration_milestones.map((m) => ({ ...m, unlocked: restorationPoints >= m.points }));
}

// ---- "Value Score" contract badges (configurable weights; emergency excluded) ----
export type BadgeKey = "best_value" | "quick_cash" | "best_restoration" | "best_xp" | "premium";

export function contractBadges(
  contracts: Contract[],
  depot: ShippingDepotState,
  cfg: GameConfig,
  buffPct = 0
): Record<string, BadgeKey> {
  const vs = cfg.contracts.value_score as any;
  if (contracts.length < 2) return {};
  const rows = contracts.map((c) => {
    const eff = effectiveReward(c, depot, cfg, buffPct);
    const materials = c.requirements.reduce((a, r) => a + r.qty, 0);
    const estTime = Math.max(
      1,
      c.requirements.reduce((a, r) => a + r.qty * (vs.unit_time_seconds[r.resource] ?? 10), 0)
    );
    const effort = Math.max(1, vs.w_materials * materials + vs.w_time * estTime);
    const score = vs.w_coins * eff.coins + vs.w_xp * eff.xp + vs.w_restoration * eff.restoration;
    return { id: c.id, coins: eff.coins, xp: eff.xp, rest: eff.restoration, estTime, effort, score, efficiency: score / effort };
  });
  const argmaxId = (fn: (r: (typeof rows)[number]) => number) =>
    rows.reduce((best, r) => (fn(r) > fn(best) ? r : best)).id;
  const maxScore = Math.max(...rows.map((r) => r.score));

  // Priority order — Best Value always shown first; Premium is a rare flavour tag.
  const candidates: [BadgeKey, string, boolean][] = [
    ["best_value", argmaxId((r) => r.efficiency), true],
    ["premium", argmaxId((r) => r.score), maxScore >= vs.premium_threshold],
    ["quick_cash", argmaxId((r) => r.coins / r.estTime), true],
    ["best_restoration", argmaxId((r) => r.rest / r.effort), true],
    ["best_xp", argmaxId((r) => r.xp / r.estTime), true],
  ];
  const result: Record<string, BadgeKey> = {};
  const usedBadge = new Set<BadgeKey>();
  for (const [badge, id, ok] of candidates) {
    if (!ok || result[id] || usedBadge.has(badge)) continue;
    result[id] = badge;
    usedBadge.add(badge);
  }
  return result;
}

// ---- xp / level ----
export function xpForLevel(level: number, cfg: GameConfig): number {
  return cfg.xp_base * level;
}
export function grantXp(state: GameState, amount: number, cfg: GameConfig): number {
  let levelsGained = 0;
  state.xp += amount;
  while (state.xp >= xpForLevel(state.level, cfg)) {
    state.xp -= xpForLevel(state.level, cfg);
    state.level += 1;
    levelsGained += 1;
  }
  return levelsGained;
}

// ---- contracts (tiered + rare emergency) ----
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function randRange(range: number[]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

const DEFAULT_DEPOT: ShippingDepotState = { upgrades: { rewards: 1, quality: 1 } };

export type TierKey = "basic" | "intermediate" | "advanced";

// Which tiers the player has unlocked, in board display order.
export function unlockedTiers(playerLevel: number, cfg: GameConfig): TierKey[] {
  return (Object.keys(cfg.contracts.tiers) as TierKey[]).filter(
    (k) => playerLevel >= (cfg.contracts.tiers as any)[k].unlock_level
  );
}

function pickTier(playerLevel: number, cfg: GameConfig): TierKey {
  const tiers = unlockedTiers(playerLevel, cfg);
  const weights = tiers.map((k) => (cfg.contracts.tier_weights as any)[k] ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < tiers.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

function buildContract(tier: string, def: any, depot: ShippingDepotState, cfg: GameConfig, expires_at: number | null): Contract {
  const qty = Math.max(1, Math.round(randInt(def.qty_min, def.qty_max) * qualityQtyMult(depot, cfg)));
  return {
    id: genId(),
    tier: tier as any,
    label: def.label,
    difficulty: def.difficulty,
    color: def.color,
    requirements: [{ resource: def.material as MaterialKey, qty }],
    reward_coins: Math.max(1, Math.round(randRange(def.coin_per) * qty)),
    reward_xp: Math.max(1, Math.round(randRange(def.xp_per) * qty)),
    reward_restoration: Math.max(1, Math.round(randRange(def.rest_per) * qty)),
    expires_at,
  };
}

export function generateTierContract(tier: TierKey, cfg: GameConfig, depot: ShippingDepotState): Contract {
  return buildContract(tier, (cfg.contracts.tiers as any)[tier], depot, cfg, null);
}

export function generateBoardContract(playerLevel: number, cfg: GameConfig, depot: ShippingDepotState): Contract {
  return generateTierContract(pickTier(playerLevel, cfg), cfg, depot);
}

export function generateEmergency(cfg: GameConfig, depot: ShippingDepotState, now: number): Contract {
  const e = cfg.contracts.emergency;
  return buildContract("emergency", e, depot, cfg, now + e.duration_seconds * 1000);
}

export function canFulfill(state: GameState, contract: Contract): boolean {
  return contract.requirements.every((r) => state.resources[r.resource] >= r.qty);
}

// Spawn / expire the rare limited-time emergency contract.
export function tickContracts(state: GameState, cfg: GameConfig, now: number): GameState {
  const e = cfg.contracts.emergency;
  let em = state.emergency;
  let nextCheck = state.emergency_next_check_ts;
  let changed = false;

  if (em && em.expires_at != null && now > em.expires_at) {
    em = null;
    nextCheck = now + e.check_interval_seconds * 1000;
    changed = true;
  }
  if (!em && e.enabled && state.level >= e.unlock_level && now >= nextCheck) {
    changed = true;
    if (Math.random() < e.spawn_chance) {
      em = generateEmergency(cfg, state.buildings.shipping_depot, now);
    }
    nextCheck = now + e.check_interval_seconds * 1000;
  }
  if (!changed) return state;
  return { ...state, emergency: em, emergency_next_check_ts: nextCheck };
}

// ---- state creation & migration ----
export function createDefaultState(now: number, cfg: GameConfig): GameState {
  return {
    resources: { scrap: 0, components: 0, finished_goods: 0, coins: 0 },
    level: 1,
    xp: 0,
    restoration_points: 0,
    town_hall_restored: false,
    claimed_milestones: [],
    buildings: {
      scrap_yard: { baseline_ts: now, upgrades: { speed: 1, storage: 1 } },
      machine_shop: { jobs: [], upgrades: { speed: 1, slots: 1 } },
      shipping_depot: { upgrades: { rewards: 1, quality: 1 } },
    },
    contracts: Array.from({ length: cfg.contracts.board_size }, () =>
      generateBoardContract(1, cfg, DEFAULT_DEPOT)
    ),
    emergency: null,
    emergency_next_check_ts: now + cfg.contracts.emergency.check_interval_seconds * 1000,
    last_seen_ts: now,
    tutorial_seen: false,
  };
}

// Merge a persisted save with defaults so new fields never crash old saves.
// Old single-`level` buildings and single `.job` migrate to Level-1 tracks.
export function normalizeState(raw: any, now: number, cfg: GameConfig): GameState {
  const def = createDefaultState(now, cfg);
  if (!raw || typeof raw !== "object") return def;

  const rawSy = raw.buildings?.scrap_yard || {};
  const rawMs = raw.buildings?.machine_shop || {};
  const rawSd = raw.buildings?.shipping_depot || {};

  const legacyJobs = Array.isArray(rawMs.jobs) ? rawMs.jobs : rawMs.job ? [rawMs.job] : [];

  return {
    ...def,
    ...raw,
    resources: { ...def.resources, ...(raw.resources || {}) },
    buildings: {
      scrap_yard: {
        baseline_ts: typeof rawSy.baseline_ts === "number" ? rawSy.baseline_ts : now,
        upgrades: {
          speed: rawSy.upgrades?.speed ?? rawSy.level ?? 1,
          storage: rawSy.upgrades?.storage ?? 1,
        },
      },
      machine_shop: {
        jobs: legacyJobs,
        upgrades: {
          speed: rawMs.upgrades?.speed ?? rawMs.level ?? 1,
          slots: rawMs.upgrades?.slots ?? 1,
        },
      },
      shipping_depot: {
        upgrades: {
          rewards: rawSd.upgrades?.rewards ?? 1,
          quality: rawSd.upgrades?.quality ?? 1,
        },
      },
    },
    contracts:
      Array.isArray(raw.contracts) && raw.contracts.length && raw.contracts.every((c: any) => c && c.tier)
        ? raw.contracts
        : def.contracts,
    emergency:
      raw.emergency && typeof raw.emergency.expires_at === "number" && raw.emergency.expires_at > now
        ? raw.emergency
        : null,
    emergency_next_check_ts:
      typeof raw.emergency_next_check_ts === "number" ? raw.emergency_next_check_ts : def.emergency_next_check_ts,
    claimed_milestones: Array.isArray(raw.claimed_milestones) ? raw.claimed_milestones : [],
  };
}

// ---- machine shop tick: complete all finished jobs ----
export function tickMachineShop(state: GameState, cfg: GameConfig, now: number): GameState {
  const ms = state.buildings.machine_shop;
  if (!ms.jobs.length) return state;
  const remaining = [] as typeof ms.jobs;
  let changed = false;
  const resources = { ...state.resources } as any;
  for (const job of ms.jobs) {
    if (now >= job.start_ts + job.duration_ms) {
      const r = cfg.machine_shop[job.type];
      resources[r.out] += r.out_qty;
      changed = true;
    } else {
      remaining.push(job);
    }
  }
  if (!changed) return state;
  return { ...state, resources, buildings: { ...state.buildings, machine_shop: { ...ms, jobs: remaining } } };
}

// ---- offline production (UTC epoch ms; capped by config.offline_cap_seconds) ----
export function computeOffline(
  state: GameState,
  cfg: GameConfig,
  now: number
): { state: GameState; summary: OfflineSummary | null } {
  const elapsed = Math.max(0, now - state.last_seen_ts);
  const next: GameState = JSON.parse(JSON.stringify(state));

  if (elapsed < cfg.min_offline_seconds * 1000) {
    return { state: tickMachineShop(next, cfg, now), summary: null };
  }

  const cap = cfg.offline_cap_seconds * 1000;
  const capped = elapsed > cap;
  const effNow = state.last_seen_ts + Math.min(elapsed, cap);

  const summary: OfflineSummary = { away_ms: elapsed, capped, scrap_earned: 0, jobs_completed: [] };

  // Scrap yard: auto-collect ready scrap (capped by storage) up to the window.
  const sy = next.buildings.scrap_yard;
  const readyBefore = readyScrap(sy, cfg, state.last_seen_ts);
  const readyAfter = readyScrap(sy, cfg, effNow);
  if (readyAfter > 0) {
    next.resources.scrap += readyAfter;
    summary.scrap_earned = Math.max(0, readyAfter - readyBefore);
  }
  sy.baseline_ts = now;

  // Machine shop: complete every job finished within the window.
  const ms = next.buildings.machine_shop;
  const remaining = [] as typeof ms.jobs;
  for (const job of ms.jobs) {
    if (effNow >= job.start_ts + job.duration_ms) {
      const r = cfg.machine_shop[job.type];
      (next.resources as any)[r.out] += r.out_qty;
      summary.jobs_completed.push({
        building: "Machine Shop",
        output: `${r.out_qty} ${r.out === "components" ? "Component" : "Finished Good"}`,
      });
    } else {
      remaining.push(job);
    }
  }
  ms.jobs = remaining;

  // Emergency contract: expire it if the window closed while away.
  if (next.emergency && next.emergency.expires_at != null && now > next.emergency.expires_at) {
    next.emergency = null;
    next.emergency_next_check_ts = now + cfg.contracts.emergency.check_interval_seconds * 1000;
  }

  return { state: next, summary };
}

// ---- human friendly time ----
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}
