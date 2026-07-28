import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { COLORS, RADIUS, SPACING, FONT, SHADOW } from "@/src/theme/theme";
import { useGame } from "@/src/game/GameContext";
import { analyticsSummary, analyticsToCSV, analyticsToJSON, formatDuration } from "@/src/game/engine";

const NOT_REACHED = "Not reached";
function fmtFirst(ms: number | null | undefined): string {
  return ms == null ? NOT_REACHED : formatDuration(ms);
}

export default function AnalyticsPanel() {
  const { state, config, resetTracking, resetGame, showToast } = useGame();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "tracking" | "game">(null);

  if (!state) return null;

  const s = analyticsSummary(state, config);

  const copy = async (kind: "json" | "csv") => {
    try {
      const text = kind === "json" ? analyticsToJSON(state, config) : analyticsToCSV(state, config);
      await Clipboard.setStringAsync(text);
      showToast(kind === "json" ? "JSON copied" : "CSV copied");
    } catch (e) {
      showToast("Copy failed — clipboard unavailable");
    }
  };

  return (
    <View style={styles.card} testID="analytics-panel">
      <Pressable style={styles.head} onPress={() => setOpen((o) => !o)} testID="analytics-toggle">
        <View style={styles.headLeft}>
          <MaterialCommunityIcons name="chart-line" size={18} color={COLORS.brandPrimary} />
          <Text style={styles.title}>Playtest & Economy Tracking</Text>
        </View>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={22} color={COLORS.onSurfaceSecondary} />
      </Pressable>

      {open && (
        <View style={styles.body} testID="analytics-body">
          {/* Current tracking session */}
          <SectionTitle icon="timer-outline" label="Current Tracking Session" />
          <Row label="Session started" value={new Date(s.session.start_ts).toLocaleTimeString()} />
          <Row label="Session duration" value={formatDuration(s.session.duration_ms)} testID="analytics-duration" />
          <Row label="Level at start" value={`${s.session.start_level}`} />
          <Row label="Restoration at start" value={`${s.session.start_restoration}`} />

          <SectionTitle icon="flag-checkered" label="First-Event Times" />
          <Row label="First Scrap" value={fmtFirst(s.firsts_ms.scrap)} testID="analytics-first-scrap" />
          <Row label="First Component" value={fmtFirst(s.firsts_ms.component)} />
          <Row label="First Finished Good" value={fmtFirst(s.firsts_ms.finished_good)} />
          <Row label="First Contract" value={fmtFirst(s.firsts_ms.contract)} />
          <Row label="First Upgrade" value={fmtFirst(s.firsts_ms.upgrade)} />
          <Row label="Reached Level 2" value={fmtFirst(s.firsts_ms.level2)} />

          <SectionTitle icon="cash-multiple" label="Economy Totals" />
          <Row label="Coins earned (contracts)" value={`${s.economy.coins_earned}`} />
          <Row label="Milestone coins" value={`${s.economy.milestone_coins}`} />
          <Row label="Coins spent" value={`${s.economy.coins_spent}`} />
          <Row label="Net coin change" value={`${s.economy.net_coins}`} highlight />
          <Row label="XP earned" value={`${s.economy.xp_earned}`} />
          <Row label="Restoration earned" value={`${s.economy.restoration_earned}`} />
          <Row label="Scrap collected" value={`${s.economy.scrap_collected}`} />
          <Row label="Components produced" value={`${s.economy.components_produced}`} />
          <Row label="Finished Goods produced" value={`${s.economy.finished_goods_produced}`} />

          <SectionTitle icon="clipboard-check-outline" label="Contract Activity" />
          <Row label="Total completed" value={`${s.contracts.total}`} />
          <Row label="Basic" value={`${s.contracts.by_tier.basic}`} />
          <Row label="Intermediate" value={`${s.contracts.by_tier.intermediate}`} />
          <Row label="Advanced" value={`${s.contracts.by_tier.advanced}`} />
          <Row label="Emergency" value={`${s.contracts.by_tier.emergency}`} />
          <Row label="Refreshes" value={`${s.contracts.refreshes}`} />
          <Row label="Avg coins / contract" value={`${s.contracts.avg_coins}`} />
          <Row label="Avg XP / contract" value={`${s.contracts.avg_xp}`} />
          <Row label="Avg restoration / contract" value={`${s.contracts.avg_restoration}`} />

          <SectionTitle icon="factory" label="Production Activity" />
          <Row label="Scrap storage full (times)" value={`${s.production.storage_full_count}`} />
          <Row label="Machine idle time" value={formatDuration(s.production.machine_idle_ms)} />
          <Row label="Machine active time" value={formatDuration(s.production.machine_active_ms)} />
          <Row label="Slot utilization" value={`${s.production.slot_utilization_pct}%`} />
          <Row label="Jobs — Component" value={`${s.production.jobs_completed.component}`} />
          <Row label="Jobs — Finished Good" value={`${s.production.jobs_completed.finished}`} />

          <SectionTitle icon="town-hall" label="Milestones" />
          {config.restoration_milestones.map((m: any) => (
            <Row
              key={m.points}
              label={`${m.landmark} (${m.points})`}
              value={fmtFirst(s.milestones.unlock_times_ms[String(m.points)] ?? null)}
            />
          ))}
          <Row label="Milestone coins received" value={`${s.milestones.milestone_coins_received}`} />
          <Row label="Current reward buff" value={`+${s.milestones.current_reward_buff_pct}%`} highlight />

          {/* Controls */}
          <View style={styles.controls}>
            <View style={styles.ctrlRow}>
              <Pressable style={styles.ctrlBtn} onPress={() => copy("json")} testID="analytics-copy-json">
                <MaterialCommunityIcons name="code-json" size={16} color={COLORS.onInfo} />
                <Text style={styles.ctrlText}>Copy JSON</Text>
              </Pressable>
              <Pressable style={styles.ctrlBtn} onPress={() => copy("csv")} testID="analytics-copy-csv">
                <MaterialCommunityIcons name="file-delimited-outline" size={16} color={COLORS.onInfo} />
                <Text style={styles.ctrlText}>Copy CSV</Text>
              </Pressable>
            </View>
            <Pressable style={[styles.ctrlBtn, styles.ctrlAlt]} onPress={() => setConfirm("tracking")} testID="analytics-reset-tracking">
              <MaterialCommunityIcons name="timer-refresh-outline" size={16} color={COLORS.onSurface} />
              <Text style={[styles.ctrlText, { color: COLORS.onSurface }]}>Reset Tracking</Text>
            </Pressable>
            <Pressable style={[styles.ctrlBtn, styles.ctrlDanger]} onPress={() => setConfirm("game")} testID="analytics-reset-game">
              <MaterialCommunityIcons name="restart-alert" size={16} color={COLORS.onError} />
              <Text style={styles.ctrlText}>Reset Game & Begin Fresh Test</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Modal visible={confirm !== null} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.confirmCard} testID="analytics-confirm-modal">
            <MaterialCommunityIcons
              name={confirm === "game" ? "alert" : "timer-refresh-outline"}
              size={38}
              color={confirm === "game" ? COLORS.error : COLORS.warning}
            />
            <Text style={styles.confirmTitle}>{confirm === "game" ? "Start a fresh test?" : "Reset tracking session?"}</Text>
            <Text style={styles.confirmBody}>
              {confirm === "game"
                ? "This clears ALL game progress (resources, upgrades, contracts, level) and starts a brand new town."
                : "This resets analytics counters and starts a new tracking session. Your game progress is NOT changed."}
            </Text>
            <Pressable
              style={[styles.confirmGo, confirm === "game" ? { backgroundColor: COLORS.error } : { backgroundColor: COLORS.brandPrimary }]}
              onPress={() => {
                if (confirm === "game") resetGame();
                else resetTracking();
                setConfirm(null);
              }}
              testID="analytics-confirm-go"
            >
              <Text style={styles.confirmGoText}>{confirm === "game" ? "Yes, reset game" : "Yes, reset tracking"}</Text>
            </Pressable>
            <Pressable style={styles.confirmCancel} onPress={() => setConfirm(null)} testID="analytics-confirm-cancel">
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SectionTitle({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.sectionTitle}>
      <MaterialCommunityIcons name={icon as any} size={15} color={COLORS.brandPrimary} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value, highlight, testID }: { label: string; value: string; highlight?: boolean; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHi]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.soft, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.lg },
  headLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  title: { fontSize: FONT.lg, fontWeight: "800", color: COLORS.onSurface },
  body: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.md, marginBottom: SPACING.xs, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  sectionLabel: { fontSize: FONT.sm, fontWeight: "800", color: COLORS.brandPrimary, textTransform: "uppercase", letterSpacing: 0.4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  rowLabel: { fontSize: FONT.sm, color: COLORS.onSurfaceSecondary, fontWeight: "600", flex: 1 },
  rowValue: { fontSize: FONT.sm, color: COLORS.onSurface, fontWeight: "800", marginLeft: SPACING.md },
  rowValueHi: { color: COLORS.success },
  controls: { marginTop: SPACING.lg, gap: SPACING.sm },
  ctrlRow: { flexDirection: "row", gap: SPACING.sm },
  ctrlBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: COLORS.info, borderRadius: RADIUS.md, paddingVertical: SPACING.md },
  ctrlAlt: { backgroundColor: COLORS.surfaceTertiary },
  ctrlDanger: { backgroundColor: COLORS.error },
  ctrlText: { color: COLORS.onInfo, fontWeight: "800", fontSize: FONT.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(20,18,16,0.6)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  confirmCard: { width: "100%", maxWidth: 380, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: "center", ...SHADOW.card },
  confirmTitle: { fontSize: FONT.xl, fontWeight: "800", color: COLORS.onSurface, marginTop: SPACING.sm },
  confirmBody: { fontSize: FONT.base, color: COLORS.onSurfaceSecondary, textAlign: "center", fontWeight: "600", marginTop: SPACING.sm, marginBottom: SPACING.lg, lineHeight: 20 },
  confirmGo: { width: "100%", borderRadius: RADIUS.lg, paddingVertical: SPACING.md, alignItems: "center" },
  confirmGoText: { color: COLORS.onError, fontWeight: "800", fontSize: FONT.base },
  confirmCancel: { paddingVertical: SPACING.md, marginTop: SPACING.xs },
  confirmCancelText: { color: COLORS.onSurfaceTertiary, fontWeight: "800" },
});
