import type { Pitch, Score, ScoreEvent, StaffId } from '../../domain/score/types';
import { getEventPitches } from '../../domain/score/events';
import { getEventDurationBeats } from '../../domain/score/eventDuration';
import {
  applyActiveKeySignatureToPitch,
} from '../../domain/score/keySignatures';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import { getMeasureRepeatJump } from '../../domain/score/repeatJumps';

export interface PlaybackTimelineEvent {
  id: string;
  staffId: StaffId;
  measureIndex: number;
  beat: number;
  startBeat: number;
  playbackStartBeat: number;
  durationBeats: number;
  startSeconds: number;
  durationSeconds: number;
  kind: ScoreEvent['kind'];
  pitch?: Pitch;
  pitches: Pitch[];
}

export function getSecondsPerBeat(tempo: number) {
  return 60 / tempo;
}

function getScoreMeasureCount(score: Score) {
  return score.parts[0]?.staves[0]?.measures.length ?? 0;
}

function isRepeatEnd(kind: ReturnType<typeof getMeasureRepeatJump>) {
  return kind === 'repeat-end' || kind === 'repeat-both';
}

function isRepeatStart(kind: ReturnType<typeof getMeasureRepeatJump>) {
  return kind === 'repeat-start' || kind === 'repeat-both';
}

export function buildPlaybackMeasureOrder(score: Score): number[] {
  const measureCount = getScoreMeasureCount(score);
  const order: number[] = [];
  const repeatedEnds = new Set<number>();
  let repeatStartIndex = 0;

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const repeatJump = getMeasureRepeatJump(score, measureIndex);

    if (isRepeatStart(repeatJump)) {
      repeatStartIndex = measureIndex;
    }

    order.push(measureIndex);

    if (isRepeatEnd(repeatJump) && !repeatedEnds.has(measureIndex)) {
      repeatedEnds.add(measureIndex);
      measureIndex = repeatStartIndex - 1;
    }
  }

  const dcAlFineIndex = order.findIndex(
    (measureIndex) => getMeasureRepeatJump(score, measureIndex) === 'dc-al-fine',
  );

  if (dcAlFineIndex >= 0) {
    const fineMeasureIndex = Array.from({ length: measureCount }, (_, index) => index)
      .find((measureIndex) => getMeasureRepeatJump(score, measureIndex) === 'fine');

    if (fineMeasureIndex !== undefined) {
      return [
        ...order.slice(0, dcAlFineIndex + 1),
        ...Array.from({ length: fineMeasureIndex + 1 }, (_, index) => index),
      ];
    }
  }

  return order;
}

export function buildPlaybackTimeline(score: Score): PlaybackTimelineEvent[] {
  const secondsPerBeat = getSecondsPerBeat(score.tempo);
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const measureOrder = buildPlaybackMeasureOrder(score);

  return measureOrder
    .flatMap((measureIndex, playbackMeasureIndex) => {
      const playbackMeasureStartBeat = playbackMeasureIndex * beatsPerMeasure;

      return score.parts.flatMap((part) =>
        part.staves.flatMap((staff) => {
          const measure = staff.measures.find(
            (candidate) => candidate.index === measureIndex,
          );

          if (!measure) {
            return [];
          }

          return measure.voices.flatMap((voice) =>
            voice.events
              .filter((event) => event.kind !== 'rest')
              .map((event) => {
                const durationBeats = getEventDurationBeats(event);
                const startBeat = measure.index * beatsPerMeasure + event.beat;
                const playbackStartBeat = playbackMeasureStartBeat + event.beat;
                const pitches = getEventPitches(event).map((pitch) =>
                  applyActiveKeySignatureToPitch(score, measure.index, pitch),
                );

                return {
                  id: event.id,
                  staffId: staff.id,
                  measureIndex: measure.index,
                  beat: event.beat,
                  startBeat,
                  playbackStartBeat,
                  durationBeats,
                  startSeconds: playbackStartBeat * secondsPerBeat,
                  durationSeconds: durationBeats * secondsPerBeat,
                  kind: event.kind,
                  pitch: pitches[0],
                  pitches,
                };
              }),
          );
        }),
      );
    })
    .sort((a, b) => a.startSeconds - b.startSeconds || a.staffId.localeCompare(b.staffId));
}

export function getTimelineDurationSeconds(timeline: PlaybackTimelineEvent[]) {
  return timeline.reduce(
    (duration, event) =>
      Math.max(duration, event.startSeconds + event.durationSeconds),
    0,
  );
}

export function getActiveTimelineEvent(
  timeline: PlaybackTimelineEvent[],
  elapsedSeconds: number,
) {
  return getActiveTimelineEvents(timeline, elapsedSeconds)[0] ?? null;
}

export function getActiveTimelineEvents(
  timeline: PlaybackTimelineEvent[],
  elapsedSeconds: number,
) {
  return timeline.filter(
    (event) =>
      elapsedSeconds >= event.startSeconds &&
      elapsedSeconds < event.startSeconds + event.durationSeconds,
  );
}

export function getPlaybackBeatAtSeconds(tempo: number, elapsedSeconds: number) {
  return elapsedSeconds / getSecondsPerBeat(tempo);
}

export function getPlaybackScoreBeatAtSeconds(
  timeline: PlaybackTimelineEvent[],
  tempo: number,
  elapsedSeconds: number,
) {
  const secondsPerBeat = getSecondsPerBeat(tempo);
  const activeEvent = getActiveTimelineEvent(timeline, elapsedSeconds);

  if (activeEvent) {
    return (
      activeEvent.startBeat +
      (elapsedSeconds - activeEvent.startSeconds) / secondsPerBeat
    );
  }

  const previousEvent = [...timeline]
    .filter((event) => event.startSeconds <= elapsedSeconds)
    .sort((a, b) => b.startSeconds - a.startSeconds)[0];

  if (!previousEvent) {
    return getPlaybackBeatAtSeconds(tempo, elapsedSeconds);
  }

  return (
    previousEvent.startBeat +
    (elapsedSeconds - previousEvent.startSeconds) / secondsPerBeat
  );
}
