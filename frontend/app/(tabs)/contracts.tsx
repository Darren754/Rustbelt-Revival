import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, RADIUS, SPACING, FONT, SHADOW, RESOURCE_META } from "@/src/theme/theme";
import { useGame } from "@/src/game/GameContext";
import { canFulfill, contractBadges, effectiveReward, formatDuration, goalWinners, milestoneRewardBuffPct } from "@/src/game/engine";
import { BadgeKey, Contract, GoalKey } from "@/src/game/types";
import BuildingSheet from "@/src/components/BuildingSheet";

const BADGE_META: Record<BadgeKey, { label: string; icon: string; color: string }> = {
  best_value: { label: "Best Value", icon: "star", color: "#D9A21B" },
  quick_cash: { label: "Quick Cash", icon: "flash", color: "#4F759B" },
  best_restoration: { label: "Best Restoration", icon: "hammer", color: "#4A7C59" },
  best_xp: { label: "Best XP", icon: "trending-up", color: "#D95A21" },
  premium: { label: "Premium", icon: "diamond-stone", color: "#7A4F9B" },
};

const GOAL_CHIPS: { key: GoalKey; label: string; icon: string }[] = [
  { key: "coins", label: "Coins", icon: "cash-multiple" },
  { key: "xp", label: "XP", icon: "star-four-points" },
  { key: "restoration", label: "Restoration", icon: "city-variant" },
];

// A chosen goal highlights the contract wearing the matching badge.
const GOAL_BADGE: Record<GoalKey, BadgeKey> = {
  coins: "quick_cash",
  xp: "best_xp",
  restoration: "best_restoration",
};

