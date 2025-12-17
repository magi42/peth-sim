const sessionsEl = document.getElementById('sessions');
const addSessionBtn = document.getElementById('add-session');
const form = document.getElementById('sim-form');
const { simulate: runSim, toUmol: toUmolFn } = window.SimModel;
const calcModal = document.getElementById('calc-modal');
const calcForm = document.getElementById('calc-form');
const calcClose = document.getElementById('calc-close');
const sessionModal = document.getElementById('session-modal');
const sessionForm = document.getElementById('session-form');
const sessionClose = document.getElementById('session-close');
const useEndTimeCheckbox = document.getElementById('use-end-time');
const paramsModal = document.getElementById('params-modal');
const paramsForm = document.getElementById('params-form');
const paramsClose = document.getElementById('params-close');
const langSelect = document.getElementById('lang-select');
const langFlag = document.getElementById('lang-flag');
const bacUnitSelect = document.getElementById('bac-unit');
const drinkList = document.getElementById('drink-list');
const addDrinkBtn = document.getElementById('add-drink');
let activeGramsInput = null;

let currentLang = detectLang();
let lastResult = null;
let sessionIdCounter = 0;
let windowMode = (document.querySelector('input[name="window-mode"]:checked')?.value) || '3d';

const defaultSessions = [
  { start: '2025-01-01T17:00', end: '2025-01-01T21:00', ml: 10*1*70*0.38, useEndTime: true }, // One 70 cL of 38% Kossu
  { start: '2025-01-02T10:00', end: '2025-01-02T14:00', ml: 10*3*50*0.08, useEndTime: true }  // Three big cans of 8% beers for hangover
];

const MEAL_PROFILES = {
  empty: { factor: 1.0, labelKey: 'mealEmpty' },
  light: { factor: 0.8, labelKey: 'mealLight' },
  mixed: { factor: 0.6, labelKey: 'mealMixed' },
  heavy: { factor: 0.45, labelKey: 'mealHeavy' },
};

function createSessionRow(session) {
  const absProfile = session.absProfile || 'empty';
  const useEndTime = session.useEndTime !== false;
  const wrapper = document.createElement('div');
  wrapper.className = 'session-row';
  wrapper.id = `session-${++sessionIdCounter}`;
  wrapper.dataset.useEndTime = useEndTime ? 'true' : 'false';
  wrapper.innerHTML = `
    <div>
      <label data-i18n="start">Start</label>
      <input type="datetime-local" class="start" value="${session.start}" required />
    </div>
    <div>
      <label data-i18n="end">End</label>
      <input type="datetime-local" class="end" value="${session.end || ''}" ${useEndTime ? '' : 'disabled'} ${useEndTime ? 'required' : ''} />
    </div>
    <div style="min-width:120px;">
      <label data-i18n="ethanolLabel">${translations[currentLang].ethanolLabel}</label>
      <div class="ethanol-input">
        <input type="number" class="grams" min="0.1" step="0.1" value="${session.ml}" required />
        <button type="button" class="calc-grams" aria-label="Calculate mL from volume and %">${translations[currentLang].calcBtn}</button>
      </div>
    </div>
    <div class="meal-row">
      <div class="meal-select">
        <label data-i18n="absProfileLabel">${translations[currentLang].absProfileLabel || 'Meal / stomach state'}</label>
        <select class="abs-profile">
          <option value="empty"${absProfile === 'empty' ? ' selected' : ''}>${translations[currentLang].mealEmpty}</option>
          <option value="light"${absProfile === 'light' ? ' selected' : ''}>${translations[currentLang].mealLight}</option>
          <option value="mixed"${absProfile === 'mixed' ? ' selected' : ''}>${translations[currentLang].mealMixed}</option>
          <option value="heavy"${absProfile === 'heavy' ? ' selected' : ''}>${translations[currentLang].mealHeavy}</option>
        </select>
      </div>
      <div class="session-actions">
        <button type="button" class="session-options-btn" aria-label="Session options">…</button>
        <button type="button" class="remove-session" aria-label="Remove session">✕</button>
      </div>
    </div>
  `;
  const removeBtn = wrapper.querySelector('.remove-session');
  if (removeBtn) removeBtn.addEventListener('click', () => wrapper.remove());
  wrapper.querySelector('.calc-grams').addEventListener('click', () => openCalcModal(wrapper.querySelector('.grams')));
  const optsBtn = wrapper.querySelector('.session-options-btn');
  if (optsBtn) optsBtn.addEventListener('click', () => openSessionModal(wrapper));
  sessionsEl.appendChild(wrapper);
}

