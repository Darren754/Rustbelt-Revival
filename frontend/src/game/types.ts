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

export interface ContractReq {
  resource: MaterialKey;
  qty: number;
}

export interface Contract {
  id: string;
  title: string;
  requirements: ContractReq[];
  reward_coins: number; // base — depot "rewards" track multiplies at fulfil
  reward_xp: number; // base
  reward_restoration: number; // base — depot "quality" track adds a bonus
}

export interface GameState {
  resources: Resources;
  level: number;
  xp: number; // progress toward next level
  restoration_points: number;
  town_hall_restored: boolean;
  buildings: {
    scrap_yard: ScrapYardState;
    machine_shop: MachineShopState;
    shipping_depot: ShippingDepotState;
  };
  contracts: Contract[];
  last_seen_ts: number; // UTC epoch ms
  tutorial_seen: boolean;
}

export interface OfflineSummary {
  away_ms: number;
  capped: boolean;
  scrap_earned: number;
  jobs_completed: { building: string; output: string }[];
}
