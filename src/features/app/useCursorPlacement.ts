import { useRef, useState } from 'react';
import {
  tryInsertScoreEvent,
  tryPlaceScoreEvent,
  tryPlaceTupletGroup,
} from '../../domain/score/editing';
import { applyActiveKeySignatureToPitch } from '../../domain/score/keySignatures';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { Score, StaffId } from '../../domain/score/types';
import { getTupletSlotDuration } from '../../domain/score/tuplets';
import type { EditorToolState } from '../editor/editorState';
import type { InputCursor } from '../editor/inputCursor';
import { createInputCursorFromPosition } from '../editor/inputCursor';
import { playPitchPreview } from '../playback/audioEngine';
import type { MusicPosition } from '../sheet/interaction';
import {
  findRhythmSlotAtBeat,
  findRhythmSlotAtPosition,
} from '../sheet/rhythmSlots';
import { snapInsertPositionToEventBoundary } from '../sheet/insertPosition';
import {
  createCursorAfterPlacement,
  musicPositionFromCursor,
} from './inputCursorFlow';

interface UseCursorPlacementOptions {
  clearSelection: () => void;
  commitScoreChange: (nextScore: Score, message: string) => void;
  markInvalidMeasure: (
    staffId: StaffId,
    measureIndex: number,
    message: string,
  ) => void;
  onInactivePlace: () => void;
  score: Score;
  toolState: EditorToolState;
  updateToolState: (update: Partial<EditorToolState>) => void;
}

