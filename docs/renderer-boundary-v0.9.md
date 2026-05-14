# Renderer Boundary V0.9

## Goal

Keep notation engraving, editor interaction, playback, and export from drifting
apart as the app adds more piano notation features.

## Source Of Truth

- The score model is the only persisted musical source of truth.
- VexFlow objects must not be stored in the score model.
- Playback must read score timing, tuplets, notes, chords, and voices from the
  score model, not from rendered SVG positions.
- Export must render the same score model that the editor uses.

## VexFlow Layer

Use VexFlow first for notation-specific drawing:

- staves, clefs, key signatures, time signatures, notes, rests, chords, stems,
  beams, tuplets, accidentals, articulations, ties, slurs, same-system
  glissando lines, and same-system pedal brackets;
- same-system hairpins through `StaveHairpin`;
- cross-system tie/slur continuations by splitting into renderer-owned
  VexFlow curves.

Allowed project-owned SVG inside the VexFlow layer:

- cross-system hairpin continuation segments where the VexFlow primitive is
  reused but anchored to system edges;
- cross-system pedal continuation segments. Same-system pedal remains VexFlow
  `PedalMarking`; continuation segments are manual because VexFlow has no
  stable open-ended sustain bracket primitive for line breaks.

Current explicit decision:

- Cross-system glissando is not rendered yet. Same-system glissando uses
  VexFlow `StaveLine`. A future cross-system glissando feature needs a clear
  engraving rule before it is enabled.

## Overlay Layer

The overlay is interaction-only:

- hover slot box and ghost note;
- note/chord hit targets and drag handles;
- lyric-map dashed connectors and selection affordances;
- debug layout zones.

Notation marks must not leak into `.notation-overlay`. The browser stress QA
checks this with `overlayNotationMarkCount === 0`.

## Stress Fixture

`stressPianoHardeningFixture` covers the cases that have repeatedly broken:

- grand staff, multiple systems, dense measures, voice 1 and voice 2;
- tuplets 2 through 9;
- lyric map one-to-one and one-to-many;
- dynamics, chord symbols, articulations, fermata, pedal, hairpin, glissando;
- clef changes inside a staff;
- high and low ledger notes;
- cross-system tie, slur, hairpin, and pedal.

## Required Hardening Gate

Run this before expanding notation features that touch rendering, timing,
export, or interaction:

```bash
npm run test:hardening
```

For broader release checks, also run:

```bash
npm run test:gate
```

Browser evidence from the stress QA is written under
`artifacts/browser-qa/stress-*/` and includes the rendered screenshot,
downloaded JSON, downloaded PDF, and metrics report.
