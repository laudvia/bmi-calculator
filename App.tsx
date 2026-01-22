import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Animated,
  Easing,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  Linking,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "./src/theme";

import NumberField from "./src/components/NumberField";
import ResultCard from "./src/components/ResultCard";
import { calculateBmi, classifyBmi } from "./src/utils/bmi";
import {
  addHistoryItem,
  clearHistory,
  HistoryItem,
  loadHistory,
} from "./src/storage/history";
import {
  changePassword,
  clearSession,
  getSessionEmail,
  getSessionName,
  getSessionToken,
  getSessionRole,
  getMe,
  loginUser,
  registerUser,
  updateProfile,
} from "./src/storage/auth";
import { buildWorkoutPlan, Goal } from "./src/utils/workoutPlan";
import { pubmedUrl, searchPubMed, PubMedArticle } from "./src/api/pubmed";
import { API_BASE_URL } from "./src/api/backend";

type ScreenKey =
  | "calc"
  | "result"
  | "history"
  | "stats"
  | "api"
  | "about"
  | "account"
  | "adminUsers"
  | "editProfile";

type ResultState = {
  bmi: number;
  category: string;
  note: string;
};

function parseNumber(text: string): number {
  const normalized = String(text).replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function validateInputs(weightKg: number, heightCm: number): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(weightKg)) errors.push("Вес должен быть числом.");
  if (!Number.isFinite(heightCm)) errors.push("Рост должен быть числом.");
  if (Number.isFinite(weightKg) && (weightKg < 20 || weightKg > 300))
    errors.push("Вес должен быть в диапазоне 20–300 кг.");
  if (Number.isFinite(heightCm) && (heightCm < 80 || heightCm > 250))
    errors.push("Рост должен быть в диапазоне 80–250 см.");
  return errors;
}

function screenTitle(screen: ScreenKey): string {
  switch (screen) {
    case "calc":
      return "Анкета";
    case "result":
      return "Интерпретация";
    case "history":
      return "История";
    case "stats":
      return "Статистика";
    case "api":
      return "Справочник";
    case "about":
      return "О приложении";
    case "account":
      return "Профиль";
    case "adminUsers":
      return "Пользователи";
    case "editProfile":
      return "Редактирование профиля";
    default:
      return "Приложение";
  }
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function App() {
  const [screen, setScreen] = useState<ScreenKey>("calc");
  const [lastMainScreen, setLastMainScreen] = useState<ScreenKey>("calc");

  const [weight, setWeight] = useState<string>("");
  const [height, setHeight] = useState<string>("");

  const [result, setResult] = useState<ResultState | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Auth (учебный локальный аккаунт)
  const [sessionEmail, setSessionEmailState] = useState<string | null>(null);
  const [sessionRole, setSessionRoleState] = useState<string | null>(null);
  const [sessionName, setSessionNameState] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState<string>("");
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authPassword2, setAuthPassword2] = useState<string>("");
  const [authBusy, setAuthBusy] = useState<boolean>(false);

  // Account settings
  const [newPassword, setNewPassword] = useState<string>("");
  const [newPassword2, setNewPassword2] = useState<string>("");

  // Profile edit
  const [profileName, setProfileName] = useState<string>("");
  const [profileEmail, setProfileEmail] = useState<string>("");
  const [profileBusy, setProfileBusy] = useState<boolean>(false);

  // Admin panel
  const [adminUsers, setAdminUsers] = useState<
    Array<{ id: number; name?: string; email: string; role: string; created_at: string }>
  >([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState<boolean>(false);
  const [adminUsersError, setAdminUsersError] = useState<string>("");

  // Fitness recommendations
  const [goal, setGoal] = useState<Goal>("fit");

  const [apiQuery, setApiQuery] = useState<string>("body mass index");
  const [apiResults, setApiResults] = useState<PubMedArticle[]>([]);
  const [apiLoading, setApiLoading] = useState<boolean>(false);

  const apiAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const email = await getSessionEmail();
      const role = await getSessionRole();
      const name = await getSessionName();
      setSessionEmailState(email);
      setSessionRoleState(role);
      setSessionNameState(name);

      // If token exists - sync profile from server (name/email/role)
      const token = await getSessionToken();
      if (token) {
        const me = await getMe();
        if (me.ok) {
          setSessionEmailState(me.email);
          setSessionRoleState(me.role);
          setSessionNameState(me.name);
        }
      }
    })();
  }, []);

  // История должна быть индивидуальной для каждого аккаунта.
  // Поэтому при смене сессии (вход/выход) перезагружаем историю из backend.
  useEffect(() => {
    (async () => {
      if (!sessionEmail) {
        setHistory([]);
        return;
      }
      const items = await loadHistory();
      setHistory(items);
    })();
  }, [sessionEmail]);

  const canCalculate = useMemo(() => {
    return weight.trim().length > 0 && height.trim().length > 0;
  }, [weight, height]);


// ===== Статистика (производные данные + анимации) =====
const statsCurrent = useMemo(() => {
  const w = parseNumber(weight);
  const h = parseNumber(height);
  if (result && Number.isFinite(w) && Number.isFinite(h)) {
    return { bmi: result.bmi, weightKg: w, heightCm: h, category: result.category };
  }
  const last = history[0];
  if (last) {
    return { bmi: last.bmi, weightKg: last.weightKg, heightCm: last.heightCm, category: last.category };
  }
  return null;
}, [weight, height, result, history]);

