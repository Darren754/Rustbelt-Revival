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

export interface ScrapYardState {
  level: number;
  baseline_ts: number; // UTC epoch ms accrual anchor
}

export interface MachineShopState {
  level: number;
  job: MachineJob | null;
}

export interface ContractReq {
  resource: MaterialKey;
  qty: number;
}

export interface Contract {
  id: string;
  title: string;
  requirements: ContractReq[];
  reward_coins: number;
  reward_xp: number;
  reward_restoration: number;
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
