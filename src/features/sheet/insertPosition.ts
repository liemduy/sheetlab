import { getDurationBeats } from '../../domain/score/durations';
import { getEventDots } from '../../domain/score/events';
import type { Score } from '../../domain/score/types';
import type { MusicPosition } from './interaction';

function roundBeat(beat: number) {
  return Number(beat.toFixed(4));
}

export function snapInsertPositionToEventBoundary(
  score: Score,
  position: MusicPosition,
): MusicPosition {
  const targetVoice = score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === position.staffId)
    ?.measures.find((measure) => measure.index === position.measureIndex)
    ?.voices[0];

  if (!targetVoice) {
    return position;
  }

  const containingEvent = targetVoice.events.find((event) => {
    const eventEnd =
      event.beat + getDurationBeats(event.duration, getEventDots(event));

    return (
      event.kind !== 'rest' &&
      event.beat < position.beat &&
      eventEnd > position.beat
    );
  });

  if (!containingEvent) {
    return position;
  }

  const eventEnd =
    containingEvent.beat +
    getDurationBeats(containingEvent.duration, getEventDots(containingEvent));
  const distanceToStart = position.beat - containingEvent.beat;
  const distanceToEnd = eventEnd - position.beat;
  const snappedBeat =
    distanceToStart < distanceToEnd ? containingEvent.beat : eventEnd;

  return {
    ...position,
    beat: roundBeat(snappedBeat),
  };
}
