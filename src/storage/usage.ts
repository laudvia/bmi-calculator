import AsyncStorage from "@react-native-async-storage/async-storage";

export type UsageStats = {
  totalSeconds: number;
  byScreenSeconds: Record<string, number>;
  byDateSeconds: Record<string, number>; // YYYY-MM-DD -> seconds
  updatedAt: string; // ISO
};

const KEY = "usage_stats_v1";

const DEFAULT: UsageStats = {
  totalSeconds: 0,
  byScreenSeconds: {},
  byDateSeconds: {},
  updatedAt: new Date(0).toISOString(),
};

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clampSeconds(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return Math.floor(n);
}

export async function loadUsage(): Promise<UsageStats> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<UsageStats> | null;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT };
    return {
      totalSeconds: clampSeconds(Number(parsed.totalSeconds ?? 0)),
      byScreenSeconds: (parsed.byScreenSeconds ?? {}) as Record<string, number>,
      byDateSeconds: (parsed.byDateSeconds ?? {}) as Record<string, number>,
      updatedAt: String(parsed.updatedAt ?? new Date().toISOString()),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export async function saveUsage(stats: UsageStats): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

export async function addUsageSeconds(params: { seconds: number; screen?: string; at?: Date }): Promise<UsageStats> {
  const { seconds, screen, at } = params;
  const add = clampSeconds(seconds);
  if (add <= 0) return loadUsage();

  const stats = await loadUsage();
  const next: UsageStats = {
    totalSeconds: stats.totalSeconds + add,
    byScreenSeconds: { ...stats.byScreenSeconds },
    byDateSeconds: { ...stats.byDateSeconds },
    updatedAt: new Date().toISOString(),
  };

  if (screen) {
    next.byScreenSeconds[screen] = clampSeconds((next.byScreenSeconds[screen] ?? 0) + add);
  }

  const key = isoDate(at ?? new Date());
  next.byDateSeconds[key] = clampSeconds((next.byDateSeconds[key] ?? 0) + add);

  await saveUsage(next);
  return next;
}

export async function clearUsage(): Promise<UsageStats> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  return { ...DEFAULT };
}

export function formatDuration(totalSeconds: number): string {
  const s = clampSeconds(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин ${sec} сек`;
  return `${sec} сек`;
}
