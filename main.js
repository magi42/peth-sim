const sessionsEl = document.getElementById('sessions');
const addSessionBtn = document.getElementById('add-session');
const form = document.getElementById('sim-form');
const { simulate: runSim, toUmol: toUmolFn } = window.SimModel;
const calcModal = document.getElementById('calc-modal');
const calcForm = document.getElementById('calc-form');
const calcClose = document.getElementById('calc-close');
const paramsModal = document.getElementById('params-modal');
const paramsForm = document.getElementById('params-form');
const paramsClose = document.getElementById('params-close');
const langSelect = document.getElementById('lang-select');
const langFlag = document.getElementById('lang-flag');
const bacUnitSelect = document.getElementById('bac-unit');
let activeGramsInput = null;

let currentLang = detectLang();
let lastResult = null;

const defaultSessions = [
  { start: '2025-01-01T18:00', end: '2025-01-01T23:00', ml: 700*0.38 }, // 70 cL of 38% Kossu
  { start: '2025-01-08T18:00', end: '2025-01-08T23:30', ml: 700*0.38 }  // 70 cL of 38% Kossu
];

function createSessionRow(session) {
  const wrapper = document.createElement('div');
  wrapper.className = 'session-row';
  wrapper.innerHTML = `
    <div>
      <label data-i18n="start">Start</label>
      <input type="datetime-local" class="start" value="${session.start}" required />
    </div>
    <div>
      <label data-i18n="end">End</label>
      <input type="datetime-local" class="end" value="${session.end}" required />
    </div>
    <div>
      <label data-i18n="ethanolLabel">${translations[currentLang].ethanolLabel}</label>
      <div class="ethanol-input">
        <input type="number" class="grams" min="0.1" step="0.1" value="${session.ml}" required />
        <button type="button" class="calc-grams" aria-label="Calculate mL from volume and %">${translations[currentLang].calcBtn}</button>
      </div>
    </div>
    <div style="align-self:center;">
      <button type="button" class="remove-session" aria-label="Remove session">✕</button>
    </div>
  `;
  const removeBtn = wrapper.querySelector('.remove-session');
  if (removeBtn) removeBtn.addEventListener('click', () => wrapper.remove());
  wrapper.querySelector('.calc-grams').addEventListener('click', () => openCalcModal(wrapper.querySelector('.grams')));
  sessionsEl.appendChild(wrapper);
}

defaultSessions.forEach(createSessionRow);

addSessionBtn.addEventListener('click', () => {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  createSessionRow({ start: toInputValue(start), end: toInputValue(end), ml: 40 });
});

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

langSelect.addEventListener('change', () => {
  applyTranslations(langSelect.value);
});
bacUnitSelect.addEventListener('change', () => {
  const result = lastResult || runSim(getParams());
  render(result);
});

function toInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getParams() {
  const sex = document.getElementById('sex').value;
  const weight = parseFloat(document.getElementById('weight').value);
  const age = parseInt(document.getElementById('age').value, 10);
  const decayHalfLifeDays = parseFloat(document.getElementById('peth-half-life').value) || 4.5;
  const stepMinutes = parseFloat(document.getElementById('time-step').value) || 5;
  const sessions = Array.from(sessionsEl.querySelectorAll('.session-row')).map((row) => {
    const start = new Date(row.querySelector('.start').value);
    const end = new Date(row.querySelector('.end').value);
    const ml = parseFloat(row.querySelector('.grams').value);
    const grams = mlToGrams(ml);
    return { start, end, grams, ml };
  }).filter((s) => !Number.isNaN(s.start.getTime()) && !Number.isNaN(s.end.getTime()) && s.grams > 0.0 && s.end > s.start);
  return { sex, weight, age, sessions, decayHalfLifeDays, stepMinutes };
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

  const bacOptions = { color: '#1c7ed6', yLabel: unitLabel(unit), warning: convertBac(0.5, unit), valueFormatter: (v) => formatBac(v, unit), axisLabel: t.axisTime, axisTick: 1.0};
  const pethOptions = { color: '#f59f00', yLabel: 'µmol/L', valueFormatter: (v) => `${v.toFixed(4)} µmol/L`, axisLabel: t.axisTime, axisTick: 0.1 };

  drawChart(document.getElementById('bac-chart'), bacPoints, bacOptions);
  drawChart(document.getElementById('peth-chart'), pethPoints, pethOptions);

  enableHover(document.getElementById('bac-chart'), bacPoints, bacOptions);
  enableHover(document.getElementById('peth-chart'), pethPoints, pethOptions);

  const note = t.modelNote({
    r: result.params.r.toFixed(2),
    elim: result.params.elimPermillePerHour.toFixed(2),
    form: result.params.formationRateNgPerMlPerHourAt1Permille,
    half: result.params.decayHalfLifeDays.toFixed(2),
    step: result.params.stepMinutes.toFixed(0),
  });
  document.getElementById('model-note').textContent = note;
}