defaultSessions.forEach(createSessionRow);
createDrinkRow();

addSessionBtn.addEventListener('click', () => {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  createSessionRow({ start: toInputValue(start), end: toInputValue(end), ml: 40 });
});

addDrinkBtn.addEventListener('click', () => createDrinkRow());

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const params = getParams();
  const result = runSim(params);
  render(result);
});

document.getElementById('more-params').addEventListener('click', () => {
  paramsModal.classList.remove('hidden');
  document.getElementById('time-step').focus();
});

paramsClose.addEventListener('click', () => {
  paramsModal.classList.add('hidden');
});

paramsModal.addEventListener('click', (e) => {
  if (e.target === paramsModal) paramsModal.classList.add('hidden');
});

paramsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  paramsModal.classList.add('hidden');
});

sessionClose.addEventListener('click', () => {
  sessionModal.classList.add('hidden');
  sessionModal.dataset.target = '';
});
sessionModal.addEventListener('click', (e) => {
  if (e.target === sessionModal) {
    sessionModal.classList.add('hidden');
    sessionModal.dataset.target = '';
  }
});
sessionForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const targetId = sessionModal.dataset.target;
  if (targetId) {
    const row = document.getElementById(targetId);
    if (row) {
      const endInput = row.querySelector('.end');
      const useEnd = useEndTimeCheckbox.checked;
      row.dataset.useEndTime = useEnd ? 'true' : 'false';
      if (endInput) {
        endInput.required = useEnd;
        endInput.disabled = !useEnd;
      }
    }
  }
  sessionModal.classList.add('hidden');
  sessionModal.dataset.target = '';
});

langSelect.addEventListener('change', () => {
  applyTranslations(langSelect.value);
});
bacUnitSelect.addEventListener('change', () => {
  const result = lastResult || runSim(getParams());
  render(result);
});
const windowRadios = document.querySelectorAll('input[name="window-mode"]');
windowRadios.forEach((radio) => {
  radio.addEventListener('change', (e) => {
    windowMode = e.target.value;
    const result = lastResult || runSim(getParams());
    render(result);
  });
});
const absorptionCheckbox = document.getElementById('absorption-enabled');
if (absorptionCheckbox) {
  absorptionCheckbox.addEventListener('change', () => {
    toggleMealSelects(absorptionCheckbox.checked);
  });
}

function toInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function openSessionModal(row) {
  sessionModal.dataset.target = row.id || '';
  const useEnd = row.dataset.useEndTime !== 'false';
  useEndTimeCheckbox.checked = useEnd;
  sessionModal.classList.remove('hidden');
  useEndTimeCheckbox.focus();
}

function mealLabel(key) {
  const t = translations[currentLang] || translations.en;
  const map = {
    empty: t.mealEmpty,
    light: t.mealLight,
    mixed: t.mealMixed,
    heavy: t.mealHeavy,
  };
  return map[key] || key;
}

function toggleMealSelects(enabled) {
  document.querySelectorAll('.abs-profile').forEach((el) => {
    el.disabled = !enabled;
  });
}

function getParams() {
  const sex = document.getElementById('sex').value;
  const weight = parseFloat(document.getElementById('weight').value);
  const age = parseInt(document.getElementById('age').value, 10);
  const decayHalfLifeDays = parseFloat(document.getElementById('peth-half-life').value) || 4.5;
  const formationRate = parseFloat(document.getElementById('formation-rate').value) || 11.3;
  const stepMinutes = parseFloat(document.getElementById('time-step').value) || 5;
  const absorptionEnabled = document.getElementById('absorption-enabled').checked;
  const useBloodWater = document.getElementById('use-blood-water').checked;
  const sessions = Array.from(sessionsEl.querySelectorAll('.session-row')).map((row) => {
    const start = new Date(row.querySelector('.start').value);
    const endInput = row.querySelector('.end');
    const useEndTime = row.dataset.useEndTime !== 'false';
    const end = endInput && endInput.value ? new Date(endInput.value) : null;
    const ml = parseFloat(row.querySelector('.grams').value);
    const grams = mlToGrams(ml);
    const select = row.querySelector('.abs-profile');
    const absProfile = select ? select.value : 'empty';
    const absFactor = (MEAL_PROFILES[absProfile] && MEAL_PROFILES[absProfile].factor) || 1;
    return { start, end, grams, ml, absProfile, absFactor, useEndTime };
  }).filter((s) => !Number.isNaN(s.start.getTime()) && s.grams > 0.0 && (!s.useEndTime || (s.end && !Number.isNaN(s.end.getTime()) && s.end > s.start)));
  return { sex, weight, age, sessions, decayHalfLifeDays, stepMinutes, formationRateNgPerMlPerHourAt1Permille: formationRate, absorptionEnabled, useBloodWater };
}

