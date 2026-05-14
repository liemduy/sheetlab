import type { Score } from '../../domain/score/types';
import type { DurationValue } from '../../domain/score/types';
import { isGeneratedRestEvent } from '../../domain/score/events';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import { getActiveClef } from '../../domain/score/clefChanges';
import type { InputCursor } from '../editor/inputCursor';
import { createInputCursorFromPosition } from '../editor/inputCursor';
import type { MusicPosition } from './interaction';
import {
  STAFF_LINE_SPACING,
  getScoreStaffTop,
} from './layout';
import { getBeatX, getPitchYForScore } from './notationGeometry';
import type { RenderedEventLayout } from './renderedEventLayout';
import {
  findRhythmSlotAtBeat,
  findRhythmSlotAtPosition,
  getRhythmSlotsForMeasure,
} from './rhythmSlots';

const BEAT_MATCH_EPSILON = 0.0001;

interface SnapPositionOptions {
  preferRenderedPosition?: boolean;
}

type RenderedRhythmSlotMatch = {
  hitKind: 'boundary' | 'direct';
  slot: ReturnType<typeof getRhythmSlotsForMeasure>[number];
};

function getRenderedRhythmSlotsForPosition(
  position: MusicPosition,
  score: Score,
  eventLayouts: Record<string, RenderedEventLayout>,
  voiceIndex: number,
) {
  const slots = getRhythmSlotsForMeasure(
    score,
    position.staffId,
    position.measureIndex,
    voiceIndex,
  );
  return slots
    .map((slot) => ({
      layout: eventLayouts[slot.eventId],
      slot,
    }))
    .filter(
      (entry): entry is {
        layout: RenderedEventLayout;
        slot: ReturnType<typeof getRhythmSlotsForMeasure>[number];
      } =>
        Boolean(entry.layout) &&
        entry.layout.staffId === position.staffId &&
        entry.layout.measureIndex === position.measureIndex &&
        entry.layout.voiceIndex === voiceIndex,
    )
    .sort((a, b) => a.layout.x - b.layout.x);
}

function findRenderedRhythmSlotAtPosition(
  position: MusicPosition,
  score: Score,
  eventLayouts: Record<string, RenderedEventLayout>,
  voiceIndex: number,
): RenderedRhythmSlotMatch | null {
  const slotsWithLayouts = getRenderedRhythmSlotsForPosition(
    position,
    score,
    eventLayouts,
    voiceIndex,
  );

  if (slotsWithLayouts.length === 0) {
    return null;
  }

  const directNoteheadHit = slotsWithLayouts
    .filter(({ layout }) => {
      const xBounds =
        layout.pitchLayouts.length > 0
          ? {
              maxX: Math.max(
                ...layout.pitchLayouts.map((pitchLayout) => pitchLayout.maxX),
              ),
              minX: Math.min(
                ...layout.pitchLayouts.map((pitchLayout) => pitchLayout.minX),
              ),
            }
          : {
              maxX: layout.maxX,
              minX: layout.minX,
            };

      return position.x >= xBounds.minX - 4 && position.x <= xBounds.maxX + 4;
    })
    .sort(
      (a, b) =>
        Math.abs(a.layout.x - position.x) - Math.abs(b.layout.x - position.x),
    )[0];

  if (directNoteheadHit) {
    return {
      hitKind: 'direct',
      slot: directNoteheadHit.slot,
    };
  }

  const boundaryHit = slotsWithLayouts.find((entry, index) => {
    const previous = slotsWithLayouts[index - 1];
    const next = slotsWithLayouts[index + 1];
    const leftBoundary = previous
      ? (previous.layout.x + entry.layout.x) / 2
      : entry.layout.minX - 24;
    const rightBoundary = next
      ? (entry.layout.x + next.layout.x) / 2
      : entry.layout.maxX + 24;

    return position.x >= leftBoundary && position.x < rightBoundary;
  });

  return boundaryHit
    ? {
        hitKind: 'boundary',
        slot: boundaryHit.slot,
      }
      : null;
}

function isWrittenNonTupletSlot(
  slot: ReturnType<typeof getRhythmSlotsForMeasure>[number] | null | undefined,
) {
  return Boolean(
    slot?.event &&
      !slot.event.tuplet &&
      !isGeneratedRestEvent(slot.event),
  );
}

export function inputCursorToMusicPosition(
  cursor: InputCursor | null | undefined,
  score: Score,
): MusicPosition | null {
  if (!cursor) {
    return null;
  }

  const staff = score.parts[0]?.staves[cursor.staffIndex];

  if (!staff || staff.id !== cursor.staffId) {
    return null;
  }

  const x = getBeatX(
    cursor.measureIndex,
    cursor.beat,
    getMeasureBeats(score.timeSignature),
    score,
  );
  const y =
    cursor.mode === 'note-input'
      ? getPitchYForScore(
          cursor.pitchPreview,
          getActiveClef(score, staff.id, cursor.measureIndex, cursor.beat),
          cursor.staffIndex,
          score,
          cursor.measureIndex,
        )
      : getScoreStaffTop(score, cursor.staffIndex, cursor.measureIndex) +
        STAFF_LINE_SPACING * 2;

  return {
    beat: cursor.beat,
    clientX: cursor.clientX,
    clientY: cursor.clientY,
    measureIndex: cursor.measureIndex,
    pitch: cursor.pitchPreview,
    staffId: cursor.staffId,
    staffIndex: cursor.staffIndex,
    x,
    y,
  };
}

