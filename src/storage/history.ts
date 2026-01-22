import { API_BASE_URL } from "../api/backend";
import { getSessionToken } from "./auth";

export type HistoryItem = {
  id: string;
  at: string; // ISO string
  weightKg: number;
  heightCm: number;
  bmi: number;
  category: string;
};

/**
 * История хранится в PostgreSQL и привязана к пользователю (user_id).
 * В приложении хранится только токен.
 */
async function authHeader() {
  const token = await getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function loadHistory(): Promise<HistoryItem[]> {
  try {
    const r = await fetch(`${API_BASE_URL}/history`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeader()),
      },
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok) return [];
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export async function addHistoryItem(item: Omit<HistoryItem, "id">): Promise<HistoryItem[]> {
  try {
    const r = await fetch(`${API_BASE_URL}/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeader()),
      },
      body: JSON.stringify(item),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok) return await loadHistory();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return await loadHistory();
  }
}

export async function clearHistory(): Promise<HistoryItem[]> {
  try {
    const r = await fetch(`${API_BASE_URL}/history`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeader()),
      },
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok) return await loadHistory();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return await loadHistory();
  }
}
