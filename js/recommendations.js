// js/recommendations.js — Понедельные программы тренировок и питания + онлайн-рекомендации из интернета
import { round1 } from './utils.js';

export function buildActivityAndDietPlan(profile) {
  if (!profile) return null;

  const {
    bmi,
    currentWeight,
    isPediatric,
    targetKcal,
    macros,
    currentWeek = 1,
    adaptationCount = 0
  } = profile;

  const waterLiters = round1((currentWeight * 33) / 1000);
  const phaseLabel = currentWeek <= 2
    ? `Неделя ${currentWeek} (Стартовая двухнедельная программа адаптации)`
    : `Неделя ${currentWeek} (Активная фаза прогрессии #${adaptationCount + 1})`;

  let workoutPlan = {};
  let dietStrategy = {};

  if (isPediatric) {
    workoutPlan = {
      phaseLabel,
      title: `Детский и подростковый режим активности (Неделя ${currentWeek})`,
      stepsGoal: `${8000 + Math.min(3000, (currentWeek - 1) * 500)} шагов или 60 мин подвижных игр`,
      cardio: 'Плавание, велосипед, командные игры на свежем воздухе или быстрая прогулка 4–5 раз в неделю по 45–60 минут.',
      strength: 'Упражнения с собственным весом (ОФП, гимнастика, планка, приседания без веса) 2–3 раза в неделю.',
      intensity: 'Умеренная игровая (пульс 120–145 уд/мин).'
    };
    dietStrategy = {
      title: `Сбалансированный рацион для растущего организма (Неделя ${currentWeek})`,
      mealsCount: '4–5 приёмов пищи (3 основных + 1–2 полезных перекуса)',
      principles: [
        'Замена сладких напитков, газировки и кондитерских изделий на цельные сезонные фрукты, ягоды и домашние морсы без сахара.',
        `Обязательный белок (${macros.protein} г/день) в каждый основной приём пищи: индейка, курица, рыба, яйца, творог 5%.`,
        'Сложные углеводы на завтрак и обед (овсянка, гречка, бурый рис, цельнозерновой хлеб) для энергии на учёбе.',
        `Водный режим: ${waterLiters} л чистой воды в течение дня.`
      ]
    };
  } else if (bmi >= 35) {
    // Ожирение II–III степени
    const steps = 6500 + Math.min(4500, (currentWeek - 1) * 700);
    workoutPlan = {
      phaseLabel,
      title: `Щадящий суставной протокол LISS + ЛФК (Неделя ${currentWeek})`,
      stepsGoal: `${steps} шагов в день (без бега и прыжков)`,
      cardio: `Плавание, аквааэробика, горизонтальный велотренажёр или эллипс ${Math.min(5, 3 + Math.floor(currentWeek / 2))} раза в неделю по ${30 + Math.min(20, currentWeek * 3)} минут.`,
      strength: 'Круговая суставная гимнастика и упражнения сидя/лёжа в тренажёрах 2–3 раза в неделю.',
      intensity: 'Низкая, безопасная зона пульса (110–125 уд/мин).'
    };
    dietStrategy = {
      title: `Высокообъёмный рацион низкой калорийной плотности (Неделя ${currentWeek})`,
      mealsCount: '3–4 структурированных приёма пищи',
      principles: [
        'Правило тарелки: половина каждой порции — свежие или тушёные зелёные овощи (брокколи, капуста, огурцы, кабачки, салат).',
        `Постный белок (${macros.protein} г/сут): треска, минтай, филе индейки, куриная грудка, яичные белки, творог до 2%.`,
        'Приготовление без жарки в масле (запекание в рукаве, гриль, на пару, тушение).',
        `Норма воды: ${waterLiters} л в сутки (по 250 мл за 20 минут до еды).`
      ]
    };
  } else if (bmi >= 25) {
    // Предожирение и Ожирение I степени
    const steps = 8500 + Math.min(4500, (currentWeek - 1) * 800);
    workoutPlan = {
      phaseLabel,
      title: `Метаболический протокол: Силовые + Кардио (Неделя ${currentWeek})`,
      stepsGoal: `${steps} шагов ежедневно`,
      cardio: `Ходьба в горку на дорожке (уклон 5–8%), эллипс или быстрый шаг 3–4 раза в неделю по ${35 + Math.min(15, currentWeek * 2)} минут.`,
      strength: 'Силовые тренировки на всё тело (FullBody) 3 раза в неделю по 45–50 минут для сохранения мышц и ускорения обмена веществ.',
      intensity: 'Умеренно-интенсивная (пульс 125–142 уд/мин).'
    };
    dietStrategy = {
      title: `Белково-сбалансированный рацион с ротацией углеводов (Неделя ${currentWeek})`,
      mealsCount: '3–4 приёма пищи с чистыми промежутками по 3.5–4 часа',
      principles: [
        `Повышенная белковая квота (${macros.protein} г/день) для максимальной сытости и защиты мышечной массы.`,
        'Сложные углеводы (гречка, киноа, овсянка, макароны твёрдых сортов) — на завтрак и обед.',
        'Ужин за 3 часа до сна: постная рыба или птица + большая порция овощей и клетчатки без крахмалистых гарниров.',
        `Водный баланс: ${waterLiters} л чистой воды в сутки.`
      ]
    };
  } else {
    // Нормальный вес / рекомпозиция
    const steps = 10000 + Math.min(3000, (currentWeek - 1) * 500);
    workoutPlan = {
      phaseLabel,
      title: `Протокол рекомпозиции и рельефа (Неделя ${currentWeek})`,
      stepsGoal: `${steps} шагов ежедневно`,
      cardio: '2–3 сессии умеренного кардио по 30 минут + 1 интервальная тренировка в неделю.',
      strength: 'Силовой прогрессивный тренинг 3–4 раза в неделю с акцентом на многосуставные упражнения.',
      intensity: 'Средне-высокая (пульс 130–155 уд/мин).'
    };
    dietStrategy = {
      title: `Точный контроль макронутриентов для рекомпозиции (Неделя ${currentWeek})`,
      mealsCount: '3–4 приёма пищи под расписание тренировок',
      principles: [
        `Точное соблюдение целевой калорийности (${targetKcal} ккал) и нормы белка (${macros.protein} г).`,
        `Ненасыщенные жиры (${macros.fat} г/сут): красная рыба, авокадо, орехи, оливковое масло Extra Virgin.`,
        'Контроль скрытых калорий в напитках и соусах, фокус на цельных продуктах.',
        `Водный баланс: ${waterLiters} л в сутки.`
      ]
    };
  }

  return { workoutPlan, dietStrategy, waterLiters };
}

