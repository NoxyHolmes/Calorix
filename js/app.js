// js/app.js — Точка входа, роутинг между экранами, связывание состояния, темы и демо-режима
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
  exportFullDatabaseJSON,
  importFullDatabaseJSON,
  getSavedTheme,
  saveTheme,
  saveMeal
} from './storage.js';
import { getTodayISO, round1, generateId } from './utils.js';
import { evaluateAdaptiveStatus, applyProgramAdaptation } from './adaptive.js';
import { renderProgressRing } from './components/progress-ring.js';
import { showToast } from './components/toast.js';
import { initDiaryModule, renderDiaryScreen, getDayTotals } from './diary.js';
import { initCalendarModule, renderCalendarScreen } from './calendar.js';
import { initChartsModule, renderAllCharts } from './charts.js';
import { initOnboardingModule, populateProfileForm } from './onboarding.js';
import { buildNutritionProgram } from './calculations.js';

async function loadInitialData() {
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

  // Если профиль ещё не создан — открываем вкладку «Профиль и программа»
  if (!profile) {
    switchScreen('profile');
  }
}

function switchScreen(screenId) {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === screenId);
  });
  document.querySelectorAll('.screen').forEach(sec => {
    sec.classList.toggle('active', sec.id === `screen-${screenId}`);
  });
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

  if (!profile) {
    if (heroCurrentEl) heroCurrentEl.textContent = '— кг';
    if (heroTargetEl) heroTargetEl.textContent = '— кг';
    return;
  }

  if (heroCurrentEl) heroCurrentEl.textContent = `${profile.currentWeight} кг`;
  if (heroTargetEl) heroTargetEl.textContent = `${profile.targetWeight} кг`;
  const toLose = round1(profile.currentWeight - profile.targetWeight);
  if (heroDiffEl) {
    heroDiffEl.textContent = toLose > 0 ? `Осталось сбросить: ${toLose} кг` : 'Цель достигнута!';
  }
  if (heroBmiEl) {
    heroBmiEl.textContent = `${profile.bmi} (${profile.bmiCategory})`;
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
          Используются педиатрические уравнения ВОЗ.
          ${profile.exceedsSafePediatricDeficit
            ? ' <strong>Внимание: выбранный дефицит выше 15%!</strong> Для растущего организма жёсткий дефицит опасен.'
            : ' Установлен щадящий безопасный дефицит.'}
          Обязательна консультация с врачом-педиатром.
        </div>
      `;
    } else {
      safetyBannerEl.style.display = 'none';
    }
  }

  // Кольцо калорий
  const ringContainer = document.getElementById('dash-progress-ring');
  renderProgressRing(ringContainer, totals.kcal, profile.targetKcal);

  // Прогресс-бары БЖУ
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

  // Карточка адаптивной системы (проверка плато/роста веса)
  renderAdaptiveStatusBox();
  renderAllCharts();
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
      <div style="font-weight: 700; margin-bottom: 4px;">Статус адаптивного алгоритма:</div>
      <p style="font-size: 0.88rem; color: var(--text-primary); margin-bottom: 10px;">${evalRes.message}</p>
      ${evalRes.canAdapt ? `
        <button type="button" class="btn btn-primary btn-sm" id="btn-apply-adaptation">
          Применить адаптацию (${evalRes.oldKcal} → ${evalRes.proposedKcal} ккал)
        </button>
      ` : ''}
    </div>
  `;

  const applyBtn = statusContainer.querySelector('#btn-apply-adaptation');
  if (applyBtn) {
    applyBtn.addEventListener('click', async () => {
      const { updatedProfile, logEntry } = applyProgramAdaptation(state.profile, evalRes);
      await saveProfile(updatedProfile);
      await saveAdaptationLog(logEntry);

      setState({
        profile: updatedProfile,
        adaptationLogs: [logEntry, ...state.adaptationLogs]
      });
      showToast(`Цель адаптирована: ${logEntry.oldKcal} → ${logEntry.newKcal} ккал`);
    });
  }

  if (logsContainer) {
    if (!state.adaptationLogs || state.adaptationLogs.length === 0) {
      logsContainer.innerHTML = `<p style="font-size: 0.84rem; color: var(--text-muted);">Пересмотров программы пока не было.</p>`;
    } else {
      logsContainer.innerHTML = state.adaptationLogs.map(log => `
        <div class="log-item">
          <div style="display:flex; justify-content:space-between; font-weight:700;">
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
  // Переключение вкладок
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      switchScreen(btn.dataset.screen);
    });
  });

  // Переключение светлой/тёмной темы
  const themeBtn = document.getElementById('btn-toggle-theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const curr = getState().theme;
      const next = curr === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      saveTheme(next);
      setState({ theme: next });
    });
  }

  // Быстрое логирование утреннего веса на главном экране
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

      const entry = { date: dateISO, weight: val, source: 'Утреннее взвешивание' };
      await saveWeightEntry(entry);

      const state = getState();
      const nextWeights = [
        ...state.weightHistory.filter(w => w.date !== dateISO),
        entry
      ].sort((a, b) => a.date.localeCompare(b.date));

      let nextProfile = state.profile;
      if (nextProfile && dateISO >= getTodayISO()) {
        nextProfile = { ...nextProfile, currentWeight: val };
        await saveProfile(nextProfile);
      }

      setState({ weightHistory: nextWeights, profile: nextProfile });
      input.value = '';
      showToast(`Вес ${val} кг за ${dateISO} сохранён`);
    });
  }

  // Экспорт JSON
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

  // Импорт JSON
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

  // Кнопка заполнения демо-данных за 14 дней (для мгновенной демонстрации плато и графиков)
  const demoBtn = document.getElementById('btn-load-demo');
  if (demoBtn) {
    demoBtn.addEventListener('click', async () => {
      const baseData = {
        age: 29,
        gender: 'female',
        height: 168,
        currentWeight: 72.4,
        targetWeight: 63.0,
        activity: 1.375,
        deficitPct: 18
      };
      const prog = buildNutritionProgram(baseData);
      const demoProfile = {
        ...baseData,
        startWeight: 74.0,
        ...prog,
        updatedAt: getTodayISO()
      };
      await saveProfile(demoProfile);

      const today = new Date();
      const simulatedWeights = [
        72.6, 72.5, 72.4, 72.5, 72.4, 72.5, 72.4, // предыдущая неделя (~72.47)
        72.5, 72.4, 72.5, 72.4, 72.5, 72.4, 72.4  // текущая неделя (~72.44 -> плато!)
      ];

      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        const w = simulatedWeights[13 - i];
        await saveWeightEntry({ date: iso, weight: w, source: 'Утром натощак' });

        // Создаём 3 приёма пищи на каждый из последних 7 дней
        if (i <= 6) {
          const m1 = {
            id: generateId('meal'), date: iso, mealName: 'Завтрак', time: '08:30',
            foodName: 'Овсяная каша варёная на воде', grams: 250, weightBefore: w,
            kcal100: 88, p100: 3, f100: 1.7, c100: 15, kcal: 220, p: 7.5, f: 4.3, c: 37.5
          };
          const m2 = {
            id: generateId('meal'), date: iso, mealName: 'Обед', time: '13:30',
            foodName: 'Куриная грудка (филе отварное/запечённое)', grams: 220, weightBefore: null,
            kcal100: 165, p100: 31, f100: 3.6, c100: 0, kcal: 363, p: 68.2, f: 7.9, c: 0
          };
          const m3 = {
            id: generateId('meal'), date: iso, mealName: 'Ужин', time: '19:00',
            foodName: 'Лосось / Сёмга запечённая', grams: 200, weightBefore: null,
            kcal100: 208, p100: 20.4, f100: 13.4, c100: 0, kcal: 416, p: 40.8, f: 26.8, c: 0
          };
          await saveMeal(m1);
          await saveMeal(m2);
          await saveMeal(m3);
        }
      }

      await loadInitialData();
      switchScreen('dashboard');
      showToast('Загружены демо-данные за 14 дней с имитацией плато веса!');
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initHeaderAndQuickActions();
  initOnboardingModule();
  initDiaryModule();
  initCalendarModule();
  initChartsModule();

  const quickDateInput = document.getElementById('quick-weight-date');
  if (quickDateInput) quickDateInput.value = getTodayISO();

  subscribe(() => {
    renderDashboardScreen();
    renderDiaryScreen();
    renderCalendarScreen();
  });

  await loadInitialData();
});
