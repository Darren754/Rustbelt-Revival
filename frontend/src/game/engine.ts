import { GameConfig } from "./config";
import {
  Contract,
  ContractReq,
  GameState,
  JobType,
  MachineShopState,
  MaterialKey,
  OfflineSummary,
  ScrapYardState,
} from "./types";

const MATERIALS: MaterialKey[] = ["scrap", "components", "finished_goods"];

export function genId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

// ---- speed / cost curves ----
export function speedMult(level: number, cfg: GameConfig): number {
  return Math.pow(cfg.upgrade.speed_factor, level - 1);
}

export function upgradeCost(level: number, cfg: GameConfig): number {
  return Math.round(cfg.upgrade.cost_base * Math.pow(cfg.upgrade.cost_growth, level - 1));
}

export function isMaxLevel(level: number, cfg: GameConfig): boolean {
  return level >= cfg.upgrade.max_level;
}

// ---- scrap yard ----
export function scrapIntervalMs(sy: ScrapYardState, cfg: GameConfig): number {
  return cfg.scrap_yard.base_interval * 1000 * speedMult(sy.level, cfg);
}

export function readyScrap(sy: ScrapYardState, cfg: GameConfig, now: number): number {
  const interval = scrapIntervalMs(sy, cfg);
  return Math.max(0, Math.floor((now - sy.baseline_ts) / interval)) * cfg.scrap_yard.produce;
}

export function scrapProgress(sy: ScrapYardState, cfg: GameConfig, now: number): number {
  const interval = scrapIntervalMs(sy, cfg);
  const frac = ((now - sy.baseline_ts) % interval) / interval;
  return Math.min(1, Math.max(0, frac));
}

// ---- machine shop ----
export function jobDurationMs(type: JobType, level: number, cfg: GameConfig): number {
  const base = cfg.machine_shop[type].base_duration;
  return base * 1000 * speedMult(level, cfg);
}

export function jobProgress(ms: MachineShopState, now: number): number {
  if (!ms.job) return 0;
  const elapsed = now - ms.job.start_ts;
  return Math.min(1, Math.max(0, elapsed / ms.job.duration_ms));
}

export function jobRemainingMs(ms: MachineShopState, now: number): number {
  if (!ms.job) return 0;
  return Math.max(0, ms.job.start_ts + ms.job.duration_ms - now);
}