function render(result) {
  if (!result) return;
  lastResult = result;
  const t = translations[currentLang] || translations.en;
  const unit = bacUnitSelect.value || 'permille';
  const { timeline } = result;
  const peakBACPermille = Math.max(...timeline.map((t) => t.bac));
  const peakBAC = convertBac(peakBACPermille, unit);
  const thresholdPermille = 0.5;
  const thresholdConverted = convertBac(thresholdPermille, unit);
  const timeOver = timeline.filter((t) => t.bac >= thresholdPermille).length * 5; // minutes
  const peakPEthUmol = Math.max(...timeline.map((t) => toUmolFn(t.pethNgMl)));

  document.getElementById('peak-bac').textContent = formatBac(peakBAC, unit);
  const thresholdLabel = formatBac(thresholdConverted, unit);
  document.getElementById('time-over-label').textContent = `${t.statTimeOver} ${thresholdLabel}`;
  document.getElementById('time-over').textContent = `${(timeOver / 60).toFixed(1)} h`;
  document.getElementById('peak-peth').textContent = `${peakPEthUmol.toFixed(3)} µmol/L`;

  const bacPoints = timeline.map((t) => ({ x: t.time, y: convertBac(t.bac, unit) }));
  const pethPoints = timeline.map((t) => ({ x: t.time, y: toUmolFn(t.pethNgMl) }));

  // Calculate time range of the simulation until PEth drops below 0.05 µmol/L
  const times = timeline.map((p) => p.time.getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const totalMs = Math.max(1, maxT - minT);

  // How much of that time to show based on window mode
  const visibleMs = windowMode === '3d' ? Math.min(totalMs, 72 * 60 * 60 * 1000) : totalMs;

  // If the visible range is smaller than total, we need to scale up the width
  const widthFactor = Math.max(1, Math.min(10, totalMs / visibleMs));

  // Keep the fraction of scroll position when re-rendering
  const bacScroll = document.getElementById('bac-scroll');
  const pethScroll = document.getElementById('peth-scroll');
  const baseWidth = (wrap) => (wrap?.clientWidth || wrap?.getBoundingClientRect?.().width || 600);
  const keepFrac = (bacScroll && bacScroll.scrollWidth > bacScroll.clientWidth) ?
                   bacScroll.scrollLeft / (bacScroll.scrollWidth - bacScroll.clientWidth) : 0;

  // The wrapper widths need to be adjusted as fixed to allow scrolling
  const wrapperWidth = baseWidth(bacScroll) || 600;
  document.getElementById('bac-scroll').style.width = `${wrapperWidth}px`;
  document.getElementById('peth-scroll').style.width = `${wrapperWidth}px`;

  const bacOptions = { color: '#1c7ed6', yLabel: unitLabel(unit), warning: convertBac(0.5, unit), valueFormatter: (v) => formatBac(v, unit), axisLabel: t.axisTime, axisTick: 1.0, showHours: windowMode === '3d' };
  const pethOptions = { color: '#f59f00', yLabel: 'µmol/L', warning: .3, valueFormatter: (v) => `${v.toFixed(4)} µmol/L`, axisLabel: t.axisTime, axisTick: 0.1 };

  const bacDesired = wrapperWidth * widthFactor;
  const pethDesired = wrapperWidth * widthFactor;
  drawChart(document.getElementById('bac-chart'), bacPoints, bacOptions, null, bacDesired);
  drawChart(document.getElementById('peth-chart'), pethPoints, pethOptions, null, pethDesired);

  enableHover(document.getElementById('bac-chart'), bacPoints, bacOptions, bacDesired);
  enableHover(document.getElementById('peth-chart'), pethPoints, pethOptions, pethDesired);

  const setScrollFrac = (wrap, frac) => {
    if (!wrap)
      return;
    const max = wrap.scrollWidth - wrap.clientWidth;
    if (max > 0)
      wrap.scrollLeft = frac * max;
    else
      wrap.scrollLeft = 0;
  };
  setScrollFrac(bacScroll, keepFrac);
  setScrollFrac(pethScroll, keepFrac);

  // sync scrollbars
  let syncing = false;
  const sync = (source, target) => {
    if (!source || !target) return;
    const maxS = source.scrollWidth - source.clientWidth;
    const frac = maxS > 0 ? source.scrollLeft / maxS : 0;
    const maxT = target.scrollWidth - target.clientWidth;
    syncing = true;
    target.scrollLeft = frac * maxT;
    syncing = false;
  };
  [bacScroll, pethScroll].forEach((el) => {
    if (el && !el._syncAttached) {
      el.addEventListener('scroll', () => {
        if (syncing) return;
        if (el === bacScroll) sync(bacScroll, pethScroll);
        else sync(pethScroll, bacScroll);
      });
      el._syncAttached = true;
    }
  });

  const note = t.modelNote({
    r: result.params.r.toFixed(2),
    elim: result.params.elimPermillePerHour.toFixed(2),
    form: result.params.formationRateNgPerMlPerHourAt1Permille,
    half: result.params.decayHalfLifeDays.toFixed(2),
    step: result.params.stepMinutes.toFixed(0),
  });
  document.getElementById('model-note').textContent = note;
}

function drawChart(canvas, points, { color, yLabel, warning, valueFormatter, axisLabel, axisTick, showHours }, highlight, desiredWidth) {
  const { ctx, w, h } = ensureCanvasSize(canvas, desiredWidth);
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  if (!points.length) {
    ctx.restore();
    return;
  }

  const padding = { l: 55, r: 14, t: 12, b: 40 };
  const times = points.map((p) => p.x.getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const values = points.map((p) => p.y);
  const minY = 0;
  const maxY = Math.max(Math.max(...values) * 1.1, warning ? warning * 1.4 : 0.1);

  const scaleX = (t) => padding.l + ((t - minT) / (maxT - minT || 1)) * (w - padding.l - padding.r);
  const scaleY = (v) => h - padding.b - ((v - minY) / (maxY - minY || 1)) * (h - padding.t - padding.b);

  // Day ticks at midnight boundaries
  const midnightTicks = [];
  const firstMidnight = new Date(minT);
  firstMidnight.setHours(0, 0, 0, 0);
  if (firstMidnight.getTime() < minT) firstMidnight.setDate(firstMidnight.getDate() + 1);
  for (let t = firstMidnight.getTime(); t <= maxT; t += 24 * 60 * 60 * 1000) {
    midnightTicks.push(t);
  }
  // Hour ticks for short window
  const hourTicks = [];
  if (highlight?.showHours || showHours) {
    const firstHour = Math.ceil(minT / (60 * 60 * 1000)) * 60 * 60 * 1000;
    for (let t = firstHour; t <= maxT; t += 60 * 60 * 1000) {
      hourTicks.push(t);
    }
  }

  // Horizontal grid lines
  ctx.strokeStyle = '#e6ecf4';
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  const baseLines = 5;
  const tickStep = axisTick || (maxY / (baseLines || 1));
  const gridLines = Math.max(baseLines, Math.ceil(maxY / (tickStep || 1)));
  ctx.fillStyle = '#6c7585';
  ctx.font = '12px var(--sans)';
  for (let i = 0; i <= gridLines; i++) {
    const tick = i * tickStep;
    const y = scaleY(tick);
    ctx.beginPath();
    ctx.moveTo(padding.l, y);
    ctx.lineTo(w - padding.r, y);
    ctx.stroke();

    // Grid line label. If goes all up, would overlap with the axis label.
    if (i < gridLines-1) {
      ctx.fillText(tick.toFixed(2), padding.l - 6, y + 4);
    }
  }

  // Vertical midnight ticks
  if (midnightTicks.length) {
    ctx.strokeStyle = '#cdd1d6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    midnightTicks.forEach((t) => {
      const x = scaleX(t);
      ctx.moveTo(x, padding.t);
      ctx.lineTo(x, h - padding.b);
    });
    ctx.stroke();
  }
  // Hour ticks
  if (hourTicks.length) {
    ctx.strokeStyle = '#f4f6fa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    hourTicks.forEach((t) => {
      const x = scaleX(t);
      ctx.moveTo(x, padding.t);
      ctx.lineTo(x, h - padding.b);
    });
    ctx.stroke();
  }

  if (warning) {
    ctx.strokeStyle = 'rgba(214,40,57,0.5)';
    ctx.setLineDash([4, 4]);
    const y = scaleY(warning);
    ctx.beginPath();
    ctx.moveTo(padding.l, y);
    ctx.lineTo(w - padding.r, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // The graph line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = scaleX(p.x.getTime());
    const y = scaleY(p.y);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Axes
  ctx.strokeStyle = '#9aa9bc';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(padding.l, padding.t);
  ctx.lineTo(padding.l, h - padding.b);
  ctx.lineTo(w - padding.r, h - padding.b);
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#4a5667';
  ctx.font = '12px var(--sans)';
  ctx.fillText(yLabel, 40, padding.t + 6);
  ctx.textAlign = 'center';
  ctx.fillText(axisLabel || 'Time', w / 2, h - 8);

  // Ticks on x
  ctx.fillStyle = '#6c7585';
  const tickCount = 6;
  if (midnightTicks.length) {
    ctx.fillStyle = '#4c5663';
    ctx.font = '11px var(--sans)';
    midnightTicks.forEach((t) => {
      const d = new Date(t);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      ctx.fillText(label, scaleX(t), h - padding.b + 15);
    });
  }

  // Shown when hovering
  if (highlight) {
    const x = scaleX(highlight.point.x.getTime());
    const y = scaleY(highlight.point.y);

    // marker
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();

    // tooltip
    const text = `${highlight.value} @ ${highlight.time}`;
    ctx.font = '12px var(--sans)';
    const paddingBox = 6;
    const textWidth = ctx.measureText(text).width;
    const boxW = textWidth + paddingBox * 2;
    const boxH = 22;
    const boxX = Math.min(Math.max(x - boxW / 2, padding.l), w - padding.r - boxW);
    const boxY = padding.t + 6;
    ctx.fillStyle = 'rgba(29,39,51,0.9)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    const prevAlign = ctx.textAlign;
    const prevBaseline = ctx.textBaseline;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, boxX + boxW / 2, boxY + boxH / 2);
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBaseline;
  }
  ctx.restore();
}

