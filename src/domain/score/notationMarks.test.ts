import { describe, expect, it } from 'vitest';
import { placeScoreEvent, setMeasureRepeatJump } from './editing';
import { createEmptyScore } from './factories';
import { getScoreNotationMarks } from './notationMarks';

describe('notation marks', () => {
  it('normalizes legacy event, range, measure, and barline marks into one view', () => {
    const firstScore = placeScoreEvent(createEmptyScore('treble'), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'mark-source',
      measureIndex: 0,
      pitch: { octave: 4, step: 'C' },
      staffId: 'treble',
    });
    const score = setMeasureRepeatJump(
      {
        ...firstScore,
        parts: firstScore.parts.map((part) => ({
          ...part,
          staves: part.staves.map((staff) => ({
            ...staff,
            measures: staff.measures.map((measure) =>
              measure.index === 0
                ? {
                    ...measure,
                    sectionMarker: 'A',
                    voices: measure.voices.map((voice) => ({
                      ...voice,
                      events: voice.events.map((event) =>
                        event.id === 'mark-source'
                          ? {
                              ...event,
                              articulations: ['accent', 'staccato'],
                              dynamic: 'mf',
                              fermata: true,
                            }
                          : event,
                      ),
                    })),
                  }
                : measure,
            ),
          })),
        })),
      },
      0,
      'repeat-both',
    );

    expect(
      getScoreNotationMarks(score).map((mark) => ({
        kind: mark.kind,
        scope: mark.scope,
        value: 'value' in mark ? mark.value : undefined,
      })),
    ).toEqual(
      expect.arrayContaining([
        { kind: 'articulation', scope: 'note', value: 'accent' },
        { kind: 'articulation', scope: 'note', value: 'staccato' },
        { kind: 'dynamic', scope: 'note', value: 'mf' },
        { kind: 'fermata', scope: 'note', value: undefined },
        { kind: 'repeatJump', scope: 'measure', value: 'repeat-both' },
        { kind: 'repeatStart', scope: 'barline', value: undefined },
        { kind: 'repeatEnd', scope: 'barline', value: undefined },
        { kind: 'sectionMarker', scope: 'measure', value: 'A' },
      ]),
    );
  });
});
