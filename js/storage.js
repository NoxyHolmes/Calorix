// js/storage.js — Хранение данных в IndexedDB + тема в localStorage + экспорт/импорт JSON + полный сброс
const DB_NAME = 'NutriAdaptDB';
const DB_VERSION = 1;

let dbPromise = null;

export function initDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meals')) {
        const mealStore = db.createObjectStore('meals', { keyPath: 'id' });
        mealStore.createIndex('by_date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('weights')) {
        db.createObjectStore('weights', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('adaptations')) {
        db.createObjectStore('adaptations', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function txStore(storeName, mode = 'readonly') {
  const db = await initDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

export async function saveProfile(profileData) {
  const store = await txStore('profile', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ ...profileData, id: 'main' });
    req.onsuccess = () => resolve(profileData);
    req.onerror = () => reject(req.error);
  });
}

export async function getProfile() {
  const store = await txStore('profile', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get('main');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMeal(meal) {
  const store = await txStore('meals', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(meal);
    req.onsuccess = () => resolve(meal);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMeal(mealId) {
  const store = await txStore('meals', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(mealId);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllMeals() {
  const store = await txStore('meals', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveWeightEntry(entry) {
  const store = await txStore('weights', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(entry);
    req.onsuccess = () => resolve(entry);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllWeights() {
  const store = await txStore('weights', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => a.date.localeCompare(b.date));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveAdaptationLog(logItem) {
  const store = await txStore('adaptations', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(logItem);
    req.onsuccess = () => resolve(logItem);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllAdaptationLogs() {
  const store = await txStore('adaptations', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => b.date.localeCompare(a.date));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllDatabase() {
  const db = await initDB();
  const tx = db.transaction(['profile', 'meals', 'weights', 'adaptations'], 'readwrite');
  tx.objectStore('profile').clear();
  tx.objectStore('meals').clear();
  tx.objectStore('weights').clear();
  tx.objectStore('adaptations').clear();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function exportFullDatabaseJSON() {
  const [profile, meals, weights, adaptations] = await Promise.all([
    getProfile(),
    getAllMeals(),
    getAllWeights(),
    getAllAdaptationLogs()
  ]);
  return JSON.stringify({
    app: 'NutriAdapt',
    version: 2,
    exportedAt: new Date().toISOString(),
    profile,
    meals,
    weights,
    adaptations
  }, null, 2);
}

export async function importFullDatabaseJSON(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Некорректный формат JSON файла.');
  }
  const db = await initDB();
  const tx = db.transaction(['profile', 'meals', 'weights', 'adaptations'], 'readwrite');

  tx.objectStore('profile').clear();
  tx.objectStore('meals').clear();
  tx.objectStore('weights').clear();
  tx.objectStore('adaptations').clear();

  if (parsed.profile) {
    tx.objectStore('profile').put({ ...parsed.profile, id: 'main' });
  }
  if (Array.isArray(parsed.meals)) {
    for (const m of parsed.meals) tx.objectStore('meals').put(m);
  }
  if (Array.isArray(parsed.weights)) {
    for (const w of parsed.weights) tx.objectStore('weights').put(w);
  }
  if (Array.isArray(parsed.adaptations)) {
    for (const a of parsed.adaptations) tx.objectStore('adaptations').put(a);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export function getSavedTheme() {
  return localStorage.getItem('nutriadapt_theme') || 'light';
}

export function saveTheme(theme) {
  localStorage.setItem('nutriadapt_theme', theme);
}
