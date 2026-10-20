// js/calendar.js — Календарь на месяц и детальный просмотр/редактирование записей выбранного дня
import { getState, setState } from './state.js';
import { getTodayISO, formatDateRU } from './utils.js';
import { getDayTotals } from './diary.js';
import { deleteMeal, saveMeal } from './storage.js';
import { computeMealMacros } from './calculations.js';
import { showToast } from './components/toast.js';

let currentCalYear = new Date().getFullYear();
let currentCalMonth = new Date().getMonth(); // 0..11

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

export function initCalendarModule() {
  const prevBtn = document.getElementById('cal-prev-month');
  const nextBtn = document.getElementById('cal-next-month');
  const todayBtn = document.getElementById('cal-today-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      currentCalMonth--;
      if (currentCalMonth < 0) {
        currentCalMonth = 11;
        currentCalYear--;
      }
      renderCalendarScreen();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentCalMonth++;
      if (currentCalMonth > 11) {
        currentCalMonth = 0;
        currentCalYear++;
      }
      renderCalendarScreen();
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      const now = new Date();
      currentCalYear = now.getFullYear();
      currentCalMonth = now.getMonth();
      setState({ selectedDate: getTodayISO() });
    });
  }
}

export function renderCalendarScreen() {
  const state = getState();
  const titleEl = document.getElementById('cal-month-title');
  const gridEl = document.getElementById('calendar-days-grid');
  const detailContainer = document.getElementById('calendar-day-detail');

  if (!gridEl || !titleEl) return;

  titleEl.textContent = `${MONTH_NAMES_RU[currentCalMonth]} ${currentCalYear}`;
  gridEl.innerHTML = '';

  const firstDayOfMonth = new Date(currentCalYear, currentCalMonth, 1);
  // Пн = 0 ... Вс = 6
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
  const todayISO = getTodayISO();

  const weightMap = {};
  for (const w of state.weightHistory) {
    weightMap[w.date] = w.weight;
  }

  for (let i = 0; i < startOffset; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'cal-day empty';
    gridEl.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const mStr = String(currentCalMonth + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const dateISO = `${currentCalYear}-${mStr}-${dStr}`;

    const dayMeals = state.mealsByDate[dateISO] || [];
    const totals = getDayTotals(dateISO);
    const weightVal = weightMap[dateISO];
    const hasData = dayMeals.length > 0 || weightVal !== undefined;

    const cell = document.createElement('div');
    cell.className = [
      'cal-day',
      dateISO === todayISO ? 'today' : '',
      dateISO === state.selectedDate ? 'selected' : '',
      hasData ? 'has-data' : ''
    ].filter(Boolean).join(' ');

    cell.innerHTML = `
      <div class="cal-day-num">${day}</div>
      <div class="cal-day-indicators">
        ${totals.kcal > 0 ? `<span class="cal-pill-kcal">${totals.kcal} ккал</span>` : ''}
        ${weightVal !== undefined ? `<span class="cal-pill-weight">${weightVal} кг</span>` : ''}
      </div>
    `;

    cell.addEventListener('click', () => {
      setState({ selectedDate: dateISO });
    });

    gridEl.appendChild(cell);
  }

  renderDayDetailPanel(detailContainer, state.selectedDate);
}

function renderDayDetailPanel(container, dateISO) {
  if (!container) return;
  const state = getState();
  const meals = state.mealsByDate[dateISO] || [];
  const totals = getDayTotals(dateISO);
  const weightObj = state.weightHistory.find(w => w.date === dateISO);
  const targetKcal = state.profile ? state.profile.targetKcal : 2000;

  container.innerHTML = `
    <div class="card-header">
      <h3 class="card-title">${formatDateRU(dateISO)}</h3>
      <button type="button" class="btn btn-primary btn-sm" id="cal-jump-to-diary-btn">Открыть в дневнике</button>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
      <div class="stat-box">
        <div class="stat-label">Калории за день</div>
        <div class="stat-value" style="font-size:1.15rem; color:var(--accent);">${totals.kcal} / ${targetKcal}</div>
        <div class="stat-sub">Б:${totals.p}г Ж:${totals.f}г У:${totals.c}г</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Записанный вес</div>
        <div class="stat-value" style="font-size:1.15rem;">${weightObj ? `${weightObj.weight} кг` : '—'}</div>
        <div class="stat-sub">${weightObj ? (weightObj.source || 'Утреннее взвешивание') : 'Не взвешивались'}</div>
      </div>
    </div>

    <h4 style="font-size:0.9rem; margin-bottom:8px;">Приёмы пищи (${meals.length}):</h4>
    <div class="day-detail-list" id="cal-day-meals-list"></div>
  `;

  const jumpBtn = container.querySelector('#cal-jump-to-diary-btn');
  if (jumpBtn) {
    jumpBtn.addEventListener('click', () => {
      const diaryTabBtn = document.querySelector('.nav-tab[data-screen="diary"]');
      if (diaryTabBtn) diaryTabBtn.click();
    });
  }

  const listEl = container.querySelector('#cal-day-meals-list');
  if (meals.length === 0) {
    listEl.innerHTML = `<p style="font-size:0.86rem; color:var(--text-muted);">Нет приёмов пищи за эту дату.</p>`;
    return;
  }

  for (const meal of meals) {
    const item = document.createElement('div');
    item.className = 'day-detail-item';
    item.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:700; font-size:0.9rem;">
          <span class="mono" style="color:var(--accent);">${meal.time}</span> — ${meal.mealName}
        </div>
        <div style="font-size:0.84rem; color:var(--text-secondary);">
          ${meal.foodName} • <strong class="mono">${meal.grams} г</strong>
          ${meal.weightBefore ? ` • Вес до еды: <strong>${meal.weightBefore} кг</strong>` : ''}
        </div>
        <div class="mono" style="font-size:0.75rem; color:var(--text-muted);">
          ${meal.kcal} ккал (Б:${meal.p} Ж:${meal.f} У:${meal.c})
        </div>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <button type="button" class="btn btn-secondary btn-sm cal-edit-grams-btn">Изменить г</button>
        <button type="button" class="btn btn-danger btn-sm cal-del-meal-btn">✕</button>
      </div>
    `;

    // Быстрое редактирование граммов прямо из календаря без ухода с экрана
    item.querySelector('.cal-edit-grams-btn').addEventListener('click', async () => {
      const nextGramsStr = prompt(`Введите новое количество граммов для «${meal.foodName}»:`, String(meal.grams));
      if (nextGramsStr === null) return;
      const nextGrams = Number(nextGramsStr);
      if (!Number.isFinite(nextGrams) || nextGrams <= 0) {
        showToast('Количество граммов должно быть больше 0', 'error');
        return;
      }
      const macros = computeMealMacros(meal, nextGrams);
      const updated = { ...meal, grams: nextGrams, ...macros };
      await saveMeal(updated);
      const latest = getState();
      const updatedList = (latest.mealsByDate[dateISO] || []).map(m => m.id === meal.id ? updated : m);
      setState({ mealsByDate: { ...latest.mealsByDate, [dateISO]: updatedList } });
      showToast('Порция обновлена');
    });

    item.querySelector('.cal-del-meal-btn').addEventListener('click', async () => {
      await deleteMeal(meal.id);
      const latest = getState();
      const updatedList = (latest.mealsByDate[dateISO] || []).filter(m => m.id !== meal.id);
      setState({ mealsByDate: { ...latest.mealsByDate, [dateISO]: updatedList } });
      showToast('Запись удалена из календаря', 'warning');
    });

    listEl.appendChild(item);
  }
}
