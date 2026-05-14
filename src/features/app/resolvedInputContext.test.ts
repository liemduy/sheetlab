import { describe, expect, it } from 'vitest';
import { createEmptyScore } from '../../domain/score/factories';
import { tryPlaceTupletGroup, placeScoreEvent } from '../../domain/score/editing';
import { DEFAULT_EDITOR_TOOL_STATE } from '../editor/editorState';
import { getBeatX } from '../sheet/notationGeometry';
import type { MusicPosition } from '../sheet/interaction';
import { resolveInputContext } from './resolvedInputContext';

function createPosition(beat: number, x = getBeatX(0, beat, 4)): MusicPosition {
  return {
    beat,
    measureIndex: 0,
    pitch: { step: 'C', octave: 4 },
    staffId: 'treble',
    staffIndex: 0,
    x,
    y: 0,
  };
}

describe('resolveInputContext', () => {
  it('trusts the rendered slot beat for an existing triplet slot', () => {
    const result = tryPlaceTupletGroup(createEmptyScore('treble'), {
      actualNotes: 3,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'triplet-entry',
      measureIndex: 0,
      pitch: { step: 'C', octave: 4 },
      staffId: 'treble',
      beat: 0,
    });
    const score = result.score;
    const context = resolveInputContext({
      position: createPosition(0.3333, getBeatX(0, 1 / 3, 4, score)),
      score,
      toolState: {
        ...DEFAULT_EDITOR_TOOL_STATE,
        duration: 'quarter',
        isInputArmed: true,
      },
    });

    expect(context.mode).toBe('existing-tuplet-slot');
    expect(context.cursor.beat).toBe(0.3333);
    expect(context.duration).toBe('eighth');
    expect(context.tuplet).toMatchObject({
      actualNotes: 3,
      index: 1,
      normalNotes: 2,
    });
  });

  it('keeps normal grid placement when no written slot is under the pointer', () => {
    const score = createEmptyScore('treble');
    const context = resolveInputContext({
      position: createPosition(1),
      score,
      toolState: {
        ...DEFAULT_EDITOR_TOOL_STATE,
        duration: 'quarter',
        isInputArmed: true,
      },
    });

    expect(context.mode).toBe('input-grid');
    expect(context.cursor.beat).toBe(1);
    expect(context.duration).toBe('quarter');
    expect(context.tuplet).toBeUndefined();
  });

  it('locks to an exact written slot without borrowing its non-tuplet duration', () => {
    const score = placeScoreEvent(createEmptyScore('treble'), {
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'written-note',
      measureIndex: 0,
      pitch: { step: 'C', octave: 4 },
      staffId: 'treble',
    });
    const context = resolveInputContext({
      position: createPosition(1, getBeatX(0, 1, 4, score)),
      score,
      toolState: {
        ...DEFAULT_EDITOR_TOOL_STATE,
        duration: 'eighth',
        isInputArmed: true,
      },
    });

    expect(context.mode).toBe('existing-rhythm-slot');
    expect(context.cursor.beat).toBe(1);
    expect(context.duration).toBe('eighth');
    expect(context.tuplet).toBeUndefined();
  });
});
