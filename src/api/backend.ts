import { Platform } from "react-native";

/**
 * Base URL for API.
 * - On Web (localhost): http://localhost:3001
 * - Override for any platform via EXPO_PUBLIC_API_BASE_URL (recommended for devices).
 *
 * IMPORTANT: do not hardcode your IP address in code.
 */
export const API_BASE_URL: string =
  (process.env.EXPO_PUBLIC_API_BASE_URL as string) ||
  (Platform.OS === "web" ? "http://localhost:3001" : "http://localhost:3001");
