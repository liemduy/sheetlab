import { isGeneratedRestEvent } from '../../domain/score/events';
import type { Score, ScoreEvent, StaffId } from '../../domain/score/types';

export interface SelectableScoreEventRef {
  event: ScoreEvent;
  measureIndex: number;
  staffId: StaffId;
  staffIndex: number;
  voiceIndex: number;
}

export function getSelectableScoreEvents(score: Score): SelectableScoreEventRef[] {
  return (score.parts[0]?.staves ?? [])
    .flatMap((staff, staffIndex) =>
      staff.measures.flatMap((measure) =>
        measure.voices.flatMap((voice, voiceIndex) =>
          voice.events
            .filter((event) => !isGeneratedRestEvent(event))
            .map((event) => ({
              event,
              measureIndex: measure.index,
              staffId: staff.id,
              staffIndex,
              voiceIndex,
            })),
        ),
      ),
    )
    .sort(
      (first, second) =>
        first.measureIndex - second.measureIndex ||
        first.staffIndex - second.staffIndex ||
        first.event.beat - second.event.beat ||
        first.voiceIndex - second.voiceIndex ||
        first.event.id.localeCompare(second.event.id),
    );
}

export function getAdjacentSelectableScoreEvent(
  score: Score,
  currentEventId: string | null,
  direction: -1 | 1,
) {
  const events = getSelectableScoreEvents(score);

  if (events.length === 0) {
    return null;
  }

  if (!currentEventId) {
    return direction > 0 ? events[0] : events.at(-1) ?? null;
  }

  const currentIndex = events.findIndex(
    (entry) => entry.event.id === currentEventId,
  );

  if (currentIndex < 0) {
    return direction > 0 ? events[0] : events.at(-1) ?? null;
  }

  return events[
    Math.min(Math.max(0, currentIndex + direction), events.length - 1)
  ] ?? null;
}
