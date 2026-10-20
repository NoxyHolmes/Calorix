// js/onboarding.js — Автоподбор программы на первые 2 недели при вводе возраста, роста и веса
import { validateProfileInput, getTodayISO, generateId } from './utils.js';
import { buildNutritionProgram, calculateDetailedBodyMetrics } from './calculations.js';
import { buildActivityAndDietPlan, fetchInternetAdaptationAdvice } from './recommendations.js';
import { saveProfile, saveWeightEntry, saveAdaptationLog } from './storage.js';
import { getState, setState } from './state.js';
import { showToast } from './components/toast.js';

export function initOnboardingModule() {
  const form = document.getElementById('profile-form');
  const ageInput = document.getElementById('input-age');
  const genderInput = document.getElementById('input-gender');
  const heightInput = document.getElementById('input-height');
  const weightInput = document.getElementById('input-current-weight');
  const targetInput = document.getElementById('input-target-weight');
  const activityInput = document.getElementById('input-activity');
  const deficitInput = document.getElementById('input-deficit');
  const pediatricHint = document.getElementById('pediatric-live-warning');
  const previewContainer = document.getElementById('live-initial-program-preview');

  if (!form) return;

  let userManuallyChangedDeficit = false;
  deficitInput?.addEventListener('input', () => {
    userManuallyChangedDeficit = true;
    updateLivePreview();
  });

  // Автоматический подбор оптимального дефицита при изменении возраста, роста или веса
  function autoSelectOptimalDeficit() {
    const ageVal = Number(ageInput.value);
    const heightVal = Number(heightInput.value);
    const weightVal = Number(weightInput.value);
    const genderVal = genderInput.value;

    if (!ageVal || !heightVal || !weightVal) return;

    const metrics = calculateDetailedBodyMetrics({
      weightKg: weightVal,
      heightCm: heightVal,
      age: ageVal,
      gender: genderVal
    });

    if (!userManuallyChangedDeficit && deficitInput) {
      let autoDeficit = 15;
      if (ageVal < 18) {
        autoDeficit = metrics.bmi >= 25 ? 14 : 10;
      } else {
        if (metrics.bmi >= 35) autoDeficit = 20;
        else if (metrics.bmi >= 30) autoDeficit = 18;
        else if (metrics.bmi >= 25) autoDeficit = 16;
        else autoDeficit = 12;
      }
      deficitInput.value = autoDeficit;
    }

    // Если целевой вес больше текущего — автоматически предлагаем здоровый оптимум
    if (targetInput && Number(targetInput.value) > weightVal && metrics.idealWeightMax > 0) {
      targetInput.value = Math.min(weightVal, metrics.idealWeightMax);
    }
  }

  function updateLivePreview() {
    const ageVal = Number(ageInput.value);
    const genderVal = genderInput.value;
    const heightVal = Number(heightInput.value);
    const weightVal = Number(weightInput.value);
    const targetVal = Number(targetInput.value);
    const activityVal = Number(activityInput.value);
    const defVal = Number(deficitInput.value);

    if (pediatricHint) {
      if (ageVal >= 6 && ageVal < 18) {
        const overSafe = defVal > 15;
        pediatricHint.style.display = 'flex';
        pediatricHint.className = `alert-banner ${overSafe ? 'alert-danger' : 'alert-warning'}`;
        pediatricHint.innerHTML = `
          <div>
            <strong>Детский/подростковый возраст (${ageVal} лет):</strong>
            Применяются педиатрические уравнения ВОЗ/FAO/UNU.
            ${overSafe
              ? '<br><strong>ПРЕДУПРЕЖДЕНИЕ:</strong> Выбранный дефицит превышает безопасный порог 15% для растущего организма!'
              : '<br>Автоматически установлен щадящий дефицит (10–15% от TDEE) со сбалансированным БЖУ.'}
          </div>
        `;
      } else {
        pediatricHint.style.display = 'none';
      }
    }

    if (!previewContainer) return;
    if (ageVal < 6 || ageVal > 50 || heightVal < 90 || weightVal < 15) {
      previewContainer.innerHTML = '';
      return;
    }

    const prog = buildNutritionProgram({
      age: ageVal,
      gender: genderVal,
      height: heightVal,
      currentWeight: weightVal,
      targetWeight: targetVal,
      activity: activityVal,
      deficitPct: defVal
    });

    const plan = buildActivityAndDietPlan({
      ...prog,
      age: ageVal,
      gender: genderVal,
      height: heightVal,
      currentWeight: weightVal,
      targetWeight: targetVal,
      currentWeek: 1,
      adaptationCount: 0
    });

    previewContainer.innerHTML = `
      <div style="padding:16px; border-radius:var(--radius-md); background:var(--bg-elevated); border:1px solid var(--accent);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
          <strong style="color:var(--accent); font-size:0.98rem;">
            ✨ Автоматически подобранная программа на первые 2 недели (Дни 1–14, с промежуточным пересмотром на 8-й день)
          </strong>
          <span class="mono" style="font-size:0.8rem; color:var(--text-secondary);">
            ${prog.obesityDegree} • ИМТ ${prog.bmi} • Жир ≈ ${prog.bodyFatPct}%
          </span>
        </div>

        <div class="hero-weight-stats" style="margin-top:0; margin-bottom:12px;">
          <div class="stat-box" style="background:var(--bg-surface);">
            <div class="stat-label">Стартовая норма калорий</div>
            <div class="stat-value" style="font-size:1.25rem; color:var(--accent);">${prog.targetKcal} ккал</div>
            <div class="stat-sub">BMR: ${prog.bmr} | TDEE: ${prog.tdee} (-${prog.requestedDeficit}%)</div>
          </div>
          <div class="stat-box" style="background:var(--bg-surface);">
            <div class="stat-label">Целевой баланс БЖУ</div>
            <div class="stat-value" style="font-size:1.1rem;">Б:${prog.macros.protein}г Ж:${prog.macros.fat}г У:${prog.macros.carbs}г</div>
            <div class="stat-sub">Вода: ${plan.waterLiters} л/день</div>
          </div>
          <div class="stat-box" style="background:var(--bg-surface);">
            <div class="stat-label">Рекомендуемая активность</div>
            <div class="stat-value" style="font-size:1rem;">${plan.workoutPlan.stepsGoal}</div>
            <div class="stat-sub">${plan.workoutPlan.title}</div>
          </div>
        </div>

        <div style="font-size:0.84rem; color:var(--text-secondary);">
          <strong>Как работает цикл:</strong> Первые 7 дней вы следуете этой стартовой программе и записываете вес.
          На <strong>8-й день</strong> система автоматически проанализирует динамику за 1-ю неделю, запросит свежие рекомендации из интернета и составит обновлённый план на 2-ю неделю (и так каждые 7 дней).
        </div>
      </div>
    `;
  }

  [ageInput, genderInput, heightInput, weightInput, activityInput].forEach(el => {
    el?.addEventListener('input', () => {
      autoSelectOptimalDeficit();
      updateLivePreview();
    });
  });

  targetInput?.addEventListener('input', updateLivePreview);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.querySelectorAll('.form-error').forEach(el => (el.textContent = ''));

    const rawData = {
      age: ageInput.value,
      gender: genderInput.value,
      height: heightInput.value,
      currentWeight: weightInput.value,
      targetWeight: targetInput.value,
      activity: activityInput.value,
      deficitPct: deficitInput.value
    };

    const { isValid, errors } = validateProfileInput(rawData);
    if (!isValid) {
      Object.entries(errors).forEach(([field, msg]) => {
        const errEl = document.getElementById(`err-${field}`);
        if (errEl) errEl.textContent = msg;
      });
      showToast('Исправьте ошибки в форме параметров', 'error');
      return;
    }

    const today = getTodayISO();
    const existingProfile = getState().profile;
    const computedProgram = buildNutritionProgram(rawData);

    // При первом создании или обновлении профиля подгружаем актуальный интернет-протокол для старта
    const initialInternetAdvice = await fetchInternetAdaptationAdvice(
      { ...computedProgram, age: Number(rawData.age), currentWeight: Number(rawData.currentWeight) },
      'initial_start',
      1
    );

    const fullProfile = {
      age: Number(rawData.age),
      gender: rawData.gender,
      height: Number(rawData.height),
      currentWeight: Number(rawData.currentWeight),
      startWeight: existingProfile?.startWeight || Number(rawData.currentWeight),
      targetWeight: Number(rawData.targetWeight),
      activity: Number(rawData.activity),
      deficitPct: Number(rawData.deficitPct),
      programStartDate: existingProfile?.programStartDate || today,
      lastWeeklyReviewDate: existingProfile?.lastWeeklyReviewDate || today,
      currentWeek: existingProfile?.currentWeek || 1,
      adaptationCount: existingProfile?.adaptationCount || 0,
      lastInternetProtocol: initialInternetAdvice,
      ...computedProgram,
      updatedAt: today
    };

    await saveProfile(fullProfile);

    const weightEntry = {
      date: today,
      weight: fullProfile.currentWeight,
      source: 'Старт / обновление профиля'
    };
    await saveWeightEntry(weightEntry);

    const state = getState();
    let nextLogs = state.adaptationLogs || [];

    // Фиксируем запуск стартовой программы на первые 2 недели в журнале
    if (!existingProfile) {
      const startLog = {
        id: generateId('adapt'),
        date: today,
        weekNumber: 1,
        reason: 'Старт: автоподбор программы на первые 2 недели (Неделя 1)',
        oldKcal: computedProgram.tdee,
        newKcal: computedProgram.targetKcal,
        reductionPct: fullProfile.deficitPct,
        details: `ИМТ ${computedProgram.bmi} (${computedProgram.obesityDegree}), старт с веса ${fullProfile.currentWeight} кг. Следующий автопересмотр на 8-й день.`
      };
      await saveAdaptationLog(startLog);
      nextLogs = [startLog, ...nextLogs];
    }

    const nextWeights = [
      ...state.weightHistory.filter(w => w.date !== today),
      weightEntry
    ].sort((a, b) => a.date.localeCompare(b.date));

    setState({
      profile: fullProfile,
      weightHistory: nextWeights,
      adaptationLogs: nextLogs
    });

    showToast('Стартовая программа сформирована и сохранена!');
    const dashBtn = document.querySelector('.nav-tab[data-screen="dashboard"]');
    if (dashBtn) dashBtn.click();
  });

  updateLivePreview();
}

export function populateProfileForm() {
  const { profile } = getState();
  if (!profile) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };

  setVal('input-age', profile.age);
  setVal('input-gender', profile.gender);
  setVal('input-height', profile.height);
  setVal('input-current-weight', profile.currentWeight);
  setVal('input-target-weight', profile.targetWeight);
  setVal('input-activity', profile.activity);
  setVal('input-deficit', profile.deficitPct);

  const ageInput = document.getElementById('input-age');
  if (ageInput) ageInput.dispatchEvent(new Event('input'));
}
