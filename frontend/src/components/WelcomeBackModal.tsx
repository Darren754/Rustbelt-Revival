import React from "react";
import { Modal, View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { COLORS, RADIUS, SPACING, FONT, SHADOW } from "@/src/theme/theme";
import { useGame } from "@/src/game/GameContext";
import { formatDuration } from "@/src/game/engine";

export default function WelcomeBackModal() {
  const { offlineSummary, clearOfflineSummary, config } = useGame();
  const visible = !!offlineSummary;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card} testID="welcome-back-modal">
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="hand-wave" size={40} color={COLORS.brandTertiary} />
          </View>
          <Text style={styles.title}>Welcome Back!</Text>
          {offlineSummary && (
            <Text style={styles.away}>
              You were away for {formatDuration(offlineSummary.away_ms)}
              {offlineSummary.capped ? ` (capped at ${Math.round(config.offline_cap_seconds / 3600)}h)` : ""}
            </Text>
          )}

          <View style={styles.list}>
            <Row
              icon="anvil"
              color="#8A8177"
              label="Scrap mined by the yard"
              value={`+${offlineSummary?.scrap_earned ?? 0}`}
            />
            {offlineSummary?.jobs_completed.map((j, i) => (
              <Row
                key={i}
                icon="factory"
                color={COLORS.brandSecondary}
                label={`${j.building} finished`}
                value={`+${j.output}`}
              />
            ))}
            {offlineSummary && offlineSummary.scrap_earned === 0 && offlineSummary.jobs_completed.length === 0 && (
              <Text style={styles.quiet}>The town was quiet while you were gone.</Text>
            )}
          </View>

          <Pressable style={styles.btn} onPress={clearOfflineSummary} testID="claim-offline-button">
            <Text style={styles.btnText}>Claim & Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Row({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: color + "22" }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,18,16,0.6)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  card: { width: "100%", maxWidth: 420, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", ...SHADOW.card },
  iconWrap: { width: 72, height: 72, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceInverse, alignItems: "center", justifyContent: "center", marginBottom: SPACING.md },
  title: { fontSize: FONT["2xl"], fontWeight: "800", color: COLORS.onSurface },
  away: { fontSize: FONT.base, color: COLORS.onSurfaceSecondary, marginTop: SPACING.xs, fontWeight: "600", textAlign: "center" },
  list: { width: "100%", marginVertical: SPACING.lg, gap: SPACING.sm },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.md, padding: SPACING.md },
  rowIcon: { width: 40, height: 40, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center", marginRight: SPACING.md },
  rowLabel: { flex: 1, fontSize: FONT.base, color: COLORS.onSurface, fontWeight: "700" },
  rowValue: { fontSize: FONT.lg, color: COLORS.success, fontWeight: "800" },
  quiet: { textAlign: "center", color: COLORS.onSurfaceTertiary, fontWeight: "600", paddingVertical: SPACING.md },
  btn: { width: "100%", backgroundColor: COLORS.brandPrimary, borderRadius: RADIUS.lg, paddingVertical: SPACING.lg, alignItems: "center", ...SHADOW.soft },
  btnText: { color: COLORS.onBrandPrimary, fontSize: FONT.lg, fontWeight: "800" },
});
