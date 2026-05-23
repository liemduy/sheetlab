import { useRef, useState } from 'react';
import {
  tryInsertScoreEvent,
  tryPlaceScoreEvent,
  tryPlaceTupletGroup,
} from '../../domain/score/editing';
import { applyActiveKeySignatureToPitch } from '../../domain/score/keySignatures';
import { getActiveClef, trySetClefChange } from '../../domain/score/clefChanges';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import {
  clampPitchToClefRange,
  diatonicValueToPitch,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import type { NoteStep, Pitch, Score, StaffId } from '../../domain/score/types';
import {
  getTupletSlotDuration,
  type SupportedTupletActualNotes,
} from '../../domain/score/tuplets';
import {
  DURATION_LABEL,
  type EditableVoiceIndex,
  type EditorToolState,
} from '../editor/editorState';
import { formatInputCursor, type InputCursor } from '../editor/inputCursor';
import { playPitchPreview } from '../playback/audioEngine';
import type { MusicPosition } from '../sheet/interaction';
import { snapInsertPositionToEventBoundary } from '../sheet/insertPosition';
import { getInsertTargetEvent } from '../sheet/insertPreview';
import { getBeatX, getPitchYForScore } from '../sheet/notationGeometry';
import {
  getRhythmSlotsForMeasure,
  type RhythmSlot,
} from '../sheet/rhythmSlots';
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
  setEditorMessage: (message: string) => void;
  toolState: EditorToolState;
  updateToolState: (update: Partial<EditorToolState>) => void;
}

function getTupletLabel(actualNotes: SupportedTupletActualNotes) {
  return actualNotes === 3 ? 'Triplet' : `Tuplet ${actualNotes}`;
}

function isEditableVoiceIndex(voiceIndex: number): voiceIndex is EditableVoiceIndex {
  return voiceIndex === 0 || voiceIndex === 1;
}

function getPlacementMessage(
  placementMode: EditorToolState['placementMode'],
  placementKind: ReturnType<typeof tryPlaceScoreEvent>['placementKind'],
  voiceIndex: number,
) {
  if (placementMode === 'insert') {
    return 'Event inserted';
  }

  if (placementKind === 'parallel-voice') {
    return `Parallel voice placed in V${voiceIndex + 1}`;
  }

  if (placementKind === 'chord') {
    return 'Chord updated';
  }

  return 'Event placed';
}

const DEFAULT_KEYBOARD_PITCH_BY_STAFF: Record<StaffId, Pitch> = {
  bass: { step: 'C', octave: 3 },
  treble: { step: 'C', octave: 4 },
};

function getScoreStaff(score: Score, staffId: StaffId) {
  return score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === staffId);
}

function getFirstEditableStaffId(score: Score): StaffId {
  return score.parts[0]?.staves[0]?.id ?? 'treble';
}

function clampMeasureIndex(score: Score, staffId: StaffId, measureIndex: number) {
  const measureCount = getScoreStaff(score, staffId)?.measures.length ?? 1;

  return Math.min(Math.max(0, measureIndex), Math.max(0, measureCount - 1));
}

function createMusicPositionFromKeyboardCursor({
  beat,
  measureIndex,
  pitch,
  score,
  staffId,
}: {
  beat: number;
  measureIndex: number;
  pitch: Pitch;
  score: Score;
  staffId: StaffId;
}): MusicPosition | null {
  const staves = score.parts[0]?.staves ?? [];
  const staffIndex = staves.findIndex((staff) => staff.id === staffId);

  if (staffIndex < 0) {
    return null;
  }

  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const safeMeasureIndex = clampMeasureIndex(score, staffId, measureIndex);
  const safeBeat = Math.min(
    Math.max(0, beat),
    Math.max(0, beatsPerMeasure - 0.0001),
  );
  const activeClef = getActiveClef(
    score,
    staffId,
    safeMeasureIndex,
    safeBeat,
  );
  const boundedPitch = clampPitchToClefRange(pitch, activeClef);

  return {
    beat: Number(safeBeat.toFixed(4)),
    measureIndex: safeMeasureIndex,
    pitch: boundedPitch,
    staffId,
    staffIndex,
    x: getBeatX(safeMeasureIndex, safeBeat, beatsPerMeasure, score),
    y: getPitchYForScore(
      boundedPitch,
      activeClef,
      staffIndex,
      score,
      safeMeasureIndex,
    ),
  };
}

