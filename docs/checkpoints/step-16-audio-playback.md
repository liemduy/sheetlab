# Checkpoint 16: Audio Playback

## Step Goal

Connect the playback timeline to a Play/Stop control and browser audio.

## Expected Result

- Play builds a timeline from the score.
- Play starts Tone.js audio in browsers with Web Audio support.
- Test environments without Web Audio use a safe no-op controller.
- Stop cancels playback state and scheduled controller cleanup.

## Tests

- Run `npm.cmd run test`.
- Run `npm.cmd run typecheck`.
- Run `npm.cmd run build`.

## Pass Criteria

- Pitch helper tests verify MIDI/frequency/note-name conversion.
- App tests verify Play/Stop button state.
- Existing tests still pass.

## Result

- `npm.cmd run test` passed with 9 test files and 38 tests.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.

## Status

Passed on 2026-05-06.
