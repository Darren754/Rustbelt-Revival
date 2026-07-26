import React from "react";
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, RADIUS, SPACING, FONT, SHADOW, RESOURCE_META } from "@/src/theme/theme";
import { useGame } from "@/src/game/GameContext";
import ProgressBar from "./ProgressBar";
import {
  formatDuration,
  isMaxLevel,
  jobDurationMs,
  jobProgress,
  jobRemainingMs,
  readyScrap,
  scrapIntervalMs,
  scrapProgress,
  speedMult,
  upgradeCost,
} from "@/src/game/engine";

type Building = "scrap_yard" | "machine_shop" | null;

export default function BuildingSheet({ building, onClose }: { building: Building; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { state, config, now, collectScrap, startJob, upgradeBuilding } = useGame();
  const visible = building !== null;
  if (!state) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="sheet-backdrop" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]} testID="building-sheet">
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          {building === "scrap_yard" && (
            <ScrapYardBody state={state} config={config} now={now} onCollect={collectScrap} onUpgrade={() => upgradeBuilding("scrap_yard")} />
          )}
          {building === "machine_shop" && (
            <MachineShopBody state={state} config={config} now={now} onStart={startJob} onUpgrade={() => upgradeBuilding("machine_shop")} />
          )}
        </ScrollView>
        <Pressable style={styles.closeBtn} onPress={onClose} testID="sheet-close-button">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function SheetHeader({ icon, title, subtitle, level }: { icon: string; title: string; subtitle: string; level: number }) {
  return (
    <View style={styles.header}>
      <View style={styles.iconBox}>
        <MaterialCommunityIcons name={icon as any} size={34} color={COLORS.onBrandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <View style={styles.lvlPill}>
        <Text style={styles.lvlPillText}>Lv {level}</Text>
      </View>
    </View>
  );
}

function UpgradeButton({ level, config, coins, onUpgrade, effect }: { level: number; config: any; coins: number; onUpgrade: () => void; effect: string }) {
  const maxed = isMaxLevel(level, config);
  const cost = upgradeCost(level, config);
  const affordable = coins >= cost;
  return (
    <Pressable
      testID="upgrade-button"
      onPress={onUpgrade}
      disabled={maxed}
      style={[styles.upgradeBtn, maxed && styles.disabledBtn, !maxed && !affordable && styles.warnBorder]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.upgradeTitle}>{maxed ? "Max Level Reached" : "Upgrade Building"}</Text>
        {!maxed && <Text style={styles.upgradeEffect}>{effect}</Text>}
      </View>
      {!maxed && (
        <View style={styles.costPill}>
          <MaterialCommunityIcons name="cash-multiple" size={16} color={COLORS.onBrandTertiary} />
          <Text style={styles.costText}>{cost}</Text>
        </View>
      )}
    </Pressable>
  );
}

function ScrapYardBody({ state, config, now, onCollect, onUpgrade }: any) {
  const sy = state.buildings.scrap_yard;
  const ready = readyScrap(sy, config, now);
  const prog = scrapProgress(sy, config, now);
  const interval = Math.round(scrapIntervalMs(sy, config) / 1000);
  const nextLevelInterval = Math.round((config.scrap_yard.base_interval * speedMult(sy.level + 1, config)) );
  return (
    <View>
      <SheetHeader icon="dump-truck" title="Scrap Yard" subtitle={`+${config.scrap_yard.produce} Scrap every ${interval}s`} level={sy.level} />

      <View style={styles.readyCard}>
        <Text style={styles.readyLabel}>Ready to collect</Text>
        <View style={styles.readyRow}>
          <MaterialCommunityIcons name="anvil" size={28} color={RESOURCE_META.scrap.color} />
          <Text style={styles.readyNum} testID="scrapyard-ready">{ready}</Text>
        </View>
        <View style={{ marginTop: SPACING.md }}>
          <ProgressBar progress={prog} height={14} color={COLORS.brandTertiary} testID="scrapyard-progress" />
        </View>
        <Text style={styles.hint}>Next scrap in {Math.max(0, Math.ceil((1 - prog) * interval))}s</Text>
      </View>

      <Pressable
        style={[styles.primaryBtn, ready <= 0 && styles.disabledBtn]}
        onPress={onCollect}
        testID="collect-scrap-button"
      >
        <MaterialCommunityIcons name="hand-back-right" size={22} color={COLORS.onBrandPrimary} />
        <Text style={styles.primaryText}>{ready > 0 ? `Collect ${ready} Scrap` : "Nothing ready"}</Text>
      </Pressable>

      <UpgradeButton
        level={sy.level}
        config={config}
        coins={state.resources.coins}
        onUpgrade={onUpgrade}
        effect={`Faster mining: ${interval}s \u2192 ${nextLevelInterval}s per scrap`}
      />
    </View>
  );
}

function RecipeCard({ label, icon, costText, durationText, onStart, disabled, busy }: any) {
  return (
    <Pressable
      style={[styles.recipe, disabled && styles.disabledBtn]}
      onPress={onStart}
      disabled={disabled}
      testID={`recipe-${label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <View style={styles.recipeIcon}>
        <MaterialCommunityIcons name={icon} size={26} color={COLORS.brandSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.recipeTitle}>{label}</Text>
        <Text style={styles.recipeMeta}>{costText}</Text>
      </View>
      <View style={styles.recipeRight}>
        <Text style={styles.recipeDur}>{durationText}</Text>
        <Text style={styles.recipeStart}>{busy ? "Busy" : "Start"}</Text>
      </View>
    </Pressable>
  );
}

function MachineShopBody({ state, config, now, onStart, onUpgrade }: any) {
  const ms = state.buildings.machine_shop;
  const busy = !!ms.job;
  const compDur = Math.round(jobDurationMs("component", ms.level, config) / 1000);
  const finDur = Math.round(jobDurationMs("finished", ms.level, config) / 1000);

  return (
    <View>
      <SheetHeader icon="factory" title="Machine Shop" subtitle="One production job at a time" level={ms.level} />

      {busy ? (
        <View style={styles.readyCard} testID="machine-active-job">
          <Text style={styles.readyLabel}>Producing {ms.job.type === "component" ? "Component" : "Finished Good"}</Text>
          <View style={{ marginTop: SPACING.md }}>
            <ProgressBar progress={jobProgress(ms, now)} height={16} color={COLORS.brandPrimary} testID="machine-progress" />
          </View>
          <Text style={styles.hint}>{formatDuration(jobRemainingMs(ms, now))} remaining</Text>
        </View>
      ) : (
        <View style={styles.readyCard}>
          <Text style={styles.readyLabel}>Idle — pick a recipe</Text>
        </View>
      )}

      <RecipeCard
        label="Make Component"
        icon="cog"
        costText="2 Scrap → 1 Component"
        durationText={`${compDur}s`}
        onStart={() => onStart("component")}
        disabled={busy}
        busy={busy}
      />
      <RecipeCard
        label="Make Finished Good"
        icon="package-variant-closed"
        costText="2 Components → 1 Good"
        durationText={`${finDur}s`}
        onStart={() => onStart("finished")}
        disabled={busy}
        busy={busy}
      />

      <UpgradeButton
        level={ms.level}
        config={config}
        coins={state.resources.coins}
        onUpgrade={onUpgrade}
        effect={`Faster production (\u221215% time per level)`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,18,16,0.55)" },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    maxHeight: "86%",
  },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: COLORS.borderStrong, marginBottom: SPACING.md },
  header: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.lg },
  iconBox: {
    width: 60, height: 60, borderRadius: RADIUS.md, backgroundColor: COLORS.brandPrimary,
    alignItems: "center", justifyContent: "center", marginRight: SPACING.md, ...SHADOW.soft,
  },
  title: { fontSize: FONT["2xl"], fontWeight: "800", color: COLORS.onSurface },
  subtitle: { fontSize: FONT.base, color: COLORS.onSurfaceSecondary, marginTop: 2, fontWeight: "600" },
  lvlPill: { backgroundColor: COLORS.surfaceTertiary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  lvlPillText: { fontWeight: "800", color: COLORS.onSurfaceTertiary },
  readyCard: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.md },
  readyLabel: { fontSize: FONT.base, color: COLORS.onSurfaceSecondary, fontWeight: "700" },
  readyRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.sm },
  readyNum: { fontSize: 40, fontWeight: "800", color: COLORS.onSurface },
  hint: { fontSize: FONT.sm, color: COLORS.onSurfaceTertiary, marginTop: SPACING.sm, fontWeight: "600" },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
    backgroundColor: COLORS.brandPrimary, borderRadius: RADIUS.lg, paddingVertical: SPACING.lg, marginBottom: SPACING.md, ...SHADOW.soft,
  },
  primaryText: { color: COLORS.onBrandPrimary, fontSize: FONT.lg, fontWeight: "800" },
  disabledBtn: { opacity: 0.45 },
  warnBorder: { borderWidth: 2, borderColor: COLORS.warning },
  upgradeBtn: {
    flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.md, padding: SPACING.lg, marginTop: SPACING.xs,
  },
  upgradeTitle: { fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface },
  upgradeEffect: { fontSize: FONT.sm, color: COLORS.onSurfaceSecondary, marginTop: 2, fontWeight: "600" },
  costPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  costText: { fontWeight: "800", color: COLORS.onBrandTertiary, fontSize: FONT.base },
  recipe: {
    flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm,
  },
  recipeIcon: { width: 46, height: 46, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center", marginRight: SPACING.md },
  recipeTitle: { fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface },
  recipeMeta: { fontSize: FONT.sm, color: COLORS.onSurfaceSecondary, marginTop: 2, fontWeight: "600" },
  recipeRight: { alignItems: "flex-end" },
  recipeDur: { fontSize: FONT.sm, color: COLORS.onSurfaceTertiary, fontWeight: "700" },
  recipeStart: { fontSize: FONT.base, color: COLORS.brandPrimary, fontWeight: "800", marginTop: 2 },
  closeBtn: { alignItems: "center", paddingVertical: SPACING.md, marginTop: SPACING.xs },
  closeText: { color: COLORS.onSurfaceTertiary, fontWeight: "800", fontSize: FONT.base },
});