export function snapPositionToInputGrid(
  position: MusicPosition,
  duration: DurationValue,
  dots: number,
  score: Score,
  eventLayouts: Record<string, RenderedEventLayout> = {},
  voiceIndex = 0,
  options: SnapPositionOptions = {},
) {
  const measureHasRenderedRhythmColumns =
    getRenderedRhythmSlotsForPosition(
      position,
      score,
      eventLayouts,
      voiceIndex,
    ).length > 0;
  const beatMatchedSlot = findRhythmSlotAtBeat(
    score,
    position.staffId,
    position.measureIndex,
    position.beat,
    voiceIndex,
  );
  const exactBeatMatchedRenderedSlot =
    beatMatchedSlot &&
    (beatMatchedSlot.event?.tuplet || measureHasRenderedRhythmColumns) &&
    Math.abs(beatMatchedSlot.beat - position.beat) <= BEAT_MATCH_EPSILON
      ? beatMatchedSlot
      : null;
  const renderedSlot = findRenderedRhythmSlotAtPosition(
    position,
    score,
    eventLayouts,
    voiceIndex,
  );
  const fallbackSlot = findRhythmSlotAtPosition(score, position, voiceIndex);
  const usableRenderedSlot =
    renderedSlot?.hitKind === 'boundary' &&
    isWrittenNonTupletSlot(renderedSlot.slot)
      ? null
      : renderedSlot;
  const usableFallbackSlot = isWrittenNonTupletSlot(fallbackSlot)
    ? null
    : fallbackSlot;
  const canRenderedDirectHitOverrideBeat =
    renderedSlot?.hitKind === 'direct' &&
    (!renderedSlot.slot.event ||
      !isGeneratedRestEvent(renderedSlot.slot.event) ||
      Boolean(renderedSlot.slot.event.tuplet));
  const activeSlot =
    options.preferRenderedPosition && measureHasRenderedRhythmColumns
      ? canRenderedDirectHitOverrideBeat
        ? renderedSlot.slot
        : usableFallbackSlot ??
          exactBeatMatchedRenderedSlot ??
          usableRenderedSlot?.slot
      : exactBeatMatchedRenderedSlot ??
        usableRenderedSlot?.slot ??
        usableFallbackSlot;
  const activeSlotIsRenderedDirect =
    canRenderedDirectHitOverrideBeat && activeSlot === renderedSlot?.slot;
  const activeSlotIsExactRendered =
    Boolean(exactBeatMatchedRenderedSlot) &&
    activeSlot === exactBeatMatchedRenderedSlot;
  const shouldPreserveActiveSlotBeat =
    Boolean(activeSlot && eventLayouts[activeSlot.eventId]) &&
    (activeSlotIsRenderedDirect || activeSlotIsExactRendered);
  const rhythmSlotPosition = activeSlot
    ? {
        ...position,
        beat: activeSlot.beat,
      }
    : position;
  const cursorDuration = activeSlot?.event?.tuplet
    ? activeSlot.duration
    : duration;
  const cursorDots = activeSlot?.event?.tuplet ? activeSlot.dots ?? 0 : dots;
  const cursorSnappedPosition =
    inputCursorToMusicPosition(
      createInputCursorFromPosition(
        rhythmSlotPosition,
        cursorDuration,
        'note-input',
        getMeasureBeats(score.timeSignature),
        cursorDots,
        activeSlot?.event?.tuplet,
      ),
      score,
    ) ?? rhythmSlotPosition;
  const snappedPosition = shouldPreserveActiveSlotBeat && activeSlot
    ? {
        ...cursorSnappedPosition,
        beat: activeSlot.beat,
      }
    : cursorSnappedPosition;
  const shouldUseActiveSlotLayout =
    shouldPreserveActiveSlotBeat || Boolean(activeSlot?.event?.tuplet);
  const snappedSlot = shouldUseActiveSlotLayout
    ? activeSlot
    : getRhythmSlotsForMeasure(
        score,
        snappedPosition.staffId,
        snappedPosition.measureIndex,
        voiceIndex,
      ).find(
        (slot) => Math.abs(slot.beat - snappedPosition.beat) <= BEAT_MATCH_EPSILON,
      );
  const snappedSlotLayout = snappedSlot ? eventLayouts[snappedSlot.eventId] : undefined;

  return snappedSlot && snappedSlotLayout
    ? {
        ...snappedPosition,
        beat: shouldUseActiveSlotLayout
          ? snappedSlot.beat
          : snappedPosition.beat,
        x: snappedSlotLayout.x,
      }
    : snappedPosition;
}
