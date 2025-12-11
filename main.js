const sessionsEl = document.getElementById('sessions');
const addSessionBtn = document.getElementById('add-session');
const form = document.getElementById('sim-form');

const defaultSessions = [
  { start: '2024-01-01T19:00', end: '2024-01-01T21:00', grams: 40 },
  { start: '2024-01-02T18:30', end: '2024-01-02T22:00', grams: 60 }
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
      <label>Ethanol (g)</label>
      <input type="number" class="grams" min="1" step="1" value="${session.grams}" required />
    </div>
    <div style="align-self:center;">
      <button type="button" aria-label="Remove session">✕</button>
    </div>
  `;
  wrapper.querySelector('button').addEventListener('click', () => wrapper.remove());
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
  const result = simulate(params);
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
  const sessions = Array.from(sessionsEl.querySelectorAll('.session-row')).map((row) => {
    const start = new Date(row.querySelector('.start').value);
    const end = new Date(row.querySelector('.end').value);
    const grams = parseFloat(row.querySelector('.grams').value);
    return { start, end, grams };
  }).filter((s) => !Number.isNaN(s.start.getTime()) && !Number.isNaN(s.end.getTime()) && s.grams > 0 && s.end > s.start);
  return { sex, weight, age, sessions };
}

function simulate({ sex, weight, age, sessions }) {
  if (!sessions.length) return null;
  const sorted = sessions.slice().sort((a, b) => a.start - b.start);
  const startTime = sorted[0].start;
  const endTime = sorted[sorted.length - 1].end;
  const horizonHours = Math.max(96, (endTime - startTime) / 3.6e6 + 48);
  const stepMinutes = 5;
  const steps = Math.ceil((horizonHours * 60) / stepMinutes);

  const r = sex === 'male' ? 0.68 : 0.55; // Widmark distribution factor
  const ageFactor = Math.min(1.25, Math.max(0.85, 1 + (age - 40) * 0.003));
  const elimPermillePerHour = 0.15 * ageFactor; // 0.015 g/dL -> 0.15‰
  const elimGramsPerHour = elimPermillePerHour * r * weight;
  const absorptionK = 1.5 / 60; // 1.5 /hour as per-minute constant

  // PEth parameters (heuristic): synthesis proportional to BAC, decay with half-life ~4.5 days
  const formationRateNgPerMlPerHourAt1Permille = 8; // ng/mL/h when BAC = 1‰
  const decayKPerHour = Math.log(2) / (4.5 * 24);

  const timeline = [];
  let stomachGrams = 0;
  let bloodGrams = 0;
  let peth = 0;

  let sessionIdx = 0;
  let currentSession = sorted[sessionIdx];

  for (let i = 0; i <= steps; i++) {
    const tMinutes = i * stepMinutes;
    const currentTime = new Date(startTime.getTime() + tMinutes * 60000);

    // Add alcohol being consumed during active sessions
    while (currentSession && currentTime > currentSession.end && sessionIdx < sorted.length - 1) {
      sessionIdx += 1;
      currentSession = sorted[sessionIdx];
    }
    if (currentSession && currentTime >= currentSession.start && currentTime <= currentSession.end) {
      const durationMin = (currentSession.end - currentSession.start) / 60000;
      const ingestionRate = currentSession.grams / durationMin; // g/min
      stomachGrams += ingestionRate * stepMinutes;
    }

    // Absorption from stomach to blood (first-order)
    const absorbed = stomachGrams * (1 - Math.exp(-absorptionK * stepMinutes));
    stomachGrams -= absorbed;
    bloodGrams += absorbed;

    // Elimination from blood (zero-order, body-mass-adjusted)
    const elim = (elimGramsPerHour / 60) * stepMinutes;
    bloodGrams = Math.max(0, bloodGrams - elim);

    const bacPermille = (bloodGrams / (r * weight));

    // PEth synthesis/decay
    const formation = (formationRateNgPerMlPerHourAt1Permille * bacPermille) * (stepMinutes / 60);
    const decay = peth * (1 - Math.exp(-decayKPerHour * stepMinutes));
    peth = Math.max(0, peth + formation - decay);

    timeline.push({ time: currentTime, bac: bacPermille, peth });
  }

  return { timeline, params: { sex, weight, age, r, elimPermillePerHour, formationRateNgPerMlPerHourAt1Permille }, startTime };
}

function render(result) {
  if (!result) return;
  const { timeline } = result;
  const peakBAC = Math.max(...timeline.map((t) => t.bac));
  const timeOver = timeline.filter((t) => t.bac >= 0.5).length * 5; // minutes
  const peakPEth = Math.max(...timeline.map((t) => t.peth));

  document.getElementById('peak-bac').textContent = `${peakBAC.toFixed(2)}‰`;
  document.getElementById('time-over').textContent = `${(timeOver / 60).toFixed(1)} h`;
  document.getElementById('peak-peth').textContent = `${peakPEth.toFixed(0)} ng/mL`;

  drawChart(document.getElementById('bac-chart'), timeline.map((t) => ({ x: t.time, y: t.bac })), {
    color: '#1c7ed6', yLabel: '‰', warning: 0.5
  });
  drawChart(document.getElementById('peth-chart'), timeline.map((t) => ({ x: t.time, y: t.peth })), {
    color: '#f59f00', yLabel: 'ng/mL'
  });

  const note = `Parameters: r=${result.params.r.toFixed(2)}, elimination ${result.params.elimPermillePerHour.toFixed(2)}‰/h, PEth formation ${result.params.formationRateNgPerMlPerHourAt1Permille} ng/mL per hour at 1‰. BAC uses Widmark-style volume of distribution, absorption k=1.5/h, elimination zero-order; PEth decays with t½≈4.5 days.`;
  document.getElementById('model-note').textContent = note;
}

function drawChart(canvas, points, { color, yLabel, warning }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!points.length) return;

  const padding = { l: 45, r: 14, t: 12, b: 28 };
  const times = points.map((p) => p.x.getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const values = points.map((p) => p.y);
  const minY = 0;
  const maxY = Math.max(Math.max(...values) * 1.1, warning ? warning * 1.4 : 0.1);

  const scaleX = (t) => padding.l + ((t - minT) / (maxT - minT || 1)) * (w - padding.l - padding.r);
  const scaleY = (v) => h - padding.b - ((v - minY) / (maxY - minY || 1)) * (h - padding.t - padding.b);

  // grid
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

  // line
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

  // axes
  ctx.strokeStyle = '#9aa9bc';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(padding.l, padding.t);
  ctx.lineTo(padding.l, h - padding.b);
  ctx.lineTo(w - padding.r, h - padding.b);
  ctx.stroke();

  // labels
  ctx.fillStyle = '#4a5667';
  ctx.font = '12px var(--sans)';
  ctx.fillText(yLabel, 6, padding.t + 12);
  ctx.textAlign = 'center';
  ctx.fillText('Time', w / 2, h - 6);

  // ticks on x (hours)
  ctx.fillStyle = '#6c7585';
  const tickCount = 6;
  for (let i = 0; i <= tickCount; i++) {
    const t = minT + (i / tickCount) * (maxT - minT);
    const d = new Date(t);
    const label = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}`;
    const x = scaleX(t);
    ctx.fillText(label, x, h - 10);
  }
}

// Kick off initial render
render(simulate(getParams()));
