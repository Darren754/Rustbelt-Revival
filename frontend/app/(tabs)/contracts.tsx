import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, RADIUS, SPACING, FONT, SHADOW, RESOURCE_META } from "@/src/theme/theme";
import { useGame } from "@/src/game/GameContext";
import { canFulfill, effectiveReward } from "@/src/game/engine";
import { Contract } from "@/src/game/types";
import BuildingSheet from "@/src/components/BuildingSheet";

export default function ContractsScreen() {
  const insets = useSafeAreaInsets();
  const { loading, state, config, fulfillContract, refreshContract } = useGame();
  const [depotSheet, setDepotSheet] = useState(false);

  if (loading || !state) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="contracts-screen">
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Shipping Depot</Text>
          <Text style={styles.headerSub}>Fulfil orders for coins &amp; XP</Text>
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
        {state.contracts.map((c) => (
          <ContractCard
            key={c.id}
            contract={c}
            reward={effectiveReward(c, state.buildings.shipping_depot, config)}
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

function ContractCard({ contract, reward, fulfillable, inventory, onFulfill, onRefresh }: {
  contract: Contract;
  reward: { coins: number; xp: number; restoration: number };
  fulfillable: boolean;
  inventory: any;
  onFulfill: () => void;
  onRefresh: () => void;
}) {
  return (
    <View style={styles.card} testID={`contract-${contract.id}`}>
      <View style={styles.cardTop}>
        <View style={styles.orderIcon}>
          <MaterialCommunityIcons name="clipboard-text" size={22} color={COLORS.brandSecondary} />
        </View>
        <Text style={styles.cardTitle}>{contract.title}</Text>
        <Pressable onPress={onRefresh} hitSlop={10} testID={`contract-refresh-${contract.id}`}>
          <MaterialCommunityIcons name="refresh" size={20} color={COLORS.onSurfaceTertiary} />
        </Pressable>
      </View>

      <View style={styles.reqRow}>
        {contract.requirements.map((r) => {
          const meta = RESOURCE_META[r.resource];
          const have = Math.floor(inventory[r.resource]);
          const ok = have >= r.qty;
          return (
            <View key={r.resource} style={styles.reqChip}>
              <MaterialCommunityIcons name={meta.icon as any} size={18} color={meta.color} />
              <Text style={[styles.reqText, { color: ok ? COLORS.onSurface : COLORS.error }]}>
                {have}/{r.qty}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.rewardRow}>
        <Reward icon="cash-multiple" color={RESOURCE_META.coins.color} value={`+${reward.coins}`} />
        <Reward icon="star-four-points" color={COLORS.brandPrimary} value={`+${reward.xp} XP`} />
        <Reward icon="city-variant" color={COLORS.success} value={`+${reward.restoration}`} />
      </View>

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
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.md },
  orderIcon: { width: 40, height: 40, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  cardTitle: { flex: 1, fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface },
  reqRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.md },
  reqChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  reqText: { fontSize: FONT.base, fontWeight: "800" },
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
