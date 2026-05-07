import type { ChordEvent, NoteEvent, Pitch, ScoreEvent } from './types';

export type PitchedScoreEvent = NoteEvent | ChordEvent;

export function isPitchedScoreEvent(
  event: ScoreEvent,
): event is PitchedScoreEvent {
  return event.kind === 'note' || event.kind === 'chord';
}

export function isGeneratedRestEvent(event: ScoreEvent) {
  return event.kind === 'rest' && event.id.startsWith('rest-');
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

export function getEventDots(event: ScoreEvent) {
  return event.dots ?? 0;
}

export function formatEventPitchList(
  event: ScoreEvent,
  formatPitch: (pitch: Pitch) => string,
) {
  return getEventPitches(event).map(formatPitch).join(' ');
}
