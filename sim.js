const PETH_MW_G_PER_MOL = 704.6; // Molecular weight of PEth 16:0/18:1
const BLOOD_WATER_FACTOR = 1.055; // kg blood water per L blood for Widmark volume
const BASE_ABS_K_PER_H = 2.0; // Empty stomach first-order absorption rate (~t1/2 0.35 h)
const BASE_ABS_CAP_G_PER_H = 80; // Upper cap for absorption on empty stomach

function simulate({ sex, weight, age, sessions, decayHalfLifeDays = 4.5, stepMinutes = 5, formationRateNgPerMlPerHourAt1Permille = 11.3, absRate = BASE_ABS_K_PER_H, absMax = BASE_ABS_CAP_G_PER_H }) {
  if (!sessions || !sessions.length) return null;
  const sorted = sessions.slice().sort((a, b) => a.start - b.start);
  const startTime = sorted[0].start;
  const endTime = sorted[sorted.length - 1].end;
  const horizonHours = Math.max(96, (endTime - startTime) / 3.6e6 + 48);
  const stepMin = Math.max(1, Math.min(120, stepMinutes || 5));
  const baseSteps = Math.ceil((horizonHours * 60) / stepMin);
  const targetPethNgMl = 0.05 * PETH_MW_G_PER_MOL; // drop below 0.05 µmol/L
  const maxSimHours = 24 * 45; // cap at ~45 days to prevent runaway

  const r = sex === 'male' ? 0.68 : 0.55; // Widmark distribution factor
  const ageFactor = Math.min(1.25, Math.max(0.85, 1 + (age - 40) * 0.003));
  const elimPermillePerHour = 0.15 * ageFactor; // 0.015 g/dL -> 0.15‰
  const distribVolumeKg = r * weight * BLOOD_WATER_FACTOR;
  const elimGramsPerHour = elimPermillePerHour * distribVolumeKg;
  const effectiveAbsRateK = absRate; // per hour
  const effectiveAbsCap = absMax;

  // PEth parameters: synthesis proportional to BAC, decay with half-life ~4.5 days (default)
  const decayKPerHour = Math.log(2) / (decayHalfLifeDays * 24);

  const timeline = [];
  let stomachGrams = 0;
  let bloodGrams = 0;
  let peth = 0;
  let currentAbsFactor = 1;

  let sessionIdx = 0;
  let currentSession = sorted[sessionIdx];

  for (let i = 0; ; i++) {
    const tMinutes = i * stepMin;
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
      currentAbsFactor = currentSession.absFactor || 1;
    }

    if (!currentSession && stomachGrams <= 0) {
      currentAbsFactor = 1;
    }

    // Absorption from stomach to blood (first-order with cap; scaled by meal factor)
    const k = effectiveAbsRateK * currentAbsFactor;
    const capPerHour = effectiveAbsCap * currentAbsFactor;
    const firstOrderAbs = stomachGrams * (k * (stepMin / 60));
    const capAbs = (capPerHour / 60) * stepMin;
    const absorbed = Math.min(stomachGrams, Math.min(firstOrderAbs, capAbs));
    stomachGrams -= absorbed;
    bloodGrams += absorbed;

    // Elimination from blood (zero-order, body-mass-adjusted)
    const elim = (elimGramsPerHour / 60) * stepMin;
    bloodGrams = Math.max(0, bloodGrams - elim);

    const bacPermille = bloodGrams / distribVolumeKg;

    // PEth synthesis/decay
    const formation = (formationRateNgPerMlPerHourAt1Permille * bacPermille) * (stepMin / 60);
    const decay = peth * (1 - Math.exp(-decayKPerHour * (stepMin / 60)));
    peth = Math.max(0, peth + formation - decay);

    timeline.push({ time: currentTime, bac: bacPermille, pethNgMl: peth });

    const pastBaseHorizon = i >= baseSteps;
    const belowTarget = peth <= targetPethNgMl;
    const beyondMax = tMinutes >= maxSimHours * 60;
    if (pastBaseHorizon && (belowTarget || beyondMax)) {
      break;
    }
  }

  return {
    timeline,
    params: {
      sex,
      weight,
      age,
      r,
      elimPermillePerHour,
      formationRateNgPerMlPerHourAt1Permille,
      distribVolumeKg,
      decayKPerHour,
      decayHalfLifeDays,
      stepMinutes: stepMin,
      absRate,
      absMax,
    },
    startTime,
  };
}

function toUmol(ngPerMl) {
  return ngPerMl / PETH_MW_G_PER_MOL;
}

const SimModel = {
  simulate,
  toUmol,
  PETH_MW_G_PER_MOL,
  BLOOD_WATER_FACTOR,
};

if (typeof module !== 'undefined') {
  module.exports = SimModel;
}
if (typeof window !== 'undefined') {
  window.SimModel = SimModel;
}
