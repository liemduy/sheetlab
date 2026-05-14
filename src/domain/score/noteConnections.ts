import { tryUpdateScoreEvent } from './editing';
import { getEventDurationBeats, getEventDurationTicks } from './eventDuration';
import {
  getEventPitches,
  isGeneratedRestEvent,
  isPitchedScoreEvent,
} from './events';
import {
  findScoreEventContext,
  type ScoreEventContext,
} from './eventLookup';
import { TICKS_PER_QUARTER, getMeasureTicks } from './ticks';
import type { Pitch, Score, ScoreEvent, SlurMark, TieMark } from './types';

export type NoteConnectionToggleReason =
  | 'missing-event'
  | 'source-not-pitched'
  | 'target-not-found';

export interface NoteConnectionToggleResult {
  score: Score;
  updated: boolean;
  reason?: NoteConnectionToggleReason;
}

function getPitchKey(pitch: Pitch) {
  return `${pitch.step}${pitch.accidental ?? ''}${pitch.octave}`;
}

export function pitchesMatch(first: Pitch, second: Pitch) {
  return getPitchKey(first) === getPitchKey(second);
}

function getAbsoluteEventStartTick(
  score: Score,
  context: Pick<ScoreEventContext, 'event' | 'measureIndex'>,
) {
  return (
    context.measureIndex * getMeasureTicks(score.timeSignature) +
    Math.round(context.event.beat * TICKS_PER_QUARTER)
  );
}

function getAbsoluteEventEndTick(
  score: Score,
  context: Pick<ScoreEventContext, 'event' | 'measureIndex'>,
) {
  return getAbsoluteEventStartTick(score, context) + getEventDurationTicks(context.event);
}

function getSameVoiceEventContexts(
  score: Score,
  sourceContext: ScoreEventContext,
) {
  const staff = score.parts
    .flatMap((part) => part.staves)
    .find((candidate) => candidate.id === sourceContext.staffId);

  return (
    staff?.measures.flatMap((measure) =>
      (measure.voices[sourceContext.voiceIndex]?.events ?? []).map((event) => ({
        event,
        measureIndex: measure.index,
        staffId: staff.id,
        staffIndex: sourceContext.staffIndex,
        voiceIndex: sourceContext.voiceIndex,
      })),
    ) ?? []
  ).sort(
    (first, second) =>
      getAbsoluteEventStartTick(score, first) -
        getAbsoluteEventStartTick(score, second) ||
      first.event.id.localeCompare(second.event.id),
  );
}

function getNextPitchedEventContext(
  score: Score,
  sourceContext: ScoreEventContext,
) {
  const sourceStartTick = getAbsoluteEventStartTick(score, sourceContext);

  return (
    getSameVoiceEventContexts(score, sourceContext).find(
      (context) =>
        context.event.id !== sourceContext.event.id &&
        getAbsoluteEventStartTick(score, context) > sourceStartTick &&
        isPitchedScoreEvent(context.event) &&
        !isGeneratedRestEvent(context.event),
    ) ?? null
  );
}

function getAdjacentNextPitchedEventContext(
  score: Score,
  sourceContext: ScoreEventContext,
) {
  const nextContext = getNextPitchedEventContext(score, sourceContext);

  if (!nextContext) {
    return null;
  }

  const sourceEndTick = getAbsoluteEventEndTick(score, sourceContext);
  const targetStartTick = getAbsoluteEventStartTick(score, nextContext);

  return Math.abs(sourceEndTick - targetStartTick) <= 1 ? nextContext : null;
}

export function isValidTieMark(
  score: Score,
  sourceContext: ScoreEventContext,
  tie: TieMark,
) {
  const targetContext = findScoreEventContext(score, tie.targetEventId);

  if (
    !targetContext ||
    targetContext.staffId !== sourceContext.staffId ||
    targetContext.voiceIndex !== sourceContext.voiceIndex ||
    !isPitchedScoreEvent(sourceContext.event) ||
    !isPitchedScoreEvent(targetContext.event)
  ) {
    return false;
  }

  if (
    Math.abs(
      getAbsoluteEventEndTick(score, sourceContext) -
        getAbsoluteEventStartTick(score, targetContext),
    ) > 1
  ) {
    return false;
  }

  const sourcePitch = getEventPitches(sourceContext.event)[tie.pitchIndex];
  const targetPitch = getEventPitches(targetContext.event)[tie.targetPitchIndex];

  return Boolean(sourcePitch && targetPitch && pitchesMatch(sourcePitch, targetPitch));
}

function getPitchIndexes(event: ScoreEvent, pitchIndex?: number | null) {
  const pitches = getEventPitches(event);

  if (pitchIndex !== null && pitchIndex !== undefined) {
    return pitchIndex >= 0 && pitchIndex < pitches.length ? [pitchIndex] : [];
  }

  return pitches.map((_, index) => index);
}

function findMatchingTargetPitchIndex(
  sourcePitch: Pitch,
  targetEvent: ScoreEvent,
) {
  return getEventPitches(targetEvent).findIndex((targetPitch) =>
    pitchesMatch(sourcePitch, targetPitch),
  );
}

function normalizeTies(ties: TieMark[] | undefined) {
  return ties && ties.length > 0 ? ties : undefined;
}

function normalizeSlurs(slurs: SlurMark[] | undefined) {
  return slurs && slurs.length > 0 ? slurs : undefined;
}

function toToggleReason(reason: unknown): NoteConnectionToggleReason {
  return reason === 'missing-event' ? 'missing-event' : 'target-not-found';
}

function createSlurId(sourceEventId: string, targetEventId: string) {
  return `slur-${sourceEventId}-${targetEventId}`;
}

