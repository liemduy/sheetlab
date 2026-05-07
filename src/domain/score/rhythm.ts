import { getDurationTicks, getMeasureTicks, beatToTick, tickToBeat } from './ticks';
import type { Score, ScoreEvent, TimeSignature } from './types';

export type RhythmSegmentSource = 'event' | 'implicit-rest';

export interface RhythmSegment {
  durationTicks: number;
  endTick: number;
  event?: ScoreEvent;
  source: RhythmSegmentSource;
  startBeat: number;
  startTick: number;
}

export interface NormalizedVoice {
  measureIndex: number;
  measureTicks: number;
  segments: RhythmSegment[];
  staffId: string;
  totalTicks: number;
  voiceId: string;
}

function createImplicitRest(startTick: number, endTick: number): RhythmSegment {
  return {
    durationTicks: endTick - startTick,
    endTick,
    source: 'implicit-rest',
    startBeat: tickToBeat(startTick),
    startTick,
  };
}

export function normalizeMeasureVoice(
  events: ScoreEvent[],
  timeSignature: TimeSignature,
): RhythmSegment[] {
  const measureTicks = getMeasureTicks(timeSignature);
  const sortedEvents = [...events].sort(
    (a, b) => beatToTick(a.beat) - beatToTick(b.beat),
  );
  const segments: RhythmSegment[] = [];
  let cursorTick = 0;

  for (const event of sortedEvents) {
    const eventStartTick = beatToTick(event.beat);
    const eventDurationTicks = getDurationTicks(event.duration);
    const eventEndTick = eventStartTick + eventDurationTicks;

    if (eventStartTick < cursorTick) {
      throw new Error('Rhythm event overlap');
    }

    if (eventEndTick > measureTicks) {
      throw new Error('Rhythm event overflows measure');
    }

    if (eventStartTick > cursorTick) {
      segments.push(createImplicitRest(cursorTick, eventStartTick));
    }

    segments.push({
      durationTicks: eventDurationTicks,
      endTick: eventEndTick,
      event,
      source: 'event',
      startBeat: tickToBeat(eventStartTick),
      startTick: eventStartTick,
    });
    cursorTick = eventEndTick;
  }

  if (cursorTick < measureTicks) {
    segments.push(createImplicitRest(cursorTick, measureTicks));
  }

  return segments;
}

export function getRhythmSegmentsTotalTicks(segments: RhythmSegment[]) {
  return segments.reduce((total, segment) => total + segment.durationTicks, 0);
}

export function normalizeScoreRhythm(score: Score): NormalizedVoice[] {
  const measureTicks = getMeasureTicks(score.timeSignature);

  return score.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.measures.flatMap((measure) =>
        measure.voices.map((voice) => {
          const segments = normalizeMeasureVoice(
            voice.events,
            score.timeSignature,
          );

          return {
            measureIndex: measure.index,
            measureTicks,
            segments,
            staffId: staff.id,
            totalTicks: getRhythmSegmentsTotalTicks(segments),
            voiceId: voice.id,
          };
        }),
      ),
    ),
  );
}

export function assertNormalizedVoiceIsFull(voice: NormalizedVoice) {
  if (voice.totalTicks !== voice.measureTicks) {
    throw new Error(
      `Voice ${voice.voiceId} has ${voice.totalTicks}/${voice.measureTicks} ticks`,
    );
  }
}
