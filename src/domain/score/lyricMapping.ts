import { findScoreEventContext, getVoiceEvents } from './eventLookup';
import { isGeneratedRestEvent, isPitchedScoreEvent } from './events';
import type { Score } from './types';

function getLyricSourceCandidates(score: Score, targetEventId: string) {
  const targetContext = findScoreEventContext(score, targetEventId);

  if (!targetContext) {
    return [];
  }

  return score.parts
    .flatMap((part) =>
      part.staves.flatMap((staff) =>
        staff.measures.flatMap((measure) =>
          measure.voices.flatMap((voice, voiceIndex) =>
            voice.events.map((event) => ({
              event,
              isSameVoice:
                staff.id === targetContext.staffId &&
                voiceIndex === targetContext.voiceIndex,
              measureIndex: measure.index,
              staffId: staff.id,
              voiceIndex,
            })),
          ),
        ),
      ),
    )
    .filter(
      ({ event }) =>
        Boolean(event.lyric) &&
        getLyricMapEventIds(score, event.id).includes(targetEventId),
    )
    .sort(
      (first, second) =>
        Number(second.isSameVoice) - Number(first.isSameVoice) ||
        first.measureIndex - second.measureIndex ||
        first.event.beat - second.event.beat ||
        first.event.id.localeCompare(second.event.id),
    );
}

export function getLyricMapEventIds(score: Score, eventId: string) {
  const eventContext = findScoreEventContext(score, eventId);
  const mappedEventIds = eventContext?.event.lyricMap?.eventIds;

  return mappedEventIds && mappedEventIds.length > 0
    ? [...new Set(mappedEventIds)]
    : [eventId];
}

export function findLyricMapSourceEventId(score: Score, targetEventId: string) {
  const targetContext = findScoreEventContext(score, targetEventId);

  if (!targetContext || targetContext.event.lyric) {
    return targetEventId;
  }

  return getLyricSourceCandidates(score, targetEventId)[0]?.event.id ?? targetEventId;
}

export function getOrderedPitchedVoiceEventIds(
  score: Score,
  sourceEventId: string,
) {
  const sourceContext = findScoreEventContext(score, sourceEventId);

  if (!sourceContext) {
    return [];
  }

  return getVoiceEvents(score, sourceContext.staffId, sourceContext.voiceIndex)
    .filter(
      ({ event }) =>
        !isGeneratedRestEvent(event) && isPitchedScoreEvent(event),
    )
    .sort(
      (first, second) =>
        first.measureIndex - second.measureIndex ||
        first.event.beat - second.event.beat ||
        first.event.id.localeCompare(second.event.id),
    )
    .map(({ event }) => event.id);
}

export function getLyricMapTargetEventIds(
  score: Score,
  sourceEventId: string,
  targetEventId: string,
) {
  const sourceContext = findScoreEventContext(score, sourceEventId);
  const targetContext = findScoreEventContext(score, targetEventId);

  if (!sourceContext || !targetContext) {
    return [sourceEventId];
  }

  if (
    sourceContext.staffId !== targetContext.staffId ||
    sourceContext.voiceIndex !== targetContext.voiceIndex
  ) {
    return [targetEventId];
  }

  const orderedEventIds = getOrderedPitchedVoiceEventIds(score, sourceEventId);
  const sourceIndex = orderedEventIds.indexOf(sourceEventId);
  const targetIndex = orderedEventIds.indexOf(targetEventId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return [sourceEventId];
  }

  const startIndex = Math.min(sourceIndex, targetIndex);
  const endIndex = Math.max(sourceIndex, targetIndex);

  return orderedEventIds.slice(startIndex, endIndex + 1);
}

export function normalizeLyricMapEventIds(
  score: Score,
  sourceEventId: string,
  eventIds: readonly string[] | undefined,
) {
  const uniqueEventIds = [...new Set(eventIds ?? [])].filter((eventId) =>
    Boolean(findScoreEventContext(score, eventId)),
  );

  return uniqueEventIds.length > 0 ? uniqueEventIds : [sourceEventId];
}