const suggestedGoal: Goal = useMemo(() => {
  if (!statsCurrent) return "fit";
  if (statsCurrent.bmi >= 25) return "lose";
  if (statsCurrent.bmi < 18.5) return "gain";
  return "fit";
}, [statsCurrent]);

const effectiveGoal: Goal = useMemo(() => {
  // если пользователь не выбирал цель явно (goal="fit"), предлагаем цель по ИМТ
  return goal === "fit" && suggestedGoal !== "fit" ? suggestedGoal : goal;
}, [goal, suggestedGoal]);

const statsPlan = useMemo(() => {
  if (!statsCurrent) return null;
  return buildWorkoutPlan({
    weightKg: statsCurrent.weightKg,
    heightCm: statsCurrent.heightCm,
    bmi: statsCurrent.bmi,
    goal: effectiveGoal,
  });
}, [statsCurrent, effectiveGoal]);

const statsEnter = useRef(new Animated.Value(0)).current;
const strengthBar = useRef(new Animated.Value(0)).current;
const cardioBar = useRef(new Animated.Value(0)).current;
const pulse = useRef(new Animated.Value(0)).current;
const [bmiDisplay, setBmiDisplay] = useState<number>(0);

useEffect(() => {
  if (screen !== "stats") return;

  statsEnter.setValue(0);
  Animated.timing(statsEnter, {
    toValue: 1,
    duration: 420,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }).start();

  pulse.setValue(0);
  const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])
  );
  loop.start();
  return () => loop.stop();
}, [screen, statsEnter, pulse]);

useEffect(() => {
  if (screen !== "stats") return;

  const target = statsCurrent?.bmi ?? 0;
  const duration = 600;
  const start = Date.now();
  const from = 0;

  const tick = () => {
    const t = Math.min(1, (Date.now() - start) / duration);
    // easeOutCubic
    const k = 1 - Math.pow(1 - t, 3);
    const v = from + (target - from) * k;
    setBmiDisplay(v);
    if (t < 1) requestAnimationFrame(tick);
  };
  setBmiDisplay(0);
  requestAnimationFrame(tick);
}, [screen, statsCurrent?.bmi]);