function getNearestPitchForStep(currentPitch: Pitch, step: NoteStep): Pitch {
  const currentValue = pitchToDiatonicValue(currentPitch);
  const candidates = [
    currentPitch.octave - 1,
    currentPitch.octave,
    currentPitch.octave + 1,
  ].map((octave) => ({ step, octave }));

  return candidates.sort((first, second) => {
    const firstDistance = Math.abs(pitchToDiatonicValue(first) - currentValue);
    const secondDistance = Math.abs(pitchToDiatonicValue(second) - currentValue);

    return (
      firstDistance - secondDistance ||
      pitchToDiatonicValue(first) - pitchToDiatonicValue(second)
    );
  })[0] ?? { step, octave: currentPitch.octave };
}

function getAllRhythmSlotsForStaff(
  score: Score,
  staffId: StaffId,
  voiceIndex: number,
) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const staff = getScoreStaff(score, staffId);

  return (staff?.measures ?? [])
    .flatMap((measure) =>
      getRhythmSlotsForMeasure(
        score,
        staffId,
        measure.index,
        voiceIndex,
      ).map((slot) => ({
        globalBeat: measure.index * beatsPerMeasure + slot.beat,
        slot,
      })),
    )
    .sort((first, second) => first.globalBeat - second.globalBeat);
}

function findAdjacentRhythmSlot({
  cursor,
  direction,
  score,
  voiceIndex,
}: {
  cursor: InputCursor;
  direction: -1 | 1;
  score: Score;
  voiceIndex: number;
}): RhythmSlot | null {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const currentGlobalBeat =
    cursor.measureIndex * beatsPerMeasure + cursor.beat;
  const slots = getAllRhythmSlotsForStaff(score, cursor.staffId, voiceIndex);

  if (direction > 0) {
    return slots.find(({ globalBeat }) => globalBeat > currentGlobalBeat + 0.0001)
      ?.slot ?? null;
  }

  return [...slots]
    .reverse()
    .find(({ globalBeat }) => globalBeat < currentGlobalBeat - 0.0001)
    ?.slot ?? null;
}

