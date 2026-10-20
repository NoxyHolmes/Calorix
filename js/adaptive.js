// js/adaptive.js — Логика пересмотра программы при плато или наборе веса (без обращений к DOM)
import { round1, getTodayISO, generateId } from './utils.js';
import { recalculateMacrosForKcal } from './calculations.js';

/**
 * Анализирует историю веса за последние 14 дней (текущие 7 дней против предыдущих 7 дней)
 * и проверяет заполненность дневника питания.
 */
export function evaluateAdaptiveStatus({ profile, weightHistory, mealsByDate, adaptationLogs }) {
  if (!profile) {
    return { status: 'no_profile', canAdapt: false, message: 'Профиль не заполнен.' };
  }

  const today = new Date();
  const getDaysAgoISO = (daysAgo) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  const recent7Start = getDaysAgoISO(6);   // последние 7 дней (0..6)
  const prev7Start = getDaysAgoISO(13);    // предыдущие 7 дней (7..13)

  // Проверяем ведение дневника питания за последние 7 дней
  let loggedFoodDaysLast7 = 0;
  for (let i = 0; i < 7; i++) {
    const dIso = getDaysAgoISO(i);
    if (Array.isArray(mealsByDate[dIso]) && mealsByDate[dIso].length > 0) {
      loggedFoodDaysLast7++;
    }
  }

  const recentWeights = weightHistory.filter(w => w.date >= recent7Start);
  const prevWeights = weightHistory.filter(w => w.date >= prev7Start && w.date < recent7Start);

  if (loggedFoodDaysLast7 < 4) {
    return {
      status: 'missing_diary',
      canAdapt: false,
      loggedFoodDaysLast7,
      message: `За последние 7 дней дневник питания заполнен только за ${loggedFoodDaysLast7} дн. (нужно минимум 4 дня). Система не меняет калорийность «вслепую» — пожалуйста, логируйте приёмы пищи.`
    };
  }

  if (recentWeights.length < 2 || prevWeights.length < 2) {
    return {
      status: 'insufficient_weights',
      canAdapt: false,
      loggedFoodDaysLast7,
      message: 'Недостаточно данных взвешиваний за 2 недели (нужно минимум по 2 измерения в текущей и прошлой неделе) для расчёта тренда.'
    };
  }

  const avgRecent = round1(recentWeights.reduce((s, x) => s + Number(x.weight), 0) / recentWeights.length);
  const avgPrev = round1(prevWeights.reduce((s, x) => s + Number(x.weight), 0) / prevWeights.length);
  const deltaKg = round1(avgRecent - avgPrev);

  // Проверяем, не было ли уже адаптации за последние 7 дней
  const lastLog = adaptationLogs && adaptationLogs[0];
  if (lastLog && lastLog.date >= recent7Start) {
    return {
      status: 'recently_adapted',
      canAdapt: false,
      avgRecent,
      avgPrev,
      deltaKg,
      message: `Программа уже была скорректирована ${lastLog.date}. Следующая проверка через неделю.`
    };
  }

  // Если вес стоит (плато: изменение менее -0.15 кг за неделю) или растёт (deltaKg > 0.1 кг)
  const isWeightGain = deltaKg > 0.1;
  const isPlateau = deltaKg >= -0.15 && deltaKg <= 0.1;

  if (isWeightGain || isPlateau) {
    // Для детей и подростков шаг мягче (5%), при наборе у взрослых — 8%, при плато — 6%
    const reductionPct = profile.isPediatric ? 5 : (isWeightGain ? 8 : 6);
    const oldKcal = Number(profile.targetKcal);
    const minSafeFloor = profile.isPediatric
      ? Math.round(Number(profile.bmr) * 1.05)
      : Math.max(1200, Math.round(Number(profile.bmr) * 0.95));

    const proposedKcal = Math.max(minSafeFloor, Math.round(oldKcal * (1 - reductionPct / 100)));

    if (proposedKcal >= oldKcal) {
      return {
        status: 'at_minimum_floor',
        canAdapt: false,
        avgRecent,
        avgPrev,
        deltaKg,
        message: 'Достигнут минимально безопасный порог калорийности. Дальнейшее урезание калорий не рекомендуется — увеличьте бытовую активность (шаги).'
      };
    }

    const reasonLabel = isWeightGain ? 'Рост среднего веса (+' + deltaKg + ' кг)' : 'Плато веса (изменение ' + deltaKg + ' кг за 2 недели)';
    return {
      status: isWeightGain ? 'weight_gain' : 'plateau',
      canAdapt: true,
      avgRecent,
      avgPrev,
      deltaKg,
      reductionPct,
      oldKcal,
      proposedKcal,
      reasonLabel,
      message: `Обнаружено: ${reasonLabel}. Рекомендуется плавная адаптация цели на -${reductionPct}% (${oldKcal} → ${proposedKcal} ккал).`
    };
  }

  return {
    status: 'on_track',
    canAdapt: false,
    avgRecent,
    avgPrev,
    deltaKg,
    message: `Отличный темп! Средний вес снизился на ${Math.abs(deltaKg)} кг за неделю (${avgPrev} → ${avgRecent} кг). Корректировка не требуется.`
  };
}

/**
 * Применяет адаптацию к профилю и формирует запись в журнал
 */
export function applyProgramAdaptation(profile, evaluation) {
  const newKcal = evaluation.proposedKcal;
  const newMacros = recalculateMacrosForKcal(newKcal, profile.currentWeight, profile.isPediatric);

  const updatedProfile = {
    ...profile,
    targetKcal: newKcal,
    macros: newMacros
  };

  const logEntry = {
    id: generateId('adapt'),
    date: getTodayISO(),
    reason: evaluation.reasonLabel,
    oldKcal: evaluation.oldKcal,
    newKcal: newKcal,
    reductionPct: evaluation.reductionPct,
    details: `Средний вес: ${evaluation.avgPrev} кг → ${evaluation.avgRecent} кг`
  };

  return { updatedProfile, logEntry };
}
