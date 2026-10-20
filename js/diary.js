// js/diary.js — Управление дневником питания + быстрое заполнение за любую пропущенную дату
import { getState, setState } from './state.js';
import { saveMeal, deleteMeal, saveWeightEntry, saveProfile } from './storage.js';
import { createMealRowElement } from './components/meal-row.js';
import { generateId, getCurrentTimeHHMM, formatDateRU, getTodayISO, round1 } from './utils.js';
import { calculateDetailedBodyMetrics } from './calculations.js';
import { showToast } from './components/toast.js';

export function getDayTotals(dateISO) {
  const { mealsByDate } = getState();
  const list = mealsByDate[dateISO] || [];
  return list.reduce(
    (acc, m) => {
      acc.kcal += Number(m.kcal) || 0;
      acc.p = round1(acc.p + (Number(m.p) || 0));
      acc.f = round1(acc.f + (Number(m.f) || 0));
      acc.c = round1(acc.c + (Number(m.c) || 0));
      return acc;
    },
    { kcal: 0, p: 0, f: 0, c: 0 }
  );
}

function shiftISO(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function initDiaryModule() {
  const datePicker = document.getElementById('diary-date-input');
  const addMealBtn = document.getElementById('btn-add-meal-row');
  const prevDayBtn = document.getElementById('diary-prev-day');
  const nextDayBtn = document.getElementById('diary-next-day');
  const yesterdayBtn = document.getElementById('diary-yesterday-btn');
  const todayBtn = document.getElementById('diary-today-btn');

  if (datePicker) {
    datePicker.addEventListener('change', () => {
      if (datePicker.value) {
        setState({ selectedDate: datePicker.value });
      }
    });
  }

  prevDayBtn?.addEventListener('click', () => {
    const curr = getState().selectedDate || getTodayISO();
    setState({ selectedDate: shiftISO(curr, -1) });
  });

  nextDayBtn?.addEventListener('click', () => {
    const curr = getState().selectedDate || getTodayISO();
    setState({ selectedDate: shiftISO(curr, 1) });
  });

  yesterdayBtn?.addEventListener('click', () => {
    setState({ selectedDate: shiftISO(getTodayISO(), -1) });
  });

  todayBtn?.addEventListener('click', () => {
    setState({ selectedDate: getTodayISO() });
  });

  if (addMealBtn) {
    addMealBtn.addEventListener('click', async () => {
      const state = getState();
      const date = state.selectedDate;
      const existing = state.mealsByDate[date] || [];

      const defaultMealsOrder = ['Завтрак', 'Обед', 'Полдник', 'Ужин', 'Перекус'];
      const mealName = defaultMealsOrder[existing.length] || 'Перекус';

      const newMeal = {
        id: generateId('meal'),
        date,
        mealName,
        time: getCurrentTimeHHMM(),
        foodName: 'Овсяная каша варёная на воде',
        grams: 200,
        weightBefore: null,
        kcal100: 88,
        p100: 3.0,
        f100: 1.7,
        c100: 15.0,
        kcal: 176,
        p: 6.0,
        f: 3.4,
        c: 30.0
      };

      await saveMeal(newMeal);
      const updatedForDate = [...existing, newMeal];
      setState({
        mealsByDate: {
          ...state.mealsByDate,
          [date]: updatedForDate
        }
      });
      showToast(`Добавлен приём пищи (${mealName}) за ${formatDateRU(date)}`);
    });
  }
}

export function renderDiaryScreen() {
  const state = getState();
  const date = state.selectedDate;
  const todayISO = getTodayISO();
  const datePicker = document.getElementById('diary-date-input');
  const dateLabel = document.getElementById('diary-date-formatted');
  const pastNotice = document.getElementById('diary-past-date-notice');
  const listContainer = document.getElementById('diary-meals-list');
  const summaryBar = document.getElementById('diary-day-summary');

  if (datePicker && datePicker.value !== date) {
    datePicker.value = date;
  }
  if (dateLabel) {
    dateLabel.textContent = formatDateRU(date);
  }
  if (pastNotice) {
    if (date !== todayISO) {
      pastNotice.style.display = 'flex';
      pastNotice.innerHTML = `
        <div>
          📌 Вы просматриваете и редактируете рацион за <strong>${formatDateRU(date)}</strong>.
          Все добавленные продукты и вес будут сохранены именно за эту дату.
        </div>
      `;
    } else {
      pastNotice.style.display = 'none';
    }
  }

  if (!listContainer) return;

  const meals = state.mealsByDate[date] || [];
  listContainer.innerHTML = '';

  if (meals.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--text-muted); border: 1px dashed var(--border); border-radius: var(--radius-md);">
        За <strong>${formatDateRU(date)}</strong> записей пока нет. Нажмите <strong>«+ Добавить приём пищи»</strong>, чтобы внести еду за этот день.
      </div>
    `;
  } else {
    for (const meal of meals) {
      const rowEl = createMealRowElement(meal, {
        onUpdate: async (updatedMeal) => {
          await saveMeal(updatedMeal);

          const latestState = getState();
          const dayList = (latestState.mealsByDate[date] || []).map(m =>
            m.id === updatedMeal.id ? updatedMeal : m
          );

          let nextWeights = latestState.weightHistory;
          let nextProfile = latestState.profile;

          if (updatedMeal.weightBefore !== null && updatedMeal.weightBefore >= 15) {
            const weightEntry = {
              date,
              weight: Number(updatedMeal.weightBefore),
              source: `Перед едой (${updatedMeal.time})`
            };
            await saveWeightEntry(weightEntry);

            const filteredW = nextWeights.filter(w => w.date !== date);
            nextWeights = [...filteredW, weightEntry].sort((a, b) => a.date.localeCompare(b.date));

            if (nextProfile && date >= getTodayISO()) {
              const metrics = calculateDetailedBodyMetrics({
                weightKg: Number(updatedMeal.weightBefore),
                heightCm: nextProfile.height,
                age: nextProfile.age,
                gender: nextProfile.gender
              });
              nextProfile = {
                ...nextProfile,
                currentWeight: Number(updatedMeal.weightBefore),
                ...metrics,
                bmiCategory: metrics.category
              };
              await saveProfile(nextProfile);
            }
            showToast(`Вес ${updatedMeal.weightBefore} кг сохранён за ${date}`);
          }

          setState({
            mealsByDate: { ...latestState.mealsByDate, [date]: dayList },
            weightHistory: nextWeights,
            profile: nextProfile
          });
        },
        onDelete: async (mealId) => {
          await deleteMeal(mealId);
          const latestState = getState();
          const dayList = (latestState.mealsByDate[date] || []).filter(m => m.id !== mealId);
          setState({
            mealsByDate: { ...latestState.mealsByDate, [date]: dayList }
          });
          showToast('Запись о приёме пищи удалена', 'warning');
        }
      });
      listContainer.appendChild(rowEl);
    }
  }

  if (summaryBar) {
    const totals = getDayTotals(date);
    const targetKcal = state.profile ? state.profile.targetKcal : 2000;
    const diff = targetKcal - totals.kcal;
    summaryBar.innerHTML = `
      <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px;">
        <div>
          <strong>Итого за ${formatDateRU(date)} (${meals.length} пр. пищи):</strong>
          <span class="num" style="color:var(--accent); font-size:1.1rem; margin-left:8px;">${totals.kcal} / ${targetKcal} ккал</span>
        </div>
        <div class="mono" style="font-size:0.88rem; color:var(--text-secondary);">
          Белки: <strong>${totals.p} г</strong> | Жиры: <strong>${totals.f} г</strong> | Углеводы: <strong>${totals.c} г</strong>
          (${diff >= 0 ? `остаток ${diff} ккал` : `профицит +${Math.abs(diff)} ккал`})
        </div>
      </div>
    `;
  }
}
