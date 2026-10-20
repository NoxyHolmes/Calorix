// js/components/progress-ring.js — SVG-кольцо прогресса калорий с анимацией заполнения
export function renderProgressRing(container, currentKcal, targetKcal) {
  if (!container) return;
  const size = 168;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const safeTarget = Math.max(1, Number(targetKcal) || 2000);
  const current = Math.max(0, Number(currentKcal) || 0);
  const ratio = Math.min(1.15, current / safeTarget);
  const offset = circumference - Math.min(1, ratio) * circumference;

  const isOver = current > safeTarget * 1.05;
  const strokeColor = isOver ? 'var(--danger)' : 'var(--accent)';
  const remaining = safeTarget - current;

  container.innerHTML = `
    <div style="position: relative; width: ${size}px; height: ${size}px; display: grid; place-items: center;">
      <svg width="${size}" height="${size}" style="transform: rotate(-90deg);">
        <circle
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          fill="transparent"
          stroke="var(--bg-elevated)"
          stroke-width="${strokeWidth}"
        />
        <circle
          class="progress-ring-circle"
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          fill="transparent"
          stroke="${strokeColor}"
          stroke-width="${strokeWidth}"
          stroke-linecap="round"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${offset}"
        />
      </svg>
      <div style="position: absolute; text-align: center;">
        <div class="num" style="font-size: 1.45rem; font-weight: 800; color: var(--text-primary);">${current}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary);">из ${safeTarget} ккал</div>
        <div style="font-size: 0.72rem; margin-top: 2px; font-weight: 600; color: ${isOver ? 'var(--danger)' : 'var(--accent)'};">
          ${remaining >= 0 ? `Осталось: ${remaining}` : `Превышение: +${Math.abs(remaining)}`}
        </div>
      </div>
    </div>
  `;
}
