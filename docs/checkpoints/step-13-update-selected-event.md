# Checkpoint 13: Update Selected Event

## Step Goal

Allow basic edits to a selected event without deleting and re-entering it.

## Expected Result

- Selecting an event and choosing a duration updates that event.
- Selecting a note and changing accidental updates that note.
- Invalid duration updates are rejected by measure capacity rules.
- Renderer output reflects updated duration/accidental.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Domain tests verify duration/accidental update.
- Domain tests verify invalid duration update rejection.
- App tests verify toolbar updates the selected event.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 7 test files and 32 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
