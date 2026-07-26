// Default (offline / first-run) game config. The live config is fetched from
// GET /api/config so tunables like the offline cap can be changed server-side
// WITHOUT touching game logic.
export const DEFAULT_CONFIG = {
  offline_cap_seconds: 8 * 3600, // 8h offline cap
  min_offline_seconds: 60,
  scrap_yard: { base_interval: 10, produce: 1 },
  machine_shop: {
    component: { cost: { scrap: 2 }, out: "components", out_qty: 1, base_duration: 20 },
    finished: { cost: { components: 2 }, out: "finished_goods", out_qty: 1, base_duration: 30 },
  },
  upgrade: { cost_base: 60, cost_growth: 1.7, speed_factor: 0.85, max_level: 8 },
  xp_base: 100,
  restoration_goal: 100,
  // Contract / order-board balance — all tunable without touching game logic.
  contracts: {
    board_size: 3,
    max_requirements: 3,
    material_unlock: { components: 2, finished_goods: 4 }, // player level to unlock in orders
    resource_weight: { scrap: 1, components: 4, finished_goods: 10 }, // relative "value"
    base_qty: { scrap: 4, components: 2, finished_goods: 1 },
    reward_coin_base: 3,
    reward_coin_var: 2,
    reward_xp_base: 1.5,
    reward_xp_var: 1,
    restoration_min: 4,
    restoration_span: 6,
  },
};

export type GameConfig = typeof DEFAULT_CONFIG;
