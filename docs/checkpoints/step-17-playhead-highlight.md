# Checkpoint 17: Playhead And Highlight

## Step Goal

Show playback position visually while the score plays.

## Expected Result

- Playback state tracks elapsed seconds.
- The active timeline event is highlighted.
- The SVG renderer draws a vertical playhead at the current beat.
- Stop clears highlight and playhead state.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Timeline tests verify active event lookup and beat calculation.
- App tests verify a playing event receives the active class.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 9 test files and 39 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
