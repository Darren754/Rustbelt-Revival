import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, RADIUS, SPACING, FONT, SHADOW } from "@/src/theme/theme";
import { useGame } from "@/src/game/GameContext";
import ProgressBar from "@/src/components/ProgressBar";

export default function HallScreen() {
  const insets = useSafeAreaInsets();
  const { loading, state, config, resetGame, grantCoins, grantMaterials, grantLevel, forceEmergency, resetUpgrades, playerId } = useGame();
  const [confirmReset, setConfirmReset] = useState(false);

  if (loading || !state) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  const pct = state.restoration_points / config.restoration_goal;
  const restored = state.town_hall_restored;

  return (
    <View style={styles.container} testID="hall-screen">
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACING.lg }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Town Hall</Text>
        <Text style={styles.subtitle}>Restore the town to bring Rustbelt back to life.</Text>

        <LinearGradient
          colors={restored ? [COLORS.brandTertiary, COLORS.brandPrimary] : ["#5A544B", "#39352E"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <MaterialCommunityIcons
            name={restored ? "city-variant" : "city-variant-outline"}
            size={92}
            color={restored ? "#FFFFFF" : "rgba(255,255,255,0.55)"}
          />
          <Text style={styles.heroText}>{restored ? "Restored & Ringing!" : "Awaiting Restoration"}</Text>
        </LinearGradient>

        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <Text style={styles.progressLabel}>Restoration Progress</Text>
            <Text style={styles.progressNum} testID="hall-restoration-value">
              {state.restoration_points}/{config.restoration_goal}
            </Text>
          </View>
          <ProgressBar progress={pct} height={16} color={COLORS.success} testID="hall-restoration-bar" />
          <Text style={styles.progressHint}>
            {restored
              ? "The Town Hall is fully restored. The whole town thanks you!"
              : "Fulfil contracts at the Shipping Depot to earn restoration points."}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <StatBox icon="star-four-points" label="Level" value={`${state.level}`} />
          <StatBox icon="clock-outline" label="Offline Cap" value={`${Math.round(config.offline_cap_seconds / 3600)}h`} />
        </View>

        <View style={styles.devCard} testID="dev-tools">
          <View style={styles.devHead}>
            <MaterialCommunityIcons name="hammer-screwdriver" size={18} color={COLORS.info} />
            <Text style={styles.devTitle}>Developer Tools</Text>
          </View>
          <Text style={styles.devSub}>Prototype testing helpers.</Text>
          <View style={styles.devRow}>
            <Pressable style={styles.devBtn} onPress={() => grantCoins()} testID="dev-grant-coins-button">
              <MaterialCommunityIcons name="cash-plus" size={18} color={COLORS.onInfo} />
              <Text style={styles.devBtnText}>Grant {config.dev.grant_coins_amount} Coins</Text>
            </Pressable>
            <Pressable style={[styles.devBtn, styles.devBtnAlt]} onPress={resetUpgrades} testID="dev-reset-upgrades-button">
              <MaterialCommunityIcons name="backup-restore" size={18} color={COLORS.onSurface} />
              <Text style={[styles.devBtnText, { color: COLORS.onSurface }]}>Reset Upgrades</Text>
            </Pressable>
          </View>
          <View style={styles.devRow}>
            <Pressable style={styles.devBtn} onPress={grantMaterials} testID="dev-grant-materials-button">
              <MaterialCommunityIcons name="package-variant" size={18} color={COLORS.onInfo} />
              <Text style={styles.devBtnText}>Grant Materials</Text>
            </Pressable>
            <Pressable style={styles.devBtn} onPress={grantLevel} testID="dev-grant-level-button">
              <MaterialCommunityIcons name="chevron-double-up" size={18} color={COLORS.onInfo} />
              <Text style={styles.devBtnText}>Level Up</Text>
            </Pressable>
          </View>
          <Pressable style={[styles.devBtn, styles.devEmergency]} onPress={forceEmergency} testID="dev-force-emergency-button">
            <MaterialCommunityIcons name="alert-decagram" size={18} color={COLORS.onBrandPrimary} />
            <Text style={styles.devBtnText}>Spawn Emergency Contract</Text>
          </Pressable>
        </View>

        <Pressable style={styles.resetBtn} onPress={() => setConfirmReset(true)} testID="reset-game-button">
          <MaterialCommunityIcons name="restart" size={18} color={COLORS.error} />
          <Text style={styles.resetText}>Start a New Town</Text>
        </Pressable>

        <Text style={styles.playerId}>Save ID: {playerId}</Text>
      </ScrollView>

      <Modal visible={confirmReset} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.confirmCard} testID="reset-confirm-modal">
            <MaterialCommunityIcons name="alert" size={40} color={COLORS.warning} />
            <Text style={styles.confirmTitle}>Start over?</Text>
            <Text style={styles.confirmBody}>This clears all progress and begins a brand new town. This can’t be undone.</Text>
            <Pressable
              style={styles.confirmDanger}
              onPress={() => { resetGame(); setConfirmReset(false); }}
              testID="reset-confirm-button"
            >
              <Text style={styles.confirmDangerText}>Yes, reset everything</Text>
            </Pressable>
            <Pressable style={styles.confirmCancel} onPress={() => setConfirmReset(false)} testID="reset-cancel-button">
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatBox({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <MaterialCommunityIcons name={icon as any} size={24} color={COLORS.brandPrimary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  loading: { flex: 1, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING["3xl"] },
  title: { fontSize: FONT["3xl"], fontWeight: "800", color: COLORS.onSurface },
  subtitle: { fontSize: FONT.base, color: COLORS.onSurfaceSecondary, fontWeight: "600", marginTop: 2, marginBottom: SPACING.lg },
  hero: { borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center", paddingVertical: SPACING["2xl"], marginBottom: SPACING.lg, ...SHADOW.card },
  heroText: { color: "#FFFFFF", fontSize: FONT.lg, fontWeight: "800", marginTop: SPACING.sm },
  progressCard: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg },
  progressTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.md },
  progressLabel: { fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface },
  progressNum: { fontSize: FONT.lg, fontWeight: "800", color: COLORS.success },
  progressHint: { fontSize: FONT.sm, color: COLORS.onSurfaceSecondary, fontWeight: "600", marginTop: SPACING.md, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.lg },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.lg, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, ...SHADOW.soft },
  statValue: { fontSize: FONT["2xl"], fontWeight: "800", color: COLORS.onSurface, marginTop: SPACING.xs },
  statLabel: { fontSize: FONT.sm, color: COLORS.onSurfaceSecondary, fontWeight: "700" },
  resetBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, borderWidth: 1.5, borderColor: COLORS.error },
  devCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.soft },
  devHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  devTitle: { fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface },
  devSub: { fontSize: FONT.sm, color: COLORS.onSurfaceSecondary, fontWeight: "600", marginTop: 2, marginBottom: SPACING.md },
  devRow: { flexDirection: "row", gap: SPACING.sm },
  devBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: COLORS.info, borderRadius: RADIUS.md, paddingVertical: SPACING.md, marginBottom: SPACING.sm },
  devBtnAlt: { backgroundColor: COLORS.surfaceTertiary },
  devEmergency: { backgroundColor: "#D9822B" },
  devBtnText: { color: COLORS.onInfo, fontWeight: "800", fontSize: FONT.sm },
  resetText: { color: COLORS.error, fontWeight: "800", fontSize: FONT.base },
  playerId: { textAlign: "center", color: COLORS.onSurfaceTertiary, fontSize: FONT.sm, fontWeight: "600", marginTop: SPACING.lg },
  backdrop: { flex: 1, backgroundColor: "rgba(20,18,16,0.6)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  confirmCard: { width: "100%", maxWidth: 380, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", ...SHADOW.card },
  confirmTitle: { fontSize: FONT.xl, fontWeight: "800", color: COLORS.onSurface, marginTop: SPACING.sm },
  confirmBody: { fontSize: FONT.base, color: COLORS.onSurfaceSecondary, textAlign: "center", fontWeight: "600", marginTop: SPACING.sm, marginBottom: SPACING.lg, lineHeight: 20 },
  confirmDanger: { width: "100%", backgroundColor: COLORS.error, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, alignItems: "center" },
  confirmDangerText: { color: COLORS.onError, fontWeight: "800", fontSize: FONT.base },
  confirmCancel: { paddingVertical: SPACING.md, marginTop: SPACING.xs },
  confirmCancelText: { color: COLORS.onSurfaceTertiary, fontWeight: "800" },
});
