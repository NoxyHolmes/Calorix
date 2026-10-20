// js/adaptive.js — Логика автоматического пересмотра программы при 2-недельном плато с поиском в интернете
import { round1, getTodayISO, generateId } from './utils.js';
import { recalculateMacrosForKcal } from './calculations.js';
import { fetchInternetAdaptationAdvice } from './recommendations.js';

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

  if (loggedFoodDaysLast7 < 4) {
    return {
      status: 'missing_diary',
      canAdapt: false,
      loggedFoodDaysLast7,
      message: `За последние 7 дней дневник питания заполнен только за ${loggedFoodDaysLast7} дн. (нужно минимум 4 дня). Вы можете добавить пропущенные дни в разделе «Дневник питания», выбрав нужную дату.`
    };
  }

  if (recentWeights.length < 2 || prevWeights.length < 2) {
    return {
      status: 'insufficient_weights',
      canAdapt: false,
      loggedFoodDaysLast7,
      message: 'Для автоматического контроля 2-недельного тренда нужно минимум по 2 взвешивания в текущей и предыдущей неделе.'
    };
  }

  const avgRecent = round1(recentWeights.reduce((s, x) => s + Number(x.weight), 0) / recentWeights.length);
  const avgPrev = round1(prevWeights.reduce((s, x) => s + Number(x.weight), 0) / prevWeights.length);
  const deltaKg = round1(avgRecent - avgPrev);

  const lastLog = adaptationLogs && adaptationLogs[0];
  if (lastLog && lastLog.date >= recent7Start) {
    return {
      status: 'recently_adapted',
      canAdapt: false,
      avgRecent,
      avgPrev,
      deltaKg,
      lastLog,
      message: `Программа была автоматически перестроена ${lastLog.date} (${lastLog.oldKcal} → ${lastLog.newKcal} ккал). Следующий контроль тренда — через 7 дней.`
    };
  }

  const isWeightGain = deltaKg > 0.1;
  const isPlateau = deltaKg >= -0.15 && deltaKg <= 0.1;

  if (isWeightGain || isPlateau) {
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
        message: 'Достигнут минимально безопасный порог калорийности. Вместо урезания еды увеличьте дневную норму шагов на 2 000.'
      };
    }

    const reasonLabel = isWeightGain
      ? `Рост среднего веса (+${deltaKg} кг за 2 недели)`
      : `Плато: за 2 недели вес не изменился (${deltaKg} кг)`;

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
      message: `Обнаружено: ${reasonLabel}. Система готова автоматически перестроить программу питания и тренировок (-${reductionPct}%, ${oldKcal} → ${proposedKcal} ккал).`
    };
  }

  return {
    status: 'on_track',
    canAdapt: false,
    avgRecent,
    avgPrev,
    deltaKg,
    message: `Отличный прогресс! Средний вес за неделю снизился на ${Math.abs(deltaKg)} кг (${avgPrev} → ${avgRecent} кг).`
  };
}

export async function applyProgramAdaptationWithInternet(profile, evaluation) {
  const internetAdvice = await fetchInternetAdaptationAdvice(profile, evaluation.status);
  const newKcal = evaluation.proposedKcal;
  const newMacros = recalculateMacrosForKcal(newKcal, profile.currentWeight, profile.isPediatric, true);

  const updatedProfile = {
    ...profile,
    targetKcal: newKcal,
    macros: newMacros,
    adaptationCount: (profile.adaptationCount || 0) + 1,
    lastInternetProtocol: internetAdvice
  };

  const logEntry = {
    id: generateId('adapt'),
    date: getTodayISO(),
    reason: evaluation.reasonLabel,
    oldKcal: evaluation.oldKcal,
    newKcal: newKcal,
    reductionPct: evaluation.reductionPct,
    details: `Средний вес: ${evaluation.avgPrev} кг → ${evaluation.avgRecent} кг | ${internetAdvice.sourceLabel}`,
    protocolSteps: internetAdvice.protocolSteps
  };

  return { updatedProfile, logEntry, internetAdvice };
}
