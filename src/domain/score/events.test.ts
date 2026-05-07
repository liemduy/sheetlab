import { describe, expect, it } from 'vitest';
import {
  formatEventPitchList,
  getEventPitches,
  getPrimaryEventPitch,
  isPitchedScoreEvent,
} from './events';
import type { ScoreEvent } from './types';

const chord: ScoreEvent = {
  id: 'c-major',
  kind: 'chord',
  beat: 0,
  duration: 'quarter',
  pitches: [
    { step: 'C', octave: 4 },
    { step: 'E', octave: 4 },
    { step: 'G', octave: 4 },
  ],
};

describe('score events', () => {
  it('treats note and chord events as pitched events', () => {
    expect(isPitchedScoreEvent(chord)).toBe(true);
    expect(
      isPitchedScoreEvent({
        id: 'rest',
        kind: 'rest',
        beat: 0,
        duration: 'quarter',
      }),
    ).toBe(false);
  });

  it('returns all pitches for chord events and the single pitch for note events', () => {
    expect(getEventPitches(chord)).toHaveLength(3);
    expect(
      getEventPitches({
        id: 'note',
        kind: 'note',
        beat: 0,
        duration: 'quarter',
        pitch: { step: 'B', octave: 4 },
      }),
    ).toEqual([{ step: 'B', octave: 4 }]);
  });

  it('uses the first chord pitch as the primary display pitch', () => {
    expect(getPrimaryEventPitch(chord)).toEqual({ step: 'C', octave: 4 });
    expect(
      getPrimaryEventPitch({
        id: 'rest',
        kind: 'rest',
        beat: 0,
        duration: 'quarter',
      }),
    ).toBeNull();
  });

  it('formats chord pitch labels', () => {
    expect(
      formatEventPitchList(
        chord,
        (pitch) => `${pitch.step}${pitch.octave}`,
      ),
    ).toBe('C4 E4 G4');
  });
});
