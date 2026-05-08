import { describe, expect, it } from 'vitest';
import { placeScoreEvent } from '../../domain/score/editing';
import { createEmptyScore } from '../../domain/score/factories';
import type { InputCursor } from '../editor/inputCursor';
import { getBeatX } from './notationGeometry';
import {
  DEFAULT_INPUT_SLOT_WIDTH,
  getInputSlotLayout,
} from './inputSlotLayout';

function createCursor(update: Partial<InputCursor> = {}): InputCursor {
  return {
    beat: 0,
    duration: 'eighth',
    measureIndex: 0,
    mode: 'note-input',
    pitchPreview: { step: 'E', octave: 4 },
    staffId: 'treble',
    staffIndex: 0,
    ...update,
  };
}

describe('input slot layout', () => {
  it('centers the fallback slot box around the input column', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const cursor = createCursor({
      beat: 0,
      duration: 'thirtySecond',
    });
    const layout = getInputSlotLayout({ cursor, score });

    expect(layout.centerX).toBeCloseTo(getBeatX(0, 0, 4, score), 2);
    expect(layout.boxX).toBeLessThan(layout.centerX);
    expect(layout.boxX + layout.boxWidth).toBeGreaterThan(layout.centerX);
    expect(layout.boxWidth).toBe(DEFAULT_INPUT_SLOT_WIDTH);
  });

  it('keeps generated-rest slots on the beat grid instead of hidden rest glyphs', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'eighth-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const layout = getInputSlotLayout({
      cursor: createCursor({ beat: 0.5 }),
      eventLayouts: {
        'rest-treble-m1-t240-eighth': {
          beat: 0.5,
          isGeneratedRest: true,
          kind: 'rest',
          maxX: 999,
          measureIndex: 0,
          minX: 980,
          staffId: 'treble',
          x: 990,
        },
      },
      score,
    });

    expect(layout.layoutSource).toBe('beat-grid');
    expect(layout.centerX).toBeCloseTo(getBeatX(0, 0.5, 4, score), 2);
    expect(layout.boxWidth).toBe(DEFAULT_INPUT_SLOT_WIDTH);
  });

  it('keeps visual slot width stable while measure width expands', () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble', { measureCount: 4 }), {
      eventId: 'eighth-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'eighth',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const expandedScore = placeScoreEvent(firstScore, {
      eventId: 'sixteenth-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 1,
      duration: 'sixteenth',
      entryMode: 'note',
      pitch: { step: 'G', octave: 4 },
    });
    const firstLayout = getInputSlotLayout({
      cursor: createCursor({ beat: 0.5 }),
      score: firstScore,
    });
    const expandedLayout = getInputSlotLayout({
      cursor: createCursor({
        beat: 1.25,
        duration: 'sixteenth',
      }),
      score: expandedScore,
    });

    expect(getBeatX(0, 0.5, 4, expandedScore)).not.toBeCloseTo(
      getBeatX(0, 0.5, 4, firstScore),
      2,
    );
    expect(firstLayout.boxWidth).toBe(DEFAULT_INPUT_SLOT_WIDTH);
    expect(expandedLayout.boxWidth).toBe(DEFAULT_INPUT_SLOT_WIDTH);
  });

  it('uses visible event bounds only for real note columns', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      eventId: 'quarter-note-1',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'E', octave: 4 },
    });
    const layout = getInputSlotLayout({
      cursor: createCursor({
        beat: 0,
        duration: 'quarter',
      }),
      eventLayouts: {
        'quarter-note-1': {
          beat: 0,
          isGeneratedRest: false,
          kind: 'note',
          maxX: 166,
          measureIndex: 0,
          minX: 150,
          staffId: 'treble',
          x: 158,
        },
      },
      score,
    });

    expect(layout.layoutSource).toBe('vexflow');
    expect(layout.centerX).toBe(158);
    expect(layout.boxX).toBeLessThan(158);
    expect(layout.boxX + layout.boxWidth).toBeGreaterThan(158);
  });
});
