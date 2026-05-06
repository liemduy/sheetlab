# Checkpoint 06: Empty Staff Renderer

## Step Goal

Render the first SVG-based empty staff system for `treble` and `grand` score types.

## Expected Result

- The sheet area renders an SVG staff surface instead of a placeholder.
- `Treble only` renders one treble staff.
- `Grand staff piano` renders treble and bass staves with a connector.
- Staffs include clef placeholders, a `4/4` time signature, five staff lines, and measure barlines.
- The renderer reads from the internal score model.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Renderer tests verify treble staff output.
- Renderer tests verify grand staff output.
- App tests continue to pass after replacing the placeholder.
- Typecheck and production build pass.

## Result

- `npm.cmd run test` passed with 4 test files and 11 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
