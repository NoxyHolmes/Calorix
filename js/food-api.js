// js/food-api.js — Поиск продуктов: Open Food Facts API + USDA FoodData Central + локальный fallback
import { round1 } from './utils.js';

let fallbackFoodsCache = null;

export async function loadFallbackFoods() {
  if (fallbackFoodsCache) return fallbackFoodsCache;
  try {
    const res = await fetch('./data/foods-fallback.json');
    if (!res.ok) throw new Error('Failed to load fallback json');
    fallbackFoodsCache = await res.json();
  } catch (e) {
    fallbackFoodsCache = [
      { id: 'fb_def_1', name: 'Овсяная каша на воде', kcal100: 88, p100: 3.0, f100: 1.7, c100: 15.0 },
      { id: 'fb_def_2', name: 'Куриная грудка отварная', kcal100: 165, p100: 31.0, f100: 3.6, c100: 0.0 },
      { id: 'fb_def_3', name: 'Яйцо куриное варёное', kcal100: 155, p100: 12.6, f100: 10.6, c100: 1.1 }
    ];
  }
  return fallbackFoodsCache;
}

export async function searchFoods(query) {
  const q = String(query || '').trim().toLowerCase();
  const fallback = await loadFallbackFoods();

  const localMatches = fallback.filter(item =>
    item.name.toLowerCase().includes(q)
  ).map(item => ({ ...item, source: 'Локальная база' }));

  if (!q || q.length < 2) {
    return localMatches.slice(0, 12);
  }

  // Запрос к Open Food Facts API с таймаутом 3.5 сек
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      const apiItems = (data.products || [])
        .filter(p => p.product_name && p.nutriments)
        .map(p => {
          const n = p.nutriments;
          const kcal = Math.round(Number(n['energy-kcal_100g'] || (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0)) || 0);
          return {
            id: `off_${p.code || Math.random().toString(36).slice(2, 7)}`,
            name: p.product_name_ru || p.product_name,
            kcal100: kcal,
            p100: round1(n.proteins_100g || 0),
            f100: round1(n.fat_100g || 0),
            c100: round1(n.carbohydrates_100g || 0),
            source: 'Open Food Facts'
          };
        })
        .filter(item => item.kcal100 > 0);

      if (apiItems.length > 0) {
        return [...localMatches, ...apiItems].slice(0, 15);
      }
    }
  } catch (_) {
    // При отсутствии интернета или блокировке возвращаем резервную базу + USDA fallback
  }

  // Резервный поиск через публичный демо-ключ USDA FoodData Central
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(q)}&pageSize=6`;
    const res = await fetch(usdaUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const usdaItems = (data.foods || []).map(f => {
        const getNutr = (id) => {
          const found = (f.foodNutrients || []).find(n => n.nutrientId === id);
          return found ? found.value : 0;
        };
        return {
          id: `usda_${f.fdcId}`,
          name: f.description,
          kcal100: Math.round(getNutr(1008)),
          p100: round1(getNutr(1003)),
          f100: round1(getNutr(1004)),
          c100: round1(getNutr(1005)),
          source: 'USDA'
        };
      }).filter(i => i.kcal100 > 0);

      return [...localMatches, ...usdaItems].slice(0, 15);
    }
  } catch (_) {
    // Fallback
  }

  return localMatches.slice(0, 15);
}
