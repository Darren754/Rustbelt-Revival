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
export type GoalKey = "coins" | "xp" | "restoration";

interface ScoredRow {
  id: string;
  coins: number;
  xp: number;
  rest: number;
  estTime: number;
  effort: number;
  score: number;
  efficiency: number;
}

function scoreRows(contracts: Contract[], depot: ShippingDepotState, cfg: GameConfig, buffPct: number): ScoredRow[] {
  const vs = cfg.contracts.value_score as any;
  return contracts.map((c) => {
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
}

export function contractBadges(
  contracts: Contract[],
  depot: ShippingDepotState,
  cfg: GameConfig,
  buffPct = 0
): Record<string, BadgeKey> {
  const vs = cfg.contracts.value_score as any;
  if (contracts.length < 2) return {};
  const rows = scoreRows(contracts, depot, cfg, buffPct);
  const result: Record<string, BadgeKey> = {};
  const remaining = new Set(rows.map((r) => r.id));

  const pick = (fn: (r: ScoredRow) => number): ScoredRow | null => {
    let best: ScoredRow | null = null;
    for (const r of rows) {
      if (!remaining.has(r.id)) continue;
      if (!best || fn(r) > fn(best)) best = r;
    }
    return best;
  };
  const assign = (badge: BadgeKey, r: ScoredRow | null) => {
    if (!r) return;
    result[r.id] = badge;
    remaining.delete(r.id);
  };

  // Each badge goes to the best REMAINING contract, so a 3-card board shows variety.
  assign("best_value", pick((r) => r.efficiency));
  const premium = pick((r) => r.score);
  if (premium && premium.score >= vs.premium_threshold) assign("premium", premium);
  assign("quick_cash", pick((r) => r.coins / r.estTime));
  assign("best_restoration", pick((r) => r.rest / r.effort));
  assign("best_xp", pick((r) => r.xp / r.estTime));
  return result;
}

// Best contract for each player goal (global argmax — used by the goal picker).
export function goalWinners(
  contracts: Contract[],
  depot: ShippingDepotState,
  cfg: GameConfig,
  buffPct = 0
): Record<GoalKey, string | null> {
  if (!contracts.length) return { coins: null, xp: null, restoration: null };
  const rows = scoreRows(contracts, depot, cfg, buffPct);
  const argmax = (fn: (r: ScoredRow) => number) => rows.reduce((b, r) => (fn(r) > fn(b) ? r : b)).id;
  return {
    coins: argmax((r) => r.coins / r.estTime),
    xp: argmax((r) => r.xp / r.estTime),
    restoration: argmax((r) => r.rest / r.effort),
  };
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

export function createAnalytics(now: number, level = 1, restoration = 0): import("./types").Analytics {
  return {
    session_start_ts: now,
    session_start_level: level,
    session_start_restoration: restoration,
    firsts: { scrap: null, component: null, finished_good: null, contract: null, upgrade: null, level2: null },
    milestone_times: {},
    contracts_by_tier: { basic: 0, intermediate: 0, advanced: 0, emergency: 0 },
    earned: { coins: 0, xp: 0, restoration: 0 },
    milestone_coins: 0,
    spent: { coins: 0 },
    produced: { scrap: 0, components: 0, finished_goods: 0 },
    jobs_completed: { component: 0, finished: 0 },
    contract_refreshes: 0,
    storage_full_count: 0,
    machine_idle_ms: 0,
    slot_active_ms: 0,
  };
}

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
    analytics: createAnalytics(now),
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
    analytics: raw.analytics && typeof raw.analytics === "object"
      ? { ...def.analytics, ...raw.analytics, firsts: { ...def.analytics.firsts, ...(raw.analytics.firsts || {}) }, contracts_by_tier: { ...def.analytics.contracts_by_tier, ...(raw.analytics.contracts_by_tier || {}) }, earned: { ...def.analytics.earned, ...(raw.analytics.earned || {}) }, spent: { ...def.analytics.spent, ...(raw.analytics.spent || {}) }, produced: { ...def.analytics.produced, ...(raw.analytics.produced || {}) }, jobs_completed: { ...def.analytics.jobs_completed, ...(raw.analytics.jobs_completed || {}) }, milestone_times: raw.analytics.milestone_times || {} }
      : def.analytics,
  };
}

// ---- machine shop tick: complete all finished jobs ----
export function tickMachineShop(state: GameState, cfg: GameConfig, now: number): GameState {
  const ms = state.buildings.machine_shop;
  if (!ms.jobs.length) return state;
  const remaining = [] as typeof ms.jobs;
  let changed = false;
  const resources = { ...state.resources } as any;
  const produced = { ...state.analytics.produced };
  const jobs_completed = { ...state.analytics.jobs_completed };
  for (const job of ms.jobs) {
    if (now >= job.start_ts + job.duration_ms) {
      const r = cfg.machine_shop[job.type];
      resources[r.out] += r.out_qty;
      (produced as any)[r.out] += r.out_qty;
      jobs_completed[job.type] += 1;
      changed = true;
    } else {
      remaining.push(job);
    }
  }
  if (!changed) return state;
  return {
    ...state,
    resources,
    buildings: { ...state.buildings, machine_shop: { ...ms, jobs: remaining } },
    analytics: { ...state.analytics, produced, jobs_completed },
  };
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

// ---- analytics export (JSON / CSV) ----
const NOT_REACHED = "Not reached";
function fmtMs(ms: number | null): string {
  return ms == null ? NOT_REACHED : formatDuration(ms);
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function analyticsSummary(state: GameState, cfg: GameConfig) {
  const a = state.analytics;
  const now = Date.now();
  const duration = now - a.session_start_ts;
  const total =
    a.contracts_by_tier.basic + a.contracts_by_tier.intermediate + a.contracts_by_tier.advanced + a.contracts_by_tier.emergency;
  const maxSlots = machineSlots(state.buildings.machine_shop, cfg);
  const slotUtilPct = duration > 0 && maxSlots > 0 ? Math.min(100, (a.slot_active_ms / (duration * maxSlots)) * 100) : 0;
  const netCoins = a.earned.coins + a.milestone_coins - a.spent.coins;
  const avg = (v: number) => (total > 0 ? round1(v / total) : 0);
  return {
    version: 1,
    generated_at_iso: new Date(now).toISOString(),
    session: {
      start_ts: a.session_start_ts,
      start_iso: new Date(a.session_start_ts).toISOString(),
      duration_ms: duration,
      start_level: a.session_start_level,
      start_restoration: a.session_start_restoration,
    },
    firsts_ms: a.firsts,
    economy: {
      coins_earned: a.earned.coins,
      milestone_coins: a.milestone_coins,
      coins_spent: a.spent.coins,
      net_coins: netCoins,
      xp_earned: a.earned.xp,
      restoration_earned: a.earned.restoration,
      scrap_collected: a.produced.scrap,
      components_produced: a.produced.components,
      finished_goods_produced: a.produced.finished_goods,
    },
    contracts: {
      total,
      by_tier: a.contracts_by_tier,
      emergency: a.contracts_by_tier.emergency,
      refreshes: a.contract_refreshes,
      avg_coins: avg(a.earned.coins),
      avg_xp: avg(a.earned.xp),
      avg_restoration: avg(a.earned.restoration),
    },
    production: {
      storage_full_count: a.storage_full_count,
      machine_idle_ms: a.machine_idle_ms,
      machine_active_ms: a.slot_active_ms,
      slot_utilization_pct: round1(slotUtilPct),
      jobs_completed: a.jobs_completed,
    },
    milestones: {
      unlock_times_ms: a.milestone_times,
      milestone_coins_received: a.milestone_coins,
      current_reward_buff_pct: milestoneRewardBuffPct(state.restoration_points, cfg),
    },
    game_progress: {
      level: state.level,
      restoration_points: state.restoration_points,
      resources: state.resources,
    },
  };
}

export function analyticsToJSON(state: GameState, cfg: GameConfig): string {
  return JSON.stringify(analyticsSummary(state, cfg), null, 2);
}

// Escape a CSV cell per RFC 4180 (wrap in quotes + double inner quotes when needed).
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function analyticsToCSV(state: GameState, cfg: GameConfig): string {
  const s = analyticsSummary(state, cfg);
  const rows: [string, string | number][] = [
    ["session_start", s.session.start_iso],
    ["session_duration", fmtMs(s.session.duration_ms)],
    ["session_start_level", s.session.start_level],
    ["session_start_restoration", s.session.start_restoration],
    ["first_scrap", fmtMs(s.firsts_ms.scrap)],
    ["first_component", fmtMs(s.firsts_ms.component)],
    ["first_finished_good", fmtMs(s.firsts_ms.finished_good)],
    ["first_contract", fmtMs(s.firsts_ms.contract)],
    ["first_upgrade", fmtMs(s.firsts_ms.upgrade)],
    ["reach_level_2", fmtMs(s.firsts_ms.level2)],
    ["coins_earned", s.economy.coins_earned],
    ["milestone_coins", s.economy.milestone_coins],
    ["coins_spent", s.economy.coins_spent],
    ["net_coins", s.economy.net_coins],
    ["xp_earned", s.economy.xp_earned],
    ["restoration_earned", s.economy.restoration_earned],
    ["scrap_collected", s.economy.scrap_collected],
    ["components_produced", s.economy.components_produced],
    ["finished_goods_produced", s.economy.finished_goods_produced],
    ["contracts_total", s.contracts.total],
    ["contracts_basic", s.contracts.by_tier.basic],
    ["contracts_intermediate", s.contracts.by_tier.intermediate],
    ["contracts_advanced", s.contracts.by_tier.advanced],
    ["contracts_emergency", s.contracts.by_tier.emergency],
    ["contract_refreshes", s.contracts.refreshes],
    ["avg_coins_per_contract", s.contracts.avg_coins],
    ["avg_xp_per_contract", s.contracts.avg_xp],
    ["avg_restoration_per_contract", s.contracts.avg_restoration],
    ["storage_full_count", s.production.storage_full_count],
    ["machine_idle", fmtMs(s.production.machine_idle_ms)],
    ["machine_active", fmtMs(s.production.machine_active_ms)],
    ["slot_utilization_pct", s.production.slot_utilization_pct],
    ["jobs_component", s.production.jobs_completed.component],
    ["jobs_finished", s.production.jobs_completed.finished],
    ["milestone_coins_received", s.milestones.milestone_coins_received],
    ["current_reward_buff_pct", s.milestones.current_reward_buff_pct],
  ];
  for (const m of cfg.restoration_milestones) {
    rows.push([`milestone_${m.points}`, fmtMs(s.milestones.unlock_times_ms[String(m.points)] ?? null)]);
  }
  const header = `${csvCell("metric")},${csvCell("value")}`;
  return header + "\n" + rows.map(([k, v]) => `${csvCell(k)},${csvCell(v)}`).join("\n");
}