function drawChart(canvas, points, { color, yLabel, warning, valueFormatter, axisLabel, axisTick}, highlight) {
  const { ctx, w, h } = ensureCanvasSize(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!points.length) return;

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

  // Horizontal grid lines
  ctx.strokeStyle = '#e6ecf4';
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const tick = Math.trunc(i*axisTick*100)/100;
    const y = scaleY(tick);
    console.log(tick, y, padding.b, h, i);
    ctx.beginPath();
    ctx.moveTo(padding.l, y);
    ctx.lineTo(w - padding.r, y);
    ctx.stroke();
    ctx.fillText(tick, 50, y+3);
  }

  // Vertical midnight ticks
  if (midnightTicks.length) {
    ctx.strokeStyle = '#eef1f6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    midnightTicks.forEach((t) => {
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
  ctx.textAlign = 'right';
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
}

// Kick off initial render
render(runSim(getParams()));

function openCalcModal(targetInput) {
  activeGramsInput = targetInput;
  calcModal.classList.remove('hidden');
  document.getElementById('calc-volume').focus();
}

function closeCalcModal() {
  calcModal.classList.add('hidden');
  activeGramsInput = null;
}

calcForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const volCl = parseFloat(document.getElementById('calc-volume').value);
  const abv = parseFloat(document.getElementById('calc-abv').value);
  if (!activeGramsInput || Number.isNaN(volCl) || Number.isNaN(abv)) {
    closeCalcModal();
    return;
  }
  const pureMl = volCl * 10 * (abv / 100); // cl -> mL, scaled by ABV
  activeGramsInput.value = pureMl.toFixed(1);
  closeCalcModal();
});

calcClose.addEventListener('click', closeCalcModal);
calcModal.addEventListener('click', (e) => {
  if (e.target === calcModal) closeCalcModal();
});

function enableHover(canvas, points, options) {
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
    console.log(options);
    drawChart(canvas, points, options, {
      point: nearest,
      value: options.valueFormatter ? options.valueFormatter(nearest.y) : nearest.y.toFixed(2),
      time: formatTime(nearest.x),
    });
  };
  const leaveHandler = () => drawChart(canvas, points, options);
  canvas.addEventListener('mousemove', handler);
  canvas.addEventListener('mouseleave', leaveHandler);
  canvas._hoverCleanup = () => {
    canvas.removeEventListener('mousemove', handler);
    canvas.removeEventListener('mouseleave', leaveHandler);
  };
}

function ensureCanvasSize(canvas) {
  const dpr = window.devicePixelRatio || 1;
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
  setText('title', t.title);
  setText('lead', t.lead);
  setText('lang-label', t.langLabel);
  setText('bac-unit-label', t.bacUnit);
  setText('person-title', t.personTitle);
  setText('sex-label', t.sex);
  setText('weight-label', t.weight);
  setText('age-label', t.age);
  setText('half-label', t.halfLife);
  const halfHelpEl = document.getElementById('half-help');
  if (halfHelpEl) halfHelpEl.title = t.halfHelp;
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
  setText('calc-title', t.modalTitle);
  setText('calc-volume-label', t.modalVolume);
  setText('calc-abv-label', t.modalAbv);
  setText('calc-apply', t.modalApply);
  setText('calc-note', t.modalNote);
  setText('params-title', t.paramsTitle);
  setText('time-step-label', t.timeStep);
  setText('params-apply', t.paramsApply);
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
  if (lastResult) render(lastResult);
}

function detectLang() {
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return translations[nav] ? nav : 'en';
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
