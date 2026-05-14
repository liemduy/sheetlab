import { useRef, useState } from 'react';
import {
  tryInsertScoreEvent,
  tryPlaceScoreEvent,
  tryPlaceTupletGroup,
} from '../../domain/score/editing';
import { applyActiveKeySignatureToPitch } from '../../domain/score/keySignatures';
import { trySetClefChange } from '../../domain/score/clefChanges';
import type { Score, StaffId } from '../../domain/score/types';
import {
  getTupletSlotDuration,
  type SupportedTupletActualNotes,
} from '../../domain/score/tuplets';
import type { EditorToolState } from '../editor/editorState';
import type { InputCursor } from '../editor/inputCursor';
import { playPitchPreview } from '../playback/audioEngine';
import type { MusicPosition } from '../sheet/interaction';
import { snapInsertPositionToEventBoundary } from '../sheet/insertPosition';
import { getInsertTargetEvent } from '../sheet/insertPreview';
import {
  createCursorAfterPlacement,
  musicPositionFromCursor,
} from './inputCursorFlow';
import {
  getSequentialAppendPosition,
  isSequentialPlaceTargetAllowed,
  shouldSnapPlaceTargetToSequentialAppend,
} from './inputPlacementRules';
import { resolveInputContext } from './resolvedInputContext';
import type { ResolvedInputContext } from './resolvedInputContext';

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

