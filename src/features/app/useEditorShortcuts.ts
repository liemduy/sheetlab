import { useEffect } from 'react';
import type {
  DurationValue,
  NoteStep,
  Score,
  StaffId,
} from '../../domain/score/types';
import {
  isSupportedTupletActualNotes,
  type SupportedTupletActualNotes,
} from '../../domain/score/tuplets';
import type { EntryMode, PlacementMode } from '../editor/editorState';
import type {
  AnnotationTarget,
  ClefChangeTarget,
} from './selectionTypes';

interface UseEditorShortcutsOptions {
  futureScores: Score[];
  inputCursorActive: boolean;
  isInputArmed: boolean;
  onClearShortcut: () => void;
  onCommandPaletteShortcut: () => void;
  onDottedShortcut: () => void;
  onDurationShortcut: (duration: DurationValue) => void;
  onEntryModeShortcut: (entryMode: EntryMode) => void;
  onKeyboardCursorDurationChange: (
    nextToolState: { dots: number; duration: DurationValue },
  ) => void;
  onKeyboardCursorMove: (move: {
    pitchDelta?: number;
    rhythmDelta?: -1 | 0 | 1;
    staffDelta?: -1 | 0 | 1;
  }) => void;
  onKeyboardPitchStepInput: (step: NoteStep) => void;
  onKeyboardPlaceAtCursor: () => void;
  onNudgeSelectedAnnotation: (change: {
    deltaX?: number;
    deltaY?: number;
    reset?: boolean;
  }) => void;
  onPlacementModeShortcut: (placementMode: PlacementMode) => void;
  onPlaybackShortcut: () => void;
  onDeleteClefChange: (target?: ClefChangeTarget | null) => void;
  onDeleteEvent: (eventId: string, pitchIndex?: number | null) => void;
  onFlipDirection: () => void;
  onRedo: () => void;
  onRequestClearMeasureContent: () => void;
  onSelectAdjacentEvent: (direction: -1 | 1) => void;
  onTransposeSelectedPitch: (delta: number) => void;
  onTupletShortcut: (actualNotes: SupportedTupletActualNotes | null) => void;
  onUndo: () => void;
  pastScores: Score[];
  score: Score;
  selectedClefChange: ClefChangeTarget | null;
  selectedAnnotation: AnnotationTarget | null;
  selectedEventId: string | null;
  selectedMeasure: {
    staffId: StaffId;
    measureIndex: number;
  } | null;
  selectedPitchIndex: number | null;
  toolDots: number;
  toolDuration: DurationValue;
  toolEntryMode: EntryMode;
  toolPlacementMode: PlacementMode;
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

const DURATION_SHORTCUTS: Record<string, DurationValue> = {
  Digit2: 'thirtySecond',
  Digit3: 'sixteenth',
  Digit4: 'eighth',
  Digit5: 'quarter',
  Digit6: 'half',
  Digit7: 'whole',
};

const PITCH_SHORTCUTS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

export function useEditorShortcuts({
  futureScores,
  inputCursorActive,
  isInputArmed,
  onClearShortcut,
  onCommandPaletteShortcut,
  onDottedShortcut,
  onDurationShortcut,
  onEntryModeShortcut,
  onKeyboardCursorDurationChange,
  onKeyboardCursorMove,
  onKeyboardPitchStepInput,
  onKeyboardPlaceAtCursor,
  onNudgeSelectedAnnotation,
  onPlacementModeShortcut,
  onPlaybackShortcut,
  onDeleteClefChange,
  onDeleteEvent,
  onFlipDirection,
  onRedo,
  onRequestClearMeasureContent,
  onSelectAdjacentEvent,
  onTransposeSelectedPitch,
  onTupletShortcut,
  onUndo,
  pastScores,
  score,
  selectedClefChange,
  selectedAnnotation,
  selectedEventId,
  selectedMeasure,
  selectedPitchIndex,
  toolDots,
  toolDuration,
  toolEntryMode,
  toolPlacementMode,
}: UseEditorShortcutsOptions) {
  useEffect(() => {
    function handleWindowKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const isModifierShortcut = event.ctrlKey || event.metaKey;

      if (isModifierShortcut && key === 'k') {
        event.preventDefault();
        onCommandPaletteShortcut();
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (!isModifierShortcut && event.key === '?') {
        event.preventDefault();
        onCommandPaletteShortcut();
        return;
      }

      if (isModifierShortcut && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      if (isModifierShortcut && key === 'y') {
        event.preventDefault();
        onRedo();
        return;
      }

      if (isModifierShortcut && /^[0-9]$/.test(event.key)) {
        const actualNotes = Number(event.key);

        if (actualNotes === 0) {
          event.preventDefault();
          onTupletShortcut(null);
          return;
        }

        if (isSupportedTupletActualNotes(actualNotes)) {
          event.preventDefault();
          onTupletShortcut(actualNotes);
          return;
        }
      }

      if (!isModifierShortcut && !event.altKey) {
        const duration = DURATION_SHORTCUTS[event.code];

        if (duration) {
          event.preventDefault();
          onDurationShortcut(duration);
          onKeyboardCursorDurationChange({
            dots: toolDots,
            duration,
          });
          return;
        }

        if (event.key === '.') {
          event.preventDefault();
          const dots = toolDots > 0 ? 0 : 1;

          onDottedShortcut();
          onKeyboardCursorDurationChange({
            dots,
            duration: toolDuration,
          });
          return;
        }

        if (key === 'r') {
          event.preventDefault();
          onEntryModeShortcut(toolEntryMode === 'rest' ? 'note' : 'rest');
          onKeyboardCursorDurationChange({
            dots: toolDots,
            duration: toolDuration,
          });
          return;
        }

        if (key === 'i') {
          event.preventDefault();
          onPlacementModeShortcut(
            toolPlacementMode === 'insert' ? 'place' : 'insert',
          );
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          onClearShortcut();
          return;
        }

        if (selectedAnnotation && event.key === '0') {
          event.preventDefault();
          onNudgeSelectedAnnotation({ reset: true });
          return;
        }

        if (event.key === ' ' && !isInputArmed) {
          event.preventDefault();
          onPlaybackShortcut();
          return;
        }

        if ((event.key === 'Enter' || event.key === ' ') && isInputArmed) {
          event.preventDefault();
          onKeyboardPlaceAtCursor();
          return;
        }

        const pitchStep = event.key.toUpperCase();

        if (
          isInputArmed &&
          PITCH_SHORTCUTS.has(pitchStep) &&
          pitchStep.length === 1
        ) {
          event.preventDefault();
          onKeyboardPitchStepInput(pitchStep as NoteStep);
          return;
        }
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();

        if (selectedClefChange) {
          onDeleteClefChange(selectedClefChange);
          return;
        }

        if (selectedEventId) {
          onDeleteEvent(selectedEventId, selectedPitchIndex);
          return;
        }

        if (selectedMeasure) {
          onRequestClearMeasureContent();
        }
      }

      if (!isModifierShortcut && key === 'x') {
        if (!selectedEventId) {
          return;
        }

        event.preventDefault();
        onFlipDirection();
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (
          selectedAnnotation &&
          !isModifierShortcut &&
          !event.altKey &&
          !isInputArmed &&
          !inputCursorActive
        ) {
          event.preventDefault();
          const step = event.shiftKey ? 5 : 1;

          onNudgeSelectedAnnotation({
            deltaY: event.key === 'ArrowUp' ? -step : step,
          });
          return;
        }

        if (isInputArmed || inputCursorActive) {
          event.preventDefault();
          onKeyboardCursorMove({
            pitchDelta: event.key === 'ArrowUp' ? 1 : -1,
          });
          return;
        }

        if (!selectedEventId) {
          return;
        }

        event.preventDefault();
        onTransposeSelectedPitch(event.key === 'ArrowUp' ? 1 : -1);
      }

      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'PageUp' ||
        event.key === 'PageDown'
      ) {
        if (
          selectedAnnotation &&
          !isModifierShortcut &&
          !event.altKey &&
          !isInputArmed &&
          !inputCursorActive &&
          (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
        ) {
          event.preventDefault();
          const step = event.shiftKey ? 5 : 1;

          onNudgeSelectedAnnotation({
            deltaX: event.key === 'ArrowLeft' ? -step : step,
          });
          return;
        }

        if (!isInputArmed && !inputCursorActive) {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            onSelectAdjacentEvent(event.key === 'ArrowLeft' ? -1 : 1);
          }
          return;
        }

        event.preventDefault();
        onKeyboardCursorMove(
          event.key === 'ArrowLeft'
            ? { rhythmDelta: -1 }
            : event.key === 'ArrowRight'
              ? { rhythmDelta: 1 }
              : event.key === 'PageUp'
                ? { staffDelta: -1 }
                : { staffDelta: 1 },
        );
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown);

    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [
    futureScores,
    inputCursorActive,
    isInputArmed,
    onClearShortcut,
    onCommandPaletteShortcut,
    onDottedShortcut,
    onDeleteClefChange,
    onDeleteEvent,
    onDurationShortcut,
    onEntryModeShortcut,
    onFlipDirection,
    onKeyboardCursorDurationChange,
    onKeyboardCursorMove,
    onKeyboardPitchStepInput,
    onKeyboardPlaceAtCursor,
    onNudgeSelectedAnnotation,
    onPlacementModeShortcut,
    onPlaybackShortcut,
    onRedo,
    onRequestClearMeasureContent,
    onSelectAdjacentEvent,
    onTransposeSelectedPitch,
    onTupletShortcut,
    onUndo,
    pastScores,
    score,
    selectedClefChange,
    selectedAnnotation,
    selectedEventId,
    selectedMeasure,
    selectedPitchIndex,
    toolDots,
    toolDuration,
    toolEntryMode,
    toolPlacementMode,
  ]);
}
