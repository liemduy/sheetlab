import { isPitchedScoreEvent } from '../../domain/score/events';
import {
  deleteScoreEvent,
  deleteScoreEventPitch,
  findScoreEvent,
  tryUpdateScoreEvent,
} from '../../domain/score/editing';
import type {
  AccidentalChoice,
  EditorToolState,
} from '../editor/editorState';
import type { DurationValue, Score } from '../../domain/score/types';
import type { MusicPosition } from '../sheet/interaction';
import { pitchesMatch } from './inputCursorFlow';
import type { MeasureTarget, SelectionSource } from './selectionTypes';

interface UseScoreEventEditingOptions {
  clearMeasureSelection: () => void;
  clearMeasureUiState: () => void;
  clearPointerState: () => void;
  clearSelection: () => void;
  commitScoreChange: (nextScore: Score, message: string) => void;
  markInvalidMeasure: (
    staffId: MusicPosition['staffId'],
    measureIndex: number,
    message: string,
  ) => void;
  onRequestClearMeasureContent: () => void;
  score: Score;
  selectEvent: (eventId: string, pitchIndex?: number | null) => void;
  selectedEventId: string | null;
  selectedEventSource: SelectionSource | null;
  selectedMeasure: MeasureTarget | null;
  selectedPitchIndex: number | null;
  setEditorMessage: (message: string) => void;
  updateToolState: (update: Partial<EditorToolState>) => void;
}

export function useScoreEventEditing({
  clearMeasureSelection,
  clearMeasureUiState,
  clearPointerState,
  clearSelection,
  commitScoreChange,
  markInvalidMeasure,
  onRequestClearMeasureContent,
  score,
  selectEvent,
  selectedEventId,
  selectedEventSource,
  selectedMeasure,
  selectedPitchIndex,
  setEditorMessage,
  updateToolState,
}: UseScoreEventEditingOptions) {
  function updateSelectedEvent(
    update: Parameters<typeof tryUpdateScoreEvent>[2],
    successMessage: string,
  ) {
    if (!selectedEventId || selectedEventSource !== 'manual') {
      return;
    }

    const result = tryUpdateScoreEvent(score, selectedEventId, {
      ...update,
      pitchIndex: selectedPitchIndex ?? undefined,
    });

    if (result.updated) {
      commitScoreChange(result.score, successMessage);
    } else {
      const foundEvent = findScoreEvent(score, selectedEventId);

      if (foundEvent) {
        markInvalidMeasure(
          foundEvent.staffId,
          foundEvent.measureIndex,
          `Cannot update: ${result.reason}`,
        );
      } else {
        setEditorMessage(`Cannot update: ${result.reason}`);
      }
    }
  }

  function handleDurationChange(duration: DurationValue) {
    updateToolState({ duration, isInputArmed: true });
    clearPointerState();
    clearMeasureSelection();
    updateSelectedEvent({ duration }, 'Event duration updated');
  }

  function handleDottedChange(dotted: boolean) {
    const dots = dotted ? 1 : 0;

    updateToolState({ dots });
    clearPointerState();
    clearMeasureSelection();
    updateSelectedEvent(
      { dots },
      dotted ? 'Dotted note enabled' : 'Dotted note disabled',
    );
  }

  function handleAccidentalChange(accidental: AccidentalChoice) {
    updateToolState({ accidental });
    updateSelectedEvent(
      { accidental: accidental === 'none' ? null : accidental },
      'Event accidental updated',
    );
  }

  function handleDeleteSelected() {
    if (!selectedEventId && selectedMeasure) {
      onRequestClearMeasureContent();
      return;
    }

    if (!selectedEventId) {
      return;
    }

    commitScoreChange(
      selectedPitchIndex !== null
        ? deleteScoreEventPitch(score, selectedEventId, selectedPitchIndex)
        : deleteScoreEvent(score, selectedEventId),
      'Event deleted',
    );
    clearMeasureUiState();
    clearSelection();
  }

  function handleDeleteEvent(eventId: string, pitchIndex = selectedPitchIndex) {
    commitScoreChange(
      pitchIndex !== null && pitchIndex !== undefined
        ? deleteScoreEventPitch(score, eventId, pitchIndex)
        : deleteScoreEvent(score, eventId),
      'Event deleted',
    );
    if (selectedEventId === eventId) {
      clearMeasureUiState();
      clearSelection();
    }
  }

  function handleMoveEvent(
    eventId: string,
    position: MusicPosition,
    pitchIndex?: number | null,
  ) {
    const foundEvent = findScoreEvent(score, eventId);
    const staysInOriginalSlot =
      foundEvent !== null &&
      position.staffId === foundEvent.staffId &&
      position.measureIndex === foundEvent.measureIndex &&
      position.beat === foundEvent.event.beat;
    const isPitchOnlyMove =
      foundEvent !== null &&
      isPitchedScoreEvent(foundEvent.event) &&
      staysInOriginalSlot &&
      pitchIndex !== null &&
      pitchIndex !== undefined;
    const result = tryUpdateScoreEvent(
      score,
      eventId,
      isPitchOnlyMove
        ? {
            pitch: position.pitch,
            pitchIndex,
          }
        : {
            beat: position.beat,
            measureIndex: position.measureIndex,
            pitch: position.pitch,
            pitchIndex: pitchIndex ?? undefined,
            staffId: position.staffId,
          },
    );

    if (result.updated) {
      commitScoreChange(
        result.score,
        isPitchOnlyMove ? 'Pitch updated' : 'Event moved',
      );
      const movedEvent = findScoreEvent(result.score, eventId)?.event;
      const movedPitchIndex =
        isPitchOnlyMove && movedEvent?.kind === 'chord'
          ? movedEvent.pitches.findIndex((pitch) =>
              pitchesMatch(pitch, position.pitch),
            )
          : null;

      selectEvent(
        eventId,
        typeof movedPitchIndex === 'number' && movedPitchIndex >= 0
          ? movedPitchIndex
          : null,
      );
    } else {
      markInvalidMeasure(
        position.staffId,
        position.measureIndex,
        `Cannot move: ${result.reason}`,
      );
    }
  }

  return {
    handleAccidentalChange,
    handleDeleteEvent,
    handleDeleteSelected,
    handleDottedChange,
    handleDurationChange,
    handleMoveEvent,
  };
}