export function tryToggleTieToNext(
  score: Score,
  eventId: string,
  pitchIndex?: number | null,
): NoteConnectionToggleResult {
  const sourceContext = findScoreEventContext(score, eventId);

  if (!sourceContext) {
    return { score, updated: false, reason: 'missing-event' };
  }

  if (!isPitchedScoreEvent(sourceContext.event)) {
    return { score, updated: false, reason: 'source-not-pitched' };
  }

  const targetContext = getAdjacentNextPitchedEventContext(score, sourceContext);

  if (!targetContext) {
    return { score, updated: false, reason: 'target-not-found' };
  }

  const sourcePitches = getEventPitches(sourceContext.event);
  const sourcePitchIndexes = getPitchIndexes(sourceContext.event, pitchIndex);
  const candidateMarks = sourcePitchIndexes.flatMap((sourcePitchIndex) => {
    const sourcePitch = sourcePitches[sourcePitchIndex];

    if (!sourcePitch) {
      return [];
    }

    const targetPitchIndex = findMatchingTargetPitchIndex(
      sourcePitch,
      targetContext.event,
    );

    return targetPitchIndex >= 0
      ? [
          {
            pitchIndex: sourcePitchIndex,
            targetEventId: targetContext.event.id,
            targetPitchIndex,
          },
        ]
      : [];
  });

  if (candidateMarks.length === 0) {
    return { score, updated: false, reason: 'target-not-found' };
  }

  const currentTies = sourceContext.event.ties ?? [];
  const candidatePitchIndexes = new Set(
    candidateMarks.map((mark) => mark.pitchIndex),
  );
  const isRemoving = candidateMarks.every((mark) =>
    currentTies.some(
      (current) =>
        current.pitchIndex === mark.pitchIndex &&
        current.targetEventId === mark.targetEventId &&
        current.targetPitchIndex === mark.targetPitchIndex,
    ),
  );
  const nextTies = isRemoving
    ? currentTies.filter((mark) => !candidatePitchIndexes.has(mark.pitchIndex))
    : [
        ...currentTies.filter(
          (mark) => !candidatePitchIndexes.has(mark.pitchIndex),
        ),
        ...candidateMarks,
      ];
  const result = tryUpdateScoreEvent(score, eventId, {
    ties: normalizeTies(nextTies) ?? null,
  });

  return {
    score: result.score,
    updated: result.updated,
    reason: result.updated ? undefined : toToggleReason(result.reason),
  };
}

export function tryToggleSlurToNext(
  score: Score,
  eventId: string,
): NoteConnectionToggleResult {
  const sourceContext = findScoreEventContext(score, eventId);

  if (!sourceContext) {
    return { score, updated: false, reason: 'missing-event' };
  }

  if (!isPitchedScoreEvent(sourceContext.event)) {
    return { score, updated: false, reason: 'source-not-pitched' };
  }

  const targetContext = getNextPitchedEventContext(score, sourceContext);

  if (!targetContext) {
    return { score, updated: false, reason: 'target-not-found' };
  }

  const currentSlurs = sourceContext.event.slurs ?? [];
  const existing = currentSlurs.find(
    (slur) => slur.targetEventId === targetContext.event.id,
  );
  const nextSlurs = existing
    ? currentSlurs.filter((slur) => slur.targetEventId !== targetContext.event.id)
    : [
        ...currentSlurs,
        {
          id: createSlurId(eventId, targetContext.event.id),
          targetEventId: targetContext.event.id,
        },
      ];
  const result = tryUpdateScoreEvent(score, eventId, {
    slurs: normalizeSlurs(nextSlurs) ?? null,
  });

  return {
    score: result.score,
    updated: result.updated,
    reason: result.updated ? undefined : toToggleReason(result.reason),
  };
}

export function getIncomingTiePitchIndexes(score: Score, eventId: string) {
  const incoming = new Set<number>();

  score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        measure.voices.forEach((voice) => {
          voice.events.forEach((event) => {
            const sourceContext = findScoreEventContext(score, event.id);

            event.ties
              ?.filter(
                (tie) =>
                  tie.targetEventId === eventId &&
                  sourceContext &&
                  isValidTieMark(score, sourceContext, tie),
              )
              .forEach((tie) => incoming.add(tie.targetPitchIndex));
          });
        });
      });
    });
  });

  return incoming;
}

export function getTieChainDurationBeats(
  score: Score,
  eventId: string,
  pitchIndex: number,
  seenEventIds = new Set<string>(),
): number {
  const context = findScoreEventContext(score, eventId);

  if (!context || seenEventIds.has(eventId)) {
    return 0;
  }

  seenEventIds.add(eventId);

  const ownDuration = getEventDurationBeats(context.event);
  const tie = context.event.ties?.find(
    (candidate) =>
      candidate.pitchIndex === pitchIndex &&
      isValidTieMark(score, context, candidate),
  );

  if (!tie) {
    return ownDuration;
  }

  return (
    ownDuration +
    getTieChainDurationBeats(
      score,
      tie.targetEventId,
      tie.targetPitchIndex,
      seenEventIds,
    )
  );
}

export function getTieChainEventIds(
  score: Score,
  eventId: string,
  pitchIndex: number,
  seenEventIds = new Set<string>(),
): string[] {
  const context = findScoreEventContext(score, eventId);

  if (!context || seenEventIds.has(eventId)) {
    return [];
  }

  seenEventIds.add(eventId);

  const tie = context.event.ties?.find(
    (candidate) =>
      candidate.pitchIndex === pitchIndex &&
      isValidTieMark(score, context, candidate),
  );

  if (!tie) {
    return [eventId];
  }

  return [
    eventId,
    ...getTieChainEventIds(
      score,
      tie.targetEventId,
      tie.targetPitchIndex,
      seenEventIds,
    ),
  ];
}
