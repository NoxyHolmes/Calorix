// js/state.js — Глобальное реактивное состояние и подписки (Pub/Sub)
const listeners = new Set();

const state = {
  profile: null,
  selectedDate: null,
  mealsByDate: {},    // { 'YYYY-MM-DD': [mealObj, ...] }
  weightHistory: [],  // [{ date: 'YYYY-MM-DD', weight: 75.4, source: 'morning'|'meal' }, ...]
  adaptationLogs: [], // [{ id, date, reason, oldKcal, newKcal, details }]
  theme: 'light'
};

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  notify();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) {
    fn(state);
  }
}
