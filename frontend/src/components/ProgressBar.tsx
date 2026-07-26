import React from "react";
import { View, StyleSheet } from "react-native";
import { COLORS, RADIUS } from "@/src/theme/theme";

interface Props {
  progress: number; // 0..1
  height?: number;
  color?: string;
  track?: string;
  testID?: string;
}

export default function ProgressBar({ progress, height = 12, color = COLORS.brandPrimary, track = COLORS.surfaceTertiary, testID }: Props) {
  const pct = Math.min(100, Math.max(0, progress * 100));
  return (
    <View testID={testID} style={[styles.track, { height, backgroundColor: track }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    borderRadius: RADIUS.pill,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: RADIUS.pill,
  },
});