useEffect(() => {
  if (screen !== "stats" || !statsPlan) return;

  const strengthTotal =
    statsPlan.gymPlan.strengthSessionsPerWeek * statsPlan.gymPlan.strengthMinutesPerSession;
  const cardioTotal =
    statsPlan.gymPlan.cardioSessionsPerWeek * statsPlan.gymPlan.cardioMinutesPerSession;

  const max = Math.max(strengthTotal, cardioTotal, 1);

  strengthBar.setValue(0);
  cardioBar.setValue(0);

  Animated.parallel([
    Animated.timing(strengthBar, {
      toValue: Math.min(1, strengthTotal / max),
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }),
    Animated.timing(cardioBar, {
      toValue: Math.min(1, cardioTotal / max),
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }),
  ]).start();
}, [
  screen,
  statsPlan?.gymPlan?.strengthSessionsPerWeek,
  statsPlan?.gymPlan?.strengthMinutesPerSession,
  statsPlan?.gymPlan?.cardioSessionsPerWeek,
  statsPlan?.gymPlan?.cardioMinutesPerSession,
]);

  const tabScreens = useMemo<ScreenKey[]>(() => {
    return ["calc", "result", "stats", "history", "api"];
  }, []);

  const mainScreens = useMemo<ScreenKey[]>(() => {
    return [...tabScreens, "about"];
  }, [tabScreens]);

  async function go(next: ScreenKey): Promise<void> {
    // Remember last "main" screen so the profile screen can go back
    // to the user's working context (tab screen / about).
    if (mainScreens.includes(next)) {
      setLastMainScreen(next);
    }
    setScreen(next);
  }

  async function onAuthSubmit(): Promise<void> {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      if (authMode === "register") {
        if (authPassword !== authPassword2) {
          Alert.alert("Проверьте пароль", "Пароли не совпадают.");
          return;
        }
        const res = await registerUser({
          name: authName,
          email: authEmail,
          password: authPassword,
        });
        if (!res.ok) {
          Alert.alert("Не удалось зарегистрироваться", res.message);
          return;
        }
        const email = await getSessionEmail();
        const role = await getSessionRole();
        const name = await getSessionName();
        setSessionEmailState(email);
        setSessionRoleState(role);
        setSessionNameState(name);

        setAuthPassword("");
        setAuthPassword2("");
        setAuthName("");
        // после регистрации подтягиваем историю (для нового пользователя она будет пустой)
        setHistory(await loadHistory());
        await go("calc");
      } else {
        const res = await loginUser({ email: authEmail, password: authPassword });
        if (!res.ok) {
          Alert.alert("Не удалось войти", res.message);
          return;
        }
        const email = await getSessionEmail();
        const role = await getSessionRole();
        const name = await getSessionName();
        setSessionEmailState(email);
        setSessionRoleState(role);
        setSessionNameState(name);
        setAuthPassword("");
        // после входа подтягиваем историю именно этого пользователя
        setHistory(await loadHistory());
        await go("calc");
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function onLogout(): Promise<void> {
    // React Native Web не всегда корректно поддерживает Alert.alert с массивом кнопок.
    // Поэтому для web используем confirm(), чтобы кнопка "шестерёнка" работала стабильно.
    const ok = await new Promise<boolean>((resolve) => {
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        const confirmed = typeof window !== "undefined"
          ? window.confirm("Выйти из аккаунта? Вы вернётесь на экран входа.")
          : false;
        resolve(confirmed);
        return;
      }

      Alert.alert("Выйти из аккаунта?", "Вы вернётесь на экран входа.", [
        { text: "Отмена", style: "cancel", onPress: () => resolve(false) },
        { text: "Выйти", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
    if (!ok) return;
    await clearSession();
    setSessionEmailState(null);
    setSessionRoleState(null);
    setSessionNameState(null);
    setSessionNameState(null);
    // чтобы при выходе не показывалась история предыдущего пользователя
    setHistory([]);
    setScreen("calc");
    setWeight("");
    setHeight("");
    setResult(null);
  }

  async function onOpenEditProfile(): Promise<void> {
    // Prefill from local session
    setProfileName(sessionName ?? "");
    setProfileEmail(sessionEmail ?? "");

    // Sync from server (if possible)
    const me = await getMe();
    if (me.ok) {
      setSessionNameState(me.name);
      setSessionEmailState(me.email);
      setSessionRoleState(me.role);
      setProfileName(me.name);
      setProfileEmail(me.email);
    }

    await go("editProfile");
  }

  async function onSaveProfile(): Promise<void> {
    if (profileBusy) return;
    setProfileBusy(true);
    try {
      const wantsPasswordChange = Boolean(newPassword.trim() || newPassword2.trim());
      if (wantsPasswordChange) {
        if (newPassword.length < 6) {
          Alert.alert("Проверьте пароль", "Пароль должен быть не короче 6 символов.");
          return;
        }
        if (newPassword !== newPassword2) {
          Alert.alert("Проверьте пароль", "Пароли не совпадают.");
          return;
        }
      }

      const res = await updateProfile({ name: profileName, email: profileEmail });
      if (!res.ok) {
        Alert.alert("Не удалось сохранить", res.message);
        return;
      }

      // Refresh local session state from storage
      const email = await getSessionEmail();
      const role = await getSessionRole();
      const name = await getSessionName();
      setSessionEmailState(email);
      setSessionRoleState(role);
      setSessionNameState(name);

      if (wantsPasswordChange) {
        const passRes = await changePassword({ newPassword });
        if (!passRes.ok) {
          Alert.alert("Не удалось сохранить", passRes.message);
          return;
        }
        setNewPassword("");
        setNewPassword2("");
      }

      Alert.alert(
        "Готово",
        wantsPasswordChange ? "Профиль и пароль обновлены." : "Профиль обновлён."
      );
      await go("account");
    } finally {
      setProfileBusy(false);
    }
  }

  async function onCalculate(): Promise<void> {
    const w = parseNumber(weight);
    const h = parseNumber(height);
    const errors = validateInputs(w, h);
    if (errors.length) {
      Alert.alert("Проверьте ввод", errors.join("\n"));
      return;
    }

    const bmi = calculateBmi(w, h);
    const bmiRounded = round1(bmi);
    const cls = classifyBmi(bmi);

    const nextResult: ResultState = {
      bmi: bmiRounded,
      category: cls.label,
      note: cls.note,
    };
    setResult(nextResult);

    const item: HistoryItem = {
      id: String(Date.now()),
      at: new Date().toISOString(),
      weightKg: w,
      heightCm: h,
      bmi: bmiRounded,
      category: cls.label,
    };

    const nextHistory = await addHistoryItem(item);
    setHistory(nextHistory);

    await go("result");
  }

  function onReset(): void {
    setWeight("");
    setHeight("");
    setResult(null);
    void go("calc");
  }


async function loadAdminUsers(): Promise<void> {
  if (adminUsersLoading) return;
  setAdminUsersError("");
  setAdminUsersLoading(true);
  try {
    const token = await getSessionToken();
    if (!token) {
      setAdminUsers([]);
      setAdminUsersError("Нет активной сессии.");
      return;
    }
    const r = await fetch(`${API_BASE_URL}/admin/users`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok || !Array.isArray(data.users)) {
      setAdminUsers([]);
      setAdminUsersError(data?.message || "Не удалось загрузить пользователей.");
      return;
    }
    setAdminUsers(data.users);
  } catch {
    setAdminUsers([]);
    setAdminUsersError("Нет подключения к серверу.");
  } finally {
    setAdminUsersLoading(false);
  }
}

  async function onClearHistory(): Promise<void> {
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Очистить историю?",
        "Будут удалены все сохранённые расчёты.",
        [
          { text: "Отмена", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Очистить",
            style: "destructive",
            onPress: () => resolve(true),
          },
        ]
      );
    });
    if (!ok) return;

    const next = await clearHistory();
    setHistory(next);
  }

  async function onApiSearch(): Promise<void> {
    const q = apiQuery.trim();
    if (!q) {
      Alert.alert(
        "Введите запрос",
        "Например: body mass index, obesity, diabetes."
      );
      return;
    }

    apiAbortRef.current?.abort();
    const controller = new AbortController();
    apiAbortRef.current = controller;

    setApiLoading(true);
    try {
      const articles = await searchPubMed({
        query: q,
        retmax: 10,
        signal: controller.signal,
      });
      setApiResults(articles);
    } catch (e: any) {
      if (String(e?.name) === "AbortError") return;
      Alert.alert(
        "Не удалось выполнить запрос",
        "Проверьте интернет-соединение и повторите попытку."
      );
    } finally {
      setApiLoading(false);
    }
  }

  async function openPubMed(id: string): Promise<void> {
    const url = pubmedUrl(id);
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Не удалось открыть ссылку", url);
    }
  }

  const headerTitle = sessionEmail ? screenTitle(screen) : "Вход / Регистрация";
  const isSubScreen = sessionEmail && (screen === "account" || screen === "editProfile" || screen === "adminUsers");
  const showGear = sessionEmail && !isSubScreen;
  const showBack = Boolean(isSubScreen);

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {showBack ? (
          <Pressable
            onPress={() => {
              if (screen === "account") void go(lastMainScreen);
              else void go("account");
            }}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            hitSlop={10}
            style={styles.headerIconBtn}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.muted} />
          </Pressable>
        ) : (
          <View style={styles.headerIconSpacer} />
        )}

        <Text style={styles.h2}>{headerTitle}</Text>

        {showGear ? (
          <Pressable
            onPress={() => void go("account")}
            accessibilityRole="button"
            accessibilityLabel="Профиль"
            hitSlop={10}
            style={styles.headerIconBtn}
          >
            <Ionicons name="settings-outline" size={22} color={theme.colors.muted} />
          </Pressable>
        ) : (
          <View style={styles.headerIconSpacer} />
        )}
      </View>
    </View>
  );

  const content = (() => {
    if (!sessionEmail) {
      return (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Text style={styles.lead}>
            Приложение для фитнес-клуба: измерьте ИМТ и получите ориентиры по
            времени и нагрузкам в спортзале, чтобы улучшить показатель.
          </Text>

          <View style={styles.segment}>
            <Pressable
              style={[
                styles.segmentBtn,
                authMode === "login" && styles.segmentBtnActive,
              ]}
              onPress={() => setAuthMode("login")}
            >
              <Text
                style={[
                  styles.segmentText,
                  authMode === "login" && styles.segmentTextActive,
                ]}
              >
                Вход
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segmentBtn,
                authMode === "register" && styles.segmentBtnActive,
              ]}
              onPress={() => setAuthMode("register")}
            >
              <Text
                style={[
                  styles.segmentText,
                  authMode === "register" && styles.segmentTextActive,
                ]}
              >
                Регистрация
              </Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            {authMode === "register" ? (
              <>
                <Text style={styles.label}>Имя</Text>
                <TextInput
                  value={authName}
                  onChangeText={setAuthName}
                  placeholder="Например: Иван"
                  style={styles.textInput}
                  placeholderTextColor={theme.colors.muted}
                  autoCorrect={false}
                />
              </>
            ) : null}

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={authEmail}
              onChangeText={setAuthEmail}
              placeholder="example@mail.com"
              style={styles.textInput}
              placeholderTextColor={theme.colors.muted}
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Пароль</Text>
            <TextInput
              value={authPassword}
              onChangeText={setAuthPassword}
              placeholder="Минимум 6 символов"
              style={styles.textInput}
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              autoCorrect={false}
              autoCapitalize="none"
            />

            {authMode === "register" ? (
              <>
                <Text style={styles.label}>Повторите пароль</Text>
                <TextInput
                  value={authPassword2}
                  onChangeText={setAuthPassword2}
                  placeholder="Повторите пароль"
                  style={styles.textInput}
                  placeholderTextColor={theme.colors.muted}
                  secureTextEntry
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </>
            ) : null}

            <View style={styles.buttons}>
              <Pressable
                style={[styles.btn, authBusy && styles.btnDisabled]}
                onPress={() => void onAuthSubmit()}
                disabled={authBusy}
              >
                <Text style={styles.btnText}>
                  {authMode === "register"
                    ? authBusy
                      ? "Создание..."
                      : "Создать аккаунт"
                    : authBusy
                      ? "Вход..."
                      : "Войти"}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.disclaimer}>
              Аккаунт и история сохраняются в базе данных PostgreSQL через локальный
              backend API. Для тестирования используйте простой пароль.
            </Text>
          </View>
        </KeyboardAvoidingView>
      );
    }

    if (screen === "account") {
      return (
        <View>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{sessionName?.trim() ? sessionName : "Без имени"}</Text>
            <Text style={styles.cardHint}>Имя</Text>
            <Text style={styles.cardValue}>{sessionEmail}</Text>
            <Text style={styles.cardHint}>Email</Text>
          </View>

          <View style={styles.buttons}>
            <Pressable
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => void onOpenEditProfile()}
            >
              <Text style={[styles.btnText, styles.btnTextSecondary]}>
                Редактировать профиль
              </Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.btnDanger]}
              onPress={() => void onLogout()}
            >
              <Text style={styles.btnText}>Выйти</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (screen === "editProfile") {
      return (
        <View>
          <Text style={styles.lead}>
            Здесь можно изменить имя и email, а также обновить пароль учётной записи.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Имя</Text>
            <TextInput
              value={profileName}
              onChangeText={setProfileName}
              placeholder="Например: Иван"
              style={styles.textInput}
              placeholderTextColor={theme.colors.muted}
              autoCorrect={false}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={profileEmail}
              onChangeText={setProfileEmail}
              placeholder="example@mail.com"
              style={styles.textInput}
              placeholderTextColor={theme.colors.muted}
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Смена пароля</Text>
            <Text style={styles.label}>Новый пароль</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Минимум 6 символов"
              style={styles.textInput}
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              autoCorrect={false}
            />

            <Text style={styles.label}>Повторите пароль</Text>
            <TextInput
              value={newPassword2}
              onChangeText={setNewPassword2}
              placeholder="Повторите новый пароль"
              style={styles.textInput}
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              autoCorrect={false}
            />
          </View>

          <View style={styles.buttons}>
            <Pressable
              style={[styles.btn, profileBusy && styles.btnDisabled]}
              onPress={() => void onSaveProfile()}
              disabled={profileBusy}
            >
              <Text style={styles.btnText}>
                {profileBusy ? "Сохранение..." : "Сохранить"}
              </Text>
            </Pressable>

            {sessionRole === "admin" ? (
              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => {
                  void loadAdminUsers();
                  void go("adminUsers");
                }}
              >
                <Text style={[styles.btnText, styles.btnTextSecondary]}>
                  Пользователи (админ)
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    }


if (screen === "adminUsers") {
  if (sessionRole !== "admin") {
    return (
      <View>
        <Text style={styles.lead}>
          Раздел доступен только администратору.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.lead}>
        Администратор может просматривать список пользователей приложения.
      </Text>

      <View style={styles.buttons}>
        <Pressable
          style={[styles.btn, adminUsersLoading && styles.btnDisabled]}
          onPress={() => void loadAdminUsers()}
          disabled={adminUsersLoading}
        >
          <Text style={styles.btnText}>
            {adminUsersLoading ? "Загрузка..." : "Обновить список"}
          </Text>
        </Pressable>
      </View>

      {adminUsersError ? (
        <Text style={styles.errorText}>{adminUsersError}</Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Пользователи</Text>
        <Text style={styles.cardHint}>
          Отображаются имя, email, роль и дата регистрации.
        </Text>

        <FlatList
          data={adminUsers}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{item.name?.trim() ? item.name : "Без имени"}</Text>
                <Text style={styles.listMeta}>{item.email}</Text>
                <Text style={styles.listMeta}>Роль: {item.role} · Создан: {fmtDate(item.created_at)}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.cardHint}>
              {adminUsersLoading
                ? "Загрузка..."
                : "Список пуст. Нажмите «Обновить список»."}
            </Text>
          }
        />
      </View>
    </View>
  );
}

    if (screen === "calc") {
      return (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Text style={styles.lead}>
            Введите рост и вес — приложение рассчитает индекс массы тела (ИМТ),
            сохранит результат и покажет интерпретацию. Рекомендации в разделе
            «Статистика» помогут оценить, сколько времени и какие нагрузки в
            спортзале могут понадобиться для улучшения показателя.
          </Text>

          <View style={styles.form}>
            <NumberField
              label="Вес"
              value={weight}
              onChangeText={setWeight}
              placeholder="Напр., 76"
              suffix="кг"
            />
            <NumberField
              label="Рост"
              value={height}
              onChangeText={setHeight}
              placeholder="Напр., 185"
              suffix="см"
            />

            <View style={styles.buttons}>
              <Pressable
                style={[styles.btn, !canCalculate && styles.btnDisabled]}
                onPress={onCalculate}
                disabled={!canCalculate}
              >
                <Text style={styles.btnText}>Рассчитать</Text>
              </Pressable>

              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={onReset}
              >
                <Text style={[styles.btnText, styles.btnTextSecondary]}>
                  Сбросить
                </Text>
              </Pressable>

              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => void go("history")}
              >
                <Text style={[styles.btnText, styles.btnTextSecondary]}>
                  История
                </Text>
              </Pressable>
            </View>

            <Text style={styles.disclaimer}>
              Примечание: результат носит информационный характер и не является
              медицинским диагнозом.
            </Text>
          </View>
        </KeyboardAvoidingView>
      );
    }

    if (screen === "result") {
      return (
        <View>
          {!result ? (
            <Text style={styles.lead}>
              Сначала выполните расчёт на вкладке «Анкета».
            </Text>
          ) : (
            <>
              <ResultCard
                bmiText={`ИМТ: ${result.bmi}`}
                category={result.category}
                note={result.note}
              />
              <View style={styles.buttons}>
                <Pressable
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={onReset}
                >
                  <Text style={[styles.btnText, styles.btnTextSecondary]}>
                    Новый расчёт
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.btn}
                  onPress={() => void go("history")}
                >
                  <Text style={styles.btnText}>К истории</Text>
                </Pressable>
              </View>
              <Text style={styles.disclaimer}>
                Интерпретация выполнена на основе классификации ВОЗ (для
                взрослых). При наличии хронических заболеваний ориентируйтесь на
                рекомендации врача.
              </Text>
            </>
          )}
        </View>
      );
    }

    if (screen === "history") {
      return (
        <View>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Сохранённые расчёты</Text>
            <Pressable onPress={onClearHistory} disabled={history.length === 0}>
              <Text
                style={[
                  styles.link,
                  history.length === 0 && styles.linkDisabled,
                ]}
              >
                Очистить
              </Text>
            </Pressable>
          </View>

          {history.length === 0 ? (
            <Text style={styles.muted}>
              Пока нет записей. Выполните расчёт, чтобы добавить запись.
            </Text>
          ) : (
            <FlatList
              data={history}
              keyExtractor={(it) => it.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.rowItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      ИМТ: {item.bmi} — {item.category}
                    </Text>
                    <Text style={styles.rowMeta}>
                      Вес: {item.weightKg} кг, рост: {item.heightCm} см
                    </Text>
                    <Text style={styles.rowDate}>{fmtDate(item.at)}</Text>
                  </View>
                </View>
              )}
            />
          )}

          <View style={styles.sep} />

          <View style={styles.buttons}>
            <Pressable
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => void go("calc")}
            >
              <Text style={[styles.btnText, styles.btnTextSecondary]}>
                К анкете
              </Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => void go("stats")}>
              <Text style={styles.btnText}>Статистика</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (screen === "stats") {
  const current = statsCurrent;
  const plan = statsPlan;

  const cardAnim = (idx: number) => {
    const translateY = statsEnter.interpolate({
      inputRange: [0, 1],
      outputRange: [18 + idx * 6, 0],
    });
    const opacity = statsEnter.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    return { transform: [{ translateY }], opacity };
  };

  const goalLabel =
    effectiveGoal === "lose"
      ? "Сбросить вес"
      : effectiveGoal === "gain"
        ? "Набрать массу"
        : "Набрать форму";

  const suggestionText =
    suggestedGoal === "lose"
      ? "снижение веса"
      : suggestedGoal === "gain"
        ? "набор массы"
        : "поддержание формы";

  const strengthWidth = strengthBar.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const cardioWidth = cardioBar.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  return (
    <View>
      {!current ? (
        <Text style={styles.lead}>
          Сначала выполните расчёт ИМТ на вкладке «Анкета», чтобы получить
          понятную статистику и ориентиры по нагрузкам.
        </Text>
      ) : (
        <>
          <Text style={styles.lead}>
            Здесь — краткая расшифровка вашего ИМТ и примерный план тренировок
            для улучшения показателя. Это ориентир, а не медицинское назначение.
          </Text>

          <Animated.View style={[styles.card, cardAnim(0)]}>
            <View style={styles.statHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Ваш ИМТ сейчас</Text>
                <Text style={styles.bigNumber}>{round1(bmiDisplay)}</Text>
                <Text style={styles.cardHint}>
                  Категория: <Text style={{ fontWeight: "900", color: theme.colors.text }}>{current.category}</Text>
                </Text>
                <Text style={styles.cardHint}>
                  Вес: {round1(current.weightKg)} кг • Рост: {round1(current.heightCm)} см
                </Text>
              </View>

              <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
                <Ionicons name="fitness-outline" size={34} color={theme.colors.primary} />
              </Animated.View>
            </View>

            <View style={styles.sep} />

            <View style={styles.chipsRow}>
              <View style={styles.chip}>
                <Ionicons name="time-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.chipText}>
                  {plan?.estimatedWeeks === 0 ? "Цель уже достигнута" : `Ориентир: ${plan?.estimatedWeeks ?? 0} нед.`}
                </Text>
              </View>

              <View style={styles.chip}>
                <Ionicons name="walk-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.chipText}>
                  {plan ? `≈ ${plan.gymPlan.stepsPerDay} шаг/день` : "Активность"}
                </Text>
              </View>
            </View>

            <Text style={styles.disclaimer}>
              Совет: ориентируйтесь на самочувствие. Если есть хронические заболевания —
              уточните допустимые нагрузки у специалиста.
            </Text>
          </Animated.View>

          <Animated.View style={[styles.card, cardAnim(1)]}>
            <Text style={styles.cardTitle}>Цель</Text>

            <View style={styles.segment}>
              <Pressable
                style={[
                  styles.segmentBtn,
                  effectiveGoal === "lose" && styles.segmentBtnActive,
                ]}
                onPress={() => setGoal("lose")}
              >
                <Text
                  style={[
                    styles.segmentText,
                    effectiveGoal === "lose" && styles.segmentTextActive,
                  ]}
                >
                  Сбросить вес
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.segmentBtn,
                  effectiveGoal === "fit" && styles.segmentBtnActive,
                ]}
                onPress={() => setGoal("fit")}
              >
                <Text
                  style={[
                    styles.segmentText,
                    effectiveGoal === "fit" && styles.segmentTextActive,
                  ]}
                >
                  Набрать форму
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.segmentBtn,
                  effectiveGoal === "gain" && styles.segmentBtnActive,
                ]}
                onPress={() => setGoal("gain")}
              >
                <Text
                  style={[
                    styles.segmentText,
                    effectiveGoal === "gain" && styles.segmentTextActive,
                  ]}
                >
                  Набрать массу
                </Text>
              </Pressable>
            </View>

            <Text style={styles.cardHint}>
              Рекомендовано по ИМТ: {suggestionText}. Выбрано: {goalLabel}.
            </Text>
          </Animated.View>

          {plan ? (
            <>
              <Animated.View style={[styles.card, cardAnim(2)]}>
                <Text style={styles.cardTitle}>План на неделю</Text>

                <View style={styles.statRow}>
                  <View style={styles.statRowHead}>
                    <Ionicons name="barbell-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.statRowTitle}>Силовые тренировки</Text>
                    <Text style={styles.statRowValue}>
                      {plan.gymPlan.strengthSessionsPerWeek}×{plan.gymPlan.strengthMinutesPerSession} мин
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <Animated.View style={[styles.barFill, { width: strengthWidth }]} />
                  </View>
                  <Text style={styles.cardHint}>
                    Упор на базовые движения или тренажёры, 6–10 упражнений.
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <View style={styles.statRowHead}>
                    <Ionicons name="heart-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.statRowTitle}>Кардио</Text>
                    <Text style={styles.statRowValue}>
                      {plan.gymPlan.cardioSessionsPerWeek}×{plan.gymPlan.cardioMinutesPerSession} мин
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <Animated.View style={[styles.barFill, { width: cardioWidth }]} />
                  </View>
                  <Text style={styles.cardHint}>
                    Дорожка (наклон), эллипс или велосипед — в комфортной зоне пульса.
                  </Text>
                </View>

                <View style={styles.sep} />
                <Text style={styles.muted}>{plan.summary}</Text>
              </Animated.View>

              <Animated.View style={[styles.card, cardAnim(3)]}>
                <Text style={styles.cardTitle}>Пояснения</Text>
                {plan.notes.map((n, idx) => (
                  <Text key={idx} style={styles.paragraph}>
                    • {n}
                  </Text>
                ))}
                <Text style={styles.disclaimer}>
                  Важно: скорость прогресса зависит от питания, сна, стресса и исходной подготовки.
                  При боли, головокружении или выраженной одышке — прекратите тренировку.
                </Text>
              </Animated.View>
            </>
          ) : null}

          <View style={styles.buttons}>
            <Pressable
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => void go("calc")}
            >
              <Text style={[styles.btnText, styles.btnTextSecondary]}>
                К анкете
              </Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => void go("api")}>
              <Text style={styles.btnText}>Справочник</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

    if (screen === "api") {
      return (
        <View>
          <Text style={styles.lead}>
            Внешняя интеграция: поиск публикаций в PubMed (NCBI E-utilities).
            Для работы требуется интернет.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Запрос</Text>
            <TextInput
              value={apiQuery}
              onChangeText={setApiQuery}
              placeholder="Напр., obesity, diabetes, BMI"
              style={styles.textInput}
              placeholderTextColor={theme.colors.muted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => void onApiSearch()}
            />

            <View style={styles.buttons}>
              <Pressable
                style={styles.btn}
                onPress={onApiSearch}
                disabled={apiLoading}
              >
                <Text style={styles.btnText}>
                  {apiLoading ? "Поиск..." : "Найти"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnSecondary]}
                onPress={() => void go("about")}
              >
                <Text style={[styles.btnText, styles.btnTextSecondary]}>
                  Источники
                </Text>
              </Pressable>
            </View>
            <View style={{ height: 25 }} />

            {apiResults.length === 0 ? (
              <Text style={styles.muted}>
                Нет результатов. Введите запрос и нажмите «Найти».
              </Text>
            ) : (
              apiResults.map((a) => (
                <Pressable
                  key={a.id}
                  style={styles.apiItem}
                  onPress={() => void openPubMed(a.id)}
                >
                  <Text style={styles.apiTitle}>{a.title}</Text>
                  <Text style={styles.apiMeta}>
                    PubMed ID: {a.id}
                    {a.source ? ` • ${a.source}` : ""}
                    {a.pubdate ? ` • ${a.pubdate}` : ""}
                  </Text>
                </Pressable>
              ))
            )}
            <Text style={styles.disclaimer}>
              Примечание: раздел «Справочник» предназначен для ознакомления с
              источниками. Решения о лечении принимает врач.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View>
        <Text style={styles.sectionTitle}>Назначение</Text>
        <Text style={styles.paragraph}>
          Приложение предназначено для фитнес-клуба и промо-акций (например, в
          торговом центре): пользователь измеряет ИМТ, получает интерпретацию
          результата, сохраняет историю и видит ориентиры по времени и нагрузкам
          в спортзале, чтобы улучшить показатель.
        </Text>

        <Text style={styles.sectionTitle}>Источники</Text>
        <Text style={styles.paragraph}>
          1) Классификация ИМТ (ВОЗ): использована стандартная шкала для
          взрослых (underweight/normal/overweight/obesity).
        </Text>
        <Text style={styles.paragraph}>
          2) NCBI E-utilities (PubMed API): поиск научных публикаций по запросу
          пользователя.
        </Text>

        <Text style={styles.sectionTitle}>Ограничения и безопасность</Text>
        <Text style={styles.paragraph}>
          Приложение не хранит персональные данные (ФИО, диагнозы, контакты). В
          истории сохраняются только введённые значения роста/веса, рассчитанный
          ИМТ, категория и дата расчёта. Результаты носят информационный
          характер.
        </Text>

        <View style={styles.buttons}>
          <Pressable
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => void go("calc")}
          >
            <Text style={[styles.btnText, styles.btnTextSecondary]}>
              К анкете
            </Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={() => void go("api")}>
            <Text style={styles.btnText}>Справочник</Text>
          </Pressable>
        </View>
      </View>
    );
  })();

  const nav = (
    <View style={styles.nav}>
      <NavButton
        label="Анкета"
        icon="person-circle-outline"
        active={screen === "calc"}
        onPress={() => void go("calc")}
      />
      <NavButton
        label="Результат"
        icon="pulse-outline"
        active={screen === "result"}
        onPress={() => void go("result")}
      />
      <NavButton
        label="Статистика"
        icon="stats-chart-outline"
        active={screen === "stats"}
        onPress={() => void go("stats")}
      />
      <NavButton
        label="История"
        icon="time-outline"
        active={screen === "history"}
        onPress={() => void go("history")}
      />
      <NavButton
        label="Справочник"
        icon="book-outline"
        active={screen === "api"}
        onPress={() => void go("api")}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {header}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
      >
        {content}
      </ScrollView>
      {sessionEmail && tabScreens.includes(screen) ? nav : null}
    </SafeAreaView>
  );
}

