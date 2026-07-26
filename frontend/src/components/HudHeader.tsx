import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, RADIUS, SPACING, FONT, SHADOW, RESOURCE_META } from "@/src/theme/theme";
import ProgressBar from "./ProgressBar";
import { GameConfig } from "@/src/game/config";
import { xpForLevel } from "@/src/game/engine";
import { GameState } from "@/src/game/types";

const RES_ORDER = ["scrap", "components", "finished_goods", "coins"] as const;

export default function HudHeader({ state, config }: { state: GameState; config: GameConfig }) {
  const insets = useSafeAreaInsets();
  const xpNeed = xpForLevel(state.level, config);
  const xpPct = state.xp / xpNeed;
  const restorePct = state.restoration_points / config.restoration_goal;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + SPACING.sm }]} testID="hud-header">
      {/* level + resource chips */}
      <View style={styles.topRow}>
        <View style={styles.levelBadge} testID="player-level">
          <Text style={styles.levelLabel}>LVL</Text>
          <Text style={styles.levelNum}>{state.level}</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {RES_ORDER.map((key) => {
            const meta = RESOURCE_META[key];
            return (
              <View key={key} style={styles.chip} testID={`resource-${key}`}>
                <MaterialCommunityIcons name={meta.icon as any} size={18} color={meta.color} />
                <Text style={styles.chipValue}>{Math.floor((state.resources as any)[key])}</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* xp bar */}
      <View style={styles.xpRow}>
        <MaterialCommunityIcons name="star-four-points" size={14} color={COLORS.brandPrimary} />
        <View style={{ flex: 1, marginHorizontal: SPACING.sm }}>
          <ProgressBar progress={xpPct} height={8} color={COLORS.brandPrimary} testID="xp-bar" />
        </View>
        <Text style={styles.xpText}>
          {Math.floor(state.xp)}/{xpNeed}
        </Text>
      </View>

      {/* restoration meter */}
      <View style={styles.restoreRow}>
        <MaterialCommunityIcons name="city-variant" size={16} color={COLORS.success} />
        <Text style={styles.restoreLabel}>Town Restoration</Text>
        <View style={{ flex: 1, marginHorizontal: SPACING.sm }}>
          <ProgressBar progress={restorePct} height={10} color={COLORS.success} testID="restoration-bar" />
        </View>
        <Text style={styles.restoreText}>
          {state.restoration_points}/{config.restoration_goal}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.surfaceInverse,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    ...SHADOW.card,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  levelBadge: {
    backgroundColor: COLORS.brandPrimary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    alignItems: "center",
    marginRight: SPACING.sm,
    minWidth: 52,
  },
  levelLabel: { color: COLORS.onBrandPrimary, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  levelNum: { color: COLORS.onBrandPrimary, fontSize: FONT.xl, fontWeight: "800", lineHeight: 24 },
  chipsRow: {
    gap: SPACING.sm,
    alignItems: "center",
    paddingRight: SPACING.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3A3B3A",
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 6,
    flexShrink: 0,
  },
  chipValue: { color: COLORS.onSurfaceInverse, fontSize: FONT.base, fontWeight: "800" },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.md,
  },
  xpText: { color: "#C9C5BE", fontSize: FONT.sm, fontWeight: "700", minWidth: 56, textAlign: "right" },
  restoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  restoreLabel: { color: "#C9C5BE", fontSize: FONT.sm, fontWeight: "700", marginLeft: 4 },
  restoreText: { color: COLORS.brandTertiary, fontSize: FONT.sm, fontWeight: "800", minWidth: 48, textAlign: "right" },
});
