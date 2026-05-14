import { describe, expect, it } from 'vitest';
import {
  tryPlaceScoreEvent,
  tryPlaceTupletGroup,
} from '../../domain/score/editing';
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

  it('uses rendered columns for regular slots after a triplet in the same measure', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'post-triplet-group',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const noteResult = tryPlaceScoreEvent(tripletResult.score, {
      eventId: 'post-triplet-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });
    const eventLayouts: Record<string, RenderedEventLayout> = {
      'post-triplet-group': createLayout(100, 0, 'note'),
      'tuplet-post-triplet-group-rest-1': createLayout(135, 0.3333),
      'tuplet-post-triplet-group-rest-2': createLayout(170, 0.6667),
      'post-triplet-note': createLayout(245, 1, 'note'),
    };
    const snappedPosition = snapPositionToInputGrid(
      {
        beat: 1,
        measureIndex: 0,
        pitch: { step: 'D', octave: 4 },
        staffId: 'treble',
        staffIndex: 0,
        x: 190,
        y: 110,
      },
      'eighth',
      0,
      noteResult.score,
      eventLayouts,
      0,
    );

    expect(snappedPosition.beat).toBe(1);
    expect(snappedPosition.x).toBe(245);
  });

  it('prefers the rendered pointer column over an exact beat match while entering tuplets', () => {
    const tripletResult = tryPlaceTupletGroup(createEmptyScore('treble'), {
      eventId: 'pointer-triplet-group',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      actualNotes: 3,
      pitch: { step: 'C', octave: 4 },
    });
    const noteResult = tryPlaceScoreEvent(tripletResult.score, {
      eventId: 'pointer-post-triplet-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });
    const eventLayouts: Record<string, RenderedEventLayout> = {
      'pointer-triplet-group': createLayout(100, 0, 'note'),
      'tuplet-pointer-triplet-group-rest-1': createLayout(135, 0.3333),
      'tuplet-pointer-triplet-group-rest-2': createLayout(170, 0.6667),
      'pointer-post-triplet-note': createLayout(245, 1, 'note'),
    };
    const snappedPosition = snapPositionToInputGrid(
      {
        beat: 1,
        measureIndex: 0,
        pitch: { step: 'F', octave: 4 },
        staffId: 'treble',
        staffIndex: 0,
        x: 135,
        y: 110,
      },
      'eighth',
      0,
      noteResult.score,
      eventLayouts,
      0,
      { preferRenderedPosition: true },
    );

    expect(snappedPosition.beat).toBe(0.3333);
    expect(snappedPosition.x).toBe(135);
  });

  it('uses rendered columns for regular notes when the visual column diverges from the beat grid', () => {
    const first = tryPlaceScoreEvent(createEmptyScore('treble'), {
      eventId: 'dense-regular-0',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const second = tryPlaceScoreEvent(first.score, {
      eventId: 'dense-regular-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0.5,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });
    const third = tryPlaceScoreEvent(second.score, {
      eventId: 'dense-regular-2',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const fourth = tryPlaceScoreEvent(third.score, {
      eventId: 'dense-regular-3',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1.5,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'F', octave: 4 },
    });
    const eventLayouts: Record<string, RenderedEventLayout> = {
      'dense-regular-0': createLayout(100, 0, 'note'),
      'dense-regular-1': createLayout(145, 0.5, 'note'),
      'dense-regular-2': createLayout(190, 1, 'note'),
      'dense-regular-3': createLayout(260, 1.5, 'note'),
    };
    const snappedPosition = snapPositionToInputGrid(
      {
        beat: 1,
        measureIndex: 0,
        pitch: { step: 'F', octave: 4 },
        staffId: 'treble',
        staffIndex: 0,
        x: 250,
        y: 110,
      },
      'quarter',
      0,
      fourth.score,
      eventLayouts,
      0,
      { preferRenderedPosition: true },
    );

    expect(snappedPosition.beat).toBe(1.5);
    expect(snappedPosition.x).toBe(260);
  });

  it('does not borrow a regular note boundary as a smaller-duration input slot', () => {
    const first = tryPlaceScoreEvent(createEmptyScore('treble'), {
      eventId: 'long-note-0',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'C', octave: 4 },
    });
    const second = tryPlaceScoreEvent(first.score, {
      eventId: 'long-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 2,
      duration: 'half',
      entryMode: 'note',
      pitch: { step: 'D', octave: 4 },
    });
    const eventLayouts: Record<string, RenderedEventLayout> = {
      'long-note-0': createLayout(100, 0, 'note'),
      'long-note-1': createLayout(220, 2, 'note'),
    };
    const snappedPosition = snapPositionToInputGrid(
      {
        beat: 1,
        measureIndex: 0,
        pitch: { step: 'F', octave: 4 },
        staffId: 'treble',
        staffIndex: 0,
        x: 160,
        y: 110,
      },
      'eighth',
      0,
      second.score,
      eventLayouts,
      0,
      { preferRenderedPosition: true },
    );

    expect(snappedPosition.beat).toBe(1);
    expect(snappedPosition.x).not.toBe(100);
    expect(snappedPosition.x).not.toBe(220);
  });
});
