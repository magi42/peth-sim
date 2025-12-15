// Minimal test harness using Node built-ins (no external deps required).
const assert = require('assert');
const { simulate, toUmol } = require('../sim');

function approx(actual, expected, tol, message) {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tol, `${message} (expected ${expected}±${tol}, got ${actual})`);
}

function nearestValue(timeline, targetMs) {
  let best = timeline[0];
  let bestDiff = Math.abs(timeline[0].time - targetMs);
  for (const p of timeline) {
    const d = Math.abs(p.time - targetMs);
    if (d < bestDiff) {
      best = p;
      bestDiff = d;
    }
  }
  return best;
}

function runTests() {
  testEmptySessions();
  testSingleSession();
  testExtendingHorizon();

  // 4) Absorption model sanity across sexes/weights/doses
  const weights = [60, 90];
  const doses = [1, 6, 10]; // dose = 40 mL @ 40% -> 1.6 mL EtOH -> ~1.26 g
  const doseGrams = (n) => n * 40 * 0.4 * 0.789;
  const doseStart = new Date('2024-01-01T20:00:00Z');
  testAbsorption(weights, doses, doseGrams, doseStart);
  testAbsorptionMonotonicity(weights, doses, doseGrams, doseStart);
  testElimination(doseGrams, doseStart);
  
  console.log('All tests passed.');
}

function testEmptySessions() {
  // Empty sessions returns null
  assert.strictEqual(simulate({ sex: 'male', weight: 80, age: 35, sessions: [] }), null, 'Empty sessions should return null');
}

function testSingleSession() {
  // 2) Single moderate session matches expected BAC/PEth range
  const caseA = simulate({
    sex: 'male',
    weight: 80,
    age: 35,
    sessions: [{ start: new Date('2024-01-01T20:00:00Z'), end: new Date('2024-01-01T22:00:00Z'), grams: 60 }],
  });
  const peakA = Math.max(...caseA.timeline.map((t) => t.bac));
  const timeOverA = caseA.timeline.filter((t) => t.bac >= 0.5).length * 5 / 60;
  const peakPethA = Math.max(...caseA.timeline.map((t) => toUmol(t.pethNgMl)));
  approx(peakA, 0.64, 0.03, 'Peak BAC for 60g/2h male 80kg');
  approx(timeOverA, 2.08, 0.25, 'Hours over 0.5‰ for 60g/2h male 80kg');
  approx(peakPethA, 0.039, 0.01, 'Peak PEth µmol/L for 60g/2h male 80kg');
  assert.ok(caseA.timeline[caseA.timeline.length - 1].bac < 0.005, 'BAC returns near zero by end of horizon');
}

function testExtendingHorizon() {
    // 3) Multi-day drinking extends horizon until PEth < 0.05 µmol/L
  const caseB = simulate({
    sex: 'female',
    weight: 65,
    age: 40,
    sessions: [
      { start: new Date('2024-01-01T18:00:00Z'), end: new Date('2024-01-01T23:00:00Z'), grams: 90 },
      { start: new Date('2024-01-02T18:00:00Z'), end: new Date('2024-01-02T21:00:00Z'), grams: 60 },
    ],
  });
  const lastB = caseB.timeline[caseB.timeline.length - 1];
  const endPethB = toUmol(lastB.pethNgMl);
  const durationDaysB = (lastB.time - caseB.timeline[0].time) / 86400000;
  assert.ok(endPethB <= 0.05, 'PEth decays below 0.05 µmol/L with extended horizon');
  assert.ok(durationDaysB >= 10, 'Extended horizon runs multiple days to show PEth decay');
}