// Kick off initial render
render(runSim(getParams()));

function openCalcModal(targetInput) {
  activeGramsInput = targetInput;
  calcModal.classList.remove('hidden');
  const vol = document.getElementById('calc-volume');
  if (vol) vol.focus();
}

function closeCalcModal() {
  calcModal.classList.add('hidden');
  activeGramsInput = null;
}

calcForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!activeGramsInput) {
    closeCalcModal();
    return;
  }
  const pureMl = calcPureMl();
  if (pureMl <= 0) {
    closeCalcModal();
    return;
  }
  activeGramsInput.value = pureMl.toFixed(1);
  closeCalcModal();
});

calcClose.addEventListener('click', closeCalcModal);
calcModal.addEventListener('click', (e) => {
  if (e.target === calcModal) closeCalcModal();
});

// Ensure any legacy tab handlers are no-ops; tabs were removed.

function createDrinkRow(type = 'beer', qty = 1) {
  const row = document.createElement('div');
  row.className = 'drink-row';
  const options = [
    { value: 'beer', label: drinkLabel('beer') },
    { value: 'beer05', label: drinkLabel('beer05') },
    { value: 'beerStrong', label: drinkLabel('beerStrong') },
    { value: 'cider', label: drinkLabel('cider') },
    { value: 'wine', label: drinkLabel('wine') },
    { value: 'wine16', label: drinkLabel('wine16') },
    { value: 'wineBottle75', label: drinkLabel('wineBottle75') },
    { value: 'wineBottle100', label: drinkLabel('wineBottle100') },
    { value: 'wineCan200', label: drinkLabel('wineCan200') },
    { value: 'wineCan300', label: drinkLabel('wineCan300') },
    { value: 'longdrink', label: drinkLabel('longdrink') },
    { value: 'bottle05', label: drinkLabel('bottle05') },
    { value: 'bottle07', label: drinkLabel('bottle07') },
    { value: 'bottle10', label: drinkLabel('bottle10') },
  ];
  const preset = drinkPreset(type);
  row.innerHTML = `
    <select class="drink-type">
      ${options.map((o, idx) => `<option value="${o.value}" id="opt-row-${o.value}-${idx}">${o.label}</option>`).join('')}
    </select>
    <input type="number" class="drink-count" min="0" step="1" value="1" aria-label="${(translations[currentLang] || translations.en).calcStdQty}" />
    <input type="number" class="drink-vol" min="0" step="0.1" value="${preset.volCl.toFixed(1)}" aria-label="${(translations[currentLang] || translations.en).calcStdQty}" />
    <input type="number" class="drink-abv" min="0" max="100" step="0.1" value="${preset.abv.toFixed(1)}" aria-label="${(translations[currentLang] || translations.en).calcShotAbv}" />
    <div class="drink-doses">0 ${(translations[currentLang] || translations.en).calcDoses || 'doses'}</div>
    <button type="button" class="remove-drink" aria-label="Remove drink">✕</button>
  `;
  row.querySelector('.drink-type').value = type;
  row.querySelector('.remove-drink').addEventListener('click', () => { row.remove(); updateCalcTotal(); });
  row.querySelector('.drink-type').addEventListener('change', (e) => {
    const p = drinkPreset(e.target.value);
    const vol = row.querySelector('.drink-vol');
    const abv = row.querySelector('.drink-abv');
    if (vol) vol.value = p.volCl.toFixed(1);
    if (abv) abv.value = p.abv.toFixed(1);
    updateCalcTotal();
  });
  ['.drink-count', '.drink-vol', '.drink-abv'].forEach((sel) => {
    const el = row.querySelector(sel);
    if (el) {
      el.addEventListener('input', updateCalcTotal);
      el.addEventListener('blur', updateCalcTotal);
    }
  });
  drinkList.appendChild(row);
  updateCalcTotal();
}