export default function ContractsScreen() {
  const insets = useSafeAreaInsets();
  const { loading, state, config, now, fulfillContract, refreshContract } = useGame();
  const [depotSheet, setDepotSheet] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<GoalKey | null>(null);

  if (loading || !state) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  const depot = state.buildings.shipping_depot;
  const emergency = state.emergency;
  const buffPct = milestoneRewardBuffPct(state.restoration_points, config);
  const badges = contractBadges(state.contracts, depot, config, buffPct);
  const winners = goalWinners(state.contracts, depot, config, buffPct);
  const recommendedId = selectedGoal
    ? (Object.keys(badges).find((id) => badges[id] === GOAL_BADGE[selectedGoal]) ?? winners[selectedGoal])
    : null;

  return (
    <View style={styles.container} testID="contracts-screen">
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Shipping Depot</Text>
          <Text style={styles.headerSub}>Pick your jobs — bigger builds pay more</Text>
        </View>
        <Pressable style={styles.upgradePill} onPress={() => setDepotSheet(true)} testID="depot-upgrade-button">
          <MaterialCommunityIcons name="arrow-up-bold-circle" size={18} color={COLORS.onBrandPrimary} />
          <Text style={styles.upgradeText}>Upgrade</Text>
        </Pressable>
        <View style={styles.coinPill}>
          <MaterialCommunityIcons name="cash-multiple" size={18} color={COLORS.brandTertiary} />
          <Text style={styles.coinText}>{Math.floor(state.resources.coins)}</Text>
        </View>
      </View>

      <View style={styles.goalBar}>
        <Text style={styles.goalLabel}>My goal:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.goalRow}>
          {GOAL_CHIPS.map((g) => {
            const active = selectedGoal === g.key;
            return (
              <Pressable
                key={g.key}
                onPress={() => setSelectedGoal(active ? null : g.key)}
                style={[styles.goalChip, active && styles.goalChipActive]}
                testID={`goal-chip-${g.key}`}
              >
                <MaterialCommunityIcons name={g.icon as any} size={16} color={active ? COLORS.onBrandPrimary : COLORS.onSurfaceSecondary} />
                <Text style={[styles.goalChipText, active && styles.goalChipTextActive]}>{g.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {emergency && (
          <EmergencyCard
            contract={emergency}
            reward={effectiveReward(emergency, depot, config, buffPct)}
            remainingMs={emergency.expires_at ? emergency.expires_at - now : 0}
            fulfillable={canFulfill(state, emergency)}
            inventory={state.resources}
            onFulfill={() => fulfillContract(emergency.id)}
          />
        )}

        {state.contracts.map((c) => (
          <ContractCard
            key={c.id}
            contract={c}
            reward={effectiveReward(c, depot, config, buffPct)}
            badge={badges[c.id]}
            recommended={!!recommendedId && c.id === recommendedId}
            fulfillable={canFulfill(state, c)}
            inventory={state.resources}
            onFulfill={() => fulfillContract(c.id)}
            onRefresh={() => refreshContract(c.id)}
          />
        ))}
      </ScrollView>

      <BuildingSheet building={depotSheet ? "shipping_depot" : null} onClose={() => setDepotSheet(false)} />
    </View>
  );
}

function RewardRow({ reward }: { reward: { coins: number; xp: number; restoration: number } }) {
  return (
    <View style={styles.rewardRow}>
      <Reward icon="cash-multiple" color={RESOURCE_META.coins.color} value={`+${reward.coins}`} />
      <Reward icon="star-four-points" color={COLORS.brandPrimary} value={`+${reward.xp} XP`} />
      <Reward icon="city-variant" color={COLORS.success} value={`+${reward.restoration}`} />
    </View>
  );
}

function ReqChips({ contract, inventory }: { contract: Contract; inventory: any }) {
  return (
    <View style={styles.reqRow}>
      {contract.requirements.map((r) => {
        const meta = RESOURCE_META[r.resource];
        const have = Math.floor(inventory[r.resource]);
        const ok = have >= r.qty;
        return (
          <View key={r.resource} style={styles.reqChip}>
            <MaterialCommunityIcons name={meta.icon as any} size={18} color={meta.color} />
            <Text style={styles.reqAmount}>{r.qty}</Text>
            <Text style={styles.reqLabel}>{meta.label}</Text>
            <Text style={[styles.reqHave, { color: ok ? COLORS.success : COLORS.error }]}>({have})</Text>
          </View>
        );
      })}
    </View>
  );
}

function ContractCard({ contract, reward, badge, recommended, fulfillable, inventory, onFulfill, onRefresh }: {
  contract: Contract;
  reward: { coins: number; xp: number; restoration: number };
  badge?: BadgeKey;
  recommended?: boolean;
  fulfillable: boolean;
  inventory: any;
  onFulfill: () => void;
  onRefresh: () => void;
}) {
  const bm = badge ? BADGE_META[badge] : null;
  return (
    <View
      style={[styles.card, { borderLeftColor: contract.color, borderLeftWidth: 5 }, recommended && styles.cardRecommended]}
      testID={`contract-${contract.id}`}
    >
      {recommended && (
        <View style={styles.recommendTag} testID={`contract-recommended-${contract.id}`}>
          <MaterialCommunityIcons name="target" size={13} color={COLORS.onBrandPrimary} />
          <Text style={styles.recommendText}>Best for your goal</Text>
        </View>
      )}
      {bm && (
        <View style={[styles.badge, { backgroundColor: bm.color }]} testID={`contract-badge-${badge}`}>
          <MaterialCommunityIcons name={bm.icon as any} size={13} color={"#FFFFFF"} />
          <Text style={styles.badgeText}>{bm.label}</Text>
        </View>
      )}
      <View style={styles.cardTop}>
        <View style={[styles.tierDot, { backgroundColor: contract.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{contract.label}</Text>
          <View style={[styles.diffPill, { backgroundColor: contract.color + "22" }]}>
            <Text style={[styles.diffText, { color: contract.color }]}>{contract.difficulty}</Text>
          </View>
        </View>
        <Pressable onPress={onRefresh} hitSlop={10} testID={`contract-refresh-${contract.id}`} style={styles.refreshBtn}>
          <MaterialCommunityIcons name="refresh" size={20} color={COLORS.onSurfaceTertiary} />
        </Pressable>
      </View>

      <ReqChips contract={contract} inventory={inventory} />
      <RewardRow reward={reward} />

      <Pressable
        style={[styles.fulfillBtn, !fulfillable && styles.fulfillDisabled]}
        onPress={onFulfill}
        disabled={!fulfillable}
        testID={`contract-fulfill-${contract.id}`}
      >
        <MaterialCommunityIcons name="truck-check" size={20} color={COLORS.onBrandPrimary} />
        <Text style={styles.fulfillText}>{fulfillable ? "Fulfil Order" : "Not enough resources"}</Text>
      </Pressable>
    </View>
  );
}

function EmergencyCard({ contract, reward, remainingMs, fulfillable, inventory, onFulfill }: {
  contract: Contract;
  reward: { coins: number; xp: number; restoration: number };
  remainingMs: number;
  fulfillable: boolean;
  inventory: any;
  onFulfill: () => void;
}) {
  return (
    <View style={[styles.card, styles.emergencyCard]} testID="contract-emergency">
      <View style={styles.emergencyRibbon}>
        <MaterialCommunityIcons name="alert-decagram" size={16} color={COLORS.onBrandPrimary} />
        <Text style={styles.ribbonText}>LIMITED TIME</Text>
        <View style={styles.timerPill}>
          <MaterialCommunityIcons name="timer-sand" size={13} color={contract.color} />
          <Text style={[styles.timerText, { color: contract.color }]} testID="emergency-timer">
            {formatDuration(remainingMs)}
          </Text>
        </View>
      </View>
      <View style={styles.cardTop}>
        <View style={[styles.tierDot, { backgroundColor: contract.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{contract.label}</Text>
          <View style={[styles.diffPill, { backgroundColor: contract.color + "22" }]}>
            <Text style={[styles.diffText, { color: contract.color }]}>{contract.difficulty} · Huge Reward</Text>
          </View>
        </View>
      </View>

      <ReqChips contract={contract} inventory={inventory} />
      <RewardRow reward={reward} />

      <Pressable
        style={[styles.fulfillBtn, { backgroundColor: contract.color }, !fulfillable && styles.fulfillDisabled]}
        onPress={onFulfill}
        disabled={!fulfillable}
        testID="contract-fulfill-emergency"
      >
        <MaterialCommunityIcons name="truck-check" size={20} color={COLORS.onBrandPrimary} />
        <Text style={styles.fulfillText}>{fulfillable ? "Rush the Repair!" : "Not enough resources"}</Text>
      </Pressable>
    </View>
  );
}

function Reward({ icon, color, value }: { icon: string; color: string; value: string }) {
  return (
    <View style={styles.reward}>
      <MaterialCommunityIcons name={icon as any} size={16} color={color} />
      <Text style={styles.rewardText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  loading: { flex: 1, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.surfaceInverse, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg,
    borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg, ...SHADOW.card,
  },
  headerTitle: { color: COLORS.onSurfaceInverse, fontSize: FONT["2xl"], fontWeight: "800" },
  headerSub: { color: "#C9C5BE", fontSize: FONT.sm, fontWeight: "600", marginTop: 2 },
  coinPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#3A3B3A", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  coinText: { color: COLORS.onSurfaceInverse, fontWeight: "800", fontSize: FONT.base },
  upgradePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.brandPrimary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, marginRight: SPACING.sm },
  upgradeText: { color: COLORS.onBrandPrimary, fontWeight: "800", fontSize: FONT.sm },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING["3xl"], gap: SPACING.md },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card },
  cardRecommended: { borderColor: COLORS.brandPrimary, borderWidth: 2 },
  recommendTag: { position: "absolute", top: -9, left: 14, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.brandPrimary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: 4, ...SHADOW.soft },
  recommendText: { color: COLORS.onBrandPrimary, fontWeight: "800", fontSize: 11 },
  goalBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, gap: SPACING.sm },
  goalLabel: { fontSize: FONT.sm, fontWeight: "800", color: COLORS.onSurfaceSecondary, flexShrink: 0 },
  goalRow: { gap: SPACING.sm, paddingRight: SPACING.lg },
  goalChip: { flexDirection: "row", alignItems: "center", gap: 5, height: 36, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceSecondary, borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 },
  goalChipActive: { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary },
  goalChipText: { fontSize: FONT.sm, fontWeight: "800", color: COLORS.onSurfaceSecondary },
  goalChipTextActive: { color: COLORS.onBrandPrimary },
  badge: { position: "absolute", top: -9, right: 14, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: 4, ...SHADOW.soft },
  badgeText: { color: "#FFFFFF", fontWeight: "800", fontSize: 11, letterSpacing: 0.3 },
  emergencyCard: { borderColor: "#D9822B", borderWidth: 2, backgroundColor: "#FBF3E9" },
  emergencyRibbon: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#D9822B", alignSelf: "flex-start", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: 5, marginBottom: SPACING.md },
  ribbonText: { color: COLORS.onBrandPrimary, fontWeight: "800", fontSize: 11, letterSpacing: 0.5 },
  timerPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2, marginLeft: 4 },
  timerText: { fontWeight: "800", fontSize: FONT.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.md },
  tierDot: { width: 14, height: 14, borderRadius: 7 },
  cardTitle: { fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface },
  diffPill: { alignSelf: "flex-start", borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2, marginTop: 4 },
  diffText: { fontSize: FONT.sm, fontWeight: "800" },
  refreshBtn: { padding: 4 },
  reqRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.md },
  reqChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  reqAmount: { fontSize: FONT.base, fontWeight: "800", color: COLORS.onSurface },
  reqLabel: { fontSize: FONT.sm, fontWeight: "700", color: COLORS.onSurfaceSecondary },
  reqHave: { fontSize: FONT.sm, fontWeight: "700" },
  rewardRow: { flexDirection: "row", gap: SPACING.lg, marginBottom: SPACING.md },
  reward: { flexDirection: "row", alignItems: "center", gap: 4 },
  rewardText: { fontSize: FONT.sm, fontWeight: "800", color: COLORS.onSurfaceSecondary },
  fulfillBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm,
    backgroundColor: COLORS.brandPrimary, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, ...SHADOW.soft,
  },
  fulfillDisabled: { backgroundColor: COLORS.borderStrong },
  fulfillText: { color: COLORS.onBrandPrimary, fontSize: FONT.base, fontWeight: "800" },
});
