// js/app.js — Отказоустойчивая точка входа (кнопки работают даже при блокировке IndexedDB)
import { getState, setState, subscribe } from './state.js';
import {
  initDB,
  getProfile,
  getAllMeals,
  getAllWeights,
  getAllAdaptationLogs,
  saveProfile,
  saveWeightEntry,
  saveAdaptationLog,
  clearAllDatabase,
  exportFullDatabaseJSON,
  importFullDatabaseJSON,
  getSavedTheme,
  saveTheme
} from './storage.js';
import { getTodayISO, round1 } from './utils.js';
import { evaluateAdaptiveStatus, applyProgramAdaptationWithInternet } from './adaptive.js';
import { buildActivityAndDietPlan } from './recommendations.js';
import { computeExtendedStatistics } from './stats.js';
import { calculateDetailedBodyMetrics } from './calculations.js';
import { renderProgressRing } from './components/progress-ring.js';
import { showToast } from './components/toast.js';
import { initDiaryModule, renderDiaryScreen, getDayTotals } from './diary.js';
import { initCalendarModule, renderCalendarScreen } from './calendar.js';
import { initChartsModule, renderAllCharts } from './charts.js';
import { initOnboardingModule, populateProfileForm } from './onboarding.js';

let isAutoAdapting = false;

export function switchScreen(screenId) {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === screenId);
  });
  document.querySelectorAll('.screen').forEach(sec => {
    sec.classList.toggle('active', sec.id === `screen-${screenId}`);
  });
}

async function loadInitialData() {
  try {
    await initDB();
    const [profile, allMeals, weights, adaptations] = await Promise.all([
      getProfile(),
      getAllMeals(),
      getAllWeights(),
      getAllAdaptationLogs()
    ]);

    const mealsByDate = {};
    for (const m of allMeals) {
      if (!mealsByDate[m.date]) mealsByDate[m.date] = [];
      mealsByDate[m.date].push(m);
    }

    const theme = getSavedTheme();
    document.documentElement.setAttribute('data-theme', theme);

    setState({
      profile,
      selectedDate: getTodayISO(),
      mealsByDate,
      weightHistory: weights,
      adaptationLogs: adaptations,
      theme
    });

    populateProfileForm();

    if (!profile) {
      switchScreen('profile');
    } else {
      await checkAndRunAutoAdaptation();
    }
  } catch (err) {
    console.error('Ошибка инициализации хранилища:', err);
    setState({ selectedDate: getTodayISO() });
    showToast('Локальная база загружена в режиме памяти', 'warning');
  }
}

async function checkAndRunAutoAdaptation() {
  if (isAutoAdapting) return;
  const state = getState();
  const evalRes = evaluateAdaptiveStatus(state);

  if (evalRes.canAdapt) {
    isAutoAdapting = true;
    try {
      const { updatedProfile, logEntry } = await applyProgramAdaptationWithInternet(state.profile, evalRes);
      await saveProfile(updatedProfile);
      await saveAdaptationLog(logEntry);

      setState({
        profile: updatedProfile,
        adaptationLogs: [logEntry, ...state.adaptationLogs]
      });
      showToast(`Авто-адаптация: программа перестроена (${logEntry.oldKcal} → ${logEntry.newKcal} ккал)`);
    } finally {
      isAutoAdapting = false;
    }
  }
}

