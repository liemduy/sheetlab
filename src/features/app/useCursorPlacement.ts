import { useRef, useState } from 'react';
import {
  tryInsertScoreEvent,
  tryPlaceScoreEvent,
} from '../../domain/score/editing';
import { applyActiveKeySignatureToPitch } from '../../domain/score/keySignatures';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { Score, StaffId } from '../../domain/score/types';
import type { EditorToolState } from '../editor/editorState';
import type { InputCursor } from '../editor/inputCursor';
import { createInputCursorFromPosition } from '../editor/inputCursor';
import { playPitchPreview } from '../playback/audioEngine';
import type { MusicPosition } from '../sheet/interaction';
import { snapInsertPositionToEventBoundary } from '../sheet/insertPosition';
import {
  createCursorAfterPlacement,
  hasPitchedEventAtPosition,
  musicPositionFromCursor,
  shouldUseSequentialCursor,
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
}

export function useCursorPlacement({
  clearSelection,
  commitScoreChange,
  markInvalidMeasure,
  onInactivePlace,
  score,
  toolState,
}: UseCursorPlacementOptions) {
  const [hoverPosition, setHoverPosition] = useState<MusicPosition | null>(null);
  const [inputCursor, setInputCursor] = useState<InputCursor | null>(null);
  const eventCounter = useRef(1);
  const isCursorSequenceLockedRef = useRef(false);

  function setCursorSequenceLocked(isLocked: boolean) {
    isCursorSequenceLockedRef.current = isLocked;
  }

  function clearPointerState() {
    setHoverPosition(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
  }

  function handleHoverPositionChange(position: MusicPosition | null) {
    const nextHoverPosition = toolState.isInputArmed ? position : null;

    if (!nextHoverPosition) {
      clearPointerState();
      return;
    }

    setInputCursor((currentCursor) => {
      const sequentialCursor =
        currentCursor &&
        shouldUseSequentialCursor(
          currentCursor,
          isCursorSequenceLockedRef.current,
          nextHoverPosition,
        )
          ? currentCursor
          : null;
      const cursorPosition = sequentialCursor
        ? musicPositionFromCursor(sequentialCursor, nextHoverPosition)
        : nextHoverPosition;
      const nextCursor = createInputCursorFromPosition(
        cursorPosition,
        toolState.duration,
        'note-input',
        getMeasureBeats(score.timeSignature),
        toolState.dots,
      );

      setHoverPosition(musicPositionFromCursor(nextCursor, cursorPosition));

      return nextCursor;
    });
  }

  function handlePlaceAtPosition(position: MusicPosition) {
    if (!toolState.isInputArmed) {
      onInactivePlace();
      return;
    }

    const sequentialCursor =
      inputCursor &&
      shouldUseSequentialCursor(
        inputCursor,
        isCursorSequenceLockedRef.current,
        position,
      ) &&
      !hasPitchedEventAtPosition(score, position)
        ? inputCursor
        : null;
    const sequentialPlacementPosition =
      sequentialCursor
        ? musicPositionFromCursor(sequentialCursor, position)
        : position;
    const placementPosition =
      toolState.placementMode === 'insert'
        ? snapInsertPositionToEventBoundary(score, position)
        : sequentialPlacementPosition;
    const accidental =
      toolState.accidental === 'none' ? undefined : toolState.accidental;
    const eventId = `event-${eventCounter.current++}`;

    const placeRequest = {
      accidental,
      beat: placementPosition.beat,
      dots: toolState.dots,
      duration: toolState.duration,
      entryMode: toolState.entryMode,
      eventId,
      measureIndex: placementPosition.measureIndex,
      pitch: placementPosition.pitch,
      staffId: placementPosition.staffId,
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
          placementPosition,
          toolState.duration,
          toolState.dots,
        ),
      );
      setCursorSequenceLocked(true);
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
    setCursorSequenceLocked,
  };
}
