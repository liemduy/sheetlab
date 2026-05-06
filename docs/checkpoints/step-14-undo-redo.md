# Checkpoint 14: Undo And Redo

## Step Goal

Add a minimal history stack for score-changing editor actions.

## Expected Result

- Add note/rest pushes history.
- Delete pushes history.
- Update selected event pushes history.
- Add measure and reset push history.
- Undo restores the previous score.
- Redo restores the undone score.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- App tests verify add -> undo -> redo.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 7 test files and 33 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
