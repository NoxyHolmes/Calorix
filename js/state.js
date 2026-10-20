// js/stats.js — Расширенная аналитика и статистика по питанию, весу и прогнозу цели
import { round1, formatDateRU } from './utils.js';
import { getDayTotals } from './diary.js';

export function computeExtendedStatistics(state) {
  const { profile, weightHistory, mealsByDate, adaptationLogs } = state;
  if (!profile) return null;

  const allDatesWithMeals = Object.keys(mealsByDate).filter(
    d => Array.isArray(mealsByDate[d]) && mealsByDate[d].length > 0
  ).sort();

  // Статистика за последние 14 дней
  const today = new Date();
  let kcalSum14 = 0;
  let proteinSum14 = 0;
  let loggedDays14 = 0;
  let cumulativeDeficitKcal = 0;

  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const dayTotals = getDayTotals(iso);
    if (dayTotals.kcal > 0) {
      loggedDays14++;
      kcalSum14 += dayTotals.kcal;
      proteinSum14 += dayTotals.p;
      cumulativeDeficitKcal += (Number(profile.tdee) - dayTotals.kcal);
    }
  }

  const avgKcal14 = loggedDays14 > 0 ? Math.round(kcalSum14 / loggedDays14) : 0;
  const avgProtein14 = loggedDays14 > 0 ? round1(proteinSum14 / loggedDays14) : 0;
  const adherencePct = Math.round((loggedDays14 / 14) * 100);

  // Расчёт динамики веса и скорости снижения
  const startW = Number(profile.startWeight || profile.currentWeight);
  const currW = Number(profile.currentWeight);
  const targetW = Number(profile.targetWeight);
  const totalLostKg = round1(startW - currW);
  const remainingKg = round1(Math.max(0, currW - targetW));

  const totalGoalSpan = Math.max(0.1, startW - targetW);
  const goalCompletionPct = Math.min(100, Math.max(0, Math.round(((startW - currW) / totalGoalSpan) * 100)));

  // Скорость изменения веса за неделю (по истории взвешиваний)
  let weeklyRateKg = 0;
  if (weightHistory.length >= 2) {
    const first = weightHistory[0];
    const last = weightHistory[weightHistory.length - 1];
    const daysSpan = Math.max(1, (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24));
    weeklyRateKg = round1(((Number(last.weight) - Number(first.weight)) / daysSpan) * 7);
  }

  // Прогноз достижения цели
  const dailyDeficitPlanned = Math.max(100, Number(profile.tdee) - Number(profile.targetKcal));
  const theoreticalWeeklyLossKg = round1((dailyDeficitPlanned * 7) / 7700);
  const effectiveWeeklyLoss = weeklyRateKg < -0.1 ? Math.abs(weeklyRateKg) : theoreticalWeeklyLossKg;

  let estimatedDaysToGoal = remainingKg > 0
    ? Math.ceil((remainingKg / Math.max(0.15, effectiveWeeklyLoss)) * 7)
    : 0;

  let estimatedTargetDate = 'Цель достигнута';
  if (estimatedDaysToGoal > 0) {
    const targetDateObj = new Date(today);
    targetDateObj.setDate(targetDateObj.getDate() + estimatedDaysToGoal);
    estimatedTargetDate = formatDateRU(targetDateObj.toISOString().slice(0, 10));
  }

  const estimatedFatBurnedKg = round1(Math.max(0, cumulativeDeficitKcal / 7700));

  return {
    totalLoggedDays: allDatesWithMeals.length,
    loggedDays14,
    adherencePct,
    avgKcal14,
    avgProtein14,
    totalLostKg,
    remainingKg,
    goalCompletionPct,
    weeklyRateKg,
    theoreticalWeeklyLossKg,
    estimatedDaysToGoal,
    estimatedTargetDate,
    cumulativeDeficitKcal: Math.round(cumulativeDeficitKcal),
    estimatedFatBurnedKg,
    adaptationsCount: (adaptationLogs || []).length
  };
}