function renderDashboardScreen() {
  const state = getState();
  const profile = state.profile;
  const today = getTodayISO();
  const totals = getDayTotals(today);

  const heroCurrentEl = document.getElementById('dash-current-weight');
  const heroTargetEl = document.getElementById('dash-target-weight');
  const heroDiffEl = document.getElementById('dash-weight-diff');
  const heroBmiEl = document.getElementById('dash-bmi-val');
  const formulaBadgeEl = document.getElementById('dash-formula-badge');
  const safetyBannerEl = document.getElementById('dash-safety-banner');

  const ringContainer = document.getElementById('dash-progress-ring');
  renderProgressRing(ringContainer, totals.kcal, profile ? profile.targetKcal : 2000);

  if (!profile) {
    if (heroCurrentEl) heroCurrentEl.textContent = '— кг';
    if (heroTargetEl) heroTargetEl.textContent = '— кг';
    renderAllCharts();
    return;
  }

  const metrics = calculateDetailedBodyMetrics({
    weightKg: profile.currentWeight,
    heightCm: profile.height,
    age: profile.age,
    gender: profile.gender
  });

  if (heroCurrentEl) heroCurrentEl.textContent = `${profile.currentWeight} кг`;
  if (heroTargetEl) heroTargetEl.textContent = `${profile.targetWeight} кг`;
  const toLose = round1(profile.currentWeight - profile.targetWeight);
  if (heroDiffEl) {
    heroDiffEl.textContent = toLose > 0 ? `Осталось сбросить: ${toLose} кг` : 'Цель достигнута!';
  }
  if (heroBmiEl) {
    heroBmiEl.textContent = `${metrics.bmi} (${metrics.obesityDegree})`;
  }
  if (formulaBadgeEl) {
    formulaBadgeEl.textContent = `${profile.formulaName} • BMR: ${profile.bmr} ккал • TDEE: ${profile.tdee} ккал`;
  }

  if (safetyBannerEl) {
    if (profile.isPediatric) {
      safetyBannerEl.style.display = 'flex';
      safetyBannerEl.className = `alert-banner ${profile.exceedsSafePediatricDeficit ? 'alert-danger' : 'alert-warning'}`;
      safetyBannerEl.innerHTML = `
        <div>
          <strong>Детский/подростковый профиль (${profile.age} лет):</strong>
          Используются педиатрические уравнения ВОЗ. Обязательна консультация с врачом-педиатром.
        </div>
      `;
    } else {
      safetyBannerEl.style.display = 'none';
    }
  }

  const updateMacroBar = (prefix, currentVal, targetVal) => {
    const labelEl = document.getElementById(`macro-${prefix}-val`);
    const fillEl = document.getElementById(`macro-${prefix}-fill`);
    if (labelEl) labelEl.textContent = `${currentVal} / ${targetVal} г`;
    if (fillEl) {
      const pct = Math.min(100, Math.round((currentVal / Math.max(1, targetVal)) * 100));
      fillEl.style.width = `${pct}%`;
    }
  };

  updateMacroBar('p', totals.p, profile.macros.protein);
  updateMacroBar('f', totals.f, profile.macros.fat);
  updateMacroBar('c', totals.c, profile.macros.carbs);

  renderBodyCompositionCard(metrics, profile);
  renderRecommendationsCard(profile);
  renderExtendedStatsCard(state);
  renderAdaptiveStatusBox();
  renderAllCharts();
}

function renderBodyCompositionCard(metrics, profile) {
  const container = document.getElementById('body-composition-box');
  if (!container) return;

  const excessBadgeColor = metrics.bmi >= 30 ? 'var(--danger)' : (metrics.bmi >= 25 ? 'var(--warning)' : 'var(--accent)');
  const excessSign = metrics.excessWeightPct > 0 ? `+${metrics.excessWeightPct}%` : `${metrics.excessWeightPct}%`;

  container.innerHTML = `
    <div class="hero-weight-stats" style="margin-top:0;">
      <div class="stat-box" style="border-left: 4px solid ${excessBadgeColor};">
        <div class="stat-label">Классификация и степень ожирения</div>
        <div class="stat-value" style="font-size:1.1rem;">${metrics.obesityDegree}</div>
        <div class="stat-sub">ИМТ: <strong>${metrics.bmi}</strong> • Риск: ${metrics.riskLevel}</div>
      </div>

      <div class="stat-box">
        <div class="stat-label">Доля жира в организме (оценка)</div>
        <div class="stat-value" style="font-size:1.25rem; color:var(--warning);">${metrics.bodyFatPct}%</div>
        <div class="stat-sub">Жировая масса: <strong>${metrics.fatMassKg} кг</strong> | Сухая масса: <strong>${metrics.leanMassKg} кг</strong></div>
      </div>

      <div class="stat-box">
        <div class="stat-label">Отклонение от оптимума по росту (${profile.height} см)</div>
        <div class="stat-value" style="font-size:1.25rem; color:${excessBadgeColor};">${excessSign}</div>
        <div class="stat-sub">
          Норма для роста: <strong>${metrics.idealWeightMin}–${metrics.idealWeightMax} кг</strong>
          ${metrics.excessWeightKg > 0 ? `(избыток выше нормы: ${metrics.excessWeightKg} кг)` : '(в пределах нормы)'}
        </div>
      </div>
    </div>
  `;
}

