import React from "react";
import { Modal, View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS, RADIUS, SPACING, FONT, SHADOW } from "@/src/theme/theme";

export default function CelebrationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card} testID="celebration-modal">
          <LinearGradient colors={[COLORS.brandTertiary, COLORS.brandPrimary]} style={styles.badge}>
            <MaterialCommunityIcons name="city-variant" size={54} color={"#FFFFFF"} />
          </LinearGradient>
          <Text style={styles.title}>Town Hall Restored!</Text>
          <Text style={styles.body}>
            The bell tower rings again and the townsfolk are cheering. Rustbelt is officially back on the map —
            all thanks to you, boss.
          </Text>
          <View style={styles.confettiRow}>
            <MaterialCommunityIcons name="star-four-points" size={20} color={COLORS.brandTertiary} />
            <MaterialCommunityIcons name="party-popper" size={24} color={COLORS.brandPrimary} />
            <MaterialCommunityIcons name="star-four-points" size={20} color={COLORS.success} />
          </View>
          <Pressable style={styles.btn} onPress={onClose} testID="celebration-close-button">
            <Text style={styles.btnText}>Keep Building</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,18,16,0.65)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  card: { width: "100%", maxWidth: 420, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", ...SHADOW.card },
  badge: { width: 96, height: 96, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", marginBottom: SPACING.lg, ...SHADOW.soft },
  title: { fontSize: FONT["3xl"], fontWeight: "800", color: COLORS.onSurface, textAlign: "center" },
  body: { fontSize: FONT.base, color: COLORS.onSurfaceSecondary, textAlign: "center", marginTop: SPACING.md, lineHeight: 22, fontWeight: "600" },
  confettiRow: { flexDirection: "row", gap: SPACING.lg, marginVertical: SPACING.lg },
  btn: { width: "100%", backgroundColor: COLORS.brandPrimary, borderRadius: RADIUS.lg, paddingVertical: SPACING.lg, alignItems: "center", ...SHADOW.soft },
  btnText: { color: COLORS.onBrandPrimary, fontSize: FONT.lg, fontWeight: "800" },
});
