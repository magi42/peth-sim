// Minimal test harness using Node built-ins (no external deps required).
const assert = require('assert');
const { simulate, toUmol } = require('../sim');

function approx(actual, expected, tol, message) {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tol, `${message} (expected ${expected}±${tol}, got ${actual})`);
}

function runTests() {
  // 1) Empty sessions returns null
  assert.strictEqual(simulate({ sex: 'male', weight: 80, age: 35, sessions: [] }), null, 'Empty sessions should return null');

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
  approx(peakA, 0.781, 0.03, 'Peak BAC for 60g/2h male 80kg');
  approx(timeOverA, 2.58, 0.25, 'Hours over 0.5‰ for 60g/2h male 80kg');
  approx(peakPethA, 0.045, 0.01, 'Peak PEth µmol/L for 60g/2h male 80kg');
  assert.ok(caseA.timeline[caseA.timeline.length - 1].bac < 0.005, 'BAC returns near zero by end of horizon');

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

  console.log('All tests passed.');
}

runTests();
