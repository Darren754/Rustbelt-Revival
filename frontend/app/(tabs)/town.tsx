import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { COLORS, RADIUS, SPACING, FONT, SHADOW } from "@/src/theme/theme";
import { useGame } from "@/src/game/GameContext";
import HudHeader from "@/src/components/HudHeader";
import BuildingSheet from "@/src/components/BuildingSheet";
import WelcomeBackModal from "@/src/components/WelcomeBackModal";
import CelebrationModal from "@/src/components/CelebrationModal";
import ProgressBar from "@/src/components/ProgressBar";
import {
  buildingLevel,
  canFulfill,
  formatDuration,
  jobProgress,
  jobRemainingMs,
  machineSlots,
  readyScrap,
  scrapCapacity,
  scrapProgress,
} from "@/src/game/engine";

export default function TownScreen() {
  const router = useRouter();
  const { loading, state, config, now, markTutorialSeen } = useGame();
  const [sheet, setSheet] = useState<"scrap_yard" | "machine_shop" | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const prevRestored = useRef<boolean>(false);

  useEffect(() => {
    if (!state) return;
    if (state.town_hall_restored && !prevRestored.current) setCelebrate(true);
    prevRestored.current = state.town_hall_restored;
  }, [state?.town_hall_restored]);

  if (loading || !state) {
    return (
      <View style={styles.loading} testID="town-loading">
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
        <Text style={styles.loadingText}>Clearing the rubble…</Text>
      </View>
    );
  }

  const sy = state.buildings.scrap_yard;
  const ms = state.buildings.machine_shop;
  const scrapReady = readyScrap(sy, config, now);
  const scrapCap = scrapCapacity(sy, config);
  const slots = machineSlots(ms, config);
  const soonestJob = ms.jobs.length
    ? ms.jobs.reduce((a, b) => (jobRemainingMs(a, now) <= jobRemainingMs(b, now) ? a : b))
    : null;
  const readyContracts = state.contracts.filter((c) => canFulfill(state, c)).length;

  return (
    <View style={styles.container} testID="town-screen">
      <HudHeader state={state} config={config} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!state.tutorial_seen && (
          <View style={styles.tutorial} testID="tutorial-banner">
            <MaterialCommunityIcons name="lightbulb-on" size={22} color={COLORS.onBrandTertiary} />
            <Text style={styles.tutorialText}>
              Welcome, boss! Tap the Scrap Yard to collect scrap, turn it into goods at the Machine Shop, then fulfil
              Contracts for coins &amp; XP.
            </Text>
            <Pressable onPress={markTutorialSeen} hitSlop={10} testID="tutorial-dismiss">
              <MaterialCommunityIcons name="close-circle" size={22} color={COLORS.onBrandTertiary} />
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionTitle}>Your Town</Text>

        {/* Scrap Yard */}
        <BuildingCard
          testID="card-scrap-yard"
          icon="dump-truck"
          title="Scrap Yard"
          level={buildingLevel(sy)}
          gradient={["#6E6459", "#4A443C"]}
          onPress={() => setSheet("scrap_yard")}
          badge={scrapReady > 0 ? `${scrapReady}` : undefined}
        >
          <Text style={styles.cardStatus}>
            {scrapReady >= scrapCap ? `Storage full · ${scrapReady}/${scrapCap}` : scrapReady > 0 ? `${scrapReady}/${scrapCap} scrap ready` : "Mining scrap…"}
          </Text>
          <ProgressBar progress={scrapProgress(sy, config, now)} height={10} color={scrapReady >= scrapCap ? COLORS.warning : COLORS.brandTertiary} />
        </BuildingCard>

        {/* Machine Shop */}
        <BuildingCard
          testID="card-machine-shop"
          icon="factory"
          title="Machine Shop"
          level={buildingLevel(ms)}
          gradient={["#8A4B2E", "#5E3115"]}
          onPress={() => setSheet("machine_shop")}
          badge={ms.jobs.length > 0 ? `${ms.jobs.length}/${slots}` : undefined}
        >
          {soonestJob ? (
            <>
              <Text style={styles.cardStatus}>
                {ms.jobs.length}/{slots} slots working · {formatDuration(jobRemainingMs(soonestJob, now))} left
              </Text>
              <ProgressBar progress={jobProgress(soonestJob, now)} height={10} color={COLORS.brandTertiary} />
            </>
          ) : (
            <Text style={styles.cardStatus}>{slots} slot{slots > 1 ? "s" : ""} idle — tap to start a job</Text>
          )}
        </BuildingCard>

        {/* Shipping Depot */}
        <BuildingCard
          testID="card-shipping-depot"
          icon="truck-delivery"
          title="Shipping Depot"
          gradient={["#3E5A6E", "#274050"]}
          onPress={() => router.push("/contracts")}
          badge={readyContracts > 0 ? `${readyContracts}` : undefined}
        >
          <Text style={styles.cardStatus}>
            {state.contracts.length} contracts on the board
            {readyContracts > 0 ? ` · ${readyContracts} ready` : ""}
          </Text>
        </BuildingCard>
      </ScrollView>

      <BuildingSheet building={sheet} onClose={() => setSheet(null)} />
      <WelcomeBackModal />
      <CelebrationModal visible={celebrate} onClose={() => setCelebrate(false)} />
    </View>
  );
}

function BuildingCard({ icon, title, level, gradient, onPress, children, badge, testID }: any) {
  return (
    <Pressable style={styles.card} onPress={onPress} testID={testID}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardArt}>
        <MaterialCommunityIcons name={icon} size={48} color="rgba(255,255,255,0.92)" />
        {badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </LinearGradient>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {level != null && (
            <View style={styles.lvlPill}>
              <Text style={styles.lvlPillText}>Lv {level}</Text>
            </View>
          )}
        </View>
        {children}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={26} color={COLORS.onSurfaceTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  loading: { flex: 1, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", gap: SPACING.md },
  loadingText: { color: COLORS.onSurfaceSecondary, fontWeight: "700" },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING["3xl"] },
  tutorial: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.brandTertiary,
    borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg,
  },
  tutorialText: { flex: 1, color: COLORS.onBrandTertiary, fontSize: FONT.sm, fontWeight: "700", lineHeight: 18 },
  sectionTitle: { fontSize: FONT.xl, fontWeight: "800", color: COLORS.onSurface, marginBottom: SPACING.md },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card,
  },
  cardArt: {
    width: 84, height: 84, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", marginRight: SPACING.md,
  },
  badge: {
    position: "absolute", top: -6, right: -6, backgroundColor: COLORS.error, borderRadius: RADIUS.pill,
    minWidth: 26, height: 26, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, borderWidth: 2, borderColor: COLORS.surface,
  },
  badgeText: { color: COLORS.onError, fontSize: FONT.sm, fontWeight: "800" },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.sm },
  cardTitle: { fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface },
  lvlPill: { backgroundColor: COLORS.surfaceTertiary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  lvlPillText: { fontSize: FONT.sm, fontWeight: "800", color: COLORS.onSurfaceTertiary },
  cardStatus: { fontSize: FONT.sm, color: COLORS.onSurfaceSecondary, fontWeight: "600", marginBottom: SPACING.sm },
});
