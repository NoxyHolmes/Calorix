// js/adaptive.js — Еженедельный автопересмотр программы (на 8-й день и далее каждую неделю)
import { round1, getTodayISO, generateId } from './utils.js';
import { buildNutritionProgram, recalculateMacrosForKcal } from './calculations.js';
import { fetchInternetAdaptationAdvice } from './recommendations.js';

function diffDaysBetweenISO(startISO, endISO) {
  const [y1, m1, d1] = startISO.split('-').map(Number);
  const [y2, m2, d2] = endISO.split('-').map(Number);
  const dt1 = new Date(y1, m1 - 1, d1);
  const dt2 = new Date(y2, m2 - 1, d2);
  return Math.floor((dt2 - dt1) / (1000 * 60 * 60 * 24));
}

function getDaysAgoISO(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Оценивает текущий день программы.
 * На 8-й день с даты последнего пересмотра (прошло >= 7 полных дней) автоматически запускает
 * формирование программы на следующую неделю по данным прошедшей недели.
 */
export function evaluateAdaptiveStatus({ profile, weightHistory, mealsByDate }) {
  if (!profile) {
    return { status: 'no_profile', canAdapt: false, message: 'Профиль не заполнен.' };
  }

  const todayISO = getTodayISO();
  const startDate = profile.programStartDate || todayISO;
  const lastReviewDate = profile.lastWeeklyReviewDate || startDate;

  const totalDaysActive = Math.max(1, diffDaysBetweenISO(startDate, todayISO) + 1);
  const daysSinceLastReview = diffDaysBetweenISO(lastReviewDate, todayISO);
  const currentCycleDay = daysSinceLastReview + 1; // День 1..7 текущей недели, 8 = пора обновлять!
  const computedWeekNumber = Math.floor((totalDaysActive - 1) / 7) + 1;

  // Данные за последние 7 дней и предыдущие 7 дней
  const recent7Start = getDaysAgoISO(6);
  const prev7Start = getDaysAgoISO(13);

  let loggedFoodDaysLast7 = 0;
  for (let i = 0; i < 7; i++) {
    const dIso = getDaysAgoISO(i);
    if (Array.isArray(mealsByDate[dIso]) && mealsByDate[dIso].length > 0) {
      loggedFoodDaysLast7++;
    }
  }

  const recentWeights = weightHistory.filter(w => w.date >= recent7Start);
  const prevWeights = weightHistory.filter(w => w.date >= prev7Start && w.date < recent7Start);

  const latestWeight = weightHistory.length > 0
    ? Number(weightHistory[weightHistory.length - 1].weight)
    : Number(profile.currentWeight);

  const startOrPrevWeight = prevWeights.length > 0
    ? round1(prevWeights.reduce((s, x) => s + Number(x.weight), 0) / prevWeights.length)
    : Number(profile.startWeight || profile.currentWeight);

  const avgRecentWeight = recentWeights.length > 0
    ? round1(recentWeights.reduce((s, x) => s + Number(x.weight), 0) / recentWeights.length)
    : latestWeight;

  const weeklyDeltaKg = round1(avgRecentWeight - startOrPrevWeight);

  // Если прошло 7 дней (наступил 8-й день или больше с последнего пересмотра) —
  // система ОБЯЗАНА автоматически составить новую программу на следующую неделю
  if (daysSinceLastReview >= 7) {
    const nextWeekNumber = (profile.currentWeek || 1) + 1;
    const isWeightGain = weeklyDeltaKg > 0.1;
    const isPlateau = weeklyDeltaKg >= -0.15 && weeklyDeltaKg <= 0.1;

    // Пересчитываем базовую программу под актуальный вес пользователя
    const recalcedForNewWeight = buildNutritionProgram({
      age: profile.age,
      gender: profile.gender,
      height: profile.height,
      currentWeight: latestWeight,
      targetWeight: profile.targetWeight,
      activity: profile.activity,
      deficitPct: profile.deficitPct
    });

    const oldKcal = Number(profile.targetKcal);
    const minSafeFloor = profile.isPediatric
      ? Math.round(Number(recalcedForNewWeight.bmr) * 1.05)
      : Math.max(1200, Math.round(Number(recalcedForNewWeight.bmr) * 0.95));

    let proposedKcal = recalcedForNewWeight.targetKcal;
    let reductionPct = 0;
    let reasonType = 'weekly_update';
    let reasonLabel = `Неделя ${nextWeekNumber} (8-й день цикла): плановая актуализация под вес ${latestWeight} кг`;

    if (isWeightGain || isPlateau) {
      reductionPct = profile.isPediatric ? 5 : (isWeightGain ? 8 : 6);
      proposedKcal = Math.max(minSafeFloor, Math.round(oldKcal * (1 - reductionPct / 100)));
      reasonType = isWeightGain ? 'weight_gain' : 'plateau';
      reasonLabel = isWeightGain
        ? `Неделя ${nextWeekNumber}: рост веса (+${weeklyDeltaKg} кг за неделю) — коррекция программы`
        : `Неделя ${nextWeekNumber}: плато за неделю (${weeklyDeltaKg} кг) — анти-плато пересмотр`;
    } else {
      // Вес снижается по плану — актуализируем калорийность под новый вес
      reductionPct = oldKcal > proposedKcal
        ? Math.max(1, Math.round(((oldKcal - proposedKcal) / oldKcal) * 100))
        : 0;
    }

    return {
      status: reasonType,
      canAdapt: true,
      isAutomaticWeeklyTrigger: true,
      currentWeek: nextWeekNumber,
      totalDaysActive,
      currentCycleDay,
      loggedFoodDaysLast7,
      avgRecent: avgRecentWeight,
      avgPrev: startOrPrevWeight,
      deltaKg: weeklyDeltaKg,
      reductionPct,
      oldKcal,
      proposedKcal,
      reasonLabel,
      message: `Наступил ${currentCycleDay}-й день цикла! Программа автоматически обновляется на Неделю ${nextWeekNumber} по данным за прошлую неделю (${startOrPrevWeight} → ${avgRecentWeight} кг).`
    };
  }

  const daysLeftUntilNextWeek = Math.max(1, 8 - currentCycleDay);

  return {
    status: 'active_cycle',
    canAdapt: false,
    currentWeek: profile.currentWeek || computedWeekNumber,
    totalDaysActive,
    currentCycleDay,
    daysLeftUntilNextWeek,
    loggedFoodDaysLast7,
    avgRecent: avgRecentWeight,
    avgPrev: startOrPrevWeight,
    deltaKg: weeklyDeltaKg,
    message: `Идёт Неделя ${profile.currentWeek || 1} (День ${currentCycleDay} из 7). Дневник заполнен за ${loggedFoodDaysLast7} дн., динамика веса за неделю: ${weeklyDeltaKg > 0 ? '+' : ''}${weeklyDeltaKg} кг. Следующее автоматическое составление новой программы — через ${daysLeftUntilNextWeek} дн. (на 8-й день).`
  };
}

/**
 * Применяет новую недельную программу, обновляет BMR/TDEE/ИМТ под текущий вес
 * и запрашивает свежие рекомендации из интернета для новой недели.
 */
export async function applyProgramAdaptationWithInternet(profile, evaluation) {
  const nextWeek = evaluation.currentWeek || ((profile.currentWeek || 1) + 1);
  const internetAdvice = await fetchInternetAdaptationAdvice(profile, evaluation.status, nextWeek);

  const newKcal = evaluation.proposedKcal;
  const boostProtein = evaluation.status === 'plateau' || evaluation.status === 'weight_gain';
  const newMacros = recalculateMacrosForKcal(newKcal, profile.currentWeight, profile.isPediatric, boostProtein);

  const freshBodyMetrics = buildNutritionProgram({
    age: profile.age,
    gender: profile.gender,
    height: profile.height,
    currentWeight: profile.currentWeight,
    targetWeight: profile.targetWeight,
    activity: profile.activity,
    deficitPct: profile.deficitPct
  });

  const updatedProfile = {
    ...profile,
    ...freshBodyMetrics,
    targetKcal: newKcal,
    macros: newMacros,
    currentWeek: nextWeek,
    lastWeeklyReviewDate: getTodayISO(),
    adaptationCount: (profile.adaptationCount || 0) + 1,
    lastInternetProtocol: internetAdvice
  };

  const logEntry = {
    id: generateId('adapt'),
    date: getTodayISO(),
    weekNumber: nextWeek,
    reason: evaluation.reasonLabel,
    oldKcal: evaluation.oldKcal,
    newKcal: newKcal,
    reductionPct: evaluation.reductionPct,
    details: `Вес за неделю: ${evaluation.avgPrev} кг → ${evaluation.avgRecent} кг | Новая норма: ${newKcal} ккал (Б:${newMacros.protein} Ж:${newMacros.fat} У:${newMacros.carbs}) | ${internetAdvice.sourceLabel}`,
    protocolSteps: internetAdvice.protocolSteps
  };

  return { updatedProfile, logEntry, internetAdvice };
}
