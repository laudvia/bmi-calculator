import { Platform } from "react-native";

export const theme = {
  colors: {
    bg: "#F3F6FF",
    card: "#FFFFFF",
    text: "#0F172A",
    muted: "#64748B",
    border: "rgba(15, 23, 42, 0.10)",
    borderStrong: "rgba(15, 23, 42, 0.16)",

    primary: "#2563EB",
    primaryPressed: "#1D4ED8",
    primarySoft: "rgba(37, 99, 235, 0.12)",

    success: "#16A34A",
    warning: "#F59E0B",
    danger: "#DC2626",
  },

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    pill: 999,
  },

  shadow: Platform.select({
    ios: {
      shadowColor: "#0F172A",
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 4 },
    default: {},
  }),

  shadowSoft: Platform.select({
    ios: {
      shadowColor: "#0F172A",
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 2 },
    default: {},
  }),
} as const;
