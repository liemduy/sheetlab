# Checkpoint 18: Save And Load JSON

## Step Goal

Allow users to persist the current project as internal JSON.

## Expected Result

- Save stores the current score JSON in localStorage.
- Load restores the saved score and syncs score type/tempo controls.
- Import JSON restores a project from a downloaded file.
- Download JSON creates a browser JSON download.
- Save/load uses the existing score serializer.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Persistence tests verify storage roundtrip.
- App tests verify save -> reset -> load restores an event.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 10 test files and 43 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
