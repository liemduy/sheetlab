import type { Dispatch, SetStateAction } from 'react';
import {
  addMeasure,
  findScoreEvent,
  setMeasureKeySignature,
  setMeasureRepeatJump,
  setMeasureSectionMarker,
  setScoreTimeSignature,
  tryMoveKeySignatureSymbol,
} from '../../domain/score/editing';
import { createEmptyScore } from '../../domain/score/factories';
import { getActiveKeySignatureSelection } from '../../domain/score/keySignatures';
import {
  getMeasureRepeatJump,
  getRepeatJumpOption,
} from '../../domain/score/repeatJumps';
import {
  getTimeSignatureLabel,
  parseTimeSignatureId,
} from '../../domain/score/timeSignatures';
import type {
  KeySignature,
  PageSize,
  RepeatJumpKind,
  Score,
  ScoreType,
  StaffId,
} from '../../domain/score/types';
import { PAGE_SIZE_LABEL } from '../editor/editorState';
import type { EditorToolState } from '../editor/editorState';
import type { ToolbarPalette } from '../editor/EditorToolbar';
import type { InputCursor } from '../editor/inputCursor';
import type { MusicPosition } from '../sheet/interaction';
import type { MeasureTarget } from './selectionTypes';

interface UseScoreCommandsParams {
  clearPointerState: () => void;
  clearTransientInteraction: () => void;
  commitScoreChange: (nextScore: Score, message: string) => void;
  hoverPosition: MusicPosition | null;
  inputCursor: InputCursor | null;
  score: Score;
  scrollNotationIntoView: () => void;
  selectMeasure: (target: MeasureTarget) => void;
  selectedEventId: string | null;
  selectedMeasure: MeasureTarget | null;
  setEditorMessage: (message: string) => void;
  setOpenPalette: Dispatch<SetStateAction<ToolbarPalette>>;
  setScore: Dispatch<SetStateAction<Score>>;
  setSelectedMeasure: Dispatch<SetStateAction<MeasureTarget | null>>;
  toolState: EditorToolState;
  updateToolState: (update: Partial<EditorToolState>) => void;
}

export function useScoreCommands({
  clearPointerState,
  clearTransientInteraction,
  commitScoreChange,
  hoverPosition,
  inputCursor,
  score,
  scrollNotationIntoView,
  selectMeasure,
  selectedEventId,
  selectedMeasure,
  setEditorMessage,
  setOpenPalette,
  setScore,
  setSelectedMeasure,
  toolState,
  updateToolState,
}: UseScoreCommandsParams) {
  function getKeySignatureTargetMeasureIndex() {
    if (selectedMeasure) {
      return selectedMeasure.measureIndex;
    }

    if (selectedEventId) {
      return findScoreEvent(score, selectedEventId)?.measureIndex ?? 0;
    }

    return inputCursor?.measureIndex ?? hoverPosition?.measureIndex ?? 0;
  }

  function getScoreEditTargetMeasureIndex() {
    return getKeySignatureTargetMeasureIndex();
  }

  function handleScoreTypeChange(scoreType: ScoreType) {
    updateToolState({ scoreType, isInputArmed: false });
    commitScoreChange(
      createEmptyScore(scoreType, {
        pageSize: score.pageSize,
        tempo: toolState.tempo,
        timeSignature: score.timeSignature,
      }),
      'New score',
    );
    clearTransientInteraction();
    scrollNotationIntoView();
  }

  function handleResetScore() {
    updateToolState({ placementMode: 'place', isInputArmed: false });
    commitScoreChange(
      createEmptyScore(toolState.scoreType, {
        pageSize: score.pageSize,
        tempo: toolState.tempo,
        timeSignature: score.timeSignature,
      }),
      'Score reset',
    );
    clearTransientInteraction();
    scrollNotationIntoView();
  }

  function handleAddMeasure() {
    commitScoreChange(addMeasure(score), 'Measure added');
  }

  function handleKeySignatureChange(keySignature: KeySignature) {
    const measureIndex = getKeySignatureTargetMeasureIndex();

    commitScoreChange(
      setMeasureKeySignature(score, measureIndex, keySignature),
      `Key signature set to ${keySignature}`,
    );
    setOpenPalette(null);
    setSelectedMeasure((currentSelection) =>
      currentSelection
        ? {
            ...currentSelection,
            measureIndex,
          }
        : currentSelection,
    );
  }

  function handleTimeSignatureChange(value: string) {
    const timeSignature = parseTimeSignatureId(value);

    if (!timeSignature) {
      return;
    }

    commitScoreChange(
      setScoreTimeSignature(score, timeSignature),
      `Time signature set to ${getTimeSignatureLabel(timeSignature)}`,
    );
    clearPointerState();
  }

  function handleRepeatJumpChange(repeatJump: RepeatJumpKind | null) {
    const measureIndex = getScoreEditTargetMeasureIndex();

    commitScoreChange(
      setMeasureRepeatJump(score, measureIndex, repeatJump),
      repeatJump
        ? `${getRepeatJumpOption(repeatJump)?.label ?? repeatJump} set at measure ${
            measureIndex + 1
          }`
        : `Repeat/jump cleared at measure ${measureIndex + 1}`,
    );
    setOpenPalette(null);
    selectMeasure({
      staffId: selectedMeasure?.staffId ?? 'treble',
      measureIndex,
    });
  }

  function handleMoveKeySignatureSymbol(
    sourceMeasureIndex: number,
    symbolIndex: number,
    position: MusicPosition,
  ) {
    const result = tryMoveKeySignatureSymbol(
      score,
      sourceMeasureIndex,
      symbolIndex,
      position.pitch,
    );

    if (result.moved) {
      commitScoreChange(result.score, 'Key signature symbol moved');
      clearPointerState();
      selectMeasure({
        staffId: position.staffId,
        measureIndex: sourceMeasureIndex,
      });
    } else {
      setEditorMessage(`Cannot move key signature: ${result.reason}`);
    }
  }

  function handleTempoChange(value: string) {
    const nextTempo = Number(value);

    if (!Number.isNaN(nextTempo)) {
      updateToolState({ tempo: nextTempo });
      setScore((currentScore) => ({
        ...currentScore,
        tempo: nextTempo,
      }));
    }
  }

  function handlePageSizeChange(pageSize: PageSize) {
    setScore((currentScore) => ({
      ...currentScore,
      pageSize,
    }));
    setEditorMessage(`Page size set to ${PAGE_SIZE_LABEL[pageSize]}`);
  }

  function handleSectionMarkerChange(sectionMarker: string | null) {
    const measureIndex = getScoreEditTargetMeasureIndex();

    commitScoreChange(
      setMeasureSectionMarker(score, measureIndex, sectionMarker),
      sectionMarker ? 'Section marker updated' : 'Section marker cleared',
    );
    selectMeasure({
      staffId: selectedMeasure?.staffId ?? 'treble',
      measureIndex,
    });
  }

  return {
    activeKeySignatureSelection: getActiveKeySignatureSelection(
      score,
      getKeySignatureTargetMeasureIndex(),
    ),
    activeRepeatJump: getMeasureRepeatJump(
      score,
      getScoreEditTargetMeasureIndex(),
    ),
    getKeySignatureTargetMeasureIndex,
    getScoreEditTargetMeasureIndex,
    handleAddMeasure,
    handleKeySignatureChange,
    handleMoveKeySignatureSymbol,
    handlePageSizeChange,
    handleRepeatJumpChange,
    handleResetScore,
    handleScoreTypeChange,
    handleSectionMarkerChange,
    handleTempoChange,
    handleTimeSignatureChange,
  };
}
