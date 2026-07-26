// Rustbelt Revival design tokens (from design_guidelines.json)
export const COLORS = {
  surface: "#F5F2EE",
  onSurface: "#2A2B2A",
  surfaceSecondary: "#E8E5DF",
  onSurfaceSecondary: "#3F413F",
  surfaceTertiary: "#D9D4CD",
  onSurfaceTertiary: "#4B4E4B",
  surfaceInverse: "#2A2B2A",
  onSurfaceInverse: "#F5F2EE",
  brand: "#CC5500",
  brandPrimary: "#D95A21",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#B34726",
  brandTertiary: "#F2B84B",
  onBrandTertiary: "#2A2B2A",
  success: "#4A7C59",
  onSuccess: "#FFFFFF",
  warning: "#F2B84B",
  onWarning: "#2A2B2A",
  error: "#C84C3C",
  onError: "#FFFFFF",
  info: "#4F759B",
  onInfo: "#FFFFFF",
  border: "#D9D4CD",
  borderStrong: "#B3AC9F",
  divider: "#E8E5DF",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
};

export const RADIUS = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const FONT = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
};

export const SHADOW = {
  card: {
    shadowColor: "#2A2B2A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  soft: {
    shadowColor: "#2A2B2A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
};

// Per-resource visual identity
export const RESOURCE_META: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  scrap: { label: "Scrap", icon: "anvil", color: "#8A8177" },
  components: { label: "Components", icon: "cog", color: "#4F759B" },
  finished_goods: { label: "Goods", icon: "package-variant-closed", color: "#4A7C59" },
  coins: { label: "Coins", icon: "cash-multiple", color: "#D9A21B" },
  xp: { label: "XP", icon: "star-four-points", color: "#D95A21" },
};
