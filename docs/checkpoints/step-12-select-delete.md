# Checkpoint 12: Select And Delete

## Step Goal

Allow users to select an existing score event and delete it.

## Expected Result

- Score events are clickable.
- The selected event has a visible selected state.
- The editor state panel shows the selected event id.
- The Delete toolbar action removes only the selected event.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Domain tests verify find/delete behavior.
- App tests verify selecting and deleting a placed event.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 7 test files and 29 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
