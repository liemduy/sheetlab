import { describe, expect, it } from 'vitest';
import {
  accidentalToVexFlow,
  buildVexFlowMeasureNotes,
  durationToVexFlowDuration,
  pitchToVexFlowKey,
  scoreEventToVexFlowSpec,
  splitBeatsIntoDurations,
} from './vexflowAdapter';

describe('vexflow adapter', () => {
  it('maps pitch and duration values to VexFlow notation strings', () => {
    expect(pitchToVexFlowKey({ step: 'C', octave: 4 })).toBe('c/4');
    expect(durationToVexFlowDuration('quarter')).toBe('q');
    expect(durationToVexFlowDuration('thirtySecond')).toBe('32');
    expect(durationToVexFlowDuration('half', true)).toBe('hr');
  });

  it('maps accidentals to VexFlow symbols', () => {
    expect(accidentalToVexFlow('sharp')).toBe('#');
    expect(accidentalToVexFlow('flat')).toBe('b');
    expect(accidentalToVexFlow('natural')).toBe('n');
  });

  it('maps note events to VexFlow note specs', () => {
    expect(
      scoreEventToVexFlowSpec(
        {
          id: 'event-note',
          kind: 'note',
          beat: 0,
          duration: 'quarter',
          pitch: { step: 'F', octave: 4, accidental: 'sharp' },
        },
        'treble',
      ),
    ).toEqual({
      eventId: 'event-note',
      beat: 0,
      keys: ['f/4'],
      duration: 'q',
      clef: 'treble',
      accidental: 'sharp',
      kind: 'note',
    });
  });

  it('maps chord events to one VexFlow note spec with multiple keys', () => {
    expect(
      scoreEventToVexFlowSpec(
        {
          id: 'event-chord',
          kind: 'chord',
          beat: 0,
          duration: 'quarter',
          pitches: [
            { step: 'C', octave: 4 },
            { step: 'E', octave: 4 },
            { step: 'G', octave: 4 },
          ],
        },
        'treble',
      ),
    ).toEqual({
      eventId: 'event-chord',
      beat: 0,
      keys: ['c/4', 'e/4', 'g/4'],
      duration: 'q',
      clef: 'treble',
      accidental: undefined,
      kind: 'chord',
    });
  });

  it('maps rest events to clef-aware VexFlow rest specs', () => {
    expect(
      scoreEventToVexFlowSpec(
        {
          id: 'event-rest',
          kind: 'rest',
          beat: 1,
          duration: 'half',
        },
        'bass',
      ),
    ).toEqual({
      eventId: 'event-rest',
      beat: 1,
      keys: ['d/3'],
      duration: 'hr',
      clef: 'bass',
      kind: 'rest',
    });
  });

  it('splits beat gaps into MVP duration values', () => {
    expect(splitBeatsIntoDurations(3.5)).toEqual(['half', 'quarter', 'eighth']);
    expect(splitBeatsIntoDurations(0.25)).toEqual(['sixteenth']);
    expect(splitBeatsIntoDurations(0.125)).toEqual(['thirtySecond']);
  });

  it('fills measure gaps with hidden rests for beat-accurate VexFlow layout', () => {
    expect(
      buildVexFlowMeasureNotes(
        [
          {
            id: 'late-note',
            kind: 'note',
            beat: 1,
            duration: 'quarter',
            pitch: { step: 'C', octave: 4 },
          },
          {
            id: 'visible-rest',
            kind: 'rest',
            beat: 3,
            duration: 'quarter',
          },
        ],
        'treble',
        4,
      ).map((note) => ({
        eventId: note.eventId,
        duration: note.duration,
        hidden: note.hidden,
        source: note.source,
      })),
    ).toEqual([
      {
        eventId: 'gap-treble-0.00-quarter',
        duration: 'qr',
        hidden: true,
        source: 'gap',
      },
      {
        eventId: 'late-note',
        duration: 'q',
        hidden: false,
        source: 'event',
      },
      {
        eventId: 'gap-treble-2.00-quarter',
        duration: 'qr',
        hidden: true,
        source: 'gap',
      },
      {
        eventId: 'visible-rest',
        duration: 'qr',
        hidden: false,
        source: 'event',
      },
    ]);
  });
});
