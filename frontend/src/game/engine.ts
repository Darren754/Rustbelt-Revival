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
export function depotRestorationBonus(depot: ShippingDepotState, cfg: GameConfig): number {
  return cfg.upgrades.shipping_depot.quality.restoration_per_level * (depot.upgrades.quality - 1);
}
export function depotQualityTierBonus(depot: ShippingDepotState, cfg: GameConfig): number {
  return cfg.upgrades.shipping_depot.quality.tier_per_level * (depot.upgrades.quality - 1);
}
export function effectiveReward(contract: Contract, depot: ShippingDepotState, cfg: GameConfig) {
  const m = depotCoinXpMult(depot, cfg);
  return {
    coins: Math.round(contract.reward_coins * m),
    xp: Math.round(contract.reward_xp * m),
    restoration: contract.reward_restoration + depotRestorationBonus(depot, cfg),
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

// ---- contracts ----
export function generateContract(playerLevel: number, cfg: GameConfig, qualityTierBonus = 0): Contract {
  const cc = cfg.contracts;
  const tier = Math.min(playerLevel, 6) + qualityTierBonus;
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
  return { id: genId(), title: pickTitle(), requirements, reward_coins, reward_xp, reward_restoration };
}

const TITLES = [
  "City Repair Crew", "Old Mill Refit", "Bridge Rebuild", "Rail Yard Order",
  "Harbor Supply", "School Restoration", "Fire Station Job", "Water Works",
];
function pickTitle(): string {
  return TITLES[Math.floor(Math.random() * TITLES.length)];
}

export function canFulfill(state: GameState, contract: Contract): boolean {
  return contract.requirements.every((r) => state.resources[r.resource] >= r.qty);
}

// ---- state creation & migration ----
export function createDefaultState(now: number, cfg: GameConfig): GameState {
  return {
    resources: { scrap: 0, components: 0, finished_goods: 0, coins: 0 },
    level: 1,
    xp: 0,
    restoration_points: 0,
    town_hall_restored: false,
    buildings: {
      scrap_yard: { baseline_ts: now, upgrades: { speed: 1, storage: 1 } },
      machine_shop: { jobs: [], upgrades: { speed: 1, slots: 1 } },
      shipping_depot: { upgrades: { rewards: 1, quality: 1 } },
    },
    contracts: Array.from({ length: cfg.contracts.board_size }, () => generateContract(1, cfg, 0)),
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
    contracts: Array.isArray(raw.contracts) && raw.contracts.length ? raw.contracts : def.contracts,
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
