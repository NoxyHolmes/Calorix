// js/utils.js — Даты, форматирование, валидация, генерация ID
export function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentTimeHHMM() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatDateRU(isoDate) {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function formatShortDateRU(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}`;
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function round1(num) {
  return Math.round((Number(num) + Number.EPSILON) * 10) / 10;
}

export function validateTimeHHMM(val) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(val).trim());
}

export function validateProfileInput({ age, gender, height, currentWeight, targetWeight, activity, deficitPct }) {
  const errors = {};
  const ageNum = Number(age);
  const heightNum = Number(height);
  const weightNum = Number(currentWeight);
  const targetNum = Number(targetWeight);
  const defNum = Number(deficitPct);

  if (!Number.isFinite(ageNum) || ageNum < 6 || ageNum > 50) {
    errors.age = 'Возраст должен быть строго от 6 до 50 лет.';
  }
  if (!['male', 'female'].includes(gender)) {
    errors.gender = 'Выберите пол.';
  }
  if (!Number.isFinite(heightNum) || heightNum < 90 || heightNum > 230) {
    errors.height = 'Рост должен быть в пределах 90–230 см.';
  }
  if (!Number.isFinite(weightNum) || weightNum < 15 || weightNum > 300) {
    errors.currentWeight = 'Текущий вес должен быть в пределах 15–300 кг.';
  }
  if (!Number.isFinite(targetNum) || targetNum < 15 || targetNum > 300) {
    errors.targetWeight = 'Целевой вес должен быть в пределах 15–300 кг.';
  }
  if (Number.isFinite(weightNum) && Number.isFinite(targetNum) && targetNum > weightNum) {
    errors.targetWeight = 'Для программы снижения веса целевой вес должен быть меньше или равен текущему.';
  }
  if (!Number.isFinite(defNum) || defNum < 5 || defNum > 30) {
    errors.deficitPct = 'Процент дефицита должен быть от 5% до 30%.';
  }
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
