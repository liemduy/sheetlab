import { isPitchedScoreEvent } from '../../domain/score/events';
import {
  deleteScoreEvent,
  deleteScoreEventPitch,
  findScoreEvent,
  tryCreateTupletFromEvent,
  tryFlipScoreEventStemDirection,
  tryUpdateScoreEvent,
} from '../../domain/score/editing';
import {
  DURATION_LABEL,
  DURATION_OPTIONS,
  type AccidentalChoice,
  type EditorToolState,
} from '../editor/editorState';
import type { DurationValue, Score, StaffId } from '../../domain/score/types';
import {
  diatonicValueToPitch,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import {
  getDefaultTupletNormalNotes,
  getTupletSlotDuration,
  type SupportedTupletActualNotes,
} from '../../domain/score/tuplets';
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

function getTupletLabel(actualNotes: SupportedTupletActualNotes) {
  return actualNotes === 3 ? 'Triplet' : `Tuplet ${actualNotes}`;
}

function getTupletEntrySetup(
  currentDuration: DurationValue,
  actualNotes: SupportedTupletActualNotes,
) {
  const normalNotes = getDefaultTupletNormalNotes(actualNotes);
  const currentIndex = DURATION_OPTIONS.indexOf(currentDuration);

  for (let index = currentIndex; index >= 0; index -= 1) {
    const totalDuration = DURATION_OPTIONS[index];
    const slotDuration = getTupletSlotDuration(
      totalDuration,
      actualNotes,
      normalNotes,
    );

    if (slotDuration) {
      return {
        normalNotes,
        slotDuration,
        totalDuration,
      };
    }
  }

  return null;
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
    const shouldReportToolChange =
      !selectedEventId || selectedEventSource !== 'manual';

    updateToolState({ clefChange: null, duration, isInputArmed: true, tuplet: null });
    clearPointerState();
    clearMeasureSelection();
    updateSelectedEvent(
      { duration },
      'Event duration updated',
      { allowInvalidMeasure: true },
    );
    if (shouldReportToolChange) {
      setEditorMessage(`${DURATION_LABEL[duration]} entry enabled`);
    }
  }

  function handleDottedChange(dotted: boolean) {
    const dots = dotted ? 1 : 0;
    const shouldReportToolChange =
      !selectedEventId || selectedEventSource !== 'manual';

    updateToolState({ clefChange: null, dots, tuplet: null });
    clearPointerState();
    clearMeasureSelection();
    updateSelectedEvent(
      { dots },
      dotted ? 'Dotted note enabled' : 'Dotted note disabled',
      { allowInvalidMeasure: true },
    );
    if (shouldReportToolChange) {
      setEditorMessage(dotted ? 'Dotted entry enabled' : 'Dotted entry cleared');
    }
  }

  function handleTupletChange(actualNotes: SupportedTupletActualNotes | null) {
    if (actualNotes === null) {
      updateToolState({ clefChange: null, tuplet: null });
      setEditorMessage('Tuplet entry cleared');
      return;
    }

    const tupletLabel = getTupletLabel(actualNotes);
    const tupletName = tupletLabel.toLowerCase();
    const normalNotes = getDefaultTupletNormalNotes(actualNotes);

    if (selectedEventId && selectedEventSource === 'manual') {
      const foundEvent = findScoreEvent(score, selectedEventId);
      if (foundEvent?.event.dots) {
        markInvalidMeasure(
          foundEvent.staffId,
          foundEvent.measureIndex,
          `Cannot create ${tupletName}: unsupported-tuplet`,
        );
        return;
      }

      const slotDuration = foundEvent
        ? getTupletSlotDuration(
            foundEvent.event.duration,
            actualNotes,
            normalNotes,
          )
        : null;
      const result = tryCreateTupletFromEvent(score, selectedEventId, actualNotes);

      if (result.updated) {
        commitScoreChange(result.score, `${tupletLabel} created`);
        updateToolState({
          clefChange: null,
          dots: 0,
          duration: slotDuration ?? toolState.duration,
          isInputArmed: true,
          tuplet: null,
        });
        clearPointerState();
        clearMeasureSelection();
      } else {
        if (foundEvent) {
          markInvalidMeasure(
            foundEvent.staffId,
            foundEvent.measureIndex,
            `Cannot create ${tupletName}: ${result.reason}`,
          );
        } else {
          setEditorMessage(`Cannot create ${tupletName}: ${result.reason}`);
        }
      }

      return;
    }

    if (toolState.dots > 0) {
      setEditorMessage(`Cannot create ${tupletName} from dotted duration`);
      updateToolState({ clefChange: null, tuplet: null });
      return;
    }

    const setup = getTupletEntrySetup(toolState.duration, actualNotes);

    if (!setup) {
      setEditorMessage(`Cannot create ${tupletName} from this duration`);
      return;
    }

    updateToolState({
      clefChange: null,
      dots: 0,
      duration: setup.slotDuration,
      isInputArmed: true,
      tuplet: {
        actualNotes,
        normalNotes: setup.normalNotes,
        totalDuration: setup.totalDuration,
      },
    });
    clearPointerState();
    clearMeasureSelection();
    setEditorMessage(`${tupletLabel} entry enabled`);
  }

  function handleAccidentalChange(accidental: AccidentalChoice) {
    const shouldReportToolChange =
      !selectedEventId || selectedEventSource !== 'manual';

    updateToolState({ accidental, clefChange: null });
    updateSelectedEvent(
      { accidental: accidental === 'none' ? null : accidental },
      'Event accidental updated',
    );
    if (shouldReportToolChange) {
      setEditorMessage(
        accidental === 'none'
          ? 'Accidental cleared'
          : `${accidental} entry enabled`,
      );
    }
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

  function handleMoveSelectedEventToStaff(staffId: StaffId) {
    if (!selectedEventId || selectedEventSource !== 'manual') {
      setEditorMessage('Select an event first');
      return;
    }

    const foundEvent = findScoreEvent(score, selectedEventId);

    if (!foundEvent) {
      setEditorMessage('Selected event not found');
      return;
    }

    if (foundEvent.staffId === staffId) {
      setEditorMessage(
        staffId === 'bass'
          ? 'Event already on left hand staff'
          : 'Event already on right hand staff',
      );
      return;
    }

    const result = tryUpdateScoreEvent(score, selectedEventId, { staffId });

    if (result.updated) {
      commitScoreChange(
        result.score,
        staffId === 'bass'
          ? 'Event moved to left hand staff'
          : 'Event moved to right hand staff',
      );
      clearPointerState();
      clearMeasureSelection();
      selectEvent(selectedEventId, selectedPitchIndex);
      return;
    }

    markInvalidMeasure(
      staffId,
      foundEvent.measureIndex,
      `Cannot move to ${staffId}: ${result.reason}`,
    );
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

  function handleFlipSelectedDirection() {
    if (!selectedEventId || selectedEventSource !== 'manual') {
      return;
    }

    const result = tryFlipScoreEventStemDirection(score, selectedEventId);

    if (result.updated) {
      commitScoreChange(
        result.score,
        result.eventIds && result.eventIds.length > 1
          ? 'Beam direction flipped'
          : 'Stem direction flipped',
      );
      clearPointerState();
      clearMeasureSelection();
      return;
    }

    const foundEvent = findScoreEvent(score, selectedEventId);

    if (foundEvent) {
      markInvalidMeasure(
        foundEvent.staffId,
        foundEvent.measureIndex,
        `Cannot flip direction: ${result.reason}`,
      );
    } else {
      setEditorMessage(`Cannot flip direction: ${result.reason}`);
    }
  }

  return {
    handleAccidentalChange,
    handleDeleteEvent,
    handleDeleteSelected,
    handleDottedChange,
    handleDurationChange,
    handleFlipSelectedDirection,
    handleMoveEvent,
    handleMoveSelectedEventToStaff,
    handleTransposeSelectedPitch,
    handleTupletChange,
  };
}