export function useCursorPlacement({
  clearSelection,
  commitScoreChange,
  markInvalidMeasure,
  onInactivePlace,
  score,
  setEditorMessage,
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

  function resolvePlacementContext(
    position: MusicPosition,
    activeToolState = toolState,
  ): ResolvedInputContext {
    const context = resolveInputContext({
      position,
      score,
      toolState: activeToolState,
    });

    if (
      activeToolState.placementMode !== 'place' ||
      !shouldSnapPlaceTargetToSequentialAppend(context.targetSlot)
    ) {
      return context;
    }

    return resolveInputContext({
      position: getSequentialAppendPosition({
        position,
        score,
        voiceIndex: activeToolState.voiceIndex,
      }),
      score,
      toolState: activeToolState,
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

    setInputCursor({ ...context.cursor, source: 'pointer' });
    setHoverPosition(musicPositionFromCursor(context.cursor, nextHoverPosition));
  }

  function placeAtPosition(
    position: MusicPosition,
    activeToolState = toolState,
    cursorSource: InputCursor['source'] = 'pointer',
  ) {
    if (!activeToolState.isInputArmed) {
      onInactivePlace();
      return;
    }

    const placementPosition =
      activeToolState.placementMode === 'insert' || activeToolState.clefChange
        ? snapInsertPositionToEventBoundary(
            score,
            position,
            activeToolState.voiceIndex,
          )
        : position;
    const context = resolvePlacementContext(placementPosition, activeToolState);
    const accidental =
      activeToolState.accidental === 'none' ? undefined : activeToolState.accidental;
    const eventId = `event-${eventCounter.current++}`;
    const targetSlot = context.targetSlot;
    const slotTuplet = context.tuplet;
    const writePosition = context.cursorPosition;

    if (activeToolState.clefChange) {
      if (
        !getInsertTargetEvent(
          score,
          context.cursorPosition,
          activeToolState.voiceIndex,
        )
      ) {
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
        activeToolState.clefChange,
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
      activeToolState.placementMode === 'insert' &&
      !getInsertTargetEvent(
        score,
        context.cursorPosition,
        activeToolState.voiceIndex,
      )
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
      activeToolState.placementMode === 'place' &&
      !isSequentialPlaceTargetAllowed({
        allowParallelVoice: activeToolState.entryMode === 'note',
        position: context.cursorPosition,
        score,
        targetSlot,
        voiceIndex: activeToolState.voiceIndex,
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

    if (activeToolState.tuplet && !slotTuplet) {
      const totalDuration = activeToolState.tuplet.totalDuration;
      const slotDuration = getTupletSlotDuration(
        totalDuration,
        activeToolState.tuplet.actualNotes,
        activeToolState.tuplet.normalNotes,
      );
      const result = tryPlaceTupletGroup(score, {
        accidental,
        actualNotes: activeToolState.tuplet.actualNotes,
        beat: writePosition.beat,
        duration: totalDuration,
        entryMode: activeToolState.entryMode,
        eventId,
        measureIndex: writePosition.measureIndex,
        normalNotes: activeToolState.tuplet.normalNotes,
        pitch: writePosition.pitch,
        staffId: writePosition.staffId,
        voiceIndex: activeToolState.voiceIndex,
      });

      if (result.placed) {
        const tupletLabel = getTupletLabel(activeToolState.tuplet.actualNotes);

        commitScoreChange(result.score, `${tupletLabel} placed`);
        if (activeToolState.entryMode === 'note') {
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
          duration: slotDuration ?? activeToolState.duration,
          isInputArmed: true,
          tuplet: null,
        });
        setInputCursor(
          {
            ...createCursorAfterPlacement(
              result.score,
              writePosition,
              slotDuration ?? activeToolState.duration,
              0,
              activeToolState.voiceIndex,
            ),
            source: cursorSource,
          },
        );
        clearSelection();
      } else {
        const tupletLabel = getTupletLabel(
          activeToolState.tuplet.actualNotes,
        ).toLowerCase();

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
      entryMode: activeToolState.entryMode,
      eventId,
      measureIndex: writePosition.measureIndex,
      pitch: writePosition.pitch,
      staffId: writePosition.staffId,
      tuplet: slotTuplet,
      voiceIndex: activeToolState.voiceIndex,
    };
    const result =
      activeToolState.placementMode === 'insert'
        ? tryInsertScoreEvent(score, placeRequest)
        : tryPlaceScoreEvent(score, placeRequest);

    if (result.placed) {
      const placedVoiceIndex = result.voiceIndex ?? activeToolState.voiceIndex;

      commitScoreChange(
        result.score,
        getPlacementMessage(
          activeToolState.placementMode,
          result.placementKind,
          placedVoiceIndex,
        ),
      );
      if (
        result.voiceIndex !== undefined &&
        result.voiceIndex !== activeToolState.voiceIndex &&
        isEditableVoiceIndex(result.voiceIndex)
      ) {
        updateToolState({ voiceIndex: result.voiceIndex });
      }
      if (activeToolState.entryMode === 'note') {
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
        {
          ...createCursorAfterPlacement(
            result.score,
            {
              ...writePosition,
              beat: placeRequest.beat,
            },
            placeRequest.duration,
            placeRequest.dots,
            placedVoiceIndex,
          ),
          source: cursorSource,
        },
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

  function handlePlaceAtPosition(position: MusicPosition) {
    placeAtPosition(position);
  }

  function getKeyboardCursorPosition(
    activeToolState = toolState,
  ): MusicPosition | null {
    if (inputCursor) {
      return createMusicPositionFromKeyboardCursor({
        beat: inputCursor.beat,
        measureIndex: inputCursor.measureIndex,
        pitch: inputCursor.pitchPreview,
        score,
        staffId: inputCursor.staffId,
      });
    }

    const staffId = getFirstEditableStaffId(score);
    const pitch = DEFAULT_KEYBOARD_PITCH_BY_STAFF[staffId];
    const initialPosition = createMusicPositionFromKeyboardCursor({
      beat: 0,
      measureIndex: 0,
      pitch,
      score,
      staffId,
    });

    if (!initialPosition) {
      return null;
    }

    const appendPosition = getSequentialAppendPosition({
      position: initialPosition,
      score,
      voiceIndex: activeToolState.voiceIndex,
    });

    return createMusicPositionFromKeyboardCursor({
      beat: appendPosition.beat,
      measureIndex: appendPosition.measureIndex,
      pitch: appendPosition.pitch,
      score,
      staffId: appendPosition.staffId,
    });
  }

  function setKeyboardCursorAtPosition(
    position: MusicPosition,
    activeToolState = toolState,
  ) {
    const context = resolvePlacementContext(position, activeToolState);

    if (
      activeToolState.placementMode === 'insert' &&
      !getInsertTargetEvent(
        score,
        context.cursorPosition,
        activeToolState.voiceIndex,
      )
    ) {
      clearPointerState();
      setEditorMessage('Cannot insert: target-note-required');
      return null;
    }

    if (
      activeToolState.placementMode === 'place' &&
      !isSequentialPlaceTargetAllowed({
        position: context.cursorPosition,
        score,
        targetSlot: context.targetSlot,
        voiceIndex: activeToolState.voiceIndex,
      })
    ) {
      clearPointerState();
      setEditorMessage('Cannot place: next-slot-required');
      return null;
    }

    setHoverPosition(null);
    setInputCursor({ ...context.cursor, source: 'keyboard' });

    return context.cursor;
  }

  function handleKeyboardCursorMove({
    pitchDelta = 0,
    rhythmDelta = 0,
    staffDelta = 0,
  }: {
    pitchDelta?: number;
    rhythmDelta?: -1 | 0 | 1;
    staffDelta?: -1 | 0 | 1;
  }) {
    const activeToolState = {
      ...toolState,
      clefChange: null,
      isInputArmed: true,
    };
    const currentPosition = getKeyboardCursorPosition(activeToolState);

    if (!currentPosition) {
      return;
    }

    const staves = score.parts[0]?.staves ?? [];
    const currentStaffIndex = Math.max(0, currentPosition.staffIndex);
    const nextStaffIndex = Math.min(
      Math.max(0, currentStaffIndex + staffDelta),
      Math.max(0, staves.length - 1),
    );
    const nextStaffId = staves[nextStaffIndex]?.id ?? currentPosition.staffId;
    const currentCursor = inputCursor ?? {
      beat: currentPosition.beat,
      duration: activeToolState.duration,
      measureIndex: currentPosition.measureIndex,
      mode: 'note-input' as const,
      pitchPreview: currentPosition.pitch,
      staffId: currentPosition.staffId,
      staffIndex: currentPosition.staffIndex,
    };
    const adjacentSlot =
      rhythmDelta === 0
        ? null
        : findAdjacentRhythmSlot({
            cursor: currentCursor,
            direction: rhythmDelta,
            score,
            voiceIndex: activeToolState.voiceIndex,
          });
    const nextBeat = adjacentSlot?.beat ?? currentPosition.beat;
    const nextMeasureIndex =
      adjacentSlot?.measureIndex ?? currentPosition.measureIndex;
    const nextPitch =
      pitchDelta === 0
        ? currentPosition.pitch
        : diatonicValueToPitch(
            pitchToDiatonicValue(currentPosition.pitch) + pitchDelta,
          );
    const nextPosition = createMusicPositionFromKeyboardCursor({
      beat: nextBeat,
      measureIndex: nextMeasureIndex,
      pitch: nextPitch,
      score,
      staffId: nextStaffId,
    });

    if (!nextPosition) {
      return;
    }

    updateToolState(activeToolState);
    const nextCursor = setKeyboardCursorAtPosition(nextPosition, activeToolState);

    if (nextCursor) {
      setEditorMessage(`Cursor moved: ${formatInputCursor(nextCursor)}`);
    }
  }

  function handleKeyboardCursorStaffChange(staffId: StaffId) {
    const activeToolState = {
      ...toolState,
      clefChange: null,
      isInputArmed: true,
    };
    const basePitch =
      inputCursor?.staffId === staffId
        ? inputCursor.pitchPreview
        : DEFAULT_KEYBOARD_PITCH_BY_STAFF[staffId];
    const basePosition = createMusicPositionFromKeyboardCursor({
      beat: inputCursor?.staffId === staffId ? inputCursor.beat : 0,
      measureIndex:
        inputCursor?.staffId === staffId ? inputCursor.measureIndex : 0,
      pitch: basePitch,
      score,
      staffId,
    });

    if (!basePosition) {
      return;
    }

    const appendPosition =
      inputCursor?.staffId === staffId
        ? basePosition
        : getSequentialAppendPosition({
            position: basePosition,
            score,
            voiceIndex: activeToolState.voiceIndex,
          });
    const nextPosition = createMusicPositionFromKeyboardCursor({
      beat: appendPosition.beat,
      measureIndex: appendPosition.measureIndex,
      pitch: appendPosition.pitch,
      score,
      staffId: appendPosition.staffId,
    });

    if (!nextPosition) {
      return;
    }

    updateToolState(activeToolState);
    const nextCursor = setKeyboardCursorAtPosition(nextPosition, activeToolState);

    if (nextCursor) {
      setEditorMessage(
        staffId === 'bass'
          ? `Left hand input: ${formatInputCursor(nextCursor)}`
          : `Right hand input: ${formatInputCursor(nextCursor)}`,
      );
    }
  }

  function handleKeyboardCursorDurationChange(
    nextToolState: Pick<EditorToolState, 'dots' | 'duration'>,
  ) {
    const activeToolState = {
      ...toolState,
      ...nextToolState,
      clefChange: null,
      isInputArmed: true,
      tuplet: null,
    };
    const currentPosition = getKeyboardCursorPosition(activeToolState);

    if (!currentPosition) {
      return;
    }

    updateToolState({
      clefChange: null,
      dots: activeToolState.dots,
      duration: activeToolState.duration,
      isInputArmed: true,
      tuplet: null,
    });
    const nextCursor = setKeyboardCursorAtPosition(currentPosition, activeToolState);

    if (nextCursor) {
      setEditorMessage(
        `${DURATION_LABEL[activeToolState.duration]} entry: ${formatInputCursor(
          nextCursor,
        )}`,
      );
    }
  }

  function handleKeyboardPlaceAtCursor() {
    const activeToolState = {
      ...toolState,
      clefChange: null,
      isInputArmed: true,
    };
    const position = getKeyboardCursorPosition(activeToolState);

    if (!position) {
      return;
    }

    updateToolState(activeToolState);
    placeAtPosition(position, activeToolState, 'keyboard');
  }

  function handleKeyboardPitchStepInput(step: NoteStep) {
    const activeToolState = {
      ...toolState,
      clefChange: null,
      entryMode: 'note' as const,
      isInputArmed: true,
    };
    const currentPosition = getKeyboardCursorPosition(activeToolState);

    if (!currentPosition) {
      return;
    }

    const nextPosition = createMusicPositionFromKeyboardCursor({
      beat: currentPosition.beat,
      measureIndex: currentPosition.measureIndex,
      pitch: getNearestPitchForStep(currentPosition.pitch, step),
      score,
      staffId: currentPosition.staffId,
    });

    if (!nextPosition) {
      return;
    }

    updateToolState(activeToolState);
    placeAtPosition(nextPosition, activeToolState, 'keyboard');
  }

  return {
    clearPointerState,
    handleKeyboardCursorDurationChange,
    handleKeyboardCursorMove,
    handleKeyboardCursorStaffChange,
    handleKeyboardPitchStepInput,
    handleKeyboardPlaceAtCursor,
    handleHoverPositionChange,
    handlePlaceAtPosition,
    hoverPosition,
    inputCursor,
  };
}
