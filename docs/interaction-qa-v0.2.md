# V0.2 Interaction QA: Hover And Place Note

## User-Like Scenario

Goal: verify the most basic editor loop feels correct.

1. Open `http://localhost:5173/`.
2. Scroll to the treble staff.
3. Move the pointer over a visible staff line.
4. Confirm the ghost note appears on the intended line/space.
5. Click the same point.
6. Confirm the placed note matches the pitch and beat the user pointed at.

## Finding

Manual browser testing showed the core interaction was not accurate enough:

- A click around the visible middle treble staff area produced a note around `B3`.
- The expected pitch around the middle treble line is `B4`.
- This meant the visible VexFlow staff and the transparent interaction overlay were not sharing the same vertical coordinate system.
- A later real-browser screenshot showed a second mismatch: the pointer, ghost note, and placed VexFlow glyph could disagree horizontally because the VexFlow formatter was still allowed to choose note spacing independently from the editor grid.

## Root Cause

The overlay treated `getStaffTop(0)` as the first visible staff line, but VexFlow's `Stave` y position rendered the actual staff lines lower than that. The app was therefore mapping user pointer positions to a pitch roughly an octave too low.

The placed notes also went through VexFlow rhythmic formatting with hidden gap rests. That is good for engraving later, but wrong for the MVP editor loop: hover/click hit testing used `getBeatX`, while VexFlow's formatter could draw the actual glyph at another x position.

## Fix

VexFlow stave placement now subtracts `VEXFLOW_STAVE_TOP_LINE_OFFSET` so the first visible VexFlow staff line aligns with `getStaffTop`.

VexFlow now owns the staff, clef, time signature, and barlines only. Placed editor notes are drawn in the interaction overlay with the same `getBeatX/getPitchY` geometry as the ghost note and hit target. This removes the font/engraving offset that made the visual glyph disagree with direct manipulation.

## Automated Coverage Added

- `src/features/sheet/StaffRenderer.test.tsx`
  - Verifies the first VexFlow staff line is aligned with overlay pitch geometry.
  - Verifies real pointer coordinates on the visible middle treble line map to `B4`.
  - Verifies ghost, hit target, and placed editor notehead share the same editor-grid center.
  - Verifies VexFlow no longer renders event note glyphs that can diverge from the overlay.

- `src/App.test.tsx`
  - Simulates a real-sized SVG bounding box.
  - Moves the pointer to the treble middle line.
  - Confirms hover state shows `treble M1 B1 B4`.
  - Clicks the same point.
  - Confirms the placed event is `Note B4 measure 1 beat 1`.
  - Confirms the placed editor notehead center matches the ghost note center.

## Manual Browser QA Added

- Use the in-app browser at `http://localhost:5173/`.
- Scroll until the treble staff is visible.
- Move the mouse to a visible staff line.
- Confirm the ghost appears under the cursor, not displaced.
- Click the same physical point.
- Confirm DOM state reports one placed event and the VexFlow note center equals the ghost center.
- Confirm DOM state reports one placed event and the editor notehead `cx/cy` equals the ghost center.
- Inspect screenshots before and after click when visual alignment is in doubt.

## Pass Criteria

- Focused interaction tests pass.
- Full unit suite passes.
- Typecheck passes.
- Production build passes.
- Real browser hover/click test shows matching ghost, hit target, and placed editor notehead centers.
