# SheetLab

SheetLab is a browser-based sheet music editor prototype for the first MVP of the music learning project.

## Current V0.1 Features

- Create a `Treble only` or `Grand staff piano` score.
- Render SVG staff notation from the internal score model.
- Hover the staff to map pointer position to staff, measure, beat, and pitch.
- Preview ghost note/rest placement.
- Click to place note/rest events.
- Select, update, delete, undo, and redo score events.
- Add measures and reset the score.
- Playback the score with Tone.js audio, playhead, and active note highlight.
- Save/load project JSON through localStorage.
- Import a JSON project file.
- Download the internal JSON project file.
- Export a basic PDF through the browser print dialog.

## Run Locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`.

## Verification

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
```

## Known V0.1 Limits

- SVG notation is intentionally simple and not engraving-perfect.
- Only one voice per staff is supported.
- MusicXML import/export is not implemented yet.
- MIDI piano practice and singing practice are future phases.
- PDF export uses browser print before a custom PDF/template pipeline exists.
