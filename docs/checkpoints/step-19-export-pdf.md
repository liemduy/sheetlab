# Checkpoint 19: Export PDF

## Step Goal

Provide a basic PDF export path through the browser print dialog.

## Expected Result

- Toolbar includes `Export PDF`.
- Export calls `window.print()`.
- Print CSS hides editor chrome and keeps the paper/sheet visible.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- App tests verify `Export PDF` calls `window.print()`.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 10 test files and 42 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
