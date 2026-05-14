import { getEventDurationBeats } from '../../domain/score/eventDuration';
import { isGeneratedRestEvent } from '../../domain/score/events';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { Score, StaffId } from '../../domain/score/types';
import type { MusicPosition } from '../sheet/interaction';
import type { RhythmSlot } from '../sheet/rhythmSlots';

const BEAT_EPSILON = 0.0001;

interface WrittenEventRange {
  endGlobalBeat: number;
  startGlobalBeat: number;
}

function beatsAreEqual(first: number, second: number) {
  return Math.abs(first - second) <= BEAT_EPSILON;
}

function getGlobalBeat(score: Score, measureIndex: number, beat: number) {
  return measureIndex * getMeasureBeats(score.timeSignature) + beat;
}

function getWrittenEventRanges(
  score: Score,
  staffId: StaffId,
  voiceIndex: number,
): WrittenEventRange[] {
  const staff = score.parts
    .flatMap((part) => part.staves)
    .find((candidate) => candidate.id === staffId);

  if (!staff) {
    return [];
  }

  return staff.measures
    .flatMap((measure) =>
      (measure.voices[voiceIndex]?.events ?? [])
        .filter((event) => !isGeneratedRestEvent(event))
        .map((event) => {
          const startGlobalBeat = getGlobalBeat(score, measure.index, event.beat);

          return {
            endGlobalBeat: startGlobalBeat + getEventDurationBeats(event),
            startGlobalBeat,
          };
        }),
    )
    .sort(
      (first, second) =>
        first.startGlobalBeat - second.startGlobalBeat ||
        first.endGlobalBeat - second.endGlobalBeat,
    );
}

function getLastWrittenEventRange(
  score: Score,
  staffId: StaffId,
  voiceIndex: number,
) {
  return getWrittenEventRanges(score, staffId, voiceIndex).sort(
    (first, second) =>
      first.endGlobalBeat - second.endGlobalBeat ||
      first.startGlobalBeat - second.startGlobalBeat,
  ).at(-1);
}

export function isSequentialPlaceTargetAllowed({
  position,
  score,
  targetSlot,
  voiceIndex,
}: {
  position: MusicPosition;
  score: Score;
  targetSlot: RhythmSlot | null;
  voiceIndex: number;
}) {
  if (targetSlot?.event?.tuplet) {
    return true;
  }

  if (targetSlot?.event && !isGeneratedRestEvent(targetSlot.event)) {
    return beatsAreEqual(position.beat, targetSlot.beat);
  }

  const lastWrittenRange = getLastWrittenEventRange(
    score,
    position.staffId,
    voiceIndex,
  );
  const requestGlobalBeat = getGlobalBeat(
    score,
    position.measureIndex,
    position.beat,
  );

  if (!lastWrittenRange) {
    return beatsAreEqual(requestGlobalBeat, 0);
  }

  return beatsAreEqual(requestGlobalBeat, lastWrittenRange.endGlobalBeat);
}

export function getSequentialAppendPosition({
  position,
  score,
  voiceIndex,
}: {
  position: MusicPosition;
  score: Score;
  voiceIndex: number;
}): MusicPosition {
  const lastWrittenRange = getLastWrittenEventRange(
    score,
    position.staffId,
    voiceIndex,
  );
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const nextGlobalBeat = lastWrittenRange?.endGlobalBeat ?? 0;
  const measureIndex = Math.floor(nextGlobalBeat / beatsPerMeasure);
  const beat = Number((nextGlobalBeat % beatsPerMeasure).toFixed(4));

  return {
    ...position,
    beat,
    measureIndex,
  };
}

export function shouldSnapPlaceTargetToSequentialAppend(
  targetSlot: RhythmSlot | null,
) {
  if (targetSlot?.event?.tuplet) {
    return false;
  }

  return !targetSlot?.event || isGeneratedRestEvent(targetSlot.event);
}