function renderRecommendationsCard(profile) {
  const container = document.getElementById('recommendations-box');
  if (!container) return;

  const plan = buildActivityAndDietPlan(profile);
  if (!plan) return;

  const { workoutPlan, dietStrategy } = plan;
  const internetBlock = profile.lastInternetProtocol;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
      <div class="stat-box">
        <div style="font-weight:700; color:var(--accent); margin-bottom:8px;">🏃 ${workoutPlan.title}</div>
        <p style="font-size:0.86rem; margin-bottom:6px;"><strong>Дневная норма шагов:</strong> ${workoutPlan.stepsGoal}</p>
        <p style="font-size:0.86rem; margin-bottom:6px;"><strong>Кардио-нагрузка:</strong> ${workoutPlan.cardio}</p>
        <p style="font-size:0.86rem; margin-bottom:6px;"><strong>Силовые / тонус:</strong> ${workoutPlan.strength}</p>
        <p style="font-size:0.84rem; color:var(--text-muted);"><strong>Пульсовая зона:</strong> ${workoutPlan.intensity}</p>
      </div>

      <div class="stat-box">
        <div style="font-weight:700; color:var(--accent); margin-bottom:8px;">🥗 ${dietStrategy.title}</div>
        <p style="font-size:0.86rem; margin-bottom:8px;"><strong>Режим приёмов пищи:</strong> ${dietStrategy.mealsCount}</p>
        <ul style="padding-left:18px; font-size:0.85rem; color:var(--text-secondary); display:flex; flex-direction:column; gap:5px;">
          ${dietStrategy.principles.map(p => `<li>${p}</li>`).join('')}
        </ul>
      </div>
    </div>

    ${internetBlock ? `
      <div style="margin-top:14px; padding:14px; border-radius:var(--radius-md); background:var(--accent-light); border:1px solid var(--accent);">
        <div style="font-weight:700; font-size:0.9rem; margin-bottom:4px;">🌐 Протокол анти-плато (${internetBlock.sourceLabel})</div>
        <p style="font-size:0.82rem; margin-bottom:8px;">${internetBlock.wikiNote}</p>
        <ul style="padding-left:18px; font-size:0.84rem; color:var(--text-primary);">
          ${internetBlock.protocolSteps.map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>
    ` : ''}
  `;
}

function renderExtendedStatsCard(state) {
  const container = document.getElementById('extended-stats-box');
  if (!container) return;

  const stats = computeExtendedStatistics(state);
  if (!stats) return;

  container.innerHTML = `
    <div class="hero-weight-stats" style="margin-top:0;">
      <div class="stat-box">
        <div class="stat-label">Прогресс к цели</div>
        <div class="stat-value" style="color:var(--accent);">${stats.goalCompletionPct}%</div>
        <div class="stat-sub">Сброшено: <strong>${stats.totalLostKg} кг</strong> | Осталось: <strong>${stats.remainingKg} кг</strong></div>
      </div>

      <div class="stat-box">
        <div class="stat-label">Средние ккал и белок (14 дн.)</div>
        <div class="stat-value">${stats.avgKcal14} ккал</div>
        <div class="stat-sub">Средний белок: <strong>${stats.avgProtein14} г/день</strong></div>
      </div>

      <div class="stat-box">
        <div class="stat-label">Дисциплина дневника (14 дн.)</div>
        <div class="stat-value">${stats.adherencePct}%</div>
        <div class="stat-sub">Заполнено <strong>${stats.loggedDays14} из 14 дн.</strong> (всего дней: ${stats.totalLoggedDays})</div>
      </div>

      <div class="stat-box">
        <div class="stat-label">Накопленный дефицит (14 дн.)</div>
        <div class="stat-value">${stats.cumulativeDeficitKcal} ккал</div>
        <div class="stat-sub">Эквивалент сожжённого жира: <strong>≈ ${stats.estimatedFatBurnedKg} кг</strong></div>
      </div>

      <div class="stat-box">
        <div class="stat-label">Темп изменения веса</div>
        <div class="stat-value">${stats.weeklyRateKg} кг/нед</div>
        <div class="stat-sub">Расчётный по дефициту: <strong>-${stats.theoreticalWeeklyLossKg} кг/нед</strong></div>
      </div>

      <div class="stat-box">
        <div class="stat-label">Прогноз достижения цели</div>
        <div class="stat-value" style="font-size:1rem;">${stats.estimatedTargetDate}</div>
        <div class="stat-sub">${stats.estimatedDaysToGoal > 0 ? `Около ${stats.estimatedDaysToGoal} дн. при текущем темпе` : 'Вы у цели!'}</div>
      </div>
    </div>
  `;
}

function renderAdaptiveStatusBox() {
  const state = getState();
  const statusContainer = document.getElementById('adaptive-status-box');
  const logsContainer = document.getElementById('adaptation-logs-list');
  if (!statusContainer) return;

  const evalRes = evaluateAdaptiveStatus(state);

  let badgeColor = 'var(--accent)';
  if (evalRes.status === 'plateau' || evalRes.status === 'weight_gain') badgeColor = 'var(--warning)';
  if (evalRes.status === 'missing_diary') badgeColor = 'var(--danger)';

  statusContainer.innerHTML = `
    <div style="padding: 14px; border-radius: var(--radius-md); background: var(--bg-elevated); border-left: 4px solid ${badgeColor};">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="font-weight: 700;">Статус автоматического пересмотра (контроль каждые 14 дней):</div>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-force-internet-rebuild">
          🔄 Обновить программу через интернет сейчас
        </button>
      </div>
      <p style="font-size: 0.88rem; color: var(--text-primary); margin-top: 6px;">${evalRes.message}</p>
    </div>
  `;

  const forceBtn = statusContainer.querySelector('#btn-force-internet-rebuild');
  if (forceBtn) {
    forceBtn.addEventListener('click', async () => {
      if (!state.profile) {
        showToast('Сначала заполните и сохраните профиль!', 'warning');
        switchScreen('profile');
        return;
      }
      forceBtn.disabled = true;
      forceBtn.textContent = 'Синхронизация с онлайн-базой...';
      const manualEval = {
        status: 'plateau',
        avgPrev: state.profile.currentWeight,
        avgRecent: state.profile.currentWeight,
        reductionPct: state.profile.isPediatric ? 5 : 6,
        oldKcal: state.profile.targetKcal,
        proposedKcal: Math.max(
          state.profile.isPediatric ? Math.round(state.profile.bmr * 1.05) : Math.max(1200, Math.round(state.profile.bmr * 0.95)),
          Math.round(state.profile.targetKcal * 0.94)
        ),
        reasonLabel: 'Запрос пересчёта программы с онлайн-поиском'
      };
      const { updatedProfile, logEntry } = await applyProgramAdaptationWithInternet(state.profile, manualEval);
      await saveProfile(updatedProfile);
      await saveAdaptationLog(logEntry);
      setState({
        profile: updatedProfile,
        adaptationLogs: [logEntry, ...state.adaptationLogs]
      });
      showToast('Новые рекомендации и программа загружены и применены!');
    });
  }

  if (logsContainer) {
    if (!state.adaptationLogs || state.adaptationLogs.length === 0) {
      logsContainer.innerHTML = `<p style="font-size: 0.84rem; color: var(--text-muted);">Пересмотров программы пока не было.</p>`;
    } else {
      logsContainer.innerHTML = state.adaptationLogs.map(log => `
        <div class="log-item">
          <div style="display:flex; justify-content:space-between; font-weight:700; flex-wrap:wrap; gap:6px;">
            <span>${log.date} — ${log.reason}</span>
            <span class="mono" style="color:var(--accent);">${log.oldKcal} → ${log.newKcal} ккал (-${log.reductionPct}%)</span>
          </div>
          <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">${log.details || ''}</div>
        </div>
      `).join('');
    }
  }
}

function initHeaderAndQuickActions() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      switchScreen(btn.dataset.screen);
    });
  });

  const themeBtn = document.getElementById('btn-toggle-theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const curr = document.documentElement.getAttribute('data-theme') || 'light';
      const next = curr === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      saveTheme(next);
      setState({ theme: next });
    });
  }

  const resetBtn = document.getElementById('btn-reset-all');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const step1 = window.confirm(
        'ВНИМАНИЕ (Шаг 1 из 2): Вы действительно хотите полностью удалить профиль, всю историю взвешиваний, дневник питания и журнал адаптаций?'
      );
      if (!step1) return;

      const step2 = window.prompt(
        'ПОДТВЕРЖДЕНИЕ (Шаг 2 из 2): Это действие необратимо. Введите слово УДАЛИТЬ заглавными буквами для полного сброса:'
      );
      if (step2 !== 'УДАЛИТЬ') {
        showToast('Сброс отменён: контрольное слово не введено.', 'warning');
        return;
      }

      await clearAllDatabase();
      setState({
        profile: null,
        selectedDate: getTodayISO(),
        mealsByDate: {},
        weightHistory: [],
        adaptationLogs: []
      });
      switchScreen('profile');
      showToast('Все данные приложения полностью сброшены.', 'warning');
    });
  }

  const quickWeightForm = document.getElementById('quick-weight-form');
  if (quickWeightForm) {
    quickWeightForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('quick-weight-input');
      const dateIn = document.getElementById('quick-weight-date');
      const val = Number(input.value);
      const dateISO = dateIn.value || getTodayISO();

      if (!Number.isFinite(val) || val < 15 || val > 300) {
        showToast('Введите корректный вес от 15 до 300 кг', 'error');
        return;
      }

      const entry = { date: dateISO, weight: val, source: 'Взвешивание' };
      await saveWeightEntry(entry);

      const state = getState();
      const nextWeights = [
        ...state.weightHistory.filter(w => w.date !== dateISO),
        entry
      ].sort((a, b) => a.date.localeCompare(b.date));

      let nextProfile = state.profile;
      if (nextProfile && dateISO >= getTodayISO()) {
        const updatedMetrics = calculateDetailedBodyMetrics({
          weightKg: val,
          heightCm: nextProfile.height,
          age: nextProfile.age,
          gender: nextProfile.gender
        });
        nextProfile = {
          ...nextProfile,
          currentWeight: val,
          ...updatedMetrics,
          bmiCategory: updatedMetrics.category
        };
        await saveProfile(nextProfile);
      }

      setState({ weightHistory: nextWeights, profile: nextProfile });
      input.value = '';
      showToast(`Вес ${val} кг за ${dateISO} сохранён`);
      await checkAndRunAutoAdaptation();
    });
  }

  const exportBtn = document.getElementById('btn-export-json');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const jsonStr = await exportFullDatabaseJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nutriadapt-backup-${getTodayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Резервная копия JSON скачана');
    });
  }

  const importInput = document.getElementById('input-import-json');
  const importBtn = document.getElementById('btn-import-json');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await importFullDatabaseJSON(text);
        await loadInitialData();
        showToast('Данные успешно импортированы!');
      } catch (err) {
        showToast('Ошибка импорта JSON: ' + err.message, 'error');
      }
      importInput.value = '';
    });
  }
}

async function bootstrapApp() {
  const quickDateInput = document.getElementById('quick-weight-date');
  if (quickDateInput) quickDateInput.value = getTodayISO();

  initHeaderAndQuickActions();
  initOnboardingModule();
  initDiaryModule();
  initCalendarModule();
  initChartsModule();

  subscribe(() => {
    renderDashboardScreen();
    renderDiaryScreen();
    renderCalendarScreen();
  });

  await loadInitialData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
