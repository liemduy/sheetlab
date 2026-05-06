# Checkpoint 11: Measure Capacity

## Step Goal

Prevent invalid event placement inside a measure.

## Expected Result

- Events that exceed the measure length are rejected.
- Events at the same beat replace the existing event.
- Events that overlap existing events at different beats are rejected.
- The editor shows a status message after placement attempts.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Domain tests verify measure overflow rejection.
- Domain tests verify same-beat replacement.
- Domain tests verify overlap rejection.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 7 test files and 27 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
