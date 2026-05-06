# Checkpoint 15: Playback Timeline

## Step Goal

Convert the score model into a time-based playback timeline.

## Expected Result

- Timeline events include staff, measure, beat, start beat, duration beats, start seconds, and duration seconds.
- Tempo controls seconds-per-beat conversion.
- Grand staff events can occur simultaneously.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Timeline tests verify quarter-note timing.
- Timeline tests verify grand staff simultaneous events.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 8 test files and 35 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