export function jobIsDone(ms: MachineShopState, now: number): boolean {
  return !!ms.job && now >= ms.job.start_ts + ms.job.duration_ms;
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

// ---- contracts ----
export function generateContract(playerLevel: number, cfg: GameConfig): Contract {
  const cc = cfg.contracts;
  const tier = Math.min(playerLevel, 6);
  const numReqs = 1 + Math.floor(Math.random() * Math.min(cc.max_requirements, 1 + Math.floor(tier / 2)));
  const pool: MaterialKey[] = ["scrap"];
  if (playerLevel >= cc.material_unlock.components) pool.push("components");
  if (playerLevel >= cc.material_unlock.finished_goods) pool.push("finished_goods");
  const chosen = new Set<MaterialKey>();
  while (chosen.size < Math.min(numReqs, pool.length)) {
    chosen.add(pool[Math.floor(Math.random() * pool.length)]);
  }
  const weight = cc.resource_weight as Record<MaterialKey, number>;
  const baseQty = cc.base_qty as Record<MaterialKey, number>;
  const requirements: ContractReq[] = [];
  let value = 0;
  chosen.forEach((resource) => {
    const base = baseQty[resource];
    const qty = base + Math.floor(Math.random() * (base + tier));
    requirements.push({ resource, qty });
    value += qty * weight[resource];
  });
  const reward_coins = Math.round(value * (cc.reward_coin_base + Math.random() * cc.reward_coin_var));
  const reward_xp = Math.round(value * (cc.reward_xp_base + Math.random() * cc.reward_xp_var));
  const reward_restoration = cc.restoration_min + Math.floor(Math.random() * cc.restoration_span);
  return {
    id: genId(),
    title: pickTitle(),
    requirements,
    reward_coins,
    reward_xp,
    reward_restoration,
  };
}

const TITLES = [
  "City Repair Crew",
  "Old Mill Refit",
  "Bridge Rebuild",
  "Rail Yard Order",
  "Harbor Supply",
  "School Restoration",
  "Fire Station Job",
  "Water Works",
];
function pickTitle(): string {
  return TITLES[Math.floor(Math.random() * TITLES.length)];
}

export function canFulfill(state: GameState, contract: Contract): boolean {
  return contract.requirements.every((r) => state.resources[r.resource] >= r.qty);
}

// ---- state creation ----
export function createDefaultState(now: number, cfg: GameConfig): GameState {
  return {
    resources: { scrap: 0, components: 0, finished_goods: 0, coins: 0 },
    level: 1,
    xp: 0,
    restoration_points: 0,
    town_hall_restored: false,
    buildings: {
      scrap_yard: { level: 1, baseline_ts: now },
      machine_shop: { level: 1, job: null },
    },
    contracts: Array.from({ length: cfg.contracts.board_size }, () => generateContract(1, cfg)),
    last_seen_ts: now,
    tutorial_seen: false,
  };
}

// Merge a persisted state with defaults so new fields never crash old saves.
export function normalizeState(raw: any, now: number, cfg: GameConfig): GameState {
  const def = createDefaultState(now, cfg);
  if (!raw || typeof raw !== "object") return def;
  return {
    ...def,
    ...raw,
    resources: { ...def.resources, ...(raw.resources || {}) },
    buildings: {
      scrap_yard: { ...def.buildings.scrap_yard, ...(raw.buildings?.scrap_yard || {}) },
      machine_shop: { ...def.buildings.machine_shop, ...(raw.buildings?.machine_shop || {}) },
    },
    contracts: Array.isArray(raw.contracts) && raw.contracts.length ? raw.contracts : def.contracts,
  };
}

// ---- machine shop tick: complete a finished job, return new state (or same) ----
export function tickMachineShop(state: GameState, cfg: GameConfig, now: number): GameState {
  const ms = state.buildings.machine_shop;
  if (!ms.job || now < ms.job.start_ts + ms.job.duration_ms) return state;
  const recipe = cfg.machine_shop[ms.job.type];
  const next: GameState = {
    ...state,
    resources: {
      ...state.resources,
      [recipe.out]: (state.resources as any)[recipe.out] + recipe.out_qty,
    },
    buildings: {
      ...state.buildings,
      machine_shop: { ...ms, job: null },
    },
  };
  return next;
}

// ---- offline production (uses UTC epoch ms; capped by config.offline_cap_seconds) ----
export function computeOffline(
  state: GameState,
  cfg: GameConfig,
  now: number
): { state: GameState; summary: OfflineSummary | null } {
  const elapsed = Math.max(0, now - state.last_seen_ts);
  const next: GameState = JSON.parse(JSON.stringify(state));

  if (elapsed < cfg.min_offline_seconds * 1000) {
    // brief absence: let the live tick handle any completed job, keep scrap pending
    return { state: tickMachineShop(next, cfg, now), summary: null };
  }

  const cap = cfg.offline_cap_seconds * 1000;
  const capped = elapsed > cap;
  const effNow = state.last_seen_ts + Math.min(elapsed, cap);

  const summary: OfflineSummary = {
    away_ms: elapsed,
    capped,
    scrap_earned: 0,
    jobs_completed: [],
  };

  // Scrap yard: auto-collect all ready scrap up to the capped window.
  const sy = next.buildings.scrap_yard;
  const interval = scrapIntervalMs(sy, cfg);
  const readyBefore = Math.max(0, Math.floor((state.last_seen_ts - sy.baseline_ts) / interval));
  const readyAfter = Math.max(0, Math.floor((effNow - sy.baseline_ts) / interval));
  const totalReady = readyAfter * cfg.scrap_yard.produce;
  if (totalReady > 0) {
    next.resources.scrap += totalReady;
    summary.scrap_earned = Math.max(0, (readyAfter - readyBefore) * cfg.scrap_yard.produce);
  }
  sy.baseline_ts = now; // resume fresh accrual from real now

  // Machine shop: complete the running job if it finished within the window.
  const ms = next.buildings.machine_shop;
  if (ms.job && effNow >= ms.job.start_ts + ms.job.duration_ms) {
    const recipe = cfg.machine_shop[ms.job.type];
    (next.resources as any)[recipe.out] += recipe.out_qty;
    summary.jobs_completed.push({
      building: "Machine Shop",
      output: `${recipe.out_qty} ${recipe.out === "components" ? "Component" : "Finished Good"}`,
    });
    ms.job = null;
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