function enableHover(canvas, points, options, desiredWidth) {
  if (!points.length) return;
  if (canvas._hoverCleanup) {
    canvas._hoverCleanup();
  }
  const handler = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const xPos = evt.clientX - rect.left;
    const w = rect.width || canvas.clientWidth || canvas.width;
    const padding = { l: 45, r: 14, t: 12, b: 28 };
    const minT = Math.min(...points.map((p) => p.x.getTime()));
    const maxT = Math.max(...points.map((p) => p.x.getTime()));
    const ratio = Math.max(0, Math.min(1, (xPos - padding.l) / (w - padding.l - padding.r)));
    const targetT = minT + ratio * (maxT - minT);
    let nearest = points[0];
    let minDiff = Math.abs(points[0].x.getTime() - targetT);
    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(points[i].x.getTime() - targetT);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = points[i];
      }
    }
    drawChart(canvas, points, options, {
      point: nearest,
      value: options.valueFormatter ? options.valueFormatter(nearest.y) : nearest.y.toFixed(2),
      time: formatTime(nearest.x),
    }, desiredWidth);
  };
  const leaveHandler = () => drawChart(canvas, points, options, null, desiredWidth);
  canvas.addEventListener('mousemove', handler);
  canvas.addEventListener('mouseleave', leaveHandler);
  canvas._hoverCleanup = () => {
    canvas.removeEventListener('mousemove', handler);
    canvas.removeEventListener('mouseleave', leaveHandler);
  };
}

