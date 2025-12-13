# PEth / BAC Simulator (browser)

Single-page HTML app that lets you simulate blood alcohol concentration curves and resulting phosphatidylethanol (PEth) formation/decay. Open `index.html` in a browser.

You can use the simulator [here](http://magi.fi/ohjelmointi/bio/peth-sim/) (not necessarily the latest version).

Creator: Marko Grönroos, magi@iki.fi, [magi.fi](https://magi.fi/), 2025.<br />

## Quick start

```bash
# open directly from disk
xdg-open index.html   # or open index.html with your browser
```

Adjust sex, weight, age, and add one or more drinking sessions (start/end + grams of ethanol). Click **Run simulation** to view BAC (‰) and PEth (ng/mL) curves.

PEth half-life (days) is configurable; defaults to 4.5 days.

## Tests (Node-only)

Requires only Node (no extra packages). Run:

```bash
npm test
```

## Model (simplified)

### References
The references inform parameter ranges and physiology:

Alcohol absorption and elimination:
- [Watson et al, 1981, Prediction of blood alcohol concentrations in human subjects. Updating the Widmark Equation.](https://doi.org/10.15288/jsa.1981.42.547)
- [Maskell et al, 2018, Evidence based survey of the distribution volume of ethanol: Comparison of empirically determined values with anthropometric measures.](https://doi.org/10.1016/j.forsciint.2018.10.033)
- [A. Jones, 2010, Evidence-based survey of the elimination rates of ethanol from blood with applications in forensic casework](https://doi.org/10.1016/j.forsciint.2010.02.021)

PEth formation:
- [Schröck et al, 2018 Determination of the formation rate of phosphatidylethanol by phospholipase D (PLD) in blood and test of two selective PLD inhibitors (PubMed 30103144)](https://pubmed.ncbi.nlm.nih.gov/30103144/)
- [Stöth et al, 2023 Increase of PEth after Single Consumption of Alcohol and Evaluation of a Volumetric DBS Filter Paper Device  (PubMed 36790103)](https://pubmed.ncbi.nlm.nih.gov/36790103/) describe PEth kinetics and half-life variability.

This simulator uses lightweight heuristic choices for interactivity, not for clinical use.

### Blood alcohol
- Widmark volume of distribution: `r = 0.68` (male), `0.55` (female), multiplied by blood-water density `1.055` to convert to kg of water.
- Absorption: first-order from stomach with `k_abs ≈ 2 / h` on an empty stomach (t½ ~0.35 h), capped at ~80 g/h; meal selection scales both (e.g., heavy meal factor ~0.45, light snack ~0.8) to reflect slower gastric emptying and lower peak BAC from fed conditions.
- Elimination: zero-order `0.15‰ / h` (≈0.015 g/dL/h). Age factor scales ±0.3% per year around 40 (bounded to 0.85–1.25x); grams/hour uses the same volume factor as BAC.
- Concentration in ‰: `BAC = grams_in_body / (r * weight_kg * 1.055)`.

### PEth synthesis/decay
- Formation proportional to BAC with linear scaling: configurable.
  The literatue shows that the formation rate is somewhat nonlinear to BAC, but we use a simple linear scaling model.
  The default is a heuristic chosen from literature at 1‰, so that it typically balances in concentrations above and below:
  - `0.01% BAC (0.1 ‰): 0.002 μmol/L/h` → `0.002 × 704.6 ≈ 1.4 ng/mL/h.`
  - `0.1% BAC (1 ‰): 0.016 μmol/L/h` → `0.016 × 704.6 ≈ 11.3 ng/mL/h.` (used for the default)
  - `0.2% BAC (2 ‰): 0.025 μmol/L/h` → `0.025 × 704.6 ≈ 17.6 ng/mL/h.`
  - `0.3% BAC (3 ‰): 0.029 μmol/L/h` → `0.029 × 704.6 ≈ 20.4 ng/mL/h.`
  
- Decay first-order with half-life `t½ = 4.5 days` (`k = ln(2)/(4.5*24)`).
- Output is displayed as `µmol/L`, assuming PEth 16:0/18:1 molecular weight ≈704.6 g/mol (`µmol/L = ng/mL / 704.6`).

### Simulation loop
- Time step: 5 minutes; horizon = max(96 h, last_drink_end + 48 h from first drink).
- Input ethanol is evenly ingested across each session duration, then absorbed and eliminated each step.
- Outputs: BAC curve, PEth curve, peak BAC, hours above 0.5‰, peak PEth.

## Caveats
- Not a clinical or forensic tool; parameters are deliberately conservative and simplified.
- Breath/urine conversion, liver disease, meds, and inter-individual kinetics are ignored.
- PEth formation varies widely by person and drinking pattern; use this only for qualitative exploration.

## Files
- `index.html` – App markup and asset references.
- `style.css` – Styling for the simulator.
- `main.js` – UI wiring and simulation logic.

Feel free to tweak constants in the script section to better match specific datasets.
