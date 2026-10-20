// js/charts.js — Встроенные интерактивные SVG-графики динамики веса и калорий (работают 100% офлайн на GitHub Pages)
import { getState } from './state.js';
import { formatShortDateRU } from './utils.js';
import { getDayTotals } from './diary.js';

let currentRangeDays = 14;

export function initChartsModule() {
  const rangeBtns = document.querySelectorAll('.chart-range-btn');
  rangeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      rangeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRangeDays = Number(btn.dataset.days) || 14;
      renderAllCharts();
    });
  });
}

export function renderAllCharts() {
  renderWeightTrendChart();
  renderCaloriesBarChart();
}

function renderWeightTrendChart() {
  const container = document.getElementById('weight-chart-container');
  if (!container) return;

  const { weightHistory, profile } = getState();
  const sorted = [...weightHistory].slice(-currentRangeDays);

  if (sorted.length === 0) {
    container.innerHTML = `<p style="padding:28px; text-align:center; color:var(--text-muted);">Нет записей веса. Добавьте утреннее взвешивание или укажите вес до еды в дневнике.</p>`;
    return;
  }

  const width = 560;
  const height = 210;
  const padLeft = 44;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 34;

  const weights = sorted.map(d => Number(d.weight));
  if (profile && profile.targetWeight) {
    weights.push(Number(profile.targetWeight));
  }

  const minW = Math.floor(Math.min(...weights) - 1);
  const maxW = Math.ceil(Math.max(...weights) + 1);
  const rangeW = Math.max(1, maxW - minW);

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const points = sorted.map((item, idx) => {
    const x = padLeft + (sorted.length === 1 ? plotW / 2 : (idx / (sorted.length - 1)) * plotW);
    const y = padTop + plotH - ((Number(item.weight) - minW) / rangeW) * plotH;
    return { x, y, ...item };
  });

  const polylinePoints = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  let targetLineSvg = '';
  if (profile && profile.targetWeight) {
    const ty = padTop + plotH - ((Number(profile.targetWeight) - minW) / rangeW) * plotH;
    targetLineSvg = `
      <line x1="${padLeft}" y1="${ty}" x2="${width - padRight}" y2="${ty}" stroke="var(--warning)" stroke-dasharray="5,5" stroke-width="1.5" />
      <text x="${width - padRight - 4}" y="${ty - 5}" text-anchor="end" fill="var(--warning)" font-size="10" font-weight="600">Цель: ${profile.targetWeight} кг</text>
    `;
  }

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; overflow:visible;">
      <!-- Горизонтальная сетка -->
      <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" stroke="var(--border)" stroke-width="1" />
      <text x="${padLeft - 6}" y="${padTop + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${maxW} кг</text>

      <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="var(--border)" stroke-width="1" />
      <text x="${padLeft - 6}" y="${padTop + plotH + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${minW} кг</text>

      ${targetLineSvg}

      ${points.length > 1 ? `<polyline fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}" />` : ''}

      ${points.map(p => `
        <g>
          <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="var(--bg-surface)" stroke="var(--accent)" stroke-width="2.5" />
          <text x="${p.x}" y="${p.y - 9}" text-anchor="middle" fill="var(--text-primary)" font-size="10" font-weight="700">${p.weight}</text>
          <text x="${p.x}" y="${height - 10}" text-anchor="middle" fill="var(--text-muted)" font-size="9.5">${formatShortDateRU(p.date)}</text>
        </g>
      `).join('')}
    </svg>
  `;
}

function renderCaloriesBarChart() {
  const container = document.getElementById('calories-chart-container');
  if (!container) return;

  const { profile } = getState();
  const targetKcal = profile ? Number(profile.targetKcal) : 2000;

  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const totals = getDayTotals(iso);
    days.push({ date: iso, kcal: totals.kcal });
  }

  const width = 560;
  const height = 200;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 24;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxKcal = Math.max(targetKcal * 1.25, ...days.map(d => d.kcal), 1500);
  const targetY = padTop + plotH - (targetKcal / maxKcal) * plotH;

  const barSlot = plotW / days.length;
  const barWidth = Math.min(36, barSlot * 0.58);

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto;">
      <line x1="${padLeft}" y1="${targetY}" x2="${width - padRight}" y2="${targetY}" stroke="var(--accent)" stroke-dasharray="4,4" stroke-width="1.5" />
      <text x="${padLeft - 6}" y="${targetY + 3}" text-anchor="end" fill="var(--accent)" font-size="10" font-weight="700">${targetKcal}</text>

      ${days.map((d, i) => {
        const bh = (d.kcal / maxKcal) * plotH;
        const x = padLeft + i * barSlot + (barSlot - barWidth) / 2;
        const y = padTop + plotH - bh;
        const isOver = d.kcal > targetKcal * 1.05;
        const fill = d.kcal === 0 ? 'var(--border)' : (isOver ? 'var(--danger)' : 'var(--accent)');
        return `
          <g>
            <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(3, bh)}" rx="5" fill="${fill}" />
            <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" fill="var(--text-primary)" font-size="9.5" font-weight="600">${d.kcal > 0 ? d.kcal : ''}</text>
            <text x="${x + barWidth / 2}" y="${height - 10}" text-anchor="middle" fill="var(--text-muted)" font-size="10">${formatShortDateRU(d.date)}</text>
          </g>
        `;
      }).join('')}
    </svg>
  `;
}
