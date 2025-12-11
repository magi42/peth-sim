# PEth / BAC Simulator (browser)

Single-page HTML app that lets you simulate blood alcohol concentration curves and resulting phosphatidylethanol (PEth) formation/decay. Open `index.html` in a browser.

## Quick start

```bash
# in this folder
xdg-open index.html   # or open index.html with your browser
```

Adjust sex, weight, age, and add one or more drinking sessions (start/end + grams of ethanol). Click **Run simulation** to view BAC (‰) and PEth (ng/mL) curves.

## Model (simplified)

References inform parameter ranges and physiology: e.g., Gnann et al. 2018 (PubMed 30103144) and Javors et al. 2023 (PubMed 36790103) describe PEth kinetics and half-life variability. This simulator uses lightweight heuristic choices for interactivity, not for clinical use.

### Blood alcohol
- Widmark volume of distribution: `r = 0.68` (male), `0.55` (female).
- Absorption: first-order from stomach with `k_abs = 1.5 / h`.
- Elimination: zero-order `0.15‰ / h` (≈0.015 g/dL/h). Age factor scales ±0.3% per year around 40 (bounded to 0.85–1.25x).
- Concentration in ‰: `BAC = grams_in_body / (r * weight_kg)`.

### PEth synthesis/decay
- Formation proportional to BAC: `8 ng/mL/h` at `1‰` BAC (linear scaling).
- Decay first-order with half-life `t½ = 4.5 days` (`k = ln(2)/(4.5*24)`).
- Starting PEth = 0 ng/mL.

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
