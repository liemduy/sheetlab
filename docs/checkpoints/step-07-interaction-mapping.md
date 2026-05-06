# Checkpoint 07: Interaction Mapping

## Step Goal

Map SVG pointer coordinates to musical position data.

## Expected Result

- The interaction layer can return `staffId`, `staffIndex`, `measureIndex`, snapped `beat`, and `pitch`.
- Treble and bass staff mapping both work.
- Hover state is visible in the editor state panel.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Unit tests verify treble mapping.
- Unit tests verify bass mapping.
- Unit tests verify points outside the staff return `null`.
- Existing app and renderer tests still pass.

## Result

- `npm.cmd run test` passed with 5 test files and 14 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