/**
 * Ищет в интернете (Wikipedia REST API + OpenFoodFacts API) актуальные рекомендации
 * и высокобелковые продукты при формировании стартовой программы и при каждом недельном обновлении.
 */
export async function fetchInternetAdaptationAdvice(profile, reasonType, weekNumber = 1) {
  let wikiExcerpt = '';
  let suggestedFoods = [];

  const wikiTopics = [
    'Основной_обмен',
    'Индекс_массы_тела',
    'Физическая_активность',
    'Рациональное_питание'
  ];
  const chosenTopic = wikiTopics[(weekNumber - 1) % wikiTopics.length];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const res = await fetch(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(chosenTopic)}`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.extract) {
        wikiExcerpt = data.extract.slice(0, 240) + '...';
      }
    }
  } catch (_) {
    // Офлайн-резерв
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const searchTerms = weekNumber % 2 === 1 ? 'greek+yogurt+protein' : 'cottage+cheese+tuna';
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${searchTerms}&search_simple=1&action=process&json=1&page_size=4`;
    const res = await fetch(offUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      suggestedFoods = (data.products || [])
        .map(p => p.product_name_ru || p.product_name)
        .filter(Boolean)
        .slice(0, 3);
    }
  } catch (_) {
    // Офлайн-резерв
  }

  let protocolSteps = [];
  if (reasonType === 'initial_start') {
    protocolSteps = [
      `Недели 1–2 (Стартовый план): фиксируйте утренний вес натощак и записывайте все приёмы пищи за день.`,
      `На 8-й день система автоматически сверит динамику веса за первую неделю и сформирует персональный план на Неделю 2.`,
      suggestedFoods.length > 0
        ? `Рекомендованные продукты недели из онлайн-базы OpenFoodFacts: ${suggestedFoods.join(', ')}.`
        : 'Базовая продуктовая корзина на старт: овсяные хлопья, гречка, куриное филе, треска, яйца, творог 2–5% и свежие овощи.'
    ];
  } else if (reasonType === 'plateau' || reasonType === 'weight_gain') {
    protocolSteps = [
      `Неделя ${weekNumber} (Анти-плато): дневная норма шагов увеличена для преодоления адаптивного термогенеза.`,
      `Квота белка повышена для сохранения сухой мышечной массы при снижении калорийности.`,
      `Вечерний приём пищи построен строго вокруг постного белка и зелёных некрахмалистых овощей.`,
      suggestedFoods.length > 0
        ? `Онлайн-подборка продуктов с высоким индексом сытости (OpenFoodFacts): ${suggestedFoods.join(', ')}.`
        : 'Рекомендована ротация белка: белая морская рыба, индейка, морепродукты, яичные белки.'
    ];
  } else {
    protocolSteps = [
      `Неделя ${weekNumber}: калорийность и БЖУ пересчитаны под ваш новый актуальный вес (${profile.currentWeight} кг).`,
      `Поддерживайте целевой коридор шагов и 3 силовые/функциональные тренировки в неделю.`,
      suggestedFoods.length > 0
        ? `Продукты недели из онлайн-каталога OpenFoodFacts: ${suggestedFoods.join(', ')}.`
        : 'Продолжайте придерживаться баланса сложных углеводов в первой половине дня и белково-овощного ужина.'
    ];
  }

  return {
    weekNumber,
    sourceLabel: wikiExcerpt
      ? `Синхронизировано с интернет-источниками (Wikipedia API + OpenFoodFacts) • Неделя ${weekNumber}`
      : `Актуализированный протокол на Неделю ${weekNumber}`,
    wikiNote: wikiExcerpt || 'Регулярный еженедельный пересчёт энергозатрат (TDEE) под меняющуюся массу тела предотвращает остановку прогресса.',
    protocolSteps
  };
}