function NavButton(props: {
  label: string;
  icon: any;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.navBtn, props.active && styles.navBtnActive]}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
    >
      <Ionicons
        name={props.icon}
        size={24}
        color={props.active ? theme.colors.primary : theme.colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },

  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconSpacer: {
    width: 32,
    height: 32,
  },
  h1: { fontSize: 18, fontWeight: "900", color: theme.colors.text },
  h2: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "900", color: theme.colors.text },

  segment: {
    flexDirection: "row",
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    marginTop: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBtnActive: { backgroundColor: theme.colors.primarySoft },
  segmentText: { fontSize: 12, fontWeight: "800", color: theme.colors.muted },
  segmentTextActive: { color: theme.colors.primary },

  body: { flex: 1, backgroundColor: theme.colors.bg },
  bodyContent: { padding: 16, paddingBottom: 24 },

  lead: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    color: theme.colors.text,
    opacity: 0.92,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
    color: theme.colors.text,
    opacity: 0.92,
  },
  muted: { fontSize: 14, color: theme.colors.muted },

  form: { marginTop: 8 },
  label: {
    fontSize: 14,
    marginBottom: 6,
    color: theme.colors.text,
    opacity: 0.9,
    fontWeight: "600",
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: theme.radius.md,
    fontSize: 16,
    marginBottom: 12,
    color: theme.colors.text,
  },

  buttons: { flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" },
  btn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    ...theme.shadowSoft,
  },
  btnDisabled: { opacity: 0.45 },
  btnSecondary: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  btnDanger: {
    backgroundColor: theme.colors.danger,
  },
  btnText: { color: "#fff", fontWeight: "800" },
  btnTextSecondary: { color: theme.colors.primary },

  link: {
    fontSize: 14,
    color: theme.colors.primary,
    textDecorationLine: "underline",
    fontWeight: "700",
  },
  linkDisabled: { opacity: 0.35 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginTop: 10,
    marginBottom: 8,
    color: theme.colors.text,
  },

  sep: { height: 10 },

  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  rowItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    marginTop: 10,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  rowTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  rowMeta: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: 2,
    fontWeight: "600",
  },
  rowDate: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },


