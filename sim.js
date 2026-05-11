const PETH_MW_G_PER_MOL = 704.6; // Molecular weight of PEth 16:0/18:1
const BLOOD_WATER_FACTOR = 1.055; // kg blood water per L blood; applied to Widmark volume if enabled
const BASE_ABS_K_PER_H = 2.0; // Empty stomach first-order absorption rate (~t1/2 0.35 h)
const BASE_ABS_CAP_G_PER_H = 80; // Upper cap for absorption on empty stomach

function simulate({
  sex,
  weight,
  age,
  sessions,
  decayHalfLifeDays = 4.5,
  stepMinutes = 5,
  formationRateNgPerMlPerHourAt1Permille = 11.3,
  eliminationRatePermillePerHour = 0.15,
  initialPethDate = null,
  initialPethUmol = 0,
  absRate = BASE_ABS_K_PER_H,
  absMax = BASE_ABS_CAP_G_PER_H,
  absorptionEnabled = true,
  useBloodWater = true,
  maleR = 0.68,
  femaleR = 0.55,
}) {
  if (!sessions || !sessions.length) return null;
  const sorted = sessions.slice().sort((a, b) => a.start - b.start);
  const hasInitialPeth = initialPethDate instanceof Date && !Number.isNaN(initialPethDate.getTime()) && Number.isFinite(initialPethUmol) && initialPethUmol > 0;
  const startTime = hasInitialPeth && initialPethDate < sorted[0].start ? initialPethDate : sorted[0].start;
  const endTime = sorted.reduce((latest, s) => {
    const t = (s.end && s.end > s.start ? s.end : s.start).getTime();
    return Math.max(latest, t);
  }, startTime.getTime());
  const horizonHours = Math.max(96, (endTime - startTime.getTime()) / 3.6e6 + 48);
  const stepMin = Math.max(1, Math.min(120, stepMinutes || 5));
  const baseSteps = Math.ceil((horizonHours * 60) / stepMin);
  const targetPethNgMl = 0.05 * PETH_MW_G_PER_MOL; // drop below 0.05 µmol/L
  const maxSimHours = 24 * 45; // cap at ~45 days to prevent runaway

  const r = sex === 'male' ? maleR : femaleR; // Widmark distribution factor
  const ageFactor = Math.min(1.25, Math.max(0.85, 1 + (age - 40) * 0.003));
  const elimPermillePerHour = eliminationRatePermillePerHour * ageFactor; // 0.015 g/dL -> 0.15‰
  const distribVolumeKg = r * weight * (useBloodWater ? BLOOD_WATER_FACTOR : 1);
  const elimGramsPerHour = elimPermillePerHour * distribVolumeKg;
  const effectiveAbsRateK = absRate; // per hour
  const effectiveAbsCap = absMax;

  // PEth parameters: synthesis proportional to BAC, decay with half-life ~4.5 days (default)
  const decayKPerHour = Math.log(2) / (decayHalfLifeDays * 24);

  const timeline = [];
  let stomachGrams = 0;
  let bloodGrams = 0;
  let peth = hasInitialPeth ? initialPethUmol * PETH_MW_G_PER_MOL : 0;
  let currentAbsFactor = 1;

  const incrementalSessions = sorted.filter((s) => absorptionEnabled && s.useEndTime !== false && s.end && s.end > s.start);
  const immediateSessions = sorted.filter((s) => !incrementalSessions.includes(s));
  const consumed = new Set();

  for (let i = 0; ; i++) {
    const tMinutes = i * stepMin;
    const currentTime = new Date(startTime.getTime() + tMinutes * 60000);
    const nextTime = new Date(currentTime.getTime() + stepMin * 60000);

    // Add alcohol being consumed during active sessions
    let addedThisStep = 0;
    let weightedAbsFactor = 0;
    incrementalSessions.forEach((s) => {
      const overlapStart = Math.max(currentTime.getTime(), s.start.getTime());
      const overlapEnd = Math.min(nextTime.getTime(), s.end.getTime());
      const overlapMin = Math.max(0, (overlapEnd - overlapStart) / 60000);
      const durationMin = (s.end - s.start) / 60000;
      const ingestionRate = s.grams / durationMin; // g/min
      if (overlapMin > 0) {
        const added = ingestionRate * overlapMin;
        stomachGrams += added;
        addedThisStep += added;
        weightedAbsFactor += added * (s.absFactor || 1);
      }
    });
    if (addedThisStep > 0) {
      currentAbsFactor = weightedAbsFactor / addedThisStep;
    }

    // Immediate sessions: add dose at start time (either to stomach or directly to blood)
    immediateSessions.forEach((s, idx) => {
      if (consumed.has(idx)) return;
      if (currentTime >= s.start) {
        if (absorptionEnabled) {
          stomachGrams += s.grams;
          currentAbsFactor = s.absFactor || 1;
        } else {
          bloodGrams += s.grams;
        }
        consumed.add(idx);
      }
    });

    if (addedThisStep <= 0 && stomachGrams <= 0) {
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
    const decay = i === 0 ? 0 : peth * (1 - Math.exp(-decayKPerHour * (stepMin / 60)));
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
      eliminationRatePermillePerHour,
      initialPethDate: hasInitialPeth ? initialPethDate : null,
      initialPethUmol: hasInitialPeth ? initialPethUmol : 0,
      distribVolumeKg,
      decayKPerHour,
      decayHalfLifeDays,
      stepMinutes: stepMin,
      absRate,
      absMax,
      absorptionEnabled,
      maleR,
      femaleR,
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