function ensureCanvasSize(canvas, desiredWidth) {
  const dpr = window.devicePixelRatio || 1;
  if (desiredWidth) {
    canvas.style.width = `${desiredWidth}px`;
  }
  const displayW = canvas.getBoundingClientRect().width || canvas.clientWidth || canvas.width || 600;
  const displayH = canvas.getBoundingClientRect().height || canvas.clientHeight || canvas.height || 260;
  const needResize = canvas.width !== Math.floor(displayW * dpr) || canvas.height !== Math.floor(displayH * dpr);
  if (needResize) {
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // map logical units to CSS pixels
  return { ctx, w: displayW, h: displayH };
}

function formatTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function mlToGrams(ml, abv = 100) {
  // If ml is pure ethanol, abv=100; if ml is beverage volume, pass actual ABV.
  return ml * 0.789 * (abv / 100);
}

function formatMl(ml) {
  return `${ml.toFixed(1)} mL`;
}

function formatDoses(totalMl, label) {
  const doses = totalMl / 16;
  return `${doses.toFixed(1)} ${label}`;
}

function calcPureMl() {
  const rows = Array.from(drinkList.querySelectorAll('.drink-row'));
  const presets = {
    beer: { volCl: 33, abv: 5 },
    beer05: { volCl: 50, abv: 5 },
    cider: { volCl: 33, abv: 4.7 },
    wine: { volCl: 12, abv: 12 },
    longdrink: { volCl: 33, abv: 5.5 },
    bottle05: { volCl: 50, abv: 38 },
    bottle07: { volCl: 70, abv: 38 },
    bottle10: { volCl: 100, abv: 38 },
  };
  return rows.reduce((sum, row) => {
    const type = row.querySelector('.drink-type').value;
    const count = parseFloat(row.querySelector('.drink-count')?.value) || 0;
    const volInput = row.querySelector('.drink-vol');
    const abvInput = row.querySelector('.drink-abv');
    const preset = presets[type] || presets.beer;
    const volCl = parseFloat(volInput?.value) || preset.volCl;
    const abv = parseFloat(abvInput?.value) || preset.abv;
    return sum + count * volCl * 10 * (abv / 100);
  }, 0);
}

function updateCalcTotal() {
  const total = calcPureMl();
  const label = (translations[currentLang] || translations.en).calcTotal || 'Total';
  const dosesLabel = (translations[currentLang] || translations.en).calcDoses || 'doses';
  const rows = Array.from(drinkList.querySelectorAll('.drink-row'));
  rows.forEach((row) => {
    const type = row.querySelector('.drink-type').value;
    const preset = drinkPreset(type);
    const count = parseFloat(row.querySelector('.drink-count')?.value) || 0;
    const volCl = parseFloat(row.querySelector('.drink-vol')?.value) || preset.volCl;
    const abv = parseFloat(row.querySelector('.drink-abv')?.value) || preset.abv;
    const pureMl = count * volCl * 10 * (abv / 100);
    const doses = pureMl / 16;
    const doseEl = row.querySelector('.drink-doses');
    if (doseEl) doseEl.textContent = `${doses.toFixed(1)} ${dosesLabel}`;
  });
  const el = document.getElementById('calc-total');
  if (el) el.textContent = `${label}: ${formatMl(total)} (${formatDoses(total, dosesLabel)})`;
}

function applyTranslations(lang) {
  const t = translations[lang] || translations.en;
  currentLang = lang;
  document.documentElement.lang = lang;
  langSelect.value = lang;
  if (langFlag) {
    const opt = langSelect.querySelector(`option[value="${lang}"]`);
    langFlag.textContent = opt ? opt.dataset.flag || '' : '';
  }
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const setOptionText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('title', t.title);
  setText('lead', t.lead);
  setText('warning', t.warning || '');
  setText('lang-label', t.langLabel);
  setText('bac-unit-label', t.bacUnit);
  setText('person-title', t.personTitle);
  setText('sex-label', t.sex);
  setText('weight-label', t.weight);
  setText('age-label', t.age);
  setText('half-label', t.halfLife);
  setText('sessions-title', t.sessionsTitle);
  setText('add-session', t.addSession);
  setText('run-btn', t.run);
  setText('more-params', t.moreParams);
  setText('form-note', t.formNote);
  setText('peak-bac-label', t.statPeakBAC);
  setText('time-over-label', t.statTimeOver);
  setText('peak-peth-label', t.statPeakPEth);
  setText('bac-chart-label', t.chartBAC);
  setText('peth-chart-label', t.chartPEth);
  setText('window-label', t.windowLabel || 'Time window');
  setText('window-3d-label', t.window3d || 'First 3 days (scrollable)');
  setText('window-peth-label', t.windowPeth || 'Until PEth < 0.05 µmol/L');
  setText('calc-title', t.modalTitle);
  setText('calc-apply', t.modalApply);
  setText('calc-note', t.modalNote);
  setText('tab-std', t.calcTabStd);
  setText('calc-std-type-label', t.calcStdType);
  setText('calc-std-count-label', t.calcStdQty);
  setText('add-drink', t.calcAddDrink);
  setText('hdr-drink', t.hdrDrink);
  setText('hdr-count', t.hdrCount);
  setText('hdr-vol', t.hdrVol);
  setText('hdr-abv', t.hdrAbv);
  setText('hdr-doses', t.hdrDoses);
  setText('formation-rate-label', t.formationRateLabel);
  setText('time-step-note', t.timeStepNote);
  setText('half-note', t.halfNote);
  setText('formation-rate-note', t.formationRateNote);
  setText('abs-rate-label', t.absRateLabel);
  setText('abs-rate-note', t.absRateNote);
  setText('abs-max-label', t.absMaxLabel);
  setText('abs-max-note', t.absMaxNote);
  setText('absorption-enabled-label', t.absorptionEnabledLabel || t.absRateLabel);
  setText('use-blood-water-label', t.useBloodWaterLabel || 'Apply blood-water factor');
  const totalEl = document.getElementById('calc-total');
  if (totalEl) totalEl.textContent = `${t.calcTotal}: ${formatMl(calcPureMl())} (${formatDoses(calcPureMl(), t.calcDoses || 'doses')})`;
  setOptionText('opt-beer', t.calcOptBeer);
  setOptionText('opt-beer05', t.calcOptBeer05);
  setOptionText('opt-beerStrong', t.calcOptBeerStrong);
  setOptionText('opt-cider', t.calcOptCider);
  setOptionText('opt-wine', t.calcOptWine);
  setOptionText('opt-wine16', t.calcOptWine16);
  setOptionText('opt-wineBottle75', t.calcOptWineBottle75);
  setOptionText('opt-wineBottle100', t.calcOptWineBottle100);
  setOptionText('opt-wineCan200', t.calcOptWineCan200);
  setOptionText('opt-wineCan300', t.calcOptWineCan300);
  setOptionText('opt-longdrink', t.calcOptLongdrink);
  setOptionText('opt-bottle05', t.calcOptBottle05);
  setOptionText('opt-bottle07', t.calcOptBottle07);
  setOptionText('opt-bottle10', t.calcOptBottle10);
  setText('params-title', t.paramsTitle);
  setText('time-step-label', t.timeStep);
  setText('params-apply', t.paramsApply);
  setText('session-title', t.sessionTitle || t.paramsTitle);
  setText('session-apply', t.sessionApply || t.paramsApply);
  setText('use-end-time-label', t.useEndTimeLabel || 'Use end time');
  // Sex option labels
  const sexSelect = document.getElementById('sex');
  if (sexSelect && sexSelect.options.length >= 2) {
    sexSelect.options[0].textContent = t.male;
    sexSelect.options[1].textContent = t.female;
  }
  // Session row labels/buttons
  document.querySelectorAll('[data-i18n="start"]').forEach((el) => { el.textContent = t.start; });
  document.querySelectorAll('[data-i18n="end"]').forEach((el) => { el.textContent = t.end; });
  document.querySelectorAll('[data-i18n="ethanolLabel"]').forEach((el) => { el.textContent = t.ethanolLabel; });
  document.querySelectorAll('.calc-grams').forEach((el) => { el.textContent = t.calcBtn; });
  document.querySelectorAll('.abs-profile').forEach((el) => {
    const current = el.value;
    el.options[0].textContent = t.mealEmpty;
    el.options[1].textContent = t.mealLight;
    el.options[2].textContent = t.mealMixed;
    el.options[3].textContent = t.mealHeavy;
    el.value = current;
    const label = el.closest('div')?.querySelector('[data-i18n="absProfileLabel"]');
    if (label) label.textContent = t.absProfileLabel;
  });
  toggleMealSelects(document.getElementById('absorption-enabled')?.checked !== false);
  // Update existing drink rows' option texts
  document.querySelectorAll('.drink-row .drink-type option').forEach((opt) => {
    const value = opt.value;
    opt.textContent = drinkLabel(value);
  });
  if (lastResult) render(lastResult);
}

function detectLang() {
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return translations[nav] ? nav : 'en';
}

function drinkLabel(key) {
  const t = translations[currentLang] || translations.en;
  const map = {
    beer: t.calcOptBeer,
    beer05: t.calcOptBeer05,
    beerStrong: t.calcOptBeerStrong,
    cider: t.calcOptCider,
    wine: t.calcOptWine,
    wine16: t.calcOptWine16,
    wineBottle75: t.calcOptWineBottle75,
    wineBottle100: t.calcOptWineBottle100,
    wineCan200: t.calcOptWineCan200,
    wineCan300: t.calcOptWineCan300,
    longdrink: t.calcOptLongdrink,
    bottle05: t.calcOptBottle05,
    bottle07: t.calcOptBottle07,
    bottle10: t.calcOptBottle10,
  };
  return map[key] || key;
}

function drinkPreset(key) {
  const presets = {
    beer: { volCl: 33, abv: 5 },
    beer05: { volCl: 50, abv: 5 },
    beerStrong: { volCl: 33, abv: 8 },
    cider: { volCl: 33, abv: 4.7 },
    wine: { volCl: 12, abv: 12 },
    wine16: { volCl: 16, abv: 12 },
    wineBottle75: { volCl: 75, abv: 12 },
    wineBottle100: { volCl: 100, abv: 12 },
    wineCan200: { volCl: 200, abv: 12 },
    wineCan300: { volCl: 300, abv: 12 },
    longdrink: { volCl: 33, abv: 5.5 },
    bottle05: { volCl: 50, abv: 38 },
    bottle07: { volCl: 70, abv: 38 },
    bottle10: { volCl: 100, abv: 38 },
  };
  return presets[key] || presets.beer;
}

applyTranslations(currentLang);
render(runSim(getParams()));

function convertBac(valuePermille, unit) {
  if (unit === 'percent') return valuePermille / 10;
  if (unit === 'mgL') return valuePermille * 1000;
  return valuePermille;
}

function formatBac(valuePermilleConverted, unit) {
  const suffix = unit === 'percent' ? '%' : unit === 'mgL' ? ' mg/L' : '‰';
  const digits = unit === 'mgL' ? 1 : 2;
  return `${valuePermilleConverted.toFixed(digits)}${suffix}`;
}

function unitLabel(unit) {
  if (unit === 'percent') return '%';
  if (unit === 'mgL') return 'mg/L';
  return '‰';
}
