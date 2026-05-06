# Checkpoint 08: Ghost Note And Rest

## Step Goal

Show a translucent preview event while the user hovers over the staff.

## Expected Result

- Hover position can render as a ghost note.
- Rest mode can render as a ghost rest.
- Ghost rendering follows the selected duration.
- Ghost geometry uses the same staff coordinate system as interaction mapping.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Unit tests verify notation geometry.
- Renderer tests verify ghost note rendering.
- Renderer tests verify ghost rest rendering.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 6 test files and 18 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
