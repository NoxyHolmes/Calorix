// js/calculations.js — Изолированный модуль расчётов BMR, TDEE, дефицита, БЖУ и ИМТ (6–50 лет)
import { round1 } from './utils.js';

/**
 * Расчёт базового обмена (BMR / REE) строго по возрастной группе:
 * - 6–10 лет: педиатрическая формула ВОЗ/FAO/UNU
 * - 10–18 лет: педиатрическая формула ВОЗ/FAO/UNU для подростков
 * - 18–50 лет: формула Миффлина — Сан Жеора
 */
export function calculateBMR({ age, gender, weightKg, heightCm }) {
  const a = Number(age);
  const w = Number(weightKg);
  const h = Number(heightCm);
  const isMale = gender === 'male';

  let bmr = 0;
  let formulaName = '';
  let ageGroup = '';

  if (a >= 6 && a < 10) {
    ageGroup = 'child_6_10';
    formulaName = isMale
      ? 'Педиатрическая (6–10 лет, мальчики): 22.7 × вес + 495'
      : 'Педиатрическая (6–10 лет, девочки): 22.5 × вес + 499';
    bmr = isMale ? (22.7 * w + 495) : (22.5 * w + 499);
  } else if (a >= 10 && a < 18) {
    ageGroup = 'teen_10_18';
    formulaName = isMale
      ? 'Педиатрическая (10–18 лет, юноши): 17.5 × вес + 651'
      : 'Педиатрическая (10–18 лет, девушки): 12.2 × вес + 746';
    bmr = isMale ? (17.5 * w + 651) : (12.2 * w + 746);
  } else {
    ageGroup = 'adult_18_50';
    formulaName = isMale
      ? 'Mifflin–St Jeor (18–50 лет, мужчины)'
      : 'Mifflin–St Jeor (18–50 лет, женщины)';
    bmr = (10 * w) + (6.25 * h) - (5 * a) + (isMale ? 5 : -161);
  }

  return {
    bmr: Math.round(bmr),
    formulaName,
    ageGroup,
    isPediatric: a < 18
  };
}

export function calculateTDEE(bmr, activityMultiplier) {
  return Math.round(Number(bmr) * Number(activityMultiplier || 1.375));
}

export function calculateBMI(weightKg, heightCm) {
  const hMeters = Number(heightCm) / 100;
  if (!hMeters) return { bmi: 0, category: '—' };
  const bmi = round1(Number(weightKg) / (hMeters * hMeters));
  let category = 'Норма';
  if (bmi < 18.5) category = 'Дефицит массы';
  else if (bmi >= 25 && bmi < 30) category = 'Избыточная масса';
  else if (bmi >= 30) category = 'Ожирение';
  return { bmi, category };
}

/**
 * Расчёт целевой калорийности и БЖУ с учётом ограничений безопасности для детей и взрослых
 */
export function buildNutritionProgram({ age, gender, height, currentWeight, targetWeight, activity, deficitPct }) {
  const { bmr, formulaName, ageGroup, isPediatric } = calculateBMR({
    age,
    gender,
    weightKg: currentWeight,
    heightCm: height
  });

  const tdee = calculateTDEE(bmr, activity);
  const requestedDeficit = Number(deficitPct);

  // Рекомендуемый безопасный порог: для детей 6–18 лет — 10–15%, для взрослых — 15–20%
  const safeMaxDeficit = isPediatric ? 15 : 20;
  const exceedsSafePediatricDeficit = isPediatric && requestedDeficit > 15;
  const exceedsSafeAdultDeficit = !isPediatric && requestedDeficit > 22;

  const targetKcalRaw = Math.round(tdee * (1 - requestedDeficit / 100));
  const minFloorKcal = isPediatric ? Math.round(bmr * 1.05) : Math.max(1200, Math.round(bmr * 0.95));
  const targetKcal = Math.max(minFloorKcal, targetKcalRaw);

  // Макронутриенты:
  // Взрослые: белок 1.8 г/кг (в диапазоне 1.6-2.2 г/кг), жиры 28% калорий (>= 25%), углеводы — остаток
  // Дети и подростки: сбалансированный профиль (белок 1.4 г/кг, жиры 30% калорий, углеводы — остаток)
  const proteinPerKg = isPediatric ? 1.4 : 1.8;
  const fatCalorieShare = isPediatric ? 0.30 : 0.28;

  const proteinGrams = Math.round(Number(currentWeight) * proteinPerKg);
  const proteinKcal = proteinGrams * 4;

  const fatKcal = Math.round(targetKcal * fatCalorieShare);
  const fatGrams = Math.round(fatKcal / 9);

  const carbsKcal = Math.max(120, targetKcal - proteinKcal - fatKcal);
  const carbsGrams = Math.round(carbsKcal / 4);

  const { bmi, category: bmiCategory } = calculateBMI(currentWeight, height);

  return {
    bmr,
    tdee,
    targetKcal,
    baseTargetKcal: targetKcal,
    formulaName,
    ageGroup,
    isPediatric,
    requestedDeficit,
    safeMaxDeficit,
    exceedsSafePediatricDeficit,
    exceedsSafeAdultDeficit,
    macros: {
      protein: proteinGrams,
      fat: fatGrams,
      carbs: carbsGrams
    },
    bmi,
    bmiCategory
  };
}

export function recalculateMacrosForKcal(targetKcal, weightKg, isPediatric) {
  const proteinPerKg = isPediatric ? 1.4 : 1.8;
  const fatCalorieShare = isPediatric ? 0.30 : 0.28;

  const proteinGrams = Math.round(Number(weightKg) * proteinPerKg);
  const fatGrams = Math.round((targetKcal * fatCalorieShare) / 9);
  const carbsGrams = Math.max(30, Math.round((targetKcal - proteinGrams * 4 - fatGrams * 9) / 4));

  return {
    protein: proteinGrams,
    fat: fatGrams,
    carbs: carbsGrams
  };
}

export function computeMealMacros(foodItem, grams) {
  const g = Math.max(0, Number(grams) || 0);
  const ratio = g / 100;
  return {
    kcal: Math.round((Number(foodItem.kcal100) || 0) * ratio),
    p: round1((Number(foodItem.p100) || 0) * ratio),
    f: round1((Number(foodItem.f100) || 0) * ratio),
    c: round1((Number(foodItem.c100) || 0) * ratio)
  };
}
