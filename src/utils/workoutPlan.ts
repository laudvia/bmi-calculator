export type Goal = "lose" | "gain" | "fit";

export type WorkoutPlan = {
  goal: Goal;
  targetBmi: number;
  currentWeightKg: number;
  targetWeightKg: number;
  deltaKg: number;
  estimatedWeeks: number;
  summary: string;
  gymPlan: {
    strengthSessionsPerWeek: number;
    strengthMinutesPerSession: number;
    cardioSessionsPerWeek: number;
    cardioMinutesPerSession: number;
    stepsPerDay: number;
  };
  notes: string[];
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function weightForBmi(heightCm: number, bmi: number): number {
  const h = heightCm / 100;
  return bmi * h * h;
}

// Простая (учебная) модель рекомендаций.
// Не является медицинской рекомендацией и не учитывает противопоказания.
export function buildWorkoutPlan(params: {
  weightKg: number;
  heightCm: number;
  bmi: number;
  goal: Goal;
}): WorkoutPlan {
  const { weightKg, heightCm, bmi, goal } = params;

  // В качестве "разумных" ориентиров используем:
  // - для снижения веса: верхнюю границу нормы 24.9 (или чуть ниже)
  // - для набора: нижнюю границу нормы 19.5
  // - для "формы": цель около 22.0
  const targetBmi =
    goal === "lose" ? 24.0 : goal === "gain" ? 20.0 : 22.0;

  const targetWeightKg = round1(weightForBmi(heightCm, targetBmi));
  const deltaKg = round1(targetWeightKg - weightKg);

  // Скорости изменения массы (условные, для расчёта времени):
  // - снижение: 0.5–0.75 кг/нед
  // - набор: 0.25–0.5 кг/нед
  const lossRate = bmi >= 30 ? 0.75 : 0.5;
  const gainRate = 0.35;

  let estimatedWeeks = 0;
  if (goal === "lose") {
    const needLose = Math.max(0, weightKg - targetWeightKg);
    estimatedWeeks = needLose > 0 ? Math.ceil(needLose / lossRate) : 0;
  } else if (goal === "gain") {
    const needGain = Math.max(0, targetWeightKg - weightKg);
    estimatedWeeks = needGain > 0 ? Math.ceil(needGain / gainRate) : 0;
  } else {
    // Рекомпозиция: даём ориентир 8–12 недель.
    estimatedWeeks = clamp(Math.round(8 + Math.abs(22 - bmi) * 2), 8, 12);
  }

  const gymPlan =
    goal === "lose"
      ? {
          strengthSessionsPerWeek: 3,
          strengthMinutesPerSession: 45,
          cardioSessionsPerWeek: 3,
          cardioMinutesPerSession: 35,
          stepsPerDay: 8000,
        }
      : goal === "gain"
        ? {
            strengthSessionsPerWeek: 4,
            strengthMinutesPerSession: 55,
            cardioSessionsPerWeek: 2,
            cardioMinutesPerSession: 20,
            stepsPerDay: 6000,
          }
        : {
            strengthSessionsPerWeek: 3,
            strengthMinutesPerSession: 50,
            cardioSessionsPerWeek: 2,
            cardioMinutesPerSession: 25,
            stepsPerDay: 7000,
          };

  const summary =
    goal === "lose"
      ? `Ориентир: снизить массу до ~${targetWeightKg} кг (ИМТ ≈ ${targetBmi}).`
      : goal === "gain"
        ? `Ориентир: набрать массу до ~${targetWeightKg} кг (ИМТ ≈ ${targetBmi}).`
        : `Ориентир: улучшать форму вокруг ИМТ ≈ ${targetBmi} (силовые + умеренное кардио).`;

  const notes: string[] = [];
  if (goal === "lose") {
    notes.push(
      "Ставка на регулярность: силовые для сохранения мышц + умеренное кардио."
    );
    notes.push(
      "Если есть противопоказания (сердце/суставы/давление) — согласуйте нагрузку со специалистом."
    );
  }
  if (goal === "gain") {
    notes.push(
      "Для набора важны прогрессия нагрузок и достаточное питание (белок/калории)."
    );
    notes.push("Кардио оставляем коротким, чтобы поддерживать выносливость.");
  }
  if (goal === "fit") {
    notes.push(
      "Оценка " +
        "по ИМТ не отличает мышцы от жира: для точности используйте обхваты/фото/проценты жира."
    );
  }

  return {
    goal,
    targetBmi,
    currentWeightKg: round1(weightKg),
    targetWeightKg,
    deltaKg: round1(deltaKg),
    estimatedWeeks,
    summary,
    gymPlan,
    notes,
  };
}
