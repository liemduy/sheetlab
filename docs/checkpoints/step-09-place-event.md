# Checkpoint 09: Click To Place Note And Rest

## Step Goal

Connect staff clicks to the score model so the editor can place real note/rest events.

## Expected Result

- The app stores a real `Score` in React state.
- Clicking a mapped staff position adds a note or rest event to the score.
- The SVG renderer draws score events from the model.
- Score type and tempo controls update the active score state.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Domain tests verify note placement.
- Domain tests verify rest placement.
- App tests verify a click places a visible score event.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 7 test files and 21 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
