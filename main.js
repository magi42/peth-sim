const sessionsEl = document.getElementById('sessions');
const addSessionBtn = document.getElementById('add-session');
const form = document.getElementById('sim-form');
const { simulate: runSim, toUmol: toUmolFn } = window.SimModel;
const calcModal = document.getElementById('calc-modal');
const calcForm = document.getElementById('calc-form');
const calcClose = document.getElementById('calc-close');
let activeGramsInput = null;

const defaultSessions = [
  { start: '2025-01-01T19:00', end: '2025-01-01T21:00', ml: 700*0.4  }, // 70 cL of 40% whiskey
  { start: '2025-01-02T12:00', end: '2025-01-02T13:30', ml: 500*0.05 }  // 50 cL of 5% beer
];

function createSessionRow(session) {
  const wrapper = document.createElement('div');
  wrapper.className = 'session-row';
  wrapper.innerHTML = `
    <div>
      <label>Start</label>
      <input type="datetime-local" class="start" value="${session.start}" required />
    </div>
    <div>
      <label>End</label>
      <input type="datetime-local" class="end" value="${session.end}" required />
    </div>
    <div>
      <label>Ethanol (mL)</label>
      <div class="ethanol-input">
        <input type="number" class="grams" min="0.1" step="0.1" value="${session.ml}" required />
        <button type="button" class="calc-grams" aria-label="Calculate mL from volume and %">Calc</button>
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
  createSessionRow({ start: toInputValue(start), end: toInputValue(end), grams: 40 });
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const params = getParams();
  const result = runSim(params);
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
  const sessions = Array.from(sessionsEl.querySelectorAll('.session-row')).map((row) => {
    const start = new Date(row.querySelector('.start').value);
    const end = new Date(row.querySelector('.end').value);
    const ml = parseFloat(row.querySelector('.grams').value);
    const grams = mlToGrams(ml);
    return { start, end, grams, ml };
  }).filter((s) => !Number.isNaN(s.start.getTime()) && !Number.isNaN(s.end.getTime()) && s.grams > 0.0 && s.end > s.start);
  return { sex, weight, age, sessions, decayHalfLifeDays };
}

function render(result) {
  if (!result) return;
  const { timeline } = result;
  const peakBAC = Math.max(...timeline.map((t) => t.bac));
  const timeOver = timeline.filter((t) => t.bac >= 0.5).length * 5; // minutes
  const peakPEthUmol = Math.max(...timeline.map((t) => toUmolFn(t.pethNgMl)));

  document.getElementById('peak-bac').textContent = `${peakBAC.toFixed(2)}‰`;
  document.getElementById('time-over').textContent = `${(timeOver / 60).toFixed(1)} h`;
  document.getElementById('peak-peth').textContent = `${peakPEthUmol.toFixed(3)} µmol/L`;

  const bacPoints = timeline.map((t) => ({ x: t.time, y: t.bac }));
  const pethPoints = timeline.map((t) => ({ x: t.time, y: toUmolFn(t.pethNgMl) }));

  const bacOptions = { color: '#1c7ed6', yLabel: '‰', warning: 0.5, valueFormatter: (v) => `${v.toFixed(3)}‰` };
  const pethOptions = { color: '#f59f00', yLabel: 'µmol/L', valueFormatter: (v) => `${v.toFixed(4)} µmol/L` };

  drawChart(document.getElementById('bac-chart'), bacPoints, bacOptions);
  drawChart(document.getElementById('peth-chart'), pethPoints, pethOptions);

  enableHover(document.getElementById('bac-chart'), bacPoints, bacOptions);
  enableHover(document.getElementById('peth-chart'), pethPoints, pethOptions);

  const note = `Parameters: r=${result.params.r.toFixed(2)}, elimination ${result.params.elimPermillePerHour.toFixed(2)}‰/h (volume includes 1.055 blood-water factor), PEth formation ${result.params.formationRateNgPerMlPerHourAt1Permille} ng/mL per hour at 1‰. BAC uses Widmark-style volume of distribution, absorption k=1.5/h, elimination zero-order; PEth decays with t½≈${result.params.decayHalfLifeDays.toFixed(2)} days.`;
  document.getElementById('model-note').textContent = note;
}

function drawChart(canvas, points, { color, yLabel, warning, valueFormatter }, highlight) {
  const { ctx, w, h } = ensureCanvasSize(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!points.length) return;

  const padding = { l: 45, r: 14, t: 12, b: 40 };
  const times = points.map((p) => p.x.getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const values = points.map((p) => p.y);
  const minY = 0;
  const maxY = Math.max(Math.max(...values) * 1.1, warning ? warning * 1.4 : 0.1);

  const scaleX = (t) => padding.l + ((t - minT) / (maxT - minT || 1)) * (w - padding.l - padding.r);
  const scaleY = (v) => h - padding.b - ((v - minY) / (maxY - minY || 1)) * (h - padding.t - padding.b);

  // day ticks at midnight boundaries
  const midnightTicks = [];
  const firstMidnight = new Date(minT);
  firstMidnight.setHours(0, 0, 0, 0);
  if (firstMidnight.getTime() < minT) firstMidnight.setDate(firstMidnight.getDate() + 1);
  for (let t = firstMidnight.getTime(); t <= maxT; t += 24 * 60 * 60 * 1000) {
    midnightTicks.push(t);
  }

  // Grid
  ctx.strokeStyle = '#e6ecf4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.t + (i / gridLines) * (h - padding.t - padding.b);
    ctx.moveTo(padding.l, y);
    ctx.lineTo(w - padding.r, y);
  }
  ctx.stroke();

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
  ctx.fillText(yLabel, 6, padding.t + 12);
  ctx.textAlign = 'center';
  ctx.fillText('Time', w / 2, h - 8);

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
