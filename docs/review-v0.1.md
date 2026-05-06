# SheetLab V0.1 Review

## Product Findings

- The core editing loop exists, but the notation surface still feels more like a debug SVG editor than sheet music.
- Clefs must use real music glyphs or a notation font. Letter placeholders such as `G` and `F` break trust immediately.
- Noteheads, stems, rests, and accidentals are still simplified placeholders. They are enough for logic testing, not enough for a music product demo.
- The toolbar is functional but too text-heavy for repeated editing. Real users will expect compact icon controls, keyboard shortcuts, and visible selected tool groups.
- Save/load works, but import/export validation is thin. Invalid project schemas can still parse as JSON and then fail later in the UI.
- Playback works at a prototype level, but tempo edits do not currently enter undo history.
- The score model is intentionally narrow: one voice per staff, no chords, no ties, no tuplets, no lyrics, and no MusicXML.

## Technical Findings

- `App.tsx` now owns too much orchestration: score editing, history, persistence, playback, and file import. This should become feature hooks or controllers before the next major phase.
- `StaffRenderer.tsx` mixes layout, interaction, event rendering, ghost rendering, selection, and playhead rendering. It needs smaller subcomponents as notation complexity grows.
- Tests are strong for state transitions, but visual correctness is under-tested. Clef rendering, print layout, and realistic score appearance need browser/screenshot QA.
- The notation renderer should move toward VexFlow or a dedicated engraving layer soon. Hand-drawn SVG is okay for the first interaction prototype, but it will become expensive quickly.

## Real User Test Scenarios

1. Create a treble-only melody: open the app, place eight quarter notes, change two durations, add one accidental, undo once, redo once, play, save, reset, load.
2. Create a grand staff sketch: switch to `Grand staff piano`, place right-hand notes on treble and left-hand notes on bass, play back, confirm both staves highlight during playback.
3. Correct a mistake: place a note on the wrong beat, select it, delete it, place it again, then verify event count and playback are correct.
4. Capacity edge case: place a half note at beat 1, try placing an overlapping quarter note, confirm the app rejects it clearly and does not corrupt the measure.
5. Persistence roundtrip: create a score, save, download JSON, reset, import JSON, confirm score type, tempo, events, playback, and export PDF still work.
6. Print/export: create a short score, click `Export PDF`, confirm the print preview shows only the paper and notation, not the toolbar or side panel.
7. Mobile sanity pass: open the app at mobile width, confirm controls do not overlap, sheet scrolls horizontally, and no text escapes buttons.

## Next Quality Bar

- Make the visible score look like music first: real clefs, better noteheads, rests, accidentals, ledger lines, and page layout.
- Replace text-heavy toolbar controls with icon or segmented notation controls.
- Add schema validation for imported JSON.
- Split app orchestration into hooks: editor state, score history, playback, persistence.
- Add browser-level visual QA for staff rendering and print mode.
