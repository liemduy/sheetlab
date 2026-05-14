import { findScoreEventContext, getVoiceEvents } from './eventLookup';
import { getEventDurationBeats } from './eventDuration';
import { isGeneratedRestEvent, isPitchedScoreEvent } from './events';
import { getMeasureBeats } from './timeSignatures';
import type {
  NotationMark,
  OttavaKind,
  Pitch,
  RangeNotationMark,
  Score,
  ScoreEvent,
  ScorePosition,
} from './types';

export const OTTAVA_KINDS = ['8va', '8vb', '15ma', '15mb'] as const satisfies readonly OttavaKind[];

export const OTTAVA_LABEL = {
  '15ma': '15ma',
  '15mb': '15mb',
  '8va': '8va',
  '8vb': '8vb',
} satisfies Record<OttavaKind, string>;

export const OTTAVA_OCTAVE_SHIFT = {
  '15ma': 2,
  '15mb': -2,
  '8va': 1,
  '8vb': -1,
} satisfies Record<OttavaKind, number>;

export type OttavaToggleReason =
  | 'missing-event'
  | 'source-not-pitched'
  | 'target-not-found';

export interface OttavaToggleResult {
  score: Score;
  updated: boolean;
  reason?: OttavaToggleReason;
}

function getMeasureTicks(score: Score) {
  return getMeasureBeats(score.timeSignature);
}

function positionToScoreBeat(score: Score, position: ScorePosition) {
  return position.measureIndex * getMeasureTicks(score) + position.beat;
}

function getEventEndPosition({
  event,
  measureIndex,
  staffId,
  voiceIndex,
}: {
  event: ScoreEvent;
  measureIndex: number;
  staffId: ScorePosition['staffId'];
  voiceIndex: number;
}): ScorePosition {
  return {
    beat: event.beat + getEventDurationBeats(event),
    measureIndex,
    staffId,
    voiceIndex,
  };
}

function getNextPitchedEvent(score: Score, sourceEventId: string) {
  const sourceContext = findScoreEventContext(score, sourceEventId);

  if (!sourceContext) {
    return null;
  }

  const sourceScoreBeat =
    sourceContext.measureIndex * getMeasureTicks(score) + sourceContext.event.beat;

  return (
    getVoiceEvents(score, sourceContext.staffId, sourceContext.voiceIndex)
      .filter(
        ({ event }) =>
          event.id !== sourceEventId &&
          isPitchedScoreEvent(event) &&
          !isGeneratedRestEvent(event),
      )
      .sort(
        (first, second) =>
          first.measureIndex * getMeasureTicks(score) +
          first.event.beat -
          (second.measureIndex * getMeasureTicks(score) + second.event.beat),
      )
      .find(
        ({ event, measureIndex }) =>
          measureIndex * getMeasureTicks(score) + event.beat > sourceScoreBeat,
      ) ?? null
  );
}

function isOttavaMark(mark: NotationMark): mark is RangeNotationMark {
  return mark.scope === 'range' && mark.kind === 'ottava';
}

function withoutOttavaMark(score: Score, predicate: (mark: RangeNotationMark) => boolean) {
  const nextMarks = (score.marks ?? []).filter(
    (mark) => !(isOttavaMark(mark) && predicate(mark)),
  );

  return {
    ...score,
    marks: nextMarks.length > 0 ? nextMarks : undefined,
  };
}

function createOttavaMark({
  kind,
  score,
  sourceEventId,
  targetEventId,
}: {
  kind: OttavaKind;
  score: Score;
  sourceEventId: string;
  targetEventId: string;
}): RangeNotationMark | null {
  const sourceContext = findScoreEventContext(score, sourceEventId);
  const targetContext = findScoreEventContext(score, targetEventId);

  if (!sourceContext || !targetContext) {
    return null;
  }

  const start: ScorePosition = {
    beat: sourceContext.event.beat,
    measureIndex: sourceContext.measureIndex,
    staffId: sourceContext.staffId,
    voiceIndex: sourceContext.voiceIndex,
  };
  const end = getEventEndPosition({
    event: targetContext.event,
    measureIndex: targetContext.measureIndex,
    staffId: targetContext.staffId,
    voiceIndex: targetContext.voiceIndex,
  });

  return {
    end,
    id: `ottava-${kind}-${sourceEventId}-${targetEventId}`,
    kind: 'ottava',
    ottava: kind,
    placement: kind.endsWith('b') ? 'below' : 'above',
    scope: 'range',
    sourceEventId,
    start,
    targetEventId,
  };
}

