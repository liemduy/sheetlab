import type { Dispatch, SetStateAction } from 'react';
import { tryUpdateScoreEvent } from '../../domain/score/editing';
import type {
  AnnotationKind,
  AnnotationPlacementSide,
  Score,
} from '../../domain/score/types';
import type { EditorToolState } from '../editor/editorState';
import type { AnnotationContextMenuState } from './selectionTypes';

interface UseAnnotationCommandsParams {
  annotationContextMenu: AnnotationContextMenuState | null;
  clearMeasureUiState: () => void;
  clearPointerState: () => void;
  commitScoreChange: (nextScore: Score, message: string) => void;
  score: Score;
  selectEvent: (eventId: string, pitchIndex?: number | null) => void;
  selectedEventId: string | null;
  setAnnotationContextMenu: Dispatch<
    SetStateAction<AnnotationContextMenuState | null>
  >;
  setEditorMessage: (message: string) => void;
  updateToolState: (update: Partial<EditorToolState>) => void;
}

export function useAnnotationCommands({
  annotationContextMenu,
  clearMeasureUiState,
  clearPointerState,
  commitScoreChange,
  score,
  selectEvent,
  selectedEventId,
  setAnnotationContextMenu,
  setEditorMessage,
  updateToolState,
}: UseAnnotationCommandsParams) {
  function handleSelectedEventAnnotationChange(
    update: Parameters<typeof tryUpdateScoreEvent>[2],
    message: string,
  ) {
    if (!selectedEventId) {
      return;
    }

    const result = tryUpdateScoreEvent(score, selectedEventId, update);

    if (result.updated) {
      commitScoreChange(result.score, message);
    } else {
      setEditorMessage(`Cannot update annotation: ${result.reason}`);
    }
  }

  function handleAnnotationContextMenu(
    eventId: string,
    kind: AnnotationKind,
    clientX: number,
    clientY: number,
  ) {
    updateToolState({ clefChange: null, isInputArmed: false });
    clearPointerState();
    clearMeasureUiState();
    selectEvent(eventId, null);
    setAnnotationContextMenu({ clientX, clientY, eventId, kind });
    setEditorMessage('Annotation selected');
  }

  function handleAnnotationPlacementChange(side: AnnotationPlacementSide) {
    if (!annotationContextMenu) {
      return;
    }

    const result = tryUpdateScoreEvent(score, annotationContextMenu.eventId, {
      annotationPlacement: {
        kind: annotationContextMenu.kind,
        side,
      },
    });

    if (result.updated) {
      commitScoreChange(
        result.score,
        side === 'auto'
          ? 'Annotation placement reset'
          : `Annotation moved ${side}`,
      );
    } else {
      setEditorMessage(`Cannot update annotation placement: ${result.reason}`);
    }

    setAnnotationContextMenu(null);
  }

  function handleLyricMapChange(eventId: string, targetEventIds: string[]) {
    const result = tryUpdateScoreEvent(score, eventId, {
      lyricMap: { eventIds: targetEventIds },
    });

    if (result.updated) {
      commitScoreChange(result.score, 'Lyric map updated');
      selectEvent(eventId, null);
    } else {
      setEditorMessage(`Cannot update lyric map: ${result.reason}`);
    }
  }

  return {
    handleAnnotationContextMenu,
    handleAnnotationPlacementChange,
    handleLyricMapChange,
    handleSelectedEventAnnotationChange,
  };
}
