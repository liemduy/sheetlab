import { useEffect } from 'react';
import type { Score, StaffId } from '../../domain/score/types';

interface UseEditorShortcutsOptions {
  futureScores: Score[];
  onDeleteEvent: (eventId: string, pitchIndex?: number | null) => void;
  onRedo: () => void;
  onRequestClearMeasureContent: () => void;
  onUndo: () => void;
  pastScores: Score[];
  score: Score;
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
      ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

export function useEditorShortcuts({
  futureScores,
  onDeleteEvent,
  onRedo,
  onRequestClearMeasureContent,
  onUndo,
  pastScores,
  score,
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

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();

        if (selectedEventId) {
          onDeleteEvent(selectedEventId, selectedPitchIndex);
          return;
        }

        if (selectedMeasure) {
          onRequestClearMeasureContent();
        }
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown);

    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [
    futureScores,
    onDeleteEvent,
    onRedo,
    onRequestClearMeasureContent,
    onUndo,
    pastScores,
    score,
    selectedEventId,
    selectedMeasure,
    selectedPitchIndex,
  ]);
}
