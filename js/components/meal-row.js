// js/components/meal-row.js — Переиспользуемый компонент строки приёма пищи
import { searchFoods } from '../food-api.js';
import { computeMealMacros } from '../calculations.js';
import { validateTimeHHMM } from '../utils.js';
import { showToast } from './toast.js';

const MEAL_TYPES = ['Завтрак', 'Обед', 'Полдник', 'Ужин', 'Перекус'];

export function createMealRowElement(meal, { onUpdate, onDelete }) {
  const row = document.createElement('div');
  row.className = 'meal-row-card';
  row.dataset.id = meal.id;

  const isPreset = MEAL_TYPES.includes(meal.mealName);
  const selectValue = isPreset ? meal.mealName : 'Своё';

  row.innerHTML = `
    <div class="form-group">
      <label class="form-label">Приём пищи</label>
      <select class="form-select meal-type-select">
        ${MEAL_TYPES.map(t => `<option value="${t}" ${selectValue === t ? 'selected' : ''}>${t}</option>`).join('')}
        <option value="Своё" ${!isPreset ? 'selected' : ''}>Своё название...</option>
      </select>
      <input type="text" class="form-input custom-meal-name" placeholder="Название приёма"
        value="${!isPreset ? (meal.mealName || '') : ''}"
        style="display: ${!isPreset ? 'block' : 'none'}; margin-top: 4px;" />
    </div>

    <div class="form-group">
      <label class="form-label">Время</label>
      <input type="time" class="form-input meal-time-input mono" value="${meal.time || '12:00'}" required />
    </div>

    <div class="form-group food-search-wrapper">
      <label class="form-label">Продукт (поиск OpenFoodFacts / База)</label>
      <input type="text" class="form-input meal-food-input" placeholder="Начните вводить продукт..." value="${meal.foodName || ''}" autocomplete="off" />
      <div class="food-suggestions"></div>
    </div>

    <div class="form-group">
      <label class="form-label">Граммы (г)</label>
      <input type="number" class="form-input meal-grams-input mono" min="1" max="5000" step="1" value="${meal.grams || 100}" />
    </div>

    <div class="form-group">
      <label class="form-label">Вес до еды (кг)</label>
      <input type="number" class="form-input meal-weight-input mono" min="15" max="300" step="0.1" placeholder="Опц." value="${meal.weightBefore ?? ''}" />
    </div>

    <div style="display: flex; flex-direction: column; gap: 6px; justify-content: space-between; height: 100%;">
      <div class="meal-computed-badge">
        <span class="num meal-kcal-display" style="color: var(--accent); font-size: 0.92rem;">${meal.kcal || 0} ккал</span>
        <span class="mono meal-bju-display" style="color: var(--text-secondary); font-size: 0.72rem;">
          Б:${meal.p || 0} Ж:${meal.f || 0} У:${meal.c || 0}
        </span>
      </div>
      <button type="button" class="btn btn-danger btn-sm meal-delete-btn" title="Удалить строку">Удалить</button>
    </div>
  `;

  const typeSelect = row.querySelector('.meal-type-select');
  const customInput = row.querySelector('.custom-meal-name');
  const timeInput = row.querySelector('.meal-time-input');
  const foodInput = row.querySelector('.meal-food-input');
  const suggestionsBox = row.querySelector('.food-suggestions');
  const gramsInput = row.querySelector('.meal-grams-input');
  const weightInput = row.querySelector('.meal-weight-input');
  const kcalDisplay = row.querySelector('.meal-kcal-display');
  const bjuDisplay = row.querySelector('.meal-bju-display');
  const deleteBtn = row.querySelector('.meal-delete-btn');

  let currentFoodData = {
    name: meal.foodName || 'Продукт',
    kcal100: meal.kcal100 || 0,
    p100: meal.p100 || 0,
    f100: meal.f100 || 0,
    c100: meal.c100 || 0
  };

  function emitChange() {
    const gramsVal = Number(gramsInput.value);
    if (!Number.isFinite(gramsVal) || gramsVal <= 0) {
      showToast('Вес порции (граммы) должен быть больше 0', 'error');
      gramsInput.value = 100;
      return;
    }

    const timeVal = timeInput.value;
    if (!validateTimeHHMM(timeVal)) {
      showToast('Укажите корректное время в формате ЧЧ:ММ', 'error');
      return;
    }

    const computed = computeMealMacros(currentFoodData, gramsVal);
    kcalDisplay.textContent = `${computed.kcal} ккал`;
    bjuDisplay.textContent = `Б:${computed.p} Ж:${computed.f} У:${computed.c}`;

    const rawWeight = weightInput.value.trim();
    const parsedWeight = rawWeight !== '' ? Number(rawWeight) : null;

    const updatedMeal = {
      ...meal,
      mealName: typeSelect.value === 'Своё' ? (customInput.value.trim() || 'Перекус') : typeSelect.value,
      time: timeVal,
      foodName: foodInput.value.trim() || currentFoodData.name,
      grams: gramsVal,
      weightBefore: (parsedWeight && parsedWeight >= 15 && parsedWeight <= 300) ? parsedWeight : null,
      kcal100: currentFoodData.kcal100,
      p100: currentFoodData.p100,
      f100: currentFoodData.f100,
      c100: currentFoodData.c100,
      ...computed
    };

    onUpdate(updatedMeal);
  }

  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'Своё') {
      customInput.style.display = 'block';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
      emitChange();
    }
  });

  customInput.addEventListener('change', emitChange);
  timeInput.addEventListener('change', emitChange);
  gramsInput.addEventListener('change', emitChange);
  weightInput.addEventListener('change', emitChange);

  let searchTimeout = null;
  foodInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const results = await searchFoods(foodInput.value);
      suggestionsBox.innerHTML = '';
      if (results.length === 0) {
        suggestionsBox.classList.remove('open');
        return;
      }
      for (const item of results) {
        const div = document.createElement('div');
        div.className = 'food-suggestion-item';
        div.innerHTML = `
          <span><strong>${item.name}</strong> <small style="color:var(--text-muted)">(${item.source})</small></span>
          <span class="mono" style="color:var(--accent); white-space:nowrap;">${item.kcal100} ккал / 100г</span>
        `;
        div.addEventListener('click', () => {
          foodInput.value = item.name;
          currentFoodData = {
            name: item.name,
            kcal100: item.kcal100,
            p100: item.p100,
            f100: item.f100,
            c100: item.c100
          };
          suggestionsBox.classList.remove('open');
          emitChange();
        });
        suggestionsBox.appendChild(div);
      }
      suggestionsBox.classList.add('open');
    }, 220);
  });

  foodInput.addEventListener('focus', async () => {
    if (!suggestionsBox.classList.contains('open')) {
      const results = await searchFoods(foodInput.value);
      if (results.length > 0) {
        foodInput.dispatchEvent(new Event('input'));
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!row.contains(e.target)) {
      suggestionsBox.classList.remove('open');
    }
  });

  deleteBtn.addEventListener('click', () => onDelete(meal.id));

  return row;
}
