import { useEffect } from 'react';
import type { Score, StaffId } from '../../domain/score/types';
import {
  isSupportedTupletActualNotes,
  type SupportedTupletActualNotes,
} from '../../domain/score/tuplets';
import type { ClefChangeTarget } from './selectionTypes';

interface UseEditorShortcutsOptions {
  futureScores: Score[];
  onDeleteClefChange: (target?: ClefChangeTarget | null) => void;
  onDeleteEvent: (eventId: string, pitchIndex?: number | null) => void;
  onFlipDirection: () => void;
  onRedo: () => void;
  onRequestClearMeasureContent: () => void;
  onTransposeSelectedPitch: (delta: number) => void;
  onTupletShortcut: (actualNotes: SupportedTupletActualNotes | null) => void;
  onUndo: () => void;
  pastScores: Score[];
  score: Score;
  selectedClefChange: ClefChangeTarget | null;
  selectedEventId: string | null;
  selectedMeasure: {
    staffId: StaffId;
    measureIndex: number;
  } | null;
  selectedPitchIndex: number | null;
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

export function useEditorShortcuts({
  futureScores,
  onDeleteClefChange,
  onDeleteEvent,
  onFlipDirection,
  onRedo,
  onRequestClearMeasureContent,
  onTransposeSelectedPitch,
  onTupletShortcut,
  onUndo,
  pastScores,
  score,
  selectedClefChange,
  selectedEventId,
  selectedMeasure,
  selectedPitchIndex,
}: UseEditorShortcutsOptions) {
  useEffect(() => {
    function handleWindowKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const isModifierShortcut = event.ctrlKey || event.metaKey;

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
        if (!selectedEventId) {
          return;
        }

        event.preventDefault();
        onTransposeSelectedPitch(event.key === 'ArrowUp' ? 1 : -1);
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown);

    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [
    futureScores,
    onDeleteClefChange,
    onDeleteEvent,
    onFlipDirection,
    onRedo,
    onRequestClearMeasureContent,
    onTransposeSelectedPitch,
    onTupletShortcut,
    onUndo,
    pastScores,
    score,
    selectedClefChange,
    selectedEventId,
    selectedMeasure,
    selectedPitchIndex,
  ]);
}
