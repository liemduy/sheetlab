import type { Dispatch, SetStateAction } from 'react';
import type { Score } from '../../domain/score/types';
import type { EditorToolState } from '../editor/editorState';

interface UseUndoRedoControlsOptions {
  clearTransientInteraction: () => void;
  futureScores: Score[];
  pastScores: Score[];
  score: Score;
  setEditorMessage: (message: string) => void;
  setFutureScores: Dispatch<SetStateAction<Score[]>>;
  setInvalidMeasureKeys: Dispatch<SetStateAction<string[]>>;
  setPastScores: Dispatch<SetStateAction<Score[]>>;
  setScore: Dispatch<SetStateAction<Score>>;
  updateToolState: (update: Partial<EditorToolState>) => void;
}

export function useUndoRedoControls({
  clearTransientInteraction,
  futureScores,
  pastScores,
  score,
  setEditorMessage,
  setFutureScores,
  setInvalidMeasureKeys,
  setPastScores,
  setScore,
  updateToolState,
}: UseUndoRedoControlsOptions) {
  function handleUndo() {
    const previousScore = pastScores.at(-1);

    if (!previousScore) {
      return;
    }

    setPastScores((currentPast) => currentPast.slice(0, -1));
    setFutureScores((currentFuture) => [score, ...currentFuture]);
    setScore(previousScore);
    clearTransientInteraction();
    setInvalidMeasureKeys([]);
    updateToolState({ clefChange: null, isInputArmed: false, tuplet: null });
    setEditorMessage('Undo');
  }

  function handleRedo() {
    const [nextScore, ...remainingFuture] = futureScores;

    if (!nextScore) {
      return;
    }

    setPastScores((currentPast) => [...currentPast, score]);
    setFutureScores(remainingFuture);
    setScore(nextScore);
    clearTransientInteraction();
    setInvalidMeasureKeys([]);
    updateToolState({ clefChange: null, isInputArmed: false, tuplet: null });
    setEditorMessage('Redo');
  }

  return {
    handleRedo,
    handleUndo,
  };
}
