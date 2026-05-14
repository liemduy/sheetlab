import { useState } from 'react';
import type {
  ClefChangeTarget,
  MeasureTarget,
  SelectionSource,
} from './selectionTypes';

export function useEditorSelection() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedClefChange, setSelectedClefChange] =
    useState<ClefChangeTarget | null>(null);
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
    setSelectedClefChange(null);
    setSelectedMeasure(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
  }

  function selectMeasure(target: MeasureTarget) {
    setSelectedEventId(null);
    setSelectedClefChange(null);
    setSelectedMeasure(target);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
  }

  function selectEvent(eventId: string, pitchIndex: number | null = null) {
    setSelectedEventId(eventId);
    setSelectedClefChange(null);
    setSelectedMeasure(null);
    setSelectedPitchIndex(pitchIndex);
    setSelectedEventSource('manual');
  }

  function selectClefChange(target: ClefChangeTarget) {
    setSelectedEventId(null);
    setSelectedClefChange(target);
    setSelectedMeasure(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
  }

  return {
    clearSelection,
    selectedClefChange,
    selectedEventId,
    selectedEventSource,
    selectedMeasure,
    selectedPitchIndex,
    selectClefChange,
    selectEvent,
    selectMeasure,
    setSelectedClefChange,
    setSelectedEventId,
    setSelectedEventSource,
    setSelectedMeasure,
    setSelectedPitchIndex,
  };
}
