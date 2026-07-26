import React from "react";
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, RADIUS, SPACING, FONT, SHADOW, RESOURCE_META } from "@/src/theme/theme";
import { useGame } from "@/src/game/GameContext";
import ProgressBar from "./ProgressBar";
import { BuildingKey, TrackKey } from "@/src/game/types";
import {
  buildingLevel,
  depotRewardPct,
  formatDuration,
  jobDurationSec,
  jobProgress,
  jobRemainingMs,
  machineSlots,
  readyScrap,
  scrapCapacity,
  scrapCapacityForLevel,
  scrapIntervalSec,
  scrapProgress,
  trackCost,
  trackDef,
  trackMaxed,
} from "@/src/game/engine";

const META: Record<BuildingKey, { icon: string; title: string; subtitle: string }> = {
  scrap_yard: { icon: "dump-truck", title: "Scrap Yard", subtitle: "Mines scrap over time" },
  machine_shop: { icon: "factory", title: "Machine Shop", subtitle: "Manufactures goods" },
  shipping_depot: { icon: "truck-delivery", title: "Shipping Depot", subtitle: "Manages contracts" },
};

export default function BuildingSheet({ building, onClose }: { building: BuildingKey | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { state, config, now, collectScrap, startJob, upgradeTrack } = useGame();
  const visible = building !== null;
  if (!state || !building) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} />
      </Modal>
    );
  }

  const b: any = state.buildings[building];
  const meta = META[building];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="sheet-backdrop" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]} testID="building-sheet">
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name={meta.icon as any} size={34} color={COLORS.onBrandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{meta.title}</Text>
              <Text style={styles.subtitle}>{meta.subtitle}</Text>
            </View>
            <View style={styles.lvlPill}>
              <Text style={styles.lvlPillText}>Lv {buildingLevel(b)}</Text>
            </View>
          </View>

          {building === "scrap_yard" && (
            <ScrapYardBody state={state} config={config} now={now} onCollect={collectScrap} onUpgrade={upgradeTrack} />
          )}
          {building === "machine_shop" && (
            <MachineShopBody state={state} config={config} now={now} onStart={startJob} onUpgrade={upgradeTrack} />
          )}
          {building === "shipping_depot" && (
            <ShippingDepotBody state={state} config={config} onUpgrade={upgradeTrack} />
          )}
        </ScrollView>
        <Pressable style={styles.closeBtn} onPress={onClose} testID="sheet-close-button">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ---- generic upgrade track row ----
function UpgradeTrack({
  building, track, config, coins, level, icon, title, current, next, onUpgrade,
}: {
  building: BuildingKey; track: TrackKey; config: any; coins: number; level: number;
  icon: string; title: string; current: string; next: string; onUpgrade: (b: BuildingKey, t: TrackKey) => void;
}) {
  const maxed = trackMaxed(config, building, track, level);
  const cost = trackCost(config, building, track, level);
  const affordable = coins >= cost;
  return (
    <View style={styles.track} testID={`track-${building}-${track}`}>
      <View style={styles.trackHead}>
        <MaterialCommunityIcons name={icon as any} size={20} color={COLORS.brandSecondary} />
        <Text style={styles.trackTitle}>{title}</Text>
        <View style={styles.trackLvl}>
          <Text style={styles.trackLvlText}>Lv {level}</Text>
        </View>
      </View>
      <Text style={styles.trackBenefit}>Now: {current}</Text>
      {!maxed && <Text style={styles.trackNext}>Next: {next}</Text>}
      <Pressable
        onPress={() => onUpgrade(building, track)}
        disabled={maxed}
        style={[styles.trackBtn, maxed && styles.disabledBtn, !maxed && !affordable && styles.warnBorder]}
        testID={`upgrade-${building}-${track}`}
      >
        {maxed ? (
          <Text style={styles.trackBtnText}>Max Level</Text>
        ) : (
          <>
            <Text style={styles.trackBtnText}>Upgrade</Text>
            <View style={styles.costPill}>
              <MaterialCommunityIcons name="cash-multiple" size={15} color={COLORS.onBrandTertiary} />
              <Text style={styles.costText}>{cost}</Text>
            </View>
          </>
        )}
      </Pressable>
    </View>
  );
}

function ScrapYardBody({ state, config, now, onCollect, onUpgrade }: any) {
  const sy = state.buildings.scrap_yard;
  const ready = readyScrap(sy, config, now);
  const cap = scrapCapacity(sy, config);
  const prog = scrapProgress(sy, config, now);
  const interval = Math.round(scrapIntervalSec(config, sy.upgrades.speed));
  const nextInterval = Math.round(scrapIntervalSec(config, sy.upgrades.speed + 1));
  const nextCap = scrapCapacityForLevel(config, sy.upgrades.storage + 1);

  return (
    <View>
      <View style={styles.readyCard}>
        <Text style={styles.readyLabel}>Ready to collect</Text>
        <View style={styles.readyRow}>
          <MaterialCommunityIcons name="anvil" size={28} color={RESOURCE_META.scrap.color} />
          <Text style={styles.readyNum} testID="scrapyard-ready">{ready}</Text>
          <Text style={styles.capText}>/ {cap}</Text>
        </View>
        <View style={{ marginTop: SPACING.md }}>
          <ProgressBar progress={prog} height={14} color={ready >= cap ? COLORS.warning : COLORS.brandTertiary} testID="scrapyard-progress" />
        </View>
        <Text style={styles.hint}>
          {ready >= cap ? "Storage full — collect to keep mining!" : `Next scrap in ${Math.max(0, Math.ceil((1 - prog) * interval))}s`}
        </Text>
      </View>

      <Pressable style={[styles.primaryBtn, ready <= 0 && styles.disabledBtn]} onPress={onCollect} testID="collect-scrap-button">
        <MaterialCommunityIcons name="hand-back-right" size={22} color={COLORS.onBrandPrimary} />
        <Text style={styles.primaryText}>{ready > 0 ? `Collect ${ready} Scrap` : "Nothing ready"}</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Upgrades</Text>
      <UpgradeTrack
        building="scrap_yard" track="speed" config={config} coins={state.resources.coins} level={sy.upgrades.speed}
        icon="speedometer" title="Production Rate"
        current={`1 scrap / ${interval}s`} next={`1 scrap / ${nextInterval}s`} onUpgrade={onUpgrade}
      />
      <UpgradeTrack
        building="scrap_yard" track="storage" config={config} coins={state.resources.coins} level={sy.upgrades.storage}
        icon="warehouse" title="Storage Capacity"
        current={`${cap} scrap`} next={`${nextCap} scrap`} onUpgrade={onUpgrade}
      />
    </View>
  );
}

function RecipeCard({ label, icon, costText, durationText, onStart, disabled, testID }: any) {
  return (
    <Pressable style={[styles.recipe, disabled && styles.disabledBtn]} onPress={onStart} disabled={disabled} testID={testID}>
      <View style={styles.recipeIcon}>
        <MaterialCommunityIcons name={icon} size={26} color={COLORS.brandSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.recipeTitle}>{label}</Text>
        <Text style={styles.recipeMeta}>{costText}</Text>
      </View>
      <View style={styles.recipeRight}>
        <Text style={styles.recipeDur}>{durationText}</Text>
        <Text style={styles.recipeStart}>{disabled ? "Full" : "Start"}</Text>
      </View>
    </Pressable>
  );
}

function MachineShopBody({ state, config, now, onStart, onUpgrade }: any) {
  const ms = state.buildings.machine_shop;
  const slots = machineSlots(ms, config);
  const full = ms.jobs.length >= slots;
  const compDur = Math.round(jobDurationSec(config, "component", ms.upgrades.speed));
  const finDur = Math.round(jobDurationSec(config, "finished", ms.upgrades.speed));
  const nextCompDur = Math.round(jobDurationSec(config, "component", ms.upgrades.speed + 1));

  const slotViews = [] as React.ReactNode[];
  for (let i = 0; i < slots; i++) {
    const job = ms.jobs[i];
    slotViews.push(
      <View key={i} style={styles.slot} testID={`machine-slot-${i}`}>
        {job ? (
          <>
            <Text style={styles.slotLabel}>
              {job.type === "component" ? "Component" : "Finished Good"} · {formatDuration(jobRemainingMs(job, now))}
            </Text>
            <ProgressBar progress={jobProgress(job, now)} height={12} color={COLORS.brandPrimary} testID={`machine-progress-${i}`} />
          </>
        ) : (
          <Text style={styles.slotEmpty}>Slot {i + 1} — idle</Text>
        )}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.readyCard} testID="machine-slots">
        <Text style={styles.readyLabel}>Production Slots ({ms.jobs.length}/{slots})</Text>
        <View style={{ gap: SPACING.sm, marginTop: SPACING.sm }}>{slotViews}</View>
      </View>

      <RecipeCard label="Make Component" icon="cog" costText="2 Scrap → 1 Component" durationText={`${compDur}s`} onStart={() => onStart("component")} disabled={full} testID="recipe-make-component" />
      <RecipeCard label="Make Finished Good" icon="package-variant-closed" costText="2 Components → 1 Good" durationText={`${finDur}s`} onStart={() => onStart("finished")} disabled={full} testID="recipe-make-finished-good" />

      <Text style={styles.sectionLabel}>Upgrades</Text>
      <UpgradeTrack
        building="machine_shop" track="speed" config={config} coins={state.resources.coins} level={ms.upgrades.speed}
        icon="speedometer" title="Production Time"
        current={`${compDur}s / ${finDur}s`} next={`${nextCompDur}s / ${Math.round(jobDurationSec(config, "finished", ms.upgrades.speed + 1))}s`} onUpgrade={onUpgrade}
      />
      <UpgradeTrack
        building="machine_shop" track="slots" config={config} coins={state.resources.coins} level={ms.upgrades.slots}
        icon="widgets" title="Production Slots"
        current={`${slots} slot${slots > 1 ? "s" : ""}`} next={`${slots + 1} slots`} onUpgrade={onUpgrade}
      />
    </View>
  );
}

function ShippingDepotBody({ state, config, onUpgrade }: any) {
  const depot = state.buildings.shipping_depot;
  const rewardPct = depotRewardPct(config, depot.upgrades.rewards);
  const nextRewardPct = depotRewardPct(config, depot.upgrades.rewards + 1);
  const q = config.upgrades.shipping_depot.quality;
  const restBonus = q.restoration_per_level * (depot.upgrades.quality - 1);
  const nextRestBonus = q.restoration_per_level * depot.upgrades.quality;

  return (
    <View>
      <View style={styles.readyCard}>
        <Text style={styles.readyLabel}>Depot bonuses apply to every contract</Text>
        <Text style={styles.hint}>+{rewardPct}% Coins &amp; XP · +{restBonus} restoration per order</Text>
      </View>

      <Text style={styles.sectionLabel}>Upgrades</Text>
      <UpgradeTrack
        building="shipping_depot" track="rewards" config={config} coins={state.resources.coins} level={depot.upgrades.rewards}
        icon="cash-plus" title="Contract Rewards"
        current={`+${rewardPct}% Coins & XP`} next={`+${nextRewardPct}% Coins & XP`} onUpgrade={onUpgrade}
      />
      <UpgradeTrack
        building="shipping_depot" track="quality" config={config} coins={state.resources.coins} level={depot.upgrades.quality}
        icon="star-shooting" title="Contract Quality"
        current={`Bigger orders · +${restBonus} restoration`} next={`Bigger orders · +${nextRestBonus} restoration`} onUpgrade={onUpgrade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,18,16,0.55)" },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, maxHeight: "88%" },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: COLORS.borderStrong, marginBottom: SPACING.md },
  header: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.lg },
  iconBox: { width: 60, height: 60, borderRadius: RADIUS.md, backgroundColor: COLORS.brandPrimary, alignItems: "center", justifyContent: "center", marginRight: SPACING.md, ...SHADOW.soft },
  title: { fontSize: FONT["2xl"], fontWeight: "800", color: COLORS.onSurface },
  subtitle: { fontSize: FONT.base, color: COLORS.onSurfaceSecondary, marginTop: 2, fontWeight: "600" },
  lvlPill: { backgroundColor: COLORS.surfaceTertiary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  lvlPillText: { fontWeight: "800", color: COLORS.onSurfaceTertiary },
  readyCard: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.md },
  readyLabel: { fontSize: FONT.base, color: COLORS.onSurfaceSecondary, fontWeight: "700" },
  readyRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm, marginTop: SPACING.sm },
  readyNum: { fontSize: 40, fontWeight: "800", color: COLORS.onSurface, lineHeight: 44 },
  capText: { fontSize: FONT.lg, fontWeight: "700", color: COLORS.onSurfaceTertiary, marginBottom: 6 },
  hint: { fontSize: FONT.sm, color: COLORS.onSurfaceTertiary, marginTop: SPACING.sm, fontWeight: "600" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, backgroundColor: COLORS.brandPrimary, borderRadius: RADIUS.lg, paddingVertical: SPACING.lg, marginBottom: SPACING.md, ...SHADOW.soft },
  primaryText: { color: COLORS.onBrandPrimary, fontSize: FONT.lg, fontWeight: "800" },
  disabledBtn: { opacity: 0.45 },
  warnBorder: { borderWidth: 2, borderColor: COLORS.warning },
  slot: { backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  slotLabel: { fontSize: FONT.sm, fontWeight: "700", color: COLORS.onSurface, marginBottom: 6 },
  slotEmpty: { fontSize: FONT.sm, fontWeight: "700", color: COLORS.onSurfaceTertiary },
  sectionLabel: { fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface, marginTop: SPACING.sm, marginBottom: SPACING.sm },
  track: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.sm },
  trackHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.xs },
  trackTitle: { flex: 1, fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface },
  trackLvl: { backgroundColor: COLORS.surfaceTertiary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  trackLvlText: { fontSize: FONT.sm, fontWeight: "800", color: COLORS.onSurfaceTertiary },
  trackBenefit: { fontSize: FONT.sm, color: COLORS.onSurfaceSecondary, fontWeight: "700" },
  trackNext: { fontSize: FONT.sm, color: COLORS.success, fontWeight: "700", marginTop: 2 },
  trackBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, backgroundColor: COLORS.surfaceInverse, borderRadius: RADIUS.md, paddingVertical: SPACING.md, marginTop: SPACING.md },
  trackBtnText: { color: COLORS.onSurfaceInverse, fontSize: FONT.base, fontWeight: "800" },
  costPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.brandTertiary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: 4 },
  costText: { fontWeight: "800", color: COLORS.onBrandTertiary, fontSize: FONT.sm },
  recipe: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  recipeIcon: { width: 46, height: 46, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center", marginRight: SPACING.md },
  recipeTitle: { fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface },
  recipeMeta: { fontSize: FONT.sm, color: COLORS.onSurfaceSecondary, marginTop: 2, fontWeight: "600" },
  recipeRight: { alignItems: "flex-end" },
  recipeDur: { fontSize: FONT.sm, color: COLORS.onSurfaceTertiary, fontWeight: "700" },
  recipeStart: { fontSize: FONT.base, color: COLORS.brandPrimary, fontWeight: "800", marginTop: 2 },
  closeBtn: { alignItems: "center", paddingVertical: SPACING.md, marginTop: SPACING.xs },
  closeText: { color: COLORS.onSurfaceTertiary, fontWeight: "800", fontSize: FONT.base },
});
