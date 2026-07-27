// Default (offline / first-run) game config. The live config is fetched from
// GET /api/config so ALL balance values (times, costs, capacities, multipliers,
// unlock levels, contract tiers/rewards/probabilities, offline cap) can be tuned
// server-side WITHOUT touching game logic.
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

  // Restoration milestones — each unlocks a named landmark, pays a one-time Coin
  // bonus, and grants a PERMANENT reward buff (+% coins & xp on all contracts).
  restoration_milestones: [
    { points: 25, landmark: "Old Clock Tower", icon: "clock-time-four", coin_bonus: 150, reward_buff_pct: 5 },
    { points: 50, landmark: "Rail Station", icon: "train-variant", coin_bonus: 350, reward_buff_pct: 5 },
    { points: 75, landmark: "River Bridge", icon: "bridge", coin_bonus: 600, reward_buff_pct: 5 },
    { points: 100, landmark: "Grand Town Hall", icon: "city-variant", coin_bonus: 1000, reward_buff_pct: 10 },
  ],

  // Per-building, per-track upgrade balance. Each track starts at level 1.
  upgrades: {
    scrap_yard: {
      speed: { max_level: 8, cost_base: 60, cost_growth: 1.7, factor: 0.85 },
      storage: { max_level: 8, cost_base: 80, cost_growth: 1.8, base_capacity: 20, per_level: 15 },
    },
    machine_shop: {
      speed: { max_level: 8, cost_base: 75, cost_growth: 1.7, factor: 0.85 },
      slots: { max_level: 3, cost_base: 600, cost_growth: 3.0 },
    },
    shipping_depot: {
      // reward payout: coins & xp multiplied by 1 + mult_per_level*(level-1)
      rewards: { max_level: 8, cost_base: 120, cost_growth: 1.8, mult_per_level: 0.15 },
      // contract quality: BIGGER orders -> qty scaled by 1 + qty_per_level*(level-1)
      quality: { max_level: 6, cost_base: 180, cost_growth: 2.0, qty_per_level: 0.2 },
    },
  },

  // Contract board — three strategic tiers + a rare limited-time emergency.
  // Rewards are PER-UNIT of requested material, so quantity drives payout and
  // higher tiers (longer production chains) pay dramatically more per contract.
  contracts: {
    board_size: 3,
    // relative spawn weight of each tier on the board (unlocked tiers only)
    tier_weights: { basic: 3, intermediate: 2, advanced: 2 },
    tiers: {
      basic: {
        material: "scrap",
        unlock_level: 1,
        qty_min: 8, qty_max: 20,
        coin_per: [0.6, 1.0], xp_per: [0.3, 0.5], rest_per: [0.1, 0.2],
        label: "Local Delivery", difficulty: "Easy", color: "#4A7C59",
      },
      intermediate: {
        material: "components",
        unlock_level: 2,
        qty_min: 4, qty_max: 10,
        coin_per: [4, 6], xp_per: [2, 3], rest_per: [0.7, 1.2],
        label: "Regional Contract", difficulty: "Medium", color: "#4F759B",
      },
      advanced: {
        material: "finished_goods",
        unlock_level: 4,
        qty_min: 2, qty_max: 6,
        coin_per: [18, 28], xp_per: [9, 14], rest_per: [2.5, 4],
        label: "Industrial Contract", difficulty: "Hard", color: "#7A4F9B",
      },
    },
    emergency: {
      enabled: true,
      material: "finished_goods",
      unlock_level: 4,
      qty_min: 4, qty_max: 8,
      coin_per: [40, 60], xp_per: [20, 30], rest_per: [4, 6],
      duration_seconds: 600, // limited-time window
      check_interval_seconds: 120, // how often we roll for a spawn
      spawn_chance: 0.3, // probability per check when none active
      label: "Emergency Repair", difficulty: "Rare", color: "#D9822B",
    },

    // Weighted "Value Score" used to badge standout board contracts.
    // Score  = w_coins*coins + w_xp*xp + w_restoration*restoration
    // Effort = w_materials*(total units) + w_time*(estimated production seconds)
    // Efficiency = Score / Effort. Emergency contracts are never badged.
    value_score: {
      w_coins: 1.0,
      w_xp: 1.0,
      w_restoration: 6.0,
      w_materials: 1.0,
      w_time: 0.25,
      premium_threshold: 340, // Value Score above which a contract counts as "Premium"
      unit_time_seconds: { scrap: 10, components: 40, finished_goods: 110 },
    },
  },

  // Developer tools (prototype only).
  dev: { grant_coins_amount: 1000 },
};

export type GameConfig = typeof DEFAULT_CONFIG;
