import { describe, expect, it } from 'vitest';
import { tryPlaceTupletGroup } from '../../domain/score/editing';
import { createEmptyScore } from '../../domain/score/factories';
import type { RenderedEventLayout } from './renderedEventLayout';
import { snapPositionToInputGrid } from './overlayPositioning';

function createLayout(
  x: number,
  beat: number,
  kind: RenderedEventLayout['kind'] = 'rest',
): RenderedEventLayout {
  return {
    beat,
    isGeneratedRest: false,
    kind,
    maxX: x + 6,
    maxY: 120,
    measureIndex: 0,
    minX: x - 6,
    minY: 100,
    pitchLayouts: [],
    staffId: 'treble',
    voiceIndex: 0,
    x,
    y: 110,
  };
}

describe('overlay positioning', () => {
  it('keeps the rendered triplet slot beat instead of snapping back to the regular grid', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'overlay-triplet',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const eventLayouts: Record<string, RenderedEventLayout> = {
      'overlay-triplet': createLayout(100, 0, 'note'),
      'tuplet-overlay-triplet-rest-1': createLayout(140, 0.3333),
      'tuplet-overlay-triplet-rest-2': createLayout(180, 0.6667),
    };
    const snappedPosition = snapPositionToInputGrid(
      {
        beat: 0.5,
        measureIndex: 0,
        pitch: { step: 'C', octave: 4 },
        staffId: 'treble',
        staffIndex: 0,
        x: 170,
        y: 110,
      },
      'eighth',
      0,
      tripletResult.score,
      eventLayouts,
      0,
    );

    expect(snappedPosition.beat).toBe(0.6667);
    expect(snappedPosition.x).toBe(180);
  });
});
