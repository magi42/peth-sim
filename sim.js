const PETH_MW_G_PER_MOL = 704.6; // Approx. PEth 16:0/18:1
const BLOOD_WATER_FACTOR = 1.055; // kg blood water per L blood for Widmark volume

function simulate({ sex, weight, age, sessions, decayHalfLifeDays = 4.5 }) {
  if (!sessions || !sessions.length) return null;
  const sorted = sessions.slice().sort((a, b) => a.start - b.start);
  const startTime = sorted[0].start;
  const endTime = sorted[sorted.length - 1].end;
  const horizonHours = Math.max(96, (endTime - startTime) / 3.6e6 + 48);
  const stepMinutes = 5;
  const baseSteps = Math.ceil((horizonHours * 60) / stepMinutes);
  const targetPethNgMl = 0.05 * PETH_MW_G_PER_MOL; // drop below 0.05 µmol/L
  const maxSimHours = 24 * 45; // cap at ~45 days to prevent runaway

  const r = sex === 'male' ? 0.68 : 0.55; // Widmark distribution factor
  const ageFactor = Math.min(1.25, Math.max(0.85, 1 + (age - 40) * 0.003));
  const elimPermillePerHour = 0.15 * ageFactor; // 0.015 g/dL -> 0.15‰
  const distribVolumeKg = r * weight * BLOOD_WATER_FACTOR;
  const elimGramsPerHour = elimPermillePerHour * distribVolumeKg;
  const absorptionK = 1.5 / 60; // 1.5 /hour as per-minute constant

  // PEth parameters (heuristic): synthesis proportional to BAC, decay with half-life ~4.5 days
  const formationRateNgPerMlPerHourAt1Permille = 8; // ng/mL/h when BAC = 1‰
  const decayKPerHour = Math.log(2) / (decayHalfLifeDays * 24);

  const timeline = [];
  let stomachGrams = 0;
  let bloodGrams = 0;
  let peth = 0;

  let sessionIdx = 0;
  let currentSession = sorted[sessionIdx];

  for (let i = 0; ; i++) {
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

    const bacPermille = bloodGrams / distribVolumeKg;

    // PEth synthesis/decay
    const formation = (formationRateNgPerMlPerHourAt1Permille * bacPermille) * (stepMinutes / 60);
    const decay = peth * (1 - Math.exp(-decayKPerHour * (stepMinutes / 60)));
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
