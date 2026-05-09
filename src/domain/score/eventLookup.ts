import type { Score, ScoreEvent, StaffId } from './types';

export interface ScoreEventContext {
  event: ScoreEvent;
  measureIndex: number;
  staffId: StaffId;
  staffIndex: number;
  voiceIndex: number;
}

export function findScoreEventContext(
  score: Score,
  eventId: string,
): ScoreEventContext | null {
  for (const part of score.parts) {
    for (const [staffIndex, staff] of part.staves.entries()) {
      for (const measure of staff.measures) {
        for (const [voiceIndex, voice] of measure.voices.entries()) {
          const event = voice.events.find((candidate) => candidate.id === eventId);

          if (event) {
            return {
              event,
              measureIndex: measure.index,
              staffId: staff.id,
              staffIndex,
              voiceIndex,
            };
          }
        }
      }
    }
  }

  return null;
}

export function findScoreEvent(score: Score, eventId: string) {
  return findScoreEventContext(score, eventId)?.event ?? null;
}

export function getVoiceEvents(
  score: Score,
  staffId: StaffId,
  voiceIndex: number,
) {
  return score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === staffId)
    ?.measures.flatMap((measure) =>
      (measure.voices[voiceIndex]?.events ?? []).map((event) => ({
        event,
        measureIndex: measure.index,
      })),
    ) ?? [];
}
