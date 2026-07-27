import React from "react";
import { Modal, View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS, RADIUS, SPACING, FONT, SHADOW } from "@/src/theme/theme";

export interface LandmarkUnlock {
  landmark: string;
  icon: string;
  coin_bonus: number;
  reward_buff_pct: number;
  points: number;
  bonus_total: number;
  is_final: boolean;
}

export default function LandmarkModal({ unlock, onClose }: { unlock: LandmarkUnlock | null; onClose: () => void }) {
  const visible = !!unlock;
  const isFinal = !!unlock?.is_final;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card} testID={isFinal ? "celebration-modal" : "landmark-modal"}>
          <LinearGradient
            colors={isFinal ? [COLORS.brandTertiary, COLORS.brandPrimary] : ["#6E9C7A", COLORS.success]}
            style={styles.badge}
          >
            <MaterialCommunityIcons name={(unlock?.icon || "city-variant") as any} size={52} color={"#FFFFFF"} />
          </LinearGradient>

          {isFinal ? (
            <>
              <Text style={styles.tag}>TOWN FULLY RESTORED</Text>
              <Text style={styles.title}>{unlock?.landmark} Restored!</Text>
              <Text style={styles.body}>
                The bell tower rings again and the whole town is cheering. Rustbelt is officially back on the map —
                all thanks to you, boss!
              </Text>
              <View style={styles.confettiRow}>
                <MaterialCommunityIcons name="star-four-points" size={20} color={COLORS.brandTertiary} />
                <MaterialCommunityIcons name="party-popper" size={24} color={COLORS.brandPrimary} />
                <MaterialCommunityIcons name="star-four-points" size={20} color={COLORS.success} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.tag}>LANDMARK RESTORED</Text>
              <Text style={styles.title}>{unlock?.landmark}</Text>
              <Text style={styles.body}>A new landmark rises from the rust — the town is coming back to life!</Text>
              <View style={styles.rewardsRow}>
                <View style={styles.pill}>
                  <MaterialCommunityIcons name="trending-up" size={16} color={COLORS.success} />
                  <Text style={styles.pillText}>+{unlock?.reward_buff_pct}% rewards</Text>
                </View>
                <View style={styles.pill}>
                  <MaterialCommunityIcons name="cash-multiple" size={16} color={COLORS.brandTertiary} />
                  <Text style={styles.pillText}>+{unlock?.bonus_total} coins</Text>
                </View>
              </View>
            </>
          )}

          <Pressable style={styles.btn} onPress={onClose} testID="landmark-modal-close">
            <Text style={styles.btnText}>{isFinal ? "Keep Building" : "Nice!"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,18,16,0.65)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  card: { width: "100%", maxWidth: 420, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", ...SHADOW.card },
  badge: { width: 92, height: 92, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginBottom: SPACING.lg, ...SHADOW.soft },
  tag: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: COLORS.onSurfaceTertiary },
  title: { fontSize: FONT["2xl"], fontWeight: "800", color: COLORS.onSurface, textAlign: "center", marginTop: 4 },
  body: { fontSize: FONT.base, color: COLORS.onSurfaceSecondary, textAlign: "center", marginTop: SPACING.md, lineHeight: 22, fontWeight: "600" },
  confettiRow: { flexDirection: "row", gap: SPACING.lg, marginVertical: SPACING.lg },
  rewardsRow: { flexDirection: "row", gap: SPACING.sm, marginVertical: SPACING.lg },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  pillText: { fontWeight: "800", color: COLORS.onSurface, fontSize: FONT.sm },
  btn: { width: "100%", backgroundColor: COLORS.brandPrimary, borderRadius: RADIUS.lg, paddingVertical: SPACING.lg, alignItems: "center", ...SHADOW.soft, marginTop: SPACING.sm },
  btnText: { color: COLORS.onBrandPrimary, fontSize: FONT.lg, fontWeight: "800" },
});
