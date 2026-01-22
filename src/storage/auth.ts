import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../api/backend";

export type StoredUser = {
  email: string;
  password: string;
  createdAt: string;
};

/**
 * В этой версии пользователи и история хранятся в PostgreSQL через backend API.
 * В AsyncStorage хранится только токен сессии (JWT) и минимальные данные сессии.
 */
const KEY_TOKEN = "fitness_bmi_token_v1";
const KEY_EMAIL = "fitness_bmi_email_v1";
const KEY_ROLE = "fitness_bmi_role_v1";
const KEY_NAME = "fitness_bmi_name_v1";

export type AuthResult = { ok: true } | { ok: false; message: string };

async function setSession(params: { token: string; email: string; role: string; name?: string }) {
  await AsyncStorage.multiSet([
    [KEY_TOKEN, params.token],
    [KEY_EMAIL, params.email],
    [KEY_ROLE, params.role],
    [KEY_NAME, params.name ?? ""],
  ]);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_TOKEN, KEY_EMAIL, KEY_ROLE, KEY_NAME]);
}

export async function getSessionToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_TOKEN);
}

export async function getSessionEmail(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_EMAIL);
}

export async function getSessionRole(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_ROLE);
}

export async function getSessionName(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_NAME);
}

export async function registerUser(params: { name?: string; email: string; password: string }): Promise<AuthResult> {
  try {
    const r = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: params.name || "", email: params.email, password: params.password }),
    });
    const data = await r.json().catch(() => null);

    if (!r.ok || !data?.ok) {
      return { ok: false, message: data?.message || "Ошибка регистрации." };
    }

    await setSession({ token: data.token, email: data.email, role: data.role, name: data.name || "" });
    return { ok: true };
  } catch {
    return { ok: false, message: "Нет подключения к серверу." };
  }
}

export async function loginUser(params: { email: string; password: string }): Promise<AuthResult> {
  try {
    const r = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: params.email, password: params.password }),
    });
    const data = await r.json().catch(() => null);

    if (!r.ok || !data?.ok) {
      return { ok: false, message: data?.message || "Ошибка входа." };
    }

    await setSession({ token: data.token, email: data.email, role: data.role, name: data.name || "" });
    return { ok: true };
  } catch {
    return { ok: false, message: "Нет подключения к серверу." };
  }
}

export type MeResult =
  | { ok: true; name: string; email: string; role: string }
  | { ok: false; message: string };

export async function getMe(): Promise<MeResult> {
  const token = await getSessionToken();
  if (!token) return { ok: false, message: "Нет активной сессии." };

  try {
    const r = await fetch(`${API_BASE_URL}/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok) {
      return { ok: false, message: data?.message || "Не удалось получить профиль." };
    }

    // keep session in sync
    await AsyncStorage.multiSet([
      [KEY_EMAIL, data.email],
      [KEY_ROLE, data.role],
      [KEY_NAME, data.name || ""],
    ]);

    return { ok: true, name: data.name || "", email: data.email, role: data.role };
  } catch {
    return { ok: false, message: "Нет подключения к серверу." };
  }
}

export async function updateProfile(params: { name: string; email: string }): Promise<AuthResult> {
  const token = await getSessionToken();
  if (!token) return { ok: false, message: "Нет активной сессии." };

  try {
    const r = await fetch(`${API_BASE_URL}/me`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: params.name, email: params.email }),
    });
    const data = await r.json().catch(() => null);

    if (!r.ok || !data?.ok) {
      return { ok: false, message: data?.message || "Не удалось обновить профиль." };
    }

    await setSession({ token: data.token, email: data.email, role: data.role, name: data.name || "" });
    return { ok: true };
  } catch {
    return { ok: false, message: "Нет подключения к серверу." };
  }
}

export async function changePassword(params: { email?: string; newPassword: string }): Promise<AuthResult> {
  const token = await getSessionToken();
  if (!token) return { ok: false, message: "Нет активной сессии." };

  try {
    const r = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ newPassword: params.newPassword }),
    });
    const data = await r.json().catch(() => null);

    if (!r.ok || !data?.ok) {
      return { ok: false, message: data?.message || "Не удалось изменить пароль." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Нет подключения к серверу." };
  }
}
