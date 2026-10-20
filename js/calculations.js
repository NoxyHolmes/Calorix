// js/calculations.js — Расчёт BMR, TDEE, степени ожирения, % жира в организме, идеального веса и БЖУ
import { round1 } from './utils.js';

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

/**
 * Детальный расчёт ИМТ, степени ожирения, % жира в организме, сухой массы и идеального веса
 */
export function calculateDetailedBodyMetrics({ weightKg, heightCm, age, gender }) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(age);
  const isMale = gender === 'male';
  const hMeters = h / 100;

  if (!hMeters || !w) {
    return {
      bmi: 0,
      category: '—',
      obesityDegree: 'Нет данных',
      riskLevel: 'Низкий',
      bodyFatPct: 0,
      fatMassKg: 0,
      leanMassKg: 0,
      idealWeightMin: 0,
      idealWeightMax: 0,
      idealWeightMid: 0,
      excessWeightKg: 0,
      excessWeightPct: 0
    };
  }

  const bmi = round1(w / (hMeters * hMeters));

  let category = 'Нормальная масса тела';
  let obesityDegree = 'Отсутствует (Норма)';
  let riskLevel = 'Минимальный';

  if (bmi < 16) {
    category = 'Выраженный дефицит массы';
    obesityDegree = 'Дефицит III ст.';
    riskLevel = 'Повышенный (истощение)';
  } else if (bmi >= 16 && bmi < 18.5) {
    category = 'Недостаточная масса тела';
    obesityDegree = 'Дефицит массы';
    riskLevel = 'Умеренный';
  } else if (bmi >= 18.5 && bmi < 25) {
    category = 'Нормальная масса тела';
    obesityDegree = 'Ожирение отсутствует';
    riskLevel = 'Норма (минимальный риск)';
  } else if (bmi >= 25 && bmi < 30) {
    category = 'Избыточная масса тела';
    obesityDegree = 'Предожирение (Избыточный вес)';
    riskLevel = 'Повышенный';
  } else if (bmi >= 30 && bmi < 35) {
    category = 'Ожирение I степени';
    obesityDegree = 'Ожирение I степени';
    riskLevel = 'Высокий';
  } else if (bmi >= 35 && bmi < 40) {
    category = 'Ожирение II степени';
    obesityDegree = 'Ожирение II степени';
    riskLevel = 'Очень высокий';
  } else {
    category = 'Ожирение III степени (морбидное)';
    obesityDegree = 'Ожирение III степени';
    riskLevel = 'Крайне высокий';
  }

  // Расчёт % жира в организме по формуле Deurenberg (с учётом возраста и пола)
  const sexFactor = isMale ? 1 : 0;
  const rawBodyFat = a < 18
    ? (1.51 * bmi) - (0.70 * a) - (3.6 * sexFactor) + 1.4
    : (1.20 * bmi) + (0.23 * a) - (10.8 * sexFactor) - 5.4;

  const bodyFatPct = round1(Math.min(60, Math.max(5, rawBodyFat)));
  const fatMassKg = round1((w * bodyFatPct) / 100);
  const leanMassKg = round1(w - fatMassKg);

  // Коридор идеального веса по ВОЗ (ИМТ 18.5 – 24.9, оптимум 21.7)
  const idealWeightMin = round1(18.5 * hMeters * hMeters);
  const idealWeightMax = round1(24.9 * hMeters * hMeters);
  const idealWeightMid = round1(21.7 * hMeters * hMeters);

  // Отклонение от верхней границы нормы и от оптимума в кг и %
  const excessWeightKg = w > idealWeightMax ? round1(w - idealWeightMax) : 0;
  const excessWeightPct = round1(((w - idealWeightMid) / idealWeightMid) * 100);

  return {
    bmi,
    category,
    obesityDegree,
    riskLevel,
    bodyFatPct,
    fatMassKg,
    leanMassKg,
    idealWeightMin,
    idealWeightMax,
    idealWeightMid,
    excessWeightKg,
    excessWeightPct
  };
}

export function buildNutritionProgram({ age, gender, height, currentWeight, targetWeight, activity, deficitPct }) {
  const { bmr, formulaName, ageGroup, isPediatric } = calculateBMR({
    age,
    gender,
    weightKg: currentWeight,
    heightCm: height
  });

  const tdee = calculateTDEE(bmr, activity);
  const requestedDeficit = Number(deficitPct);

  const safeMaxDeficit = isPediatric ? 15 : 20;
  const exceedsSafePediatricDeficit = isPediatric && requestedDeficit > 15;
  const exceedsSafeAdultDeficit = !isPediatric && requestedDeficit > 22;

  const targetKcalRaw = Math.round(tdee * (1 - requestedDeficit / 100));
  const minFloorKcal = isPediatric ? Math.round(bmr * 1.05) : Math.max(1200, Math.round(bmr * 0.95));
  const targetKcal = Math.max(minFloorKcal, targetKcalRaw);

  const proteinPerKg = isPediatric ? 1.4 : 1.8;
  const fatCalorieShare = isPediatric ? 0.30 : 0.28;

  const proteinGrams = Math.round(Number(currentWeight) * proteinPerKg);
  const proteinKcal = proteinGrams * 4;

  const fatKcal = Math.round(targetKcal * fatCalorieShare);
  const fatGrams = Math.round(fatKcal / 9);

  const carbsKcal = Math.max(120, targetKcal - proteinKcal - fatKcal);
  const carbsGrams = Math.round(carbsKcal / 4);

  const bodyMetrics = calculateDetailedBodyMetrics({
    weightKg: currentWeight,
    heightCm: height,
    age,
    gender
  });

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
    ...bodyMetrics,
    bmiCategory: bodyMetrics.category
  };
}

export function recalculateMacrosForKcal(targetKcal, weightKg, isPediatric, boostProtein = false) {
  const proteinPerKg = isPediatric ? 1.45 : (boostProtein ? 2.0 : 1.8);
  const fatCalorieShare = isPediatric ? 0.30 : 0.27;

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
