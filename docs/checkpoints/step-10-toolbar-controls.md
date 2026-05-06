# Checkpoint 10: Basic Toolbar Controls

## Step Goal

Complete the MVP toolbar controls needed before editing rules and selection.

## Expected Result

- Duration buttons remain functional.
- Note/rest mode remains functional.
- Accidental, score type, and tempo controls remain functional.
- Toolbar can add a measure.
- Toolbar can reset the current score.
- The state panel shows measure and event counts.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Domain tests verify measure insertion.
- Domain tests verify event counting.
- App tests verify add measure updates the rendered staff.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 7 test files and 24 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
