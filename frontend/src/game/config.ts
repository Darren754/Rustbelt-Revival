// Default (offline / first-run) game config. The live config is fetched from
// GET /api/config so ALL balance values (times, costs, capacities, multipliers,
// unlock levels, offline cap) can be tuned server-side WITHOUT touching logic.
export const DEFAULT_CONFIG = {
  offline_cap_seconds: 8 * 3600, // 8h offline cap
  min_offline_seconds: 60,
  scrap_yard: { base_interval: 10, produce: 1 },
  machine_shop: {
    component: { cost: { scrap: 2 }, out: "components", out_qty: 1, base_duration: 20 },
    finished: { cost: { components: 2 }, out: "finished_goods", out_qty: 1, base_duration: 30 },
  },
  xp_base: 100,
  restoration_goal: 100,

  // Per-building, per-track upgrade balance. Each track starts at level 1.
  upgrades: {
    scrap_yard: {
      // production rate: interval = base_interval * factor^(level-1)
      speed: { max_level: 8, cost_base: 60, cost_growth: 1.7, factor: 0.85 },
      // storage cap: base_capacity + per_level*(level-1)
      storage: { max_level: 8, cost_base: 80, cost_growth: 1.8, base_capacity: 20, per_level: 15 },
    },
    machine_shop: {
      // production time: duration = base_duration * factor^(level-1)
      speed: { max_level: 8, cost_base: 75, cost_growth: 1.7, factor: 0.85 },
      // number of concurrent production slots == this level (1 -> 1 slot)
      slots: { max_level: 3, cost_base: 600, cost_growth: 3.0 },
    },
    shipping_depot: {
      // reward payout: coins & xp multiplied by 1 + mult_per_level*(level-1)
      rewards: { max_level: 8, cost_base: 120, cost_growth: 1.8, mult_per_level: 0.15 },
      // contract quality: bigger orders (+tier) and +restoration per contract
      quality: { max_level: 6, cost_base: 180, cost_growth: 2.0, tier_per_level: 1, restoration_per_level: 2 },
    },
  },

  // Contract / order-board balance.
  contracts: {
    board_size: 3,
    max_requirements: 3,
    material_unlock: { components: 2, finished_goods: 4 },
    resource_weight: { scrap: 1, components: 4, finished_goods: 10 },
    base_qty: { scrap: 4, components: 2, finished_goods: 1 },
    reward_coin_base: 3,
    reward_coin_var: 2,
    reward_xp_base: 1.5,
    reward_xp_var: 1,
    restoration_min: 4,
    restoration_span: 6,
  },

  // Developer tools (prototype only).
  dev: { grant_coins_amount: 1000 },
};

export type GameConfig = typeof DEFAULT_CONFIG;
