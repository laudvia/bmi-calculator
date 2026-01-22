import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";

import { theme } from "../theme";

export type NumberFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  suffix?: string;
};

export default function NumberField({
  label,
  value,
  onChangeText,
  placeholder,
  suffix,
}: NumberFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType="numeric"
          inputMode="decimal"
          style={styles.input}
          maxLength={7}
          selectionColor={theme.colors.primary}
          placeholderTextColor={theme.colors.muted}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  label: { fontSize: 14, marginBottom: 6, color: theme.colors.text, opacity: 0.9, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: theme.radius.md,
    fontSize: 16,
    color: theme.colors.text,
  },
  suffix: { marginLeft: 10, fontSize: 16, color: theme.colors.muted, fontWeight: "600" },
});
