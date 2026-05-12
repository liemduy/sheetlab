import { isPitchedScoreEvent } from '../../domain/score/events';
import {
  deleteScoreEvent,
  deleteScoreEventPitch,
  findScoreEvent,
  tryCreateTupletFromEvent,
  tryUpdateScoreEvent,
} from '../../domain/score/editing';
import type {
  AccidentalChoice,
  EditorToolState,
} from '../editor/editorState';
import type { DurationValue, Score } from '../../domain/score/types';
import {
  diatonicValueToPitch,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import { getTupletSlotDuration } from '../../domain/score/tuplets';
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
  toolState: EditorToolState;
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
  toolState,
  updateToolState,
}: UseScoreEventEditingOptions) {
  function updateSelectedEvent(
    update: Parameters<typeof tryUpdateScoreEvent>[2],
    successMessage: string,
    options: { allowInvalidMeasure?: boolean } = {},
  ) {
    if (!selectedEventId || selectedEventSource !== 'manual') {
      return;
    }

    const result = tryUpdateScoreEvent(score, selectedEventId, {
      ...update,
      allowInvalidMeasure: options.allowInvalidMeasure,
      pitchIndex: selectedPitchIndex ?? undefined,
    });

    if (result.updated) {
      commitScoreChange(result.score, successMessage);
      if (result.reason) {
        const updatedEvent = findScoreEvent(result.score, selectedEventId);

        if (updatedEvent) {
          markInvalidMeasure(
            updatedEvent.staffId,
            updatedEvent.measureIndex,
            `${successMessage}; measure rhythm needs fixing`,
          );
        }
      }
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
    updateSelectedEvent(
      { duration },
      'Event duration updated',
      { allowInvalidMeasure: true },
    );
  }

  function handleDottedChange(dotted: boolean) {
    const dots = dotted ? 1 : 0;

    updateToolState({ dots });
    clearPointerState();
    clearMeasureSelection();
    updateSelectedEvent(
      { dots },
      dotted ? 'Dotted note enabled' : 'Dotted note disabled',
      { allowInvalidMeasure: true },
    );
  }

  function handleTupletChange(actualNotes: 3 | null) {
    if (actualNotes === null) {
      updateToolState({ tuplet: null });
      setEditorMessage('Triplet entry cleared');
      return;
    }

    if (selectedEventId && selectedEventSource === 'manual') {
      const foundEvent = findScoreEvent(score, selectedEventId);
      const slotDuration = foundEvent
        ? getTupletSlotDuration(foundEvent.event.duration, actualNotes)
        : null;
      const result = tryCreateTupletFromEvent(score, selectedEventId, actualNotes);

      if (result.updated) {
        commitScoreChange(result.score, 'Triplet created');
        updateToolState({
          dots: 0,
          duration: slotDuration ?? toolState.duration,
          isInputArmed: true,
          tuplet: null,
        });
        clearPointerState();
        clearMeasureSelection();
      } else {
        setEditorMessage(`Cannot create triplet: ${result.reason}`);
      }

      return;
    }

    const slotDuration = getTupletSlotDuration(toolState.duration, actualNotes);

    if (!slotDuration) {
      setEditorMessage('Cannot create triplet from this duration');
      return;
    }

    updateToolState({
      dots: 0,
      duration: slotDuration,
      isInputArmed: true,
      tuplet: {
        actualNotes,
        normalNotes: 2,
        totalDuration: toolState.duration,
      },
    });
    clearPointerState();
    clearMeasureSelection();
    setEditorMessage('Triplet entry enabled');
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

  function handleTransposeSelectedPitch(delta: number) {
    if (!selectedEventId || selectedEventSource !== 'manual') {
      return;
    }

    const foundEvent = findScoreEvent(score, selectedEventId);

    if (!foundEvent || !isPitchedScoreEvent(foundEvent.event)) {
      return;
    }

    const sourcePitch =
      foundEvent.event.kind === 'chord'
        ? foundEvent.event.pitches[selectedPitchIndex ?? 0]
        : foundEvent.event.pitch;

    if (!sourcePitch) {
      return;
    }

    const result = tryUpdateScoreEvent(score, selectedEventId, {
      pitch: diatonicValueToPitch(pitchToDiatonicValue(sourcePitch) + delta),
      pitchIndex: selectedPitchIndex ?? undefined,
    });

    if (result.updated) {
      commitScoreChange(
        result.score,
        delta > 0 ? 'Pitch moved up' : 'Pitch moved down',
      );
    } else {
      markInvalidMeasure(
        foundEvent.staffId,
        foundEvent.measureIndex,
        `Cannot transpose: ${result.reason}`,
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
    handleTransposeSelectedPitch,
    handleTupletChange,
  };
}
