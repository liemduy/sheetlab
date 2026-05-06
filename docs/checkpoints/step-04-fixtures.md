# Checkpoint 04: Score Fixtures

## Step Goal

Create reusable sample scores for renderer, editor, playback, and regression tests.

## Expected Result

- `trebleStudyFixture` provides a four-measure treble-only score with note events.
- `grandStaffStudyFixture` provides a four-measure piano score with treble and bass staff material.
- Fixture data uses the same internal score model as the editor.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Fixture unit tests verify event counts, beats, durations, and staff structure.
- Fixtures survive JSON serialization/deserialization.
- Typecheck and production build pass.

## Result

- `npm.cmd run test` passed with 2 test files and 6 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
