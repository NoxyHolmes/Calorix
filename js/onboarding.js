// js/onboarding.js — Ввод и валидация возраста (6–50 лет), пола, роста, текущего веса, цели и активности
import { validateProfileInput, getTodayISO } from './utils.js';
import { buildNutritionProgram } from './calculations.js';
import { saveProfile, saveWeightEntry } from './storage.js';
import { getState, setState } from './state.js';
import { showToast } from './components/toast.js';

export function initOnboardingModule() {
  const form = document.getElementById('profile-form');
  const ageInput = document.getElementById('input-age');
  const deficitInput = document.getElementById('input-deficit');
  const pediatricHint = document.getElementById('pediatric-live-warning');

  if (!form) return;

  function checkPediatricLiveWarning() {
    const ageVal = Number(ageInput.value);
    const defVal = Number(deficitInput.value);
    if (!pediatricHint) return;

    if (ageVal >= 6 && ageVal < 18) {
      const overSafe = defVal > 15;
      pediatricHint.style.display = 'flex';
      pediatricHint.className = `alert-banner ${overSafe ? 'alert-danger' : 'alert-warning'}`;
      pediatricHint.innerHTML = `
        <div>
          <strong>Внимание (возраст ${ageVal} лет — детский/подростковый период):</strong>
          Расчёт выполняется по педиатрическим уравнениям ВОЗ/FAO/UNU (формула Миффлина—Сан Жеора для взрослых здесь неприменима).
          ${overSafe
            ? '<br><strong>ПРЕДУПРЕЖДЕНИЕ:</strong> Выбранный дефицит превышает безопасный порог 10–15% для растущего организма! Настоятельно рекомендуется снизить дефицит до 10–15% и проконсультироваться с врачом-педиатром.'
            : '<br>Рекомендуемый мягкий дефицит для детей и подростков — 10–15% от TDEE со сбалансированным БЖУ. Обязательна консультация с педиатром.'}
        </div>
      `;
    } else {
      pediatricHint.style.display = 'none';
    }
  }

  ageInput?.addEventListener('input', checkPediatricLiveWarning);
  deficitInput?.addEventListener('input', checkPediatricLiveWarning);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Очистка ошибок
    document.querySelectorAll('.form-error').forEach(el => (el.textContent = ''));

    const rawData = {
      age: document.getElementById('input-age').value,
      gender: document.getElementById('input-gender').value,
      height: document.getElementById('input-height').value,
      currentWeight: document.getElementById('input-current-weight').value,
      targetWeight: document.getElementById('input-target-weight').value,
      activity: document.getElementById('input-activity').value,
      deficitPct: document.getElementById('input-deficit').value
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

    const computedProgram = buildNutritionProgram(rawData);
    const fullProfile = {
      age: Number(rawData.age),
      gender: rawData.gender,
      height: Number(rawData.height),
      currentWeight: Number(rawData.currentWeight),
      startWeight: getState().profile?.startWeight || Number(rawData.currentWeight),
      targetWeight: Number(rawData.targetWeight),
      activity: Number(rawData.activity),
      deficitPct: Number(rawData.deficitPct),
      ...computedProgram,
      updatedAt: getTodayISO()
    };

    await saveProfile(fullProfile);

    // Сохраняем вес в историю за сегодня
    const today = getTodayISO();
    const weightEntry = {
      date: today,
      weight: fullProfile.currentWeight,
      source: 'Анкета профиля'
    };
    await saveWeightEntry(weightEntry);

    const state = getState();
    const nextWeights = [
      ...state.weightHistory.filter(w => w.date !== today),
      weightEntry
    ].sort((a, b) => a.date.localeCompare(b.date));

    setState({
      profile: fullProfile,
      weightHistory: nextWeights
    });

    showToast('Индивидуальная программа рассчитана и сохранена!');
  });
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
