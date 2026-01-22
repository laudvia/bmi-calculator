import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";

import { theme } from "../theme";

export type ResultCardProps = {
  bmiText: string;
  category: string;
  note: string;
};

function categoryColor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("нормаль")) return theme.colors.success;
  if (c.includes("недостат")) return theme.colors.warning;
  if (c.includes("избыточ")) return theme.colors.warning;
  if (c.includes("ожир")) return theme.colors.danger;
  return theme.colors.primary;
}

export default function ResultCard({ bmiText, category, note }: ResultCardProps) {
  const badge = useMemo(() => categoryColor(category), [category]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Результат</Text>

      <Text style={styles.bmi}>{bmiText}</Text>

      <View style={[styles.badge, { backgroundColor: badge }]}>
        <Text style={styles.badgeText}>{category}</Text>
      </View>

      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  title: { fontSize: 13, color: theme.colors.muted, marginBottom: 8, fontWeight: "700" },
  bmi: { fontSize: 34, fontWeight: "800", marginBottom: 10, color: theme.colors.text },
  badge: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  note: { fontSize: 14, lineHeight: 20, color: theme.colors.text, opacity: 0.9 },
});