listRow: {
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 10,
  paddingVertical: 10,
  borderTopWidth: 1,
  borderTopColor: theme.colors.border,
},
listTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
listMeta: {
  fontSize: 12,
  color: theme.colors.muted,
  marginTop: 2,
  fontWeight: "600",
},

errorText: {
  marginTop: 8,
  fontSize: 13,
  color: theme.colors.danger,
  fontWeight: "700",
},

  card: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginTop: 10,
    ...theme.shadow,
  },
  cardTitle: {
    fontSize: 14,
    color: theme.colors.muted,
    marginBottom: 6,
    fontWeight: "700",
  },
  cardValue: { fontSize: 22, fontWeight: "900", color: theme.colors.text },
  cardHint: { marginTop: 6, fontSize: 12, color: theme.colors.muted },

statHeaderRow: {
  flexDirection: "row",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
},
bigNumber: { fontSize: 42, fontWeight: "900", color: theme.colors.text, letterSpacing: -0.5 },

chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
chip: {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: theme.colors.border,
  backgroundColor: theme.colors.bg,
},
chipText: { fontSize: 12, color: theme.colors.text, fontWeight: "800" },

statRow: { marginTop: 12 },
statRowHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
statRowTitle: { flex: 1, fontSize: 13, fontWeight: "800", color: theme.colors.text },
statRowValue: { fontSize: 13, fontWeight: "900", color: theme.colors.text },

barTrack: {
  height: 10,
  borderRadius: 999,
  backgroundColor: theme.colors.bg,
  borderWidth: 1,
  borderColor: theme.colors.border,
  overflow: "hidden",
},
barFill: {
  height: 10,
  borderRadius: 999,
  backgroundColor: theme.colors.primary,
},


  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  kvKey: {
    fontSize: 14,
    color: theme.colors.text,
    opacity: 0.9,
    fontWeight: "600",
  },
  kvVal: { fontSize: 14, fontWeight: "800", color: theme.colors.text },

  apiItem: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    marginTop: 10,
    ...theme.shadowSoft,
  },
  apiTitle: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
    color: theme.colors.text,
  },
  apiMeta: {
    fontSize: 12,
    color: theme.colors.muted,
    marginTop: 6,
    fontWeight: "600",
  },

  disclaimer: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.muted,
  },

  nav: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  navBtn: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
    backgroundColor: "transparent",
  },
  navBtnActive: { backgroundColor: theme.colors.primarySoft },
});
