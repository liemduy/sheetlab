import type { ChordEvent, NoteEvent, Pitch, ScoreEvent } from './types';

export type PitchedScoreEvent = NoteEvent | ChordEvent;

export function isPitchedScoreEvent(
  event: ScoreEvent,
): event is PitchedScoreEvent {
  return event.kind === 'note' || event.kind === 'chord';
}

export function getEventPitches(event: ScoreEvent): Pitch[] {
  if (event.kind === 'note') {
    return [event.pitch];
  }

  if (event.kind === 'chord') {
    return event.pitches;
  }

  return [];
}

export function getPrimaryEventPitch(event: ScoreEvent): Pitch | null {
  return getEventPitches(event)[0] ?? null;
}

export function formatEventPitchList(
  event: ScoreEvent,
  formatPitch: (pitch: Pitch) => string,
) {
  return getEventPitches(event).map(formatPitch).join(' ');
}
