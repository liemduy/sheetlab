import type { Pitch, Score, ScoreEvent, StaffId } from '../../domain/score/types';
import { getDurationBeats } from '../../domain/score/durations';
import { getEventDots, getEventPitches } from '../../domain/score/events';

export interface PlaybackTimelineEvent {
  id: string;
  staffId: StaffId;
  measureIndex: number;
  beat: number;
  startBeat: number;
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

export function buildPlaybackTimeline(score: Score): PlaybackTimelineEvent[] {
  const secondsPerBeat = getSecondsPerBeat(score.tempo);
  const beatsPerMeasure = score.timeSignature.beats;

  return score.parts
    .flatMap((part) =>
      part.staves.flatMap((staff) =>
        staff.measures.flatMap((measure) =>
          measure.voices.flatMap((voice) =>
            voice.events.filter((event) => event.kind !== 'rest').map((event) => {
              const durationBeats = getDurationBeats(
                event.duration,
                getEventDots(event),
              );
              const startBeat = measure.index * beatsPerMeasure + event.beat;

              const pitches = getEventPitches(event);

              return {
                id: event.id,
                staffId: staff.id,
                measureIndex: measure.index,
                beat: event.beat,
                startBeat,
                durationBeats,
                startSeconds: startBeat * secondsPerBeat,
                durationSeconds: durationBeats * secondsPerBeat,
                kind: event.kind,
                pitch: pitches[0],
                pitches,
              };
            }),
          ),
        ),
      ),
    )
    .sort((a, b) => a.startBeat - b.startBeat || a.staffId.localeCompare(b.staffId));
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
  return (
    timeline.find(
      (event) =>
        elapsedSeconds >= event.startSeconds &&
        elapsedSeconds < event.startSeconds + event.durationSeconds,
    ) ?? null
  );
}

export function getPlaybackBeatAtSeconds(tempo: number, elapsedSeconds: number) {
  return elapsedSeconds / getSecondsPerBeat(tempo);
}
