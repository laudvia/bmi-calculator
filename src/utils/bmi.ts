export type BmiClass = {
  label: string;
  note: string;
};

export function calculateBmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function classifyBmi(bmi: number): BmiClass {
  // WHO adult BMI classification
  if (bmi < 18.5) {
    return {
      label: "Недостаточная масса тела",
      note: "Рекомендуется обсудить питание и режим с врачом/диетологом.",
    };
  }
  if (bmi < 25) {
    return {
      label: "Нормальная масса тела",
      note: "Поддерживайте текущую активность и рацион.",
    };
  }
  if (bmi < 30) {
    return {
      label: "Избыточная масса тела",
      note: "Полезны умеренная активность и корректировка питания.",
    };
  }
  if (bmi < 35) {
    return {
      label: "Ожирение I степени",
      note: "Рекомендуется консультация специалиста и план снижения веса.",
    };
  }
  if (bmi < 40) {
    return {
      label: "Ожирение II степени",
      note: "Рекомендуется медицинское сопровождение и коррекция образа жизни.",
    };
  }
  return {
    label: "Ожирение III степени",
    note: "Рекомендуется срочная консультация врача и комплексное лечение.",
  };
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function validateInputs(weightKg: number, heightCm: number): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(weightKg) || weightKg <= 0) errors.push("Вес должен быть положительным числом.");
  if (!Number.isFinite(heightCm) || heightCm <= 0) errors.push("Рост должен быть положительным числом.");
  if (heightCm < 80 || heightCm > 250) errors.push("Рост выглядит некорректно (ожидается 80–250 см).");
  if (weightKg < 20 || weightKg > 300) errors.push("Вес выглядит некорректно (ожидается 20–300 кг).");
  return errors;
}
