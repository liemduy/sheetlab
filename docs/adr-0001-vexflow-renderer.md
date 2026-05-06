# ADR 0001: Use VexFlow For V0.2 Notation Rendering

## Status

Accepted for V0.2.

## Context

The V0.1 renderer draws staff lines, clefs, notes, rests, and stems manually in SVG. It is useful for validating interaction logic, but it does not look credible as sheet music. Clefs, rests, accidentals, and note spacing need a notation-aware renderer.

The project already has a renderer-independent score model. Playback, persistence, and editing actions all use that model.

## Decision

Use VexFlow as the V0.2 notation renderer.

The internal score model remains the source of truth. VexFlow is an adapter/output layer only.

## Consequences

- Clefs, notes, rests, accidentals, and staff layout become more musically credible.
- The editor can keep hover/click interaction by placing an overlay above the VexFlow SVG.
- Renderer code needs a mapping layer from `ScoreEvent` to VexFlow note data.
- Tests should focus on adapter output and preserved editor behavior rather than exact VexFlow DOM internals.

## Alternatives Considered

- Continue custom SVG drawing: fastest short term, but it would keep accumulating engraving problems.
- OpenSheetMusicDisplay: strong for MusicXML display, less direct for an interactive note-entry editor at this phase.
- Full custom engraving engine: too large for the current MVP.

## Guardrails

- Do not store VexFlow objects inside the score model.
- Do not make playback depend on VexFlow layout.
- Keep a small fallback/simple renderer path available until VexFlow integration is stable.
- Keep interaction geometry in project-owned modules.
