import { describe, expect, it } from 'vitest';
import { createEmptyScore } from './factories';
import { placeScoreEvent } from './editing';
import {
  assertNormalizedVoiceIsFull,
  getScoreRhythmIssues,
  normalizeMeasureVoice,
  normalizeScoreRhythm,
} from './rhythm';
import type { Score, ScoreEvent } from './types';

const FOUR_FOUR = { beats: 4, beatUnit: 4 };

describe('score rhythm normalization', () => {
  it('represents an empty measure as a full implicit rest', () => {
    expect(normalizeMeasureVoice([], FOUR_FOUR)).toEqual([
      {
        durationTicks: 1920,
        endTick: 1920,
        source: 'implicit-rest',
        startBeat: 0,
        startTick: 0,
      },
    ]);
  });

  it('fills gaps between events so the measure always has full duration', () => {
    const events: ScoreEvent[] = [
      {
        id: 'note-1',
        kind: 'note',
        beat: 0,
        duration: 'quarter',
        pitch: { step: 'C', octave: 4 },
      },
      {
        id: 'note-2',
        kind: 'note',
        beat: 2,
        duration: 'half',
        pitch: { step: 'E', octave: 4 },
      },
    ];

    expect(
      normalizeMeasureVoice(events, FOUR_FOUR).map((segment) => ({
        durationTicks: segment.durationTicks,
        eventId: segment.event?.id ?? null,
        source: segment.source,
        startTick: segment.startTick,
      })),
    ).toEqual([
      {
        durationTicks: 480,
        eventId: 'note-1',
        source: 'event',
        startTick: 0,
      },
      {
        durationTicks: 480,
        eventId: null,
        source: 'implicit-rest',
        startTick: 480,
      },
      {
        durationTicks: 960,
        eventId: 'note-2',
        source: 'event',
        startTick: 960,
      },
    ]);
  });

  it('keeps explicit rests as real event segments', () => {
    const events: ScoreEvent[] = [
      {
        id: 'rest-1',
        kind: 'rest',
        beat: 0,
        duration: 'half',
      },
    ];

    expect(
      normalizeMeasureVoice(events, FOUR_FOUR).map((segment) => ({
        durationTicks: segment.durationTicks,
        eventId: segment.event?.id ?? null,
        kind: segment.event?.kind ?? 'implicit-rest',
        source: segment.source,
      })),
    ).toEqual([
      {
        durationTicks: 960,
        eventId: 'rest-1',
        kind: 'rest',
        source: 'event',
      },
      {
        durationTicks: 960,
        eventId: null,
        kind: 'implicit-rest',
        source: 'implicit-rest',
      },
    ]);
  });

  it('rejects overlapping and overflowing event timelines', () => {
    expect(() =>
      normalizeMeasureVoice(
        [
          {
            id: 'long',
            kind: 'note',
            beat: 0,
            duration: 'half',
            pitch: { step: 'C', octave: 4 },
          },
          {
            id: 'overlap',
            kind: 'note',
            beat: 1,
            duration: 'quarter',
            pitch: { step: 'D', octave: 4 },
          },
        ],
        FOUR_FOUR,
      ),
    ).toThrow('Rhythm event overlap');

    expect(() =>
      normalizeMeasureVoice(
        [
          {
            id: 'overflow',
            kind: 'note',
            beat: 3.5,
            duration: 'half',
            pitch: { step: 'C', octave: 4 },
          },
        ],
        FOUR_FOUR,
      ),
    ).toThrow('Rhythm event overflows measure');
  });

  it('normalizes every voice in a score to full measure ticks', () => {
    const score = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'treble-note',
      staffId: 'treble',
      measureIndex: 0,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 5 },
    });
    const voices = normalizeScoreRhythm(score);

    expect(voices).toHaveLength(32);
    voices.forEach((voice) => {
      expect(voice.totalTicks).toBe(voice.measureTicks);
      expect(() => assertNormalizedVoiceIsFull(voice)).not.toThrow();
    });
  });

  it('reports invalid score rhythm by staff and measure without throwing globally', () => {
    const baseScore = createEmptyScore('grand', { measureCount: 1 });
    const score: Score = {
      ...baseScore,
      parts: baseScore.parts.map((part) => ({
        ...part,
        staves: part.staves.map((staff) =>
          staff.id === 'treble'
            ? {
                ...staff,
                measures: staff.measures.map((measure) => ({
                  ...measure,
                  voices: measure.voices.map((voice) => ({
                    ...voice,
                    events: [
                      {
                        id: 'long',
                        kind: 'note',
                        beat: 0,
                        duration: 'half',
                        pitch: { step: 'C', octave: 4 },
                      },
                      {
                        id: 'overlap',
                        kind: 'note',
                        beat: 1,
                        duration: 'quarter',
                        pitch: { step: 'D', octave: 4 },
                      },
                    ] satisfies ScoreEvent[],
                  })),
                })),
              }
            : {
                ...staff,
                measures: staff.measures.map((measure) => ({
                  ...measure,
                  voices: measure.voices.map((voice) => ({
                    ...voice,
                    events: [
                      {
                        id: 'overflow',
                        kind: 'note',
                        beat: 3.5,
                        duration: 'half',
                        pitch: { step: 'C', octave: 3 },
                      },
                    ] satisfies ScoreEvent[],
                  })),
                })),
              },
        ),
      })),
    };

    expect(getScoreRhythmIssues(score)).toEqual([
      {
        measureIndex: 0,
        reason: 'overlap',
        staffId: 'treble',
        voiceId: 'voice-treble-1-main',
      },
      {
        measureIndex: 0,
        reason: 'overflow',
        staffId: 'bass',
        voiceId: 'voice-bass-1-main',
      },
    ]);
  });
});