function getTupletLabel(actualNotes: SupportedTupletActualNotes) {
  return actualNotes === 3 ? 'Triplet' : `Tuplet ${actualNotes}`;
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

  function resolvePlacementContext(position: MusicPosition): ResolvedInputContext {
    const context = resolveInputContext({
      position,
      score,
      toolState,
    });

    if (
      toolState.placementMode !== 'place' ||
      !shouldSnapPlaceTargetToSequentialAppend(context.targetSlot)
    ) {
      return context;
    }

    return resolveInputContext({
      position: getSequentialAppendPosition({
        position,
        score,
        voiceIndex: toolState.voiceIndex,
      }),
      score,
      toolState,
    });
  }

  function handleHoverPositionChange(position: MusicPosition | null) {
    const nextHoverPosition = toolState.isInputArmed ? position : null;

    if (!nextHoverPosition) {
      clearPointerState();
      return;
    }

    const hoverPlacementPosition =
      toolState.placementMode === 'insert' || toolState.clefChange
        ? snapInsertPositionToEventBoundary(
            score,
            nextHoverPosition,
            toolState.voiceIndex,
          )
        : nextHoverPosition;
    const context = resolvePlacementContext(hoverPlacementPosition);

    if (
      (toolState.placementMode === 'insert' || toolState.clefChange) &&
      !getInsertTargetEvent(score, context.cursorPosition, toolState.voiceIndex)
    ) {
      clearPointerState();
      return;
    }

    if (
      toolState.placementMode === 'place' &&
      !isSequentialPlaceTargetAllowed({
        position: context.cursorPosition,
        score,
        targetSlot: context.targetSlot,
        voiceIndex: toolState.voiceIndex,
      })
    ) {
      clearPointerState();
      return;
    }

    setInputCursor(context.cursor);
    setHoverPosition(musicPositionFromCursor(context.cursor, nextHoverPosition));
  }

  function handlePlaceAtPosition(position: MusicPosition) {
    if (!toolState.isInputArmed) {
      onInactivePlace();
      return;
    }

    const placementPosition =
      toolState.placementMode === 'insert' || toolState.clefChange
        ? snapInsertPositionToEventBoundary(score, position, toolState.voiceIndex)
        : position;
    const context = resolvePlacementContext(placementPosition);
    const accidental =
      toolState.accidental === 'none' ? undefined : toolState.accidental;
    const eventId = `event-${eventCounter.current++}`;
    const targetSlot = context.targetSlot;
    const slotTuplet = context.tuplet;
    const writePosition = context.cursorPosition;

    if (toolState.clefChange) {
      if (!getInsertTargetEvent(score, context.cursorPosition, toolState.voiceIndex)) {
        markInvalidMeasure(
          placementPosition.staffId,
          placementPosition.measureIndex,
          'Cannot insert clef: target-note-required',
        );
        clearPointerState();
        clearSelection();
        return;
      }

      const result = trySetClefChange(
        score,
        writePosition.staffId,
        writePosition.measureIndex,
        writePosition.beat,
        toolState.clefChange,
      );

      if (result.updated) {
        commitScoreChange(result.score, 'Clef change inserted');
        setHoverPosition(null);
        setInputCursor(null);
        clearSelection();
      } else {
        markInvalidMeasure(
          writePosition.staffId,
          writePosition.measureIndex,
          `Cannot insert clef: ${result.reason}`,
        );
        clearPointerState();
        clearSelection();
      }

      return;
    }

    if (
      toolState.placementMode === 'insert' &&
      !getInsertTargetEvent(score, context.cursorPosition, toolState.voiceIndex)
    ) {
      markInvalidMeasure(
        placementPosition.staffId,
        placementPosition.measureIndex,
        'Cannot insert: target-note-required',
      );
      clearPointerState();
      clearSelection();
      return;
    }

    if (
      toolState.placementMode === 'place' &&
      !isSequentialPlaceTargetAllowed({
        position: context.cursorPosition,
        score,
        targetSlot,
        voiceIndex: toolState.voiceIndex,
      })
    ) {
      markInvalidMeasure(
        placementPosition.staffId,
        placementPosition.measureIndex,
        'Cannot place: next-slot-required',
      );
      clearPointerState();
      clearSelection();
      return;
    }

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
        beat: writePosition.beat,
        duration: totalDuration,
        entryMode: toolState.entryMode,
        eventId,
        measureIndex: writePosition.measureIndex,
        normalNotes: toolState.tuplet.normalNotes,
        pitch: writePosition.pitch,
        staffId: writePosition.staffId,
        voiceIndex: toolState.voiceIndex,
      });

      if (result.placed) {
        const tupletLabel = getTupletLabel(toolState.tuplet.actualNotes);

        commitScoreChange(result.score, `${tupletLabel} placed`);
        if (toolState.entryMode === 'note') {
          const placedPitch = {
            ...writePosition.pitch,
            accidental,
          };

          void playPitchPreview([
            applyActiveKeySignatureToPitch(
              result.score,
              writePosition.measureIndex,
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
            writePosition,
            slotDuration ?? toolState.duration,
            0,
            toolState.voiceIndex,
          ),
        );
        clearSelection();
      } else {
        const tupletLabel = getTupletLabel(toolState.tuplet.actualNotes).toLowerCase();

        markInvalidMeasure(
          writePosition.staffId,
          writePosition.measureIndex,
          `Cannot place ${tupletLabel}: ${result.reason}`,
        );
        updateToolState({
          isInputArmed: false,
          tuplet: null,
        });
        clearPointerState();
        clearSelection();
      }

      return;
    }

    const placeRequest = {
      accidental,
      beat: context.isExistingTupletSlot
        ? context.cursor.beat
        : context.cursorPosition.beat,
      dots: context.dots,
      duration: context.duration,
      entryMode: toolState.entryMode,
      eventId,
      measureIndex: writePosition.measureIndex,
      pitch: writePosition.pitch,
      staffId: writePosition.staffId,
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
          ...writePosition.pitch,
          accidental,
        };

        void playPitchPreview([
          applyActiveKeySignatureToPitch(
            result.score,
            writePosition.measureIndex,
            placedPitch,
          ),
        ]);
      }
      setHoverPosition(null);
      setInputCursor(
        createCursorAfterPlacement(
          result.score,
          {
            ...writePosition,
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
        writePosition.staffId,
        writePosition.measureIndex,
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