export function useCursorPlacement({
  clearSelection,
  commitScoreChange,
  markInvalidMeasure,
  onInactivePlace,
  score,
  toolState,
  updateToolState,
}: UseCursorPlacementOptions) {
  const [hoverPosition, setHoverPosition] = useState<MusicPosition | null>(null);
  const [inputCursor, setInputCursor] = useState<InputCursor | null>(null);
  const eventCounter = useRef(1);

  function clearPointerState() {
    setHoverPosition(null);
    setInputCursor(null);
  }

  function handleHoverPositionChange(position: MusicPosition | null) {
    const nextHoverPosition = toolState.isInputArmed ? position : null;

    if (!nextHoverPosition) {
      clearPointerState();
      return;
    }

    const targetSlot =
      findRhythmSlotAtBeat(
        score,
        nextHoverPosition.staffId,
        nextHoverPosition.measureIndex,
        nextHoverPosition.beat,
        toolState.voiceIndex,
      ) ??
      findRhythmSlotAtPosition(
        score,
        nextHoverPosition,
        toolState.voiceIndex,
      );
    const hoverDuration = targetSlot?.event?.tuplet
      ? targetSlot.duration
      : toolState.duration;
    const hoverDots = targetSlot?.event?.tuplet
      ? targetSlot.dots ?? 0
      : toolState.dots;
    const hoverPositionForCursor = targetSlot?.event?.tuplet
      ? {
          ...nextHoverPosition,
          beat: targetSlot.beat,
        }
      : nextHoverPosition;
    const nextCursor = createInputCursorFromPosition(
      hoverPositionForCursor,
      hoverDuration,
      'note-input',
      getMeasureBeats(score.timeSignature),
      hoverDots,
      targetSlot?.event?.tuplet,
    );
    const cursor = targetSlot?.event?.tuplet
      ? {
          ...nextCursor,
          beat: targetSlot.beat,
        }
      : nextCursor;

    setInputCursor(cursor);
    setHoverPosition(musicPositionFromCursor(cursor, nextHoverPosition));
  }

  function handlePlaceAtPosition(position: MusicPosition) {
    if (!toolState.isInputArmed) {
      onInactivePlace();
      return;
    }

    const placementPosition =
      toolState.placementMode === 'insert'
        ? snapInsertPositionToEventBoundary(score, position, toolState.voiceIndex)
        : position;
    const accidental =
      toolState.accidental === 'none' ? undefined : toolState.accidental;
    const eventId = `event-${eventCounter.current++}`;
    const targetSlot =
      findRhythmSlotAtBeat(
        score,
        placementPosition.staffId,
        placementPosition.measureIndex,
        placementPosition.beat,
        toolState.voiceIndex,
      ) ??
      findRhythmSlotAtPosition(
        score,
        placementPosition,
        toolState.voiceIndex,
      );
    const slotTuplet = targetSlot?.event?.tuplet;

    if (toolState.tuplet && !slotTuplet) {
      const totalDuration = toolState.tuplet.totalDuration;
      const slotDuration = getTupletSlotDuration(
        totalDuration,
        toolState.tuplet.actualNotes,
        toolState.tuplet.normalNotes,
      );
      const result = tryPlaceTupletGroup(score, {
        accidental,
        actualNotes: toolState.tuplet.actualNotes,
        beat: placementPosition.beat,
        duration: totalDuration,
        entryMode: toolState.entryMode,
        eventId,
        measureIndex: placementPosition.measureIndex,
        normalNotes: toolState.tuplet.normalNotes,
        pitch: placementPosition.pitch,
        staffId: placementPosition.staffId,
        voiceIndex: toolState.voiceIndex,
      });

      if (result.placed) {
        commitScoreChange(result.score, 'Triplet placed');
        if (toolState.entryMode === 'note') {
          const placedPitch = {
            ...placementPosition.pitch,
            accidental,
          };

          void playPitchPreview([
            applyActiveKeySignatureToPitch(
              result.score,
              placementPosition.measureIndex,
              placedPitch,
            ),
          ]);
        }
        setHoverPosition(null);
        updateToolState({
          dots: 0,
          duration: slotDuration ?? toolState.duration,
          isInputArmed: true,
          tuplet: null,
        });
        setInputCursor(
          createCursorAfterPlacement(
            result.score,
            placementPosition,
            slotDuration ?? toolState.duration,
            0,
            toolState.voiceIndex,
          ),
        );
        clearSelection();
      } else {
        markInvalidMeasure(
          placementPosition.staffId,
          placementPosition.measureIndex,
          `Cannot place triplet: ${result.reason}`,
        );
      }

      return;
    }

    const placeRequest = {
      accidental,
      beat: slotTuplet && targetSlot ? targetSlot.beat : placementPosition.beat,
      dots: slotTuplet && targetSlot ? targetSlot.dots ?? 0 : toolState.dots,
      duration: slotTuplet && targetSlot ? targetSlot.duration : toolState.duration,
      entryMode: toolState.entryMode,
      eventId,
      measureIndex: placementPosition.measureIndex,
      pitch: placementPosition.pitch,
      staffId: placementPosition.staffId,
      tuplet: slotTuplet,
      voiceIndex: toolState.voiceIndex,
    };
    const result =
      toolState.placementMode === 'insert'
        ? tryInsertScoreEvent(score, placeRequest)
        : tryPlaceScoreEvent(score, placeRequest);

    if (result.placed) {
      commitScoreChange(
        result.score,
        toolState.placementMode === 'insert' ? 'Event inserted' : 'Event placed',
      );
      if (toolState.entryMode === 'note') {
        const placedPitch = {
          ...placementPosition.pitch,
          accidental,
        };

        void playPitchPreview([
          applyActiveKeySignatureToPitch(
            result.score,
            placementPosition.measureIndex,
            placedPitch,
          ),
        ]);
      }
      setHoverPosition(null);
      setInputCursor(
          createCursorAfterPlacement(
            result.score,
            {
              ...placementPosition,
              beat: placeRequest.beat,
            },
            placeRequest.duration,
            placeRequest.dots,
            toolState.voiceIndex,
          ),
      );
      clearSelection();
    } else {
      markInvalidMeasure(
        placementPosition.staffId,
        placementPosition.measureIndex,
        `Cannot place: ${result.reason}`,
      );
    }
  }

  return {
    clearPointerState,
    handleHoverPositionChange,
    handlePlaceAtPosition,
    hoverPosition,
    inputCursor,
  };
}