export function tryToggleOttavaToNext(
  score: Score,
  eventId: string,
  kind: OttavaKind,
): OttavaToggleResult {
  const sourceContext = findScoreEventContext(score, eventId);

  if (!sourceContext) {
    return { score, updated: false, reason: 'missing-event' };
  }

  if (!isPitchedScoreEvent(sourceContext.event)) {
    return { score, updated: false, reason: 'source-not-pitched' };
  }

  const target = getNextPitchedEvent(score, eventId);

  if (!target) {
    return { score, updated: false, reason: 'target-not-found' };
  }

  const existing = (score.marks ?? []).find(
    (mark): mark is RangeNotationMark =>
      isOttavaMark(mark) &&
      mark.sourceEventId === eventId &&
      mark.targetEventId === target.event.id &&
      mark.ottava === kind,
  );

  if (existing) {
    return {
      score: withoutOttavaMark(score, (mark) => mark.id === existing.id),
      updated: true,
    };
  }

  const nextMark = createOttavaMark({
    kind,
    score,
    sourceEventId: eventId,
    targetEventId: target.event.id,
  });

  if (!nextMark) {
    return { score, updated: false, reason: 'target-not-found' };
  }

  const scoreWithoutExistingSourceOttava = withoutOttavaMark(
    score,
    (mark) => mark.sourceEventId === eventId,
  );

  return {
    score: {
      ...scoreWithoutExistingSourceOttava,
      marks: [...(scoreWithoutExistingSourceOttava.marks ?? []), nextMark],
    },
    updated: true,
  };
}

export function getOttavaMarks(score: Score) {
  return (score.marks ?? []).filter(
    (mark): mark is RangeNotationMark => isOttavaMark(mark) && Boolean(mark.ottava),
  );
}

export function getOttavaMarkForSource(score: Score, eventId: string) {
  return getOttavaMarks(score).find((mark) => mark.sourceEventId === eventId) ?? null;
}

export function tryClearOttavaForEvent(score: Score, eventId: string): OttavaToggleResult {
  const existing = getOttavaMarkForSource(score, eventId);

  if (!existing) {
    return { score, updated: false, reason: 'missing-event' };
  }

  return {
    score: withoutOttavaMark(score, (mark) => mark.id === existing.id),
    updated: true,
  };
}

export function getActiveOttavaOctaveShift(
  score: Score,
  staffId: ScorePosition['staffId'],
  measureIndex: number,
  beat: number,
) {
  const scoreBeat = positionToScoreBeat(score, { beat, measureIndex, staffId });

  return getOttavaMarks(score).reduce((shift, mark) => {
    if (mark.start.staffId !== staffId || !mark.ottava) {
      return shift;
    }

    const startBeat = positionToScoreBeat(score, mark.start);
    const endBeat = positionToScoreBeat(score, mark.end);

    return scoreBeat >= startBeat && scoreBeat < endBeat
      ? shift + OTTAVA_OCTAVE_SHIFT[mark.ottava]
      : shift;
  }, 0);
}

export function applyOttavaToPitch(pitch: Pitch, octaveShift: number): Pitch {
  if (octaveShift === 0) {
    return pitch;
  }

  return {
    ...pitch,
    octave: pitch.octave + octaveShift,
  };
}

export function applyActiveOttavaToPitch(
  score: Score,
  staffId: ScorePosition['staffId'],
  measureIndex: number,
  beat: number,
  pitch: Pitch,
): Pitch {
  return applyOttavaToPitch(
    pitch,
    getActiveOttavaOctaveShift(score, staffId, measureIndex, beat),
  );
}
