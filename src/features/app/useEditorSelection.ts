import { useState } from 'react';
import type { MeasureTarget, SelectionSource } from './selectionTypes';

export function useEditorSelection() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedMeasure, setSelectedMeasure] = useState<MeasureTarget | null>(
    null,
  );
  const [selectedPitchIndex, setSelectedPitchIndex] = useState<number | null>(
    null,
  );
  const [selectedEventSource, setSelectedEventSource] =
    useState<SelectionSource | null>(null);

  function clearSelection() {
    setSelectedEventId(null);
    setSelectedMeasure(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
  }

  function selectMeasure(target: MeasureTarget) {
    setSelectedEventId(null);
    setSelectedMeasure(target);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
  }

  function selectEvent(eventId: string, pitchIndex: number | null = null) {
    setSelectedEventId(eventId);
    setSelectedMeasure(null);
    setSelectedPitchIndex(pitchIndex);
    setSelectedEventSource('manual');
  }

  return {
    clearSelection,
    selectedEventId,
    selectedEventSource,
    selectedMeasure,
    selectedPitchIndex,
    selectEvent,
    selectMeasure,
    setSelectedEventId,
    setSelectedEventSource,
    setSelectedMeasure,
    setSelectedPitchIndex,
  };
}
