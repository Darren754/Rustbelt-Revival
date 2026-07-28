export type MaterialKey = "scrap" | "components" | "finished_goods";
export type ResourceKey = MaterialKey | "coins";

export interface Resources {
  scrap: number;
  components: number;
  finished_goods: number;
  coins: number;
}

export type JobType = "component" | "finished";

export interface MachineJob {
  type: JobType;
  start_ts: number; // UTC epoch ms
  duration_ms: number;
}

// Upgrade tracks — each starts at level 1.
export interface ScrapYardState {
  baseline_ts: number; // UTC epoch ms accrual anchor
  upgrades: { speed: number; storage: number };
}

export interface MachineShopState {
  jobs: MachineJob[]; // concurrent jobs limited by the "slots" track
  upgrades: { speed: number; slots: number };
}

export interface ShippingDepotState {
  upgrades: { rewards: number; quality: number };
}

export type BuildingKey = "scrap_yard" | "machine_shop" | "shipping_depot";
export type TrackKey = "speed" | "storage" | "slots" | "rewards" | "quality";

export type ContractTier = "basic" | "intermediate" | "advanced" | "emergency";

export interface ContractReq {
  resource: MaterialKey;
  qty: number;
}

export interface Contract {
  id: string;
  tier: ContractTier;
  label: string; // e.g. "Local Delivery"
  difficulty: string; // e.g. "Easy"
  color: string;
  requirements: ContractReq[];
  reward_coins: number; // base — depot "rewards" track multiplies at fulfil
  reward_xp: number; // base
  reward_restoration: number;
  expires_at: number | null; // UTC epoch ms — only emergency contracts expire
}

export interface Analytics {
  session_start_ts: number; // UTC epoch ms tracking began
  session_start_level: number; // player level when tracking began
  session_start_restoration: number; // restoration points when tracking began
  firsts: {
    scrap: number | null; // elapsed ms from session start (null = not yet)
    component: number | null;
    finished_good: number | null;
    contract: number | null;
    upgrade: number | null;
    level2: number | null;
  };
  milestone_times: Record<string, number>; // restoration points -> elapsed ms
  contracts_by_tier: { basic: number; intermediate: number; advanced: number; emergency: number };
  earned: { coins: number; xp: number; restoration: number }; // coins here = contract coins only
  milestone_coins: number; // one-time coin rewards from restoration milestones
  spent: { coins: number }; // coins spent on upgrades
  produced: { scrap: number; components: number; finished_goods: number }; // materials gained this session
  jobs_completed: { component: number; finished: number }; // machine shop jobs by recipe
  contract_refreshes: number;
  storage_full_count: number;
  machine_idle_ms: number;
  slot_active_ms: number; // summed across active slots (slot-milliseconds)
}

export interface GameState {
  resources: Resources;
  level: number;
  xp: number; // progress toward next level
  restoration_points: number;
  town_hall_restored: boolean;
  claimed_milestones: number[]; // milestone point-thresholds whose one-time bonus was paid
  buildings: {
    scrap_yard: ScrapYardState;
    machine_shop: MachineShopState;
    shipping_depot: ShippingDepotState;
  };
  contracts: Contract[];
  emergency: Contract | null; // rare limited-time contract
  emergency_next_check_ts: number; // UTC epoch ms — next spawn roll
  last_seen_ts: number; // UTC epoch ms
  tutorial_seen: boolean;
  analytics: Analytics;
}

export interface OfflineSummary {
  away_ms: number;
  capped: boolean;
  scrap_earned: number;
  jobs_completed: { building: string; output: string }[];
}
