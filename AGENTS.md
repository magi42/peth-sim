# AGENTS.md

## Project

Browser-only BAC/PEth simulator. Keep the app dependency-light and runnable with the existing plain HTML/CSS/JS setup.

## Checks

Run before finishing code changes:

- `node --check main.js`
- `npm test`

## Model Notes

- UI alcohol amount is pure ethanol in mL. Simulation converts to grams with `0.789 g/mL`.
- `medium` in the text format maps to the internal `mixed` meal profile.
- Text format should preserve two decimals for parameter values and meal factors, except `step`, which is integer minutes.
- `InitialPEth` is optional. If absent or zero, PEth starts at `0`.
- If `InitialPEth` has a date before the first drinking session, simulation starts at that date.
- Session order in UI/text must not affect the simulation result.
- `Aika yli 0.5‰` / `Time over 0.5‰` is not total alcohol clearance time. `Alkoholi poistunut` / `Alcohol cleared` is the clearance metric.

## Editing Guidance

- Keep the app plain HTML/CSS/JS; do not introduce a framework.
- Preserve Finnish and English translations together.
- When changing model behavior, add or update `test/sim.test.js`.
- Keep text import/export backward-compatible where practical: missing optional lines should leave current/default values usable.
