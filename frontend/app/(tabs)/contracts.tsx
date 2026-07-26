import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, RADIUS, SPACING, FONT, SHADOW, RESOURCE_META } from "@/src/theme/theme";
import { useGame } from "@/src/game/GameContext";
import { canFulfill, effectiveReward, formatDuration } from "@/src/game/engine";
import { Contract } from "@/src/game/types";
import BuildingSheet from "@/src/components/BuildingSheet";

export default function ContractsScreen() {
  const insets = useSafeAreaInsets();
  const { loading, state, config, now, fulfillContract, refreshContract } = useGame();
  const [depotSheet, setDepotSheet] = useState(false);

  if (loading || !state) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  const depot = state.buildings.shipping_depot;
  const emergency = state.emergency;

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

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {emergency && (
          <EmergencyCard
            contract={emergency}
            reward={effectiveReward(emergency, depot, config)}
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
            reward={effectiveReward(c, depot, config)}
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

function ContractCard({ contract, reward, fulfillable, inventory, onFulfill, onRefresh }: {
  contract: Contract;
  reward: { coins: number; xp: number; restoration: number };
  fulfillable: boolean;
  inventory: any;
  onFulfill: () => void;
  onRefresh: () => void;
}) {
  return (
    <View style={[styles.card, { borderLeftColor: contract.color, borderLeftWidth: 5 }]} testID={`contract-${contract.id}`}>
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
