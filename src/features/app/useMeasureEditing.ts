import { useState } from 'react';
import {
  clearMeasureContent,
  deleteMeasureAt,
  insertMeasureAt,
} from '../../domain/score/editing';
import type { Score } from '../../domain/score/types';
import type { MeasureContextMenuState, MeasureTarget } from './selectionTypes';

interface UseMeasureEditingOptions {
  clearSelection: () => void;
  commitScoreChange: (nextScore: Score, message: string) => void;
  score: Score;
  selectedMeasure: MeasureTarget | null;
  selectMeasure: (target: MeasureTarget) => void;
}

export function useMeasureEditing({
  clearSelection,
  commitScoreChange,
  score,
  selectedMeasure,
  selectMeasure,
}: UseMeasureEditingOptions) {
  const [measureContextMenu, setMeasureContextMenu] =
    useState<MeasureContextMenuState | null>(null);
  const [pendingMeasureDelete, setPendingMeasureDelete] =
    useState<MeasureTarget | null>(null);
  const [pendingMeasureClear, setPendingMeasureClear] =
    useState<MeasureTarget | null>(null);

  function getMeasureCount() {
    return score.parts[0]?.staves[0]?.measures.length ?? 0;
  }

  function getActiveMeasureTarget() {
    return measureContextMenu ?? selectedMeasure;
  }

  function clearMeasureUiState() {
    setMeasureContextMenu(null);
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
  }

  function closeMeasureContextMenu() {
    setMeasureContextMenu(null);
  }

  function openMeasureContextMenu(
    target: MeasureTarget,
    clientX: number,
    clientY: number,
  ) {
    selectMeasure(target);
    setMeasureContextMenu({ ...target, clientX, clientY });
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
  }

  function handleClearMeasureContent() {
    const targetMeasure = getActiveMeasureTarget();

    if (!targetMeasure) {
      return;
    }

    commitScoreChange(
      clearMeasureContent(
        score,
        targetMeasure.staffId,
        targetMeasure.measureIndex,
      ),
      'Measure content cleared',
    );
    selectMeasure(targetMeasure);
    closeMeasureContextMenu();
  }

  function handleRequestClearMeasureContent() {
    const targetMeasure = getActiveMeasureTarget();

    if (!targetMeasure) {
      return;
    }

    setPendingMeasureClear(targetMeasure);
    closeMeasureContextMenu();
  }

  function handleConfirmClearMeasureContent() {
    if (!pendingMeasureClear) {
      return;
    }

    commitScoreChange(
      clearMeasureContent(
        score,
        pendingMeasureClear.staffId,
        pendingMeasureClear.measureIndex,
      ),
      'Measure content cleared',
    );
    selectMeasure(pendingMeasureClear);
    setPendingMeasureClear(null);
  }

  function handleInsertMeasureBefore() {
    const targetMeasure = getActiveMeasureTarget();

    if (!targetMeasure) {
      return;
    }

    commitScoreChange(
      insertMeasureAt(score, targetMeasure.measureIndex),
      'Measure inserted before',
    );
    selectMeasure(targetMeasure);
    closeMeasureContextMenu();
  }

  function handleInsertMeasureAfter() {
    const targetMeasure = getActiveMeasureTarget();

    if (!targetMeasure) {
      return;
    }

    const nextMeasure = {
      staffId: targetMeasure.staffId,
      measureIndex: targetMeasure.measureIndex + 1,
    };

    commitScoreChange(
      insertMeasureAt(score, nextMeasure.measureIndex),
      'Measure inserted after',
    );
    selectMeasure(nextMeasure);
    closeMeasureContextMenu();
  }

  function handleRequestDeleteMeasure() {
    const targetMeasure = getActiveMeasureTarget();

    if (!targetMeasure) {
      return;
    }

    setPendingMeasureDelete(targetMeasure);
    setPendingMeasureClear(null);
    closeMeasureContextMenu();
  }

  function handleConfirmDeleteMeasure() {
    if (!pendingMeasureDelete) {
      return;
    }

    const measureCount = getMeasureCount();
    const nextSelectedIndex = Math.min(
      pendingMeasureDelete.measureIndex,
      Math.max(0, measureCount - 2),
    );

    commitScoreChange(
      deleteMeasureAt(score, pendingMeasureDelete.measureIndex),
      'Measure deleted',
    );

    if (measureCount > 1) {
      selectMeasure({
        staffId: pendingMeasureDelete.staffId,
        measureIndex: nextSelectedIndex,
      });
    } else {
      clearSelection();
    }
    setPendingMeasureDelete(null);
  }

  return {
    clearMeasureUiState,
    getMeasureCount,
    handleClearMeasureContent,
    handleConfirmClearMeasureContent,
    handleConfirmDeleteMeasure,
    handleInsertMeasureAfter,
    handleInsertMeasureBefore,
    handleRequestClearMeasureContent,
    handleRequestDeleteMeasure,
    measureContextMenu,
    openMeasureContextMenu,
    pendingMeasureClear,
    pendingMeasureDelete,
    setPendingMeasureClear,
    setPendingMeasureDelete,
  };
}
