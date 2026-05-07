import { getDurationBeats } from '../../domain/score/durations';
import { getEventDots } from '../../domain/score/events';
import {
  getDurationTicks,
  getMeasureTicks,
  splitTicksIntoDurations,
  tickToBeat,
} from '../../domain/score/ticks';
import type { DurationValue, Score, ScoreEvent, StaffId } from '../../domain/score/types';
import {
  getMeasureContentLeft,
  getMeasureContentWidth,
} from './layout';
import type { MusicPosition } from './interaction';

const SLOT_EPSILON = 0.0001;

export interface RhythmSlot {
  beat: number;
  duration: DurationValue;
  dots?: number;
  endBeat: number;
  event?: ScoreEvent;
  eventId: string;
  kind: ScoreEvent['kind'];
  measureIndex: number;
  staffId: StaffId;
}

function getMeasureVoiceEvents(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
) {
  return (
    score.parts
      .flatMap((part) => part.staves)
      .find((staff) => staff.id === staffId)
      ?.measures.find((measure) => measure.index === measureIndex)
      ?.voices[0]?.events ?? []
  );
}

function createVirtualEmptyMeasureSlots(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
): RhythmSlot[] {
  const measureTicks = getMeasureTicks(score.timeSignature);
  let cursorTick = 0;

  return splitTicksIntoDurations(measureTicks).map((duration) => {
    const beat = tickToBeat(cursorTick);
    const endBeat = tickToBeat(cursorTick + getDurationTicks(duration));
    const slot: RhythmSlot = {
      beat,
      duration,
      endBeat,
      eventId: `virtual-rest-${staffId}-m${measureIndex + 1}-t${cursorTick}`,
      kind: 'rest',
      measureIndex,
      staffId,
    };

    cursorTick += getDurationTicks(duration);

    return slot;
  });
}

export function getRhythmSlotsForMeasure(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
): RhythmSlot[] {
  const events = getMeasureVoiceEvents(score, staffId, measureIndex);

  if (events.length === 0) {
    return createVirtualEmptyMeasureSlots(score, staffId, measureIndex);
  }

  return [...events]
    .sort((a, b) => a.beat - b.beat)
    .map((event) => {
      const dots = getEventDots(event);
      const durationBeats = getDurationBeats(event.duration, dots);

      return {
        beat: event.beat,
        dots: event.dots,
        duration: event.duration,
        endBeat: event.beat + durationBeats,
        event,
        eventId: event.id,
        kind: event.kind,
        measureIndex,
        staffId,
      };
    });
}

export function getRawBeatFromMeasureX(score: Score, measureIndex: number, x: number) {
  const contentLeft = getMeasureContentLeft(measureIndex);
  const contentWidth = getMeasureContentWidth(measureIndex);
  const rawBeat =
    ((x - contentLeft) / contentWidth) * score.timeSignature.beats;

  return Math.min(
    score.timeSignature.beats,
    Math.max(0, rawBeat),
  );
}

export function findRhythmSlotAtPosition(score: Score, position: MusicPosition) {
  const slots = getRhythmSlotsForMeasure(
    score,
    position.staffId,
    position.measureIndex,
  );

  if (slots.length === 0) {
    return null;
  }

  const rawBeat = getRawBeatFromMeasureX(score, position.measureIndex, position.x);
  const containingSlot = slots.find(
    (slot) =>
      rawBeat >= slot.beat - SLOT_EPSILON &&
      rawBeat < slot.endBeat - SLOT_EPSILON,
  );

  if (containingSlot) {
    return containingSlot;
  }

  return [...slots].sort(
    (a, b) => Math.abs(a.beat - rawBeat) - Math.abs(b.beat - rawBeat),
  )[0] ?? null;
}

export function findNextRhythmSlotAfter(
  score: Score,
  staffId: StaffId,
  measureIndex: number,
  beat: number,
) {
  const staff = score.parts
    .flatMap((part) => part.staves)
    .find((candidate) => candidate.id === staffId);

  if (!staff) {
    return null;
  }

  for (
    let currentMeasureIndex = measureIndex;
    currentMeasureIndex < staff.measures.length;
    currentMeasureIndex += 1
  ) {
    const slots = getRhythmSlotsForMeasure(score, staffId, currentMeasureIndex);
    const minBeat =
      currentMeasureIndex === measureIndex ? beat + SLOT_EPSILON : -SLOT_EPSILON;
    const nextSlot = slots.find((slot) => slot.beat > minBeat);

    if (nextSlot) {
      return nextSlot;
    }
  }

  return null;
}

export function snapPositionToRhythmSlot(
  score: Score,
  position: MusicPosition,
): MusicPosition {
  const slot = findRhythmSlotAtPosition(score, position);

  return slot
    ? {
        ...position,
        beat: slot.beat,
      }
    : position;
}