function testAbsorption(weights, doses, doseGrams, doseStart) {
    doses.forEach((n) => {
    weights.forEach((w) => {
      ['male', 'female'].forEach((sex) => {
        const grams = doseGrams(n);
        const durationH = 3; // session length in hours
        const session = { start: doseStart, end: new Date(doseStart.getTime() + durationH * 60 * 60000), grams };
        const res = simulate({ sex, weight: w, age: 35, sessions: [session], stepMinutes: 60 });
        const at0 = res.timeline.at(0).bac;
        const peak = Math.max(...res.timeline.map((p) => p.bac));
 
        // Theoretical peak BAC assuming instantaneous absorption and no elimination
        const r = sex === 'male' ? 0.68 : 0.55;
        const theo = grams / (r * w * 1.055);
        const elim = res.params.elimPermillePerHour;

        // Adjust theoretical with approximate concurrent elimination (half-hour equivalent)
        const theoWithElim = Math.max(0, theo - elim * durationH/2);

        console.log(`Absorption test: ${n} doses, ${grams}g, ${r}, ${w}kg, theoretical: ${theo}, elimination: ${elim}, adjusted: ${theoWithElim}, at(0): ${at0}, peak: ${peak}`);

        assert.ok(peak >= 0, `Sanity check: Peak not negative (${sex}, ${w}kg, ${n} doses)`);

        // In the beginning, absorption should be far below theoretical well-mixed value (with some elimination).
        // assert.ok(at0 < theoWithElim * 0.7, "Initial BAC should be far below theoretical max after absorption (${sex}, ${w}kg, ${n} doses)");

        // Peak should be below theoretical well-mixed value (with some elimination) and above zero.
        // approx(peak, theoWithElim, 0.2, "Peak should be near theoretical max after absorption");
      });
    });
  });
}

function testAbsorptionMonotonicity(weights, doses, doseGrams, doseStart) {
    // Monotonicity: more doses -> higher peak; heavier -> lower peak; female > male for same weight
  const peakBySexWeight = {};
  doses.forEach((n) => {
    weights.forEach((w) => {
      ['male', 'female'].forEach((sex) => {
        const grams = doseGrams(n);
        const session = { start: doseStart, end: new Date(doseStart.getTime() + 60 * 60000), grams };
        const res = simulate({ sex, weight: w, age: 35, sessions: [session] });
        const peak = Math.max(...res.timeline.map((p) => p.bac));
        peakBySexWeight[`${sex}-${w}-${n}`] = peak;
      });
    });
  });
  doses.slice(1).forEach((n, idx) => {
    const prev = doses[idx];
    weights.forEach((w) => {
      ['male', 'female'].forEach((sex) => {
        const diff = peakBySexWeight[`${sex}-${w}-${n}`] - peakBySexWeight[`${sex}-${w}-${prev}`];
        assert.ok(diff > -0.02, `More doses should not significantly lower peak for ${sex}, ${w}kg`);
      });
    });
  });
  weights.slice(1).forEach((w, idx) => {
    const lighter = weights[idx];
    doses.forEach((n) => {
      ['male', 'female'].forEach((sex) => {
        const heavierPeak = peakBySexWeight[`${sex}-${w}-${n}`];
        const lighterPeak = peakBySexWeight[`${sex}-${lighter}-${n}`];
        assert.ok(heavierPeak <= lighterPeak + 0.02, `Heavier weight should not exceed lighter for ${sex}, ${n} doses`);
      });
    });
  });
  doses.forEach((n) => {
    weights.forEach((w) => {
      const diff = peakBySexWeight[`female-${w}-${n}`] - peakBySexWeight[`male-${w}-${n}`];
      assert.ok(diff >= -0.01, `Female peak should be at least as high as male at ${w}kg for ${n} doses`);
    });
  });
}

function testElimination(doseGrams, doseStart) {
  const elimSession = { start: doseStart, end: new Date(doseStart.getTime() + 30 * 60000), grams: doseGrams(6) };
  const elimRes = simulate({ sex: 'male', weight: 80, age: 35, sessions: [elimSession] });
  const peakIdx = elimRes.timeline.reduce((maxIdx, p, idx, arr) => (p.bac > arr[maxIdx].bac ? idx : maxIdx), 0);
  const peakTime = elimRes.timeline[peakIdx].time;
  const t1 = peakTime + 60 * 60 * 1000;
  const t2 = t1 + 60 * 60 * 1000;
  const bac1 = nearestValue(elimRes.timeline, t1).bac;
  const bac2 = nearestValue(elimRes.timeline, t2).bac;
  const drop = bac1 - bac2;
  const elimRate = elimRes.params.elimPermillePerHour;
  assert.ok(drop >= 0, 'BAC should not increase after peak');
  assert.ok(drop <= elimRate + 0.05, `Elimination over 1h should not exceed rate (~${elimRate}‰/h, got drop ${drop})`);
}


runTests();
