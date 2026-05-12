import { getDurationBeats } from './durations';
import { getEventDots } from './events';
import {
  TICKS_PER_QUARTER,
  roundTick,
} from './ticks';
import type { ScoreEvent } from './types';

export function getEventTupletMultiplier(event: ScoreEvent) {
  return event.tuplet
    ? event.tuplet.normalNotes / event.tuplet.actualNotes
    : 1;
}

export function getEventDurationBeats(event: ScoreEvent) {
  return (
    getDurationBeats(event.duration, getEventDots(event)) *
    getEventTupletMultiplier(event)
  );
}

export function getEventDurationTicks(event: ScoreEvent) {
  return roundTick(getEventDurationBeats(event) * TICKS_PER_QUARTER);
}
