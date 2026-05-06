# Checkpoint 03: Score Model

## Step Goal

Create the typed internal score model that future renderer, editor input, playback, save/load, MIDI, and singing modules can share.

## Expected Result

- Score domain types exist in `src/domain/score/types.ts`.
- Score factory helpers exist in `src/domain/score/factories.ts`.
- The app can create empty `treble` and `grand` scores.
- Scores can be serialized to JSON and deserialized back.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Unit tests verify treble score structure.
- Unit tests verify grand staff structure.
- Unit tests verify JSON roundtrip.
- Typecheck and production build pass.

## Result

- `npm.cmd run test` passed with 1 test file and 3 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
