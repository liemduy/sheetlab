import { useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { createEmptyScore, deserializeScore } from './domain/score/factories';
import { isPitchedScoreEvent } from './domain/score/events';
import {
  addMeasure,
  clearMeasureContent,
  countScoreEvents,
  deleteMeasureAt,
  deleteScoreEvent,
  deleteScoreEventPitch,
  findScoreEvent,
  insertMeasureAt,
  setMeasureKeySignature,
  setMeasureRepeatJump,
  setScoreTimeSignature,
  tryMoveKeySignatureSymbol,
  tryInsertScoreEvent,
  tryPlaceScoreEvent,
  tryUpdateScoreEvent,
} from './domain/score/editing';
import {
  applyActiveKeySignatureToPitch,
  createKeySignatureSymbols,
  getActiveKeySignatureSelection,
  getKeySignatureLabel,
  KEY_SIGNATURE_OPTIONS,
} from './domain/score/keySignatures';
import type {
  AccidentalChoice,
  EditorToolState,
  EntryMode,
  PlacementMode,
} from './features/editor/editorState';
import {
  ACCIDENTAL_LABEL,
  ACCIDENTAL_SYMBOL,
  DEFAULT_EDITOR_TOOL_STATE,
  DURATION_LABEL,
  DURATION_OPTIONS,
  DURATION_SYMBOL,
  PAGE_SIZE_LABEL,
  PLACEMENT_MODE_LABEL,
  SCORE_TYPE_LABEL,
} from './features/editor/editorState';
import {
  createInputCursorFromPosition,
  formatInputCursor,
} from './features/editor/inputCursor';
import type { InputCursor } from './features/editor/inputCursor';
import type {
  DurationValue,
  KeySignature,
  PageSize,
  Pitch,
  RepeatJumpKind,
  Score,
  ScoreType,
  StaffId,
} from './domain/score/types';
import {
  getMeasureBeats,
  getTimeSignatureId,
  getTimeSignatureLabel,
  parseTimeSignatureId,
  TIME_SIGNATURE_OPTIONS,
} from './domain/score/timeSignatures';
import {
  getMeasureRepeatJump,
  getRepeatJumpOption,
  REPEAT_JUMP_OPTIONS,
} from './domain/score/repeatJumps';
import { StaffRenderer } from './features/sheet/StaffRenderer';
import { formatPitch } from './features/sheet/interaction';
import type { MusicPosition } from './features/sheet/interaction';
import { snapInsertPositionToEventBoundary } from './features/sheet/insertPosition';
import { getMeasureKey } from './features/sheet/measureKey';
import { findNextRhythmSlotAfter } from './features/sheet/rhythmSlots';
import {
  playPitchPreview,
  playTimelineAudio,
} from './features/playback/audioEngine';
import {
  buildPlaybackTimeline,
  getActiveTimelineEvent,
  getPlaybackBeatAtSeconds,
  getTimelineDurationSeconds,
} from './features/playback/timeline';
import {
  createProjectJsonBlob,
  loadProjectFromStorage,
  saveProjectToStorage,
  SHEETLAB_PDF_EXPORT_SCORE_KEY,
} from './features/persistence/projectStorage';

function isPdfExportMode() {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('pdf-export')
  );
}

function loadInitialScoreForApp() {
  if (isPdfExportMode()) {
    try {
      const serializedExportScore = window.sessionStorage.getItem(
        SHEETLAB_PDF_EXPORT_SCORE_KEY,
      );

      if (serializedExportScore) {
        return deserializeScore(serializedExportScore);
      }
    } catch {
      // Fall through to the default score if the export payload is invalid.
    }
  }

  return createEmptyScore(DEFAULT_EDITOR_TOOL_STATE.scoreType, {
    tempo: DEFAULT_EDITOR_TOOL_STATE.tempo,
  });
}

const ZOOM_MIN = 70;
const ZOOM_MAX = 180;
const ZOOM_STEP = 5;
const DEFAULT_CANVAS_ZOOM = 100;

type ToolbarPalette = 'key' | 'repeat' | null;

const THUMBNAIL_ACCIDENTAL_Y = {
  A: 21,
  B: 11,
  C: 18,
  D: 9,
  E: 15,
  F: 6,
  G: 24,
} as const;

function KeySignatureThumbnail({ keySignature }: { keySignature: KeySignature }) {
  const symbols = createKeySignatureSymbols(keySignature);

  return (
    <span className="signature-thumbnail" aria-hidden="true">
      <span className="signature-staff-lines" />
      {symbols.map((symbol, symbolIndex) => (
        <span
          key={symbol.id}
          className="signature-accidental"
          style={{
            left: `${16 + symbolIndex * 8}px`,
            top: `${THUMBNAIL_ACCIDENTAL_Y[symbol.step]}px`,
          }}
        >
          {symbol.accidental === 'sharp' ? '♯' : '♭'}
        </span>
      ))}
    </span>
  );
}

function RepeatJumpThumbnail({ kind }: { kind: RepeatJumpKind }) {
  const option = getRepeatJumpOption(kind);

  return (
    <span className="repeat-thumbnail" aria-hidden="true">
      <span className="signature-staff-lines" />
      <span className="repeat-thumbnail-symbol">{option?.symbol ?? kind}</span>
    </span>
  );
}

function pitchesMatch(first: Pitch, second: Pitch) {
  return (
    first.step === second.step &&
    first.octave === second.octave &&
    first.accidental === second.accidental
  );
}

function musicPositionFromCursor(
  cursor: InputCursor,
  pointerPosition: MusicPosition,
): MusicPosition {
  return {
    ...pointerPosition,
    beat: cursor.beat,
    measureIndex: cursor.measureIndex,
    pitch: pointerPosition.pitch,
    staffId: cursor.staffId,
    staffIndex: cursor.staffIndex,
  };
}

function hasPitchedEventAtPosition(score: Score, position: MusicPosition) {
  const voice = score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === position.staffId)
    ?.measures.find((measure) => measure.index === position.measureIndex)
    ?.voices[0];

  return (
    voice?.events.some(
      (event) => isPitchedScoreEvent(event) && event.beat === position.beat,
    ) ?? false
  );
}

const SEQUENTIAL_CLICK_CLIENT_RADIUS = 32;

function isNearSequentialCursor(
  cursor: InputCursor,
  position: MusicPosition,
) {
  if (cursor.clientX === undefined || position.clientX === undefined) {
    return false;
  }

  return (
    Math.abs(position.clientX - cursor.clientX) <=
    SEQUENTIAL_CLICK_CLIENT_RADIUS
  );
}

function createCursorAfterPlacement(
  score: Score,
  placementPosition: MusicPosition,
  duration: DurationValue,
  dots: number,
) {
  const nextSlot = findNextRhythmSlotAfter(
    score,
    placementPosition.staffId,
    placementPosition.measureIndex,
    placementPosition.beat,
  );
  const nextPosition = nextSlot
    ? {
        ...placementPosition,
        beat: nextSlot.beat,
        clientX: undefined,
        clientY: undefined,
        measureIndex: nextSlot.measureIndex,
      }
    : {
        ...placementPosition,
        clientX: undefined,
        clientY: undefined,
      };

  return createInputCursorFromPosition(
    nextPosition,
    duration,
    'note-input',
    getMeasureBeats(score.timeSignature),
    dots,
  );
}

function App() {
  type SelectionSource = 'manual';

  const [initialScore] = useState(loadInitialScoreForApp);
  const [toolState, setToolState] = useState<EditorToolState>(
    () => ({
      ...DEFAULT_EDITOR_TOOL_STATE,
      scoreType: initialScore.type,
      tempo: initialScore.tempo,
    }),
  );
  const [hoverPosition, setHoverPosition] = useState<MusicPosition | null>(null);
  const [inputCursor, setInputCursor] = useState<InputCursor | null>(null);
  const [score, setScore] = useState(initialScore);
  const [invalidMeasureKeys, setInvalidMeasureKeys] = useState<string[]>([]);
  const [pastScores, setPastScores] = useState<Score[]>([]);
  const [futureScores, setFutureScores] = useState<Score[]>([]);
  const [editorMessage, setEditorMessage] = useState('Ready');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedMeasure, setSelectedMeasure] = useState<{
    staffId: StaffId;
    measureIndex: number;
  } | null>(null);
  const [measureContextMenu, setMeasureContextMenu] = useState<{
    clientX: number;
    clientY: number;
    staffId: StaffId;
    measureIndex: number;
  } | null>(null);
  const [pendingMeasureDelete, setPendingMeasureDelete] = useState<{
    staffId: StaffId;
    measureIndex: number;
  } | null>(null);
  const [pendingMeasureClear, setPendingMeasureClear] = useState<{
    staffId: StaffId;
    measureIndex: number;
  } | null>(null);
  const [selectedPitchIndex, setSelectedPitchIndex] = useState<number | null>(null);
  const [selectedEventSource, setSelectedEventSource] =
    useState<SelectionSource | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackElapsedSeconds, setPlaybackElapsedSeconds] = useState(0);
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [openPalette, setOpenPalette] = useState<ToolbarPalette>(null);
  const eventCounter = useRef(1);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const notationViewportRef = useRef<HTMLDivElement | null>(null);
  const playbackController = useRef<{ stop: () => void } | null>(null);
  const playbackEndTimer = useRef<number | null>(null);
  const playbackInterval = useRef<number | null>(null);
  const isCursorSequenceLockedRef = useRef(false);

  function setCursorSequenceLocked(isLocked: boolean) {
    isCursorSequenceLockedRef.current = isLocked;
  }

  function commitScoreChange(nextScore: Score, message: string) {
    setPastScores((currentPast) => [...currentPast, score]);
    setFutureScores([]);
    setScore(nextScore);
    setInvalidMeasureKeys([]);
    setEditorMessage(message);
  }

  function updateScoreMetadata(update: Partial<Pick<Score, 'composer' | 'title'>>) {
    setScore((currentScore) => ({
      ...currentScore,
      ...update,
    }));
  }

  function updateToolState(update: Partial<EditorToolState>) {
    setToolState((current) => ({
      ...current,
      ...update,
    }));
  }

  function markInvalidMeasure(
    staffId: StaffId,
    measureIndex: number,
    message: string,
  ) {
    const measureKey = getMeasureKey(staffId, measureIndex);

    setInvalidMeasureKeys((currentKeys) =>
      currentKeys.includes(measureKey)
        ? currentKeys
        : [...currentKeys, measureKey],
    );
    setEditorMessage(message);
  }

  function scrollNotationIntoView() {
    window.requestAnimationFrame(() => {
      if (typeof notationViewportRef.current?.scrollIntoView === 'function') {
        notationViewportRef.current.scrollIntoView({
          behavior: 'auto',
          block: 'center',
        });
      }
    });
  }

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
    setCursorSequenceLocked(false);
    setHoverPosition(null);
    setInputCursor(null);
    setSelectedMeasure(null);
    updateSelectedEvent({ duration }, 'Event duration updated');
  }

  function handleDottedChange(dotted: boolean) {
    const dots = dotted ? 1 : 0;

    updateToolState({ dots });
    setCursorSequenceLocked(false);
    setHoverPosition(null);
    setInputCursor(null);
    setSelectedMeasure(null);
    updateSelectedEvent({ dots }, dotted ? 'Dotted note enabled' : 'Dotted note disabled');
  }

  function handleClearInteraction() {
    updateToolState({ isInputArmed: false });
    setHoverPosition(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setSelectedEventId(null);
    setSelectedMeasure(null);
    setMeasureContextMenu(null);
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
    setEditorMessage('Select mode');
  }

  function handleSheetStageClick(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (
      target.closest('[data-testid="staff-renderer"]') ||
      target.closest('.measure-context-menu, .measure-warning-dialog') ||
      target.closest('button, input, select, textarea, a')
    ) {
      return;
    }

    handleClearInteraction();
  }

  function handleHoverPositionChange(position: MusicPosition | null) {
    const nextHoverPosition = toolState.isInputArmed ? position : null;

    if (!nextHoverPosition) {
      setHoverPosition(null);
      setInputCursor(null);
      setCursorSequenceLocked(false);
      return;
    }

    setInputCursor(() => {
      const nextCursor = createInputCursorFromPosition(
        nextHoverPosition,
        toolState.duration,
        'note-input',
        getMeasureBeats(score.timeSignature),
        toolState.dots,
      );

      setHoverPosition(musicPositionFromCursor(nextCursor, nextHoverPosition));

      return nextCursor;
    });
  }

  function handleScoreTypeChange(scoreType: ScoreType) {
    updateToolState({ scoreType, isInputArmed: false });
    commitScoreChange(
      createEmptyScore(scoreType, {
        pageSize: score.pageSize,
        tempo: toolState.tempo,
        timeSignature: score.timeSignature,
      }),
      'New score',
    );
    setHoverPosition(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setSelectedEventId(null);
    setSelectedMeasure(null);
    setMeasureContextMenu(null);
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
    scrollNotationIntoView();
  }

  function handleResetScore() {
    updateToolState({ placementMode: 'place', isInputArmed: false });
    commitScoreChange(
      createEmptyScore(toolState.scoreType, {
        pageSize: score.pageSize,
        tempo: toolState.tempo,
        timeSignature: score.timeSignature,
      }),
      'Score reset',
    );
    setHoverPosition(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setSelectedEventId(null);
    setSelectedMeasure(null);
    setMeasureContextMenu(null);
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
    scrollNotationIntoView();
  }

  function handleAddMeasure() {
    commitScoreChange(addMeasure(score), 'Measure added');
  }

  function getMeasureCount() {
    return score.parts[0]?.staves[0]?.measures.length ?? 0;
  }

  function getKeySignatureTargetMeasureIndex() {
    if (selectedMeasure) {
      return selectedMeasure.measureIndex;
    }

    if (selectedEventId) {
      return findScoreEvent(score, selectedEventId)?.measureIndex ?? 0;
    }

    return inputCursor?.measureIndex ?? hoverPosition?.measureIndex ?? 0;
  }

  function getScoreEditTargetMeasureIndex() {
    return getKeySignatureTargetMeasureIndex();
  }

  function handleMeasureContextMenu(
    staffId: StaffId,
    measureIndex: number,
    clientX: number,
    clientY: number,
  ) {
    updateToolState({ isInputArmed: false });
    setHoverPosition(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setSelectedEventId(null);
    setSelectedMeasure({ staffId, measureIndex });
    setMeasureContextMenu({ clientX, clientY, staffId, measureIndex });
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
    setEditorMessage('Measure selected');
  }

  function closeMeasureContextMenu() {
    setMeasureContextMenu(null);
  }

  function handleClearMeasureContent() {
    const targetMeasure = measureContextMenu ?? selectedMeasure;

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
    setSelectedMeasure({
      staffId: targetMeasure.staffId,
      measureIndex: targetMeasure.measureIndex,
    });
    closeMeasureContextMenu();
  }

  function handleRequestClearMeasureContent() {
    const targetMeasure = measureContextMenu ?? selectedMeasure;

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
    setSelectedMeasure({
      staffId: pendingMeasureClear.staffId,
      measureIndex: pendingMeasureClear.measureIndex,
    });
    setPendingMeasureClear(null);
  }

  function handleInsertMeasureBefore() {
    const targetMeasure = measureContextMenu ?? selectedMeasure;

    if (!targetMeasure) {
      return;
    }

    commitScoreChange(
      insertMeasureAt(score, targetMeasure.measureIndex),
      'Measure inserted before',
    );
    setSelectedMeasure({
      staffId: targetMeasure.staffId,
      measureIndex: targetMeasure.measureIndex,
    });
    closeMeasureContextMenu();
  }

  function handleInsertMeasureAfter() {
    const targetMeasure = measureContextMenu ?? selectedMeasure;

    if (!targetMeasure) {
      return;
    }

    commitScoreChange(
      insertMeasureAt(score, targetMeasure.measureIndex + 1),
      'Measure inserted after',
    );
    setSelectedMeasure({
      staffId: targetMeasure.staffId,
      measureIndex: targetMeasure.measureIndex + 1,
    });
    closeMeasureContextMenu();
  }

  function handleRequestDeleteMeasure() {
    const targetMeasure = measureContextMenu ?? selectedMeasure;

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
    setSelectedMeasure(
      measureCount > 1
        ? {
            staffId: pendingMeasureDelete.staffId,
            measureIndex: nextSelectedIndex,
          }
        : null,
    );
    setPendingMeasureDelete(null);
  }

  function handleKeySignatureChange(keySignature: KeySignature) {
    const measureIndex = getKeySignatureTargetMeasureIndex();

    commitScoreChange(
      setMeasureKeySignature(score, measureIndex, keySignature),
      `Key signature set to ${keySignature}`,
    );
    setOpenPalette(null);
    setSelectedMeasure((currentSelection) =>
      currentSelection
        ? {
            ...currentSelection,
            measureIndex,
          }
        : currentSelection,
    );
  }

  function handleTimeSignatureChange(value: string) {
    const timeSignature = parseTimeSignatureId(value);

    if (!timeSignature) {
      return;
    }

    commitScoreChange(
      setScoreTimeSignature(score, timeSignature),
      `Time signature set to ${getTimeSignatureLabel(timeSignature)}`,
    );
    setHoverPosition(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
  }

  function handleRepeatJumpChange(repeatJump: RepeatJumpKind | null) {
    const measureIndex = getScoreEditTargetMeasureIndex();

    commitScoreChange(
      setMeasureRepeatJump(score, measureIndex, repeatJump),
      repeatJump
        ? `${getRepeatJumpOption(repeatJump)?.label ?? repeatJump} set at measure ${
            measureIndex + 1
          }`
        : `Repeat/jump cleared at measure ${measureIndex + 1}`,
    );
    setOpenPalette(null);
    setSelectedMeasure({
      staffId: selectedMeasure?.staffId ?? 'treble',
      measureIndex,
    });
    setSelectedEventId(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
  }

  function clampCanvasZoom(value: number) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
  }

  function handleCanvasZoomChange(value: string) {
    const nextZoom = Number(value);

    if (!Number.isNaN(nextZoom)) {
      setCanvasZoom(clampCanvasZoom(nextZoom));
    }
  }

  function zoomCanvasByWheelDelta(deltaY: number) {
    setCanvasZoom((currentZoom) =>
      clampCanvasZoom(currentZoom + (deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)),
    );
  }

  function handleMoveKeySignatureSymbol(
    sourceMeasureIndex: number,
    symbolIndex: number,
    position: MusicPosition,
  ) {
    const result = tryMoveKeySignatureSymbol(
      score,
      sourceMeasureIndex,
      symbolIndex,
      position.pitch,
    );

    if (result.moved) {
      commitScoreChange(result.score, 'Key signature symbol moved');
      setHoverPosition(null);
      setInputCursor(null);
      setCursorSequenceLocked(false);
      setSelectedEventId(null);
      setSelectedMeasure({
        staffId: position.staffId,
        measureIndex: sourceMeasureIndex,
      });
      setSelectedPitchIndex(null);
      setSelectedEventSource(null);
    } else {
      setEditorMessage(`Cannot move key signature: ${result.reason}`);
    }
  }

  function handleTempoChange(value: string) {
    const nextTempo = Number(value);

    if (!Number.isNaN(nextTempo)) {
      updateToolState({ tempo: nextTempo });
      setScore((currentScore) => ({
        ...currentScore,
        tempo: nextTempo,
      }));
    }
  }

  function handlePageSizeChange(pageSize: PageSize) {
    setScore((currentScore) => ({
      ...currentScore,
      pageSize,
    }));
    setEditorMessage(`Page size set to ${PAGE_SIZE_LABEL[pageSize]}`);
  }

  function handleAccidentalChange(accidental: AccidentalChoice) {
    updateToolState({ accidental });
    updateSelectedEvent(
      { accidental: accidental === 'none' ? null : accidental },
      'Event accidental updated',
    );
  }

  function handlePlaceAtPosition(position: MusicPosition) {
    if (!toolState.isInputArmed) {
      handleClearInteraction();
      return;
    }

    const sequentialPlacementPosition =
      isCursorSequenceLockedRef.current &&
      inputCursor !== null &&
      inputCursor.staffId === position.staffId &&
      (inputCursor.measureIndex === position.measureIndex ||
        isNearSequentialCursor(inputCursor, position)) &&
      !hasPitchedEventAtPosition(score, position)
        ? musicPositionFromCursor(inputCursor, position)
        : position;
    const placementPosition =
      toolState.placementMode === 'insert'
        ? snapInsertPositionToEventBoundary(score, position)
        : sequentialPlacementPosition;
    const accidental =
      toolState.accidental === 'none' ? undefined : toolState.accidental;
    const eventId = `event-${eventCounter.current++}`;

    const placeRequest = {
      eventId,
      staffId: placementPosition.staffId,
      measureIndex: placementPosition.measureIndex,
      beat: placementPosition.beat,
      duration: toolState.duration,
      dots: toolState.dots,
      entryMode: toolState.entryMode,
      pitch: placementPosition.pitch,
      accidental,
    };
    const result =
      toolState.placementMode === 'insert'
        ? tryInsertScoreEvent(score, placeRequest)
        : tryPlaceScoreEvent(score, placeRequest);

    if (result.placed) {
      commitScoreChange(
        result.score,
        toolState.placementMode === 'insert' ? 'Event inserted' : 'Event placed',
      );
      if (toolState.entryMode === 'note') {
        const placedPitch = {
          ...placementPosition.pitch,
          accidental,
        };

        void playPitchPreview([
          applyActiveKeySignatureToPitch(
            result.score,
            placementPosition.measureIndex,
            placedPitch,
          ),
        ]);
      }
      setHoverPosition(null);
      setInputCursor(
        createCursorAfterPlacement(
          result.score,
          placementPosition,
          toolState.duration,
          toolState.dots,
        ),
      );
      setCursorSequenceLocked(true);
      setSelectedEventId(null);
      setSelectedMeasure(null);
      setSelectedPitchIndex(null);
      setSelectedEventSource(null);
    } else {
      markInvalidMeasure(
        placementPosition.staffId,
        placementPosition.measureIndex,
        `Cannot place: ${result.reason}`,
      );
    }
  }

  function handleDeleteSelected() {
    if (!selectedEventId && selectedMeasure) {
      handleRequestClearMeasureContent();
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
    setSelectedEventId(null);
    setSelectedMeasure(null);
    setMeasureContextMenu(null);
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
  }

  function handleSelectMeasure(staffId: StaffId, measureIndex: number) {
    updateToolState({ isInputArmed: false });
    setHoverPosition(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setSelectedEventId(null);
    setSelectedMeasure({ staffId, measureIndex });
    setMeasureContextMenu(null);
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
    setEditorMessage('Measure selected');
  }

  function handleDeleteEvent(eventId: string, pitchIndex = selectedPitchIndex) {
    commitScoreChange(
      pitchIndex !== null && pitchIndex !== undefined
        ? deleteScoreEventPitch(score, eventId, pitchIndex)
        : deleteScoreEvent(score, eventId),
      'Event deleted',
    );
    if (selectedEventId === eventId) {
      setSelectedEventId(null);
      setSelectedMeasure(null);
      setMeasureContextMenu(null);
      setPendingMeasureDelete(null);
      setPendingMeasureClear(null);
      setSelectedPitchIndex(null);
      setSelectedEventSource(null);
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
            pitchIndex,
            pitch: position.pitch,
          }
        : {
            beat: position.beat,
            measureIndex: position.measureIndex,
            pitchIndex: pitchIndex ?? undefined,
            pitch: position.pitch,
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
          ? movedEvent.pitches.findIndex((pitch) => pitchesMatch(pitch, position.pitch))
          : null;

      setSelectedEventId(eventId);
      setSelectedMeasure(null);
      setSelectedPitchIndex(
        typeof movedPitchIndex === 'number' && movedPitchIndex >= 0
          ? movedPitchIndex
          : null,
      );
      setSelectedEventSource('manual');
    } else {
      markInvalidMeasure(
        position.staffId,
        position.measureIndex,
        `Cannot move: ${result.reason}`,
      );
    }
  }

  function handleUndo() {
    const previousScore = pastScores.at(-1);

    if (!previousScore) {
      return;
    }

    setPastScores((currentPast) => currentPast.slice(0, -1));
    setFutureScores((currentFuture) => [score, ...currentFuture]);
    setScore(previousScore);
    setSelectedEventId(null);
    setSelectedMeasure(null);
    setMeasureContextMenu(null);
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setInvalidMeasureKeys([]);
    updateToolState({ isInputArmed: false });
    setEditorMessage('Undo');
  }

  function handleRedo() {
    const [nextScore, ...remainingFuture] = futureScores;

    if (!nextScore) {
      return;
    }

    setPastScores((currentPast) => [...currentPast, score]);
    setFutureScores(remainingFuture);
    setScore(nextScore);
    setSelectedEventId(null);
    setSelectedMeasure(null);
    setMeasureContextMenu(null);
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setInvalidMeasureKeys([]);
    updateToolState({ isInputArmed: false });
    setEditorMessage('Redo');
  }

  function handleSaveProject() {
    saveProjectToStorage(score);
    setEditorMessage('Project saved');
  }

  function handleLoadProject() {
    const storedScore = loadProjectFromStorage();

    if (!storedScore) {
      setEditorMessage('No saved project');
      return;
    }

    commitScoreChange(storedScore, 'Project loaded');
    setToolState((current) => ({
      ...current,
      scoreType: storedScore.type,
      tempo: storedScore.tempo,
      isInputArmed: false,
    }));
    setSelectedEventId(null);
    setSelectedMeasure(null);
    setMeasureContextMenu(null);
    setPendingMeasureDelete(null);
    setPendingMeasureClear(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setHoverPosition(null);
  }

  async function handleImportProjectFile(fileList: FileList | null) {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    try {
      const importedScore = deserializeScore(await file.text());

      commitScoreChange(importedScore, 'Project imported');
      setToolState((current) => ({
        ...current,
        scoreType: importedScore.type,
        tempo: importedScore.tempo,
        isInputArmed: false,
      }));
      setSelectedEventId(null);
      setSelectedMeasure(null);
      setMeasureContextMenu(null);
      setPendingMeasureDelete(null);
      setPendingMeasureClear(null);
      setSelectedPitchIndex(null);
      setSelectedEventSource(null);
      setInputCursor(null);
      setCursorSequenceLocked(false);
      setHoverPosition(null);
    } catch {
      setEditorMessage('Invalid JSON project');
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  }

  function handleDownloadProject() {
    const blob = createProjectJsonBlob(score);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${score.title || 'sheetlab-project'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setEditorMessage('JSON downloaded');
  }

  function getDownloadBaseName() {
    return (
      score.title
        .trim()
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'sheetlab-score'
    );
  }

  async function handleExportPdf() {
    setEditorMessage('Exporting PDF');

    try {
      const response = await fetch('/api/export-pdf', {
        body: JSON.stringify(score),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('PDF export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `${getDownloadBaseName()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setEditorMessage('PDF downloaded');
    } catch {
      setEditorMessage('PDF export failed');
    }
  }

  function stopPlayback() {
    playbackController.current?.stop();
    playbackController.current = null;

    if (playbackEndTimer.current !== null) {
      window.clearTimeout(playbackEndTimer.current);
      playbackEndTimer.current = null;
    }

    if (playbackInterval.current !== null) {
      window.clearInterval(playbackInterval.current);
      playbackInterval.current = null;
    }

    setIsPlaying(false);
    setPlaybackElapsedSeconds(0);
    setEditorMessage('Playback stopped');
  }

  async function handlePlaybackToggle() {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const timeline = buildPlaybackTimeline(score);

    if (timeline.length === 0) {
      setEditorMessage('Nothing to play');
      return;
    }

    setIsPlaying(true);
    setPlaybackElapsedSeconds(0);
    setEditorMessage('Playback started');
    const startedAt = performance.now();
    playbackInterval.current = window.setInterval(() => {
      setPlaybackElapsedSeconds((performance.now() - startedAt) / 1000);
    }, 50);
    playbackController.current = await playTimelineAudio(timeline);
    playbackEndTimer.current = window.setTimeout(() => {
      playbackController.current?.stop();
      playbackController.current = null;
      playbackEndTimer.current = null;
      if (playbackInterval.current !== null) {
        window.clearInterval(playbackInterval.current);
        playbackInterval.current = null;
      }
      setIsPlaying(false);
      setPlaybackElapsedSeconds(0);
      setEditorMessage('Playback finished');
    }, getTimelineDurationSeconds(timeline) * 1000 + 120);
  }

  const playbackTimeline = buildPlaybackTimeline(score);
  const activePlaybackEvent = isPlaying
    ? getActiveTimelineEvent(playbackTimeline, playbackElapsedSeconds)
    : null;
  const playbackBeat = isPlaying
    ? getPlaybackBeatAtSeconds(score.tempo, playbackElapsedSeconds)
    : null;
  const activeKeySignatureSelection = getActiveKeySignatureSelection(
    score,
    getKeySignatureTargetMeasureIndex(),
  );
  const activeRepeatJump = getMeasureRepeatJump(
    score,
    getScoreEditTargetMeasureIndex(),
  );

  useEffect(() => {
    const viewport = notationViewportRef.current;

    if (!viewport) {
      return;
    }

    function handleNativeWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      zoomCanvasByWheelDelta(event.deltaY);
    }

    viewport.addEventListener('wheel', handleNativeWheel, { passive: false });

    return () => viewport.removeEventListener('wheel', handleNativeWheel);
  }, []);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
      );
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const isModifierShortcut = event.ctrlKey || event.metaKey;

      if (isModifierShortcut && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (isModifierShortcut && key === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();

        if (selectedEventId) {
          handleDeleteEvent(selectedEventId, selectedPitchIndex);
          return;
        }

        if (selectedMeasure) {
          handleRequestClearMeasureContent();
        }
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown);

    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [
    futureScores,
    pastScores,
    score,
    selectedEventId,
    selectedMeasure,
    selectedPitchIndex,
  ]);

  return (
    <main
      className={`app-shell${isPdfExportMode() ? ' is-pdf-export' : ''}`}
      aria-label="SheetLab music editor"
    >
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <div>
            <h1>SheetLab</h1>
            <p>Notation editor prototype</p>
          </div>
        </div>

        <nav className="toolbar" aria-label="Editor toolbar">
          <div className="toolbar-group" aria-label="Duration tools">
            <span className="toolbar-group-label">Duration</span>
            <button
              type="button"
              aria-label="Select tool"
              className={`tool-button${!toolState.isInputArmed ? ' is-active' : ''}`}
              aria-pressed={!toolState.isInputArmed}
              title="Normal cursor: select, drag, or delete existing notes"
              onClick={handleClearInteraction}
            >
              <span className="tool-symbol" aria-hidden="true">
                {'\u2196'}
              </span>
            </button>
            {DURATION_OPTIONS.map((duration) => (
              <button
                key={duration}
                type="button"
                aria-label={DURATION_LABEL[duration]}
                className={`tool-button${
                  toolState.isInputArmed && toolState.duration === duration
                    ? ' is-active'
                    : ''
                }`}
                aria-pressed={toolState.isInputArmed && toolState.duration === duration}
                title={DURATION_LABEL[duration]}
                onClick={() => handleDurationChange(duration)}
              >
                <span className="tool-symbol" aria-hidden="true">
                  {DURATION_SYMBOL[duration]}
                </span>
              </button>
            ))}
          </div>
          <div className="toolbar-group" aria-label="Modifier tools">
            <span className="toolbar-group-label">Modifiers</span>
            <button
              type="button"
              aria-label="Dotted note"
              className={`tool-button${toolState.dots > 0 ? ' is-active' : ''}`}
              aria-pressed={toolState.dots > 0}
              title="Add one augmentation dot to the selected duration"
              onClick={() => handleDottedChange(toolState.dots === 0)}
            >
              <span className="tool-symbol" aria-hidden="true">
                .
              </span>
            </button>
            {(['none', 'natural', 'sharp', 'flat'] satisfies AccidentalChoice[]).map(
              (accidental) => (
                <button
                  key={accidental}
                  type="button"
                  aria-label={ACCIDENTAL_LABEL[accidental]}
                  className={`tool-button${
                    toolState.accidental === accidental ? ' is-active' : ''
                  }`}
                  aria-pressed={toolState.accidental === accidental}
                  title={ACCIDENTAL_LABEL[accidental]}
                  onClick={() => handleAccidentalChange(accidental)}
                >
                  <span className="tool-symbol" aria-hidden="true">
                    {ACCIDENTAL_SYMBOL[accidental]}
                  </span>
                </button>
              ),
            )}
          </div>
          <div className="toolbar-group" aria-label="Key signature tools">
            <span className="toolbar-group-label">Key</span>
            <div className="palette-host">
              <button
                type="button"
                aria-expanded={openPalette === 'key'}
                aria-label="Key signature menu"
                className="toolbar-select palette-trigger"
                title="Apply key signature at the selected measure or selected note measure"
                onClick={() =>
                  setOpenPalette((current) => (current === 'key' ? null : 'key'))
                }
              >
                {activeKeySignatureSelection === 'custom'
                  ? 'Custom key signature'
                  : getKeySignatureLabel(activeKeySignatureSelection)}
              </button>
              {openPalette === 'key' ? (
                <div
                  className="thumbnail-menu key-signature-menu"
                  data-testid="key-signature-thumbnail-menu"
                  role="menu"
                >
                  {activeKeySignatureSelection === 'custom' ? (
                    <div className="thumbnail-option is-current" aria-hidden="true">
                      <span className="signature-thumbnail">
                        <span className="signature-staff-lines" />
                      </span>
                      <span>Custom</span>
                    </div>
                  ) : null}
                  {KEY_SIGNATURE_OPTIONS.map((keySignature) => (
                    <button
                      key={keySignature}
                      type="button"
                      className={`thumbnail-option${
                        activeKeySignatureSelection === keySignature
                          ? ' is-current'
                          : ''
                      }`}
                      role="menuitem"
                      onClick={() => handleKeySignatureChange(keySignature)}
                    >
                      <KeySignatureThumbnail keySignature={keySignature} />
                      <span>{keySignature}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="toolbar-group" aria-label="Time signature tools">
            <span className="toolbar-group-label">Time</span>
            <select
              aria-label="Time signature"
              className="toolbar-select compact-select"
              value={getTimeSignatureId(score.timeSignature)}
              onChange={(event) => handleTimeSignatureChange(event.target.value)}
            >
              {TIME_SIGNATURE_OPTIONS.map((timeSignature) => (
                <option
                  key={getTimeSignatureId(timeSignature)}
                  value={getTimeSignatureId(timeSignature)}
                >
                  {getTimeSignatureLabel(timeSignature)}
                </option>
              ))}
            </select>
          </div>
          <div className="toolbar-group" aria-label="Repeat and jump tools">
            <span className="toolbar-group-label">Repeats</span>
            <div className="palette-host">
              <button
                type="button"
                aria-expanded={openPalette === 'repeat'}
                aria-label="Repeat and jump menu"
                className="toolbar-select palette-trigger"
                title="Apply repeat or jump to the selected measure"
                onClick={() =>
                  setOpenPalette((current) =>
                    current === 'repeat' ? null : 'repeat',
                  )
                }
              >
                {activeRepeatJump
                  ? getRepeatJumpOption(activeRepeatJump)?.label ?? activeRepeatJump
                  : 'None'}
              </button>
              {openPalette === 'repeat' ? (
                <div
                  className="thumbnail-menu repeat-menu"
                  data-testid="repeat-jump-thumbnail-menu"
                  role="menu"
                >
                  <button
                    type="button"
                    className={`thumbnail-option${!activeRepeatJump ? ' is-current' : ''}`}
                    role="menuitem"
                    onClick={() => handleRepeatJumpChange(null)}
                  >
                    <span className="repeat-thumbnail" aria-hidden="true">
                      <span className="signature-staff-lines" />
                      <span className="repeat-thumbnail-symbol">Ø</span>
                    </span>
                    <span>Clear</span>
                  </button>
                  {REPEAT_JUMP_OPTIONS.map((option) => (
                    <button
                      key={option.kind}
                      type="button"
                      className={`thumbnail-option${
                        activeRepeatJump === option.kind ? ' is-current' : ''
                      }`}
                      role="menuitem"
                      title={option.description}
                      onClick={() => handleRepeatJumpChange(option.kind)}
                    >
                      <RepeatJumpThumbnail kind={option.kind} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="toolbar-group" aria-label="Entry tools">
            <span className="toolbar-group-label">Entry</span>
            {(['note', 'rest'] satisfies EntryMode[]).map((entryMode) => (
              <button
                key={entryMode}
                type="button"
                aria-label={entryMode === 'note' ? 'Note' : 'Rest'}
                className={`tool-button${
                  toolState.entryMode === entryMode ? ' is-active' : ''
                }`}
                aria-pressed={toolState.entryMode === entryMode}
                title={entryMode === 'note' ? 'Note' : 'Rest'}
                onClick={() => {
                  updateToolState({ entryMode });
                }}
              >
                <span className="tool-symbol" aria-hidden="true">
                  {entryMode === 'note' ? '\u2669' : String.fromCodePoint(0x1d13d)}
                </span>
              </button>
            ))}
          </div>
          <div className="toolbar-group" aria-label="Placement tools">
            <span className="toolbar-group-label">Write mode</span>
            {(['place', 'insert'] satisfies PlacementMode[]).map(
              (placementMode) => (
                <button
                  key={placementMode}
                  type="button"
                  aria-label={PLACEMENT_MODE_LABEL[placementMode]}
                  className={`tool-button${
                    toolState.placementMode === placementMode ? ' is-active' : ''
                  }`}
                  aria-pressed={toolState.placementMode === placementMode}
                  title={
                    placementMode === 'insert'
                      ? 'Insert and shift later notes'
                      : 'Place or replace at the current slot'
                  }
                  onClick={() => {
                    updateToolState({ placementMode });
                    setCursorSequenceLocked(false);
                  }}
                >
                  {PLACEMENT_MODE_LABEL[placementMode]}
                </button>
              ),
            )}
          </div>
          <div className="toolbar-group" aria-label="Transport and history">
            <span className="toolbar-group-label">Transport</span>
            <button
              type="button"
              aria-label={isPlaying ? 'Stop' : 'Play'}
              className={`tool-button${isPlaying ? ' is-active' : ''}`}
              onClick={handlePlaybackToggle}
            >
              <span className="tool-symbol" aria-hidden="true">
                {isPlaying ? '\u25a0' : '\u25b6'}
              </span>
            </button>
            <button
              type="button"
              aria-label="Undo"
              className="tool-button"
              disabled={pastScores.length === 0}
              onClick={handleUndo}
            >
              {'\u21b6'}
            </button>
            <button
              type="button"
              aria-label="Redo"
              className="tool-button"
              disabled={futureScores.length === 0}
              onClick={handleRedo}
            >
              {'\u21b7'}
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={handleAddMeasure}
            >
              Add Measure
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={handleResetScore}
            >
              Reset
            </button>
            <button
              type="button"
              className="tool-button"
              disabled={!selectedEventId && !selectedMeasure}
              onClick={handleDeleteSelected}
            >
              Delete
            </button>
          </div>
          <div className="toolbar-group zoom-toolbar" aria-label="Canvas zoom tools">
            <span className="toolbar-group-label">Zoom</span>
            <input
              aria-label="Canvas zoom"
              className="zoom-slider"
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={ZOOM_STEP}
              value={canvasZoom}
              onChange={(event) => handleCanvasZoomChange(event.target.value)}
            />
            <output className="zoom-value" aria-label="Current canvas zoom">
              {canvasZoom}%
            </output>
          </div>
          <div className="toolbar-group" aria-label="Project tools">
            <span className="toolbar-group-label">File</span>
            <button type="button" className="tool-button" onClick={handleSaveProject}>
              Save
            </button>
            <button type="button" className="tool-button" onClick={handleLoadProject}>
              Load
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={() => importInputRef.current?.click()}
            >
              Import JSON
            </button>
            <input
              ref={importInputRef}
              aria-label="Import JSON file"
              className="file-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleImportProjectFile(event.target.files)}
            />
            <button type="button" className="tool-button" onClick={handleDownloadProject}>
              Download JSON
            </button>
            <button type="button" className="tool-button" onClick={() => void handleExportPdf()}>
              Export PDF
            </button>
          </div>
        </nav>
      </header>

      <section className="workspace">
        <aside className="left-panel" aria-label="Score settings">
          <h2>Score Setup</h2>
          <label>
            Score type
            <select
              value={toolState.scoreType}
              onChange={(event) =>
                handleScoreTypeChange(event.target.value as ScoreType)
              }
            >
              <option value="treble">Treble only</option>
              <option value="grand">Grand staff piano</option>
            </select>
          </label>
          <label>
            Page size
            <select
              value={score.pageSize}
              onChange={(event) =>
                handlePageSizeChange(event.target.value as PageSize)
              }
            >
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
            </select>
          </label>
          <label>
            Tempo
            <input
              type="number"
              value={toolState.tempo}
              min={40}
              max={220}
              onChange={(event) => handleTempoChange(event.target.value)}
            />
          </label>
          <label>
            Time signature
            <select
              value={getTimeSignatureId(score.timeSignature)}
              onChange={(event) => handleTimeSignatureChange(event.target.value)}
            >
              {TIME_SIGNATURE_OPTIONS.map((timeSignature) => (
                <option
                  key={getTimeSignatureId(timeSignature)}
                  value={getTimeSignatureId(timeSignature)}
                >
                  {getTimeSignatureLabel(timeSignature)}
                </option>
              ))}
            </select>
          </label>
          <dl className="state-summary" aria-label="Current editor state">
            <div>
              <dt>Score</dt>
              <dd>{SCORE_TYPE_LABEL[toolState.scoreType]}</dd>
            </div>
            <div>
              <dt>Page</dt>
              <dd>{PAGE_SIZE_LABEL[score.pageSize]}</dd>
            </div>
            <div>
              <dt>Input</dt>
              <dd>{toolState.isInputArmed ? 'Write' : 'Select'}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>
                {DURATION_LABEL[toolState.duration]}
                {toolState.dots > 0 ? ' dotted' : ''}
              </dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{toolState.entryMode === 'note' ? 'Note' : 'Rest'}</dd>
            </div>
            <div>
              <dt>Placement</dt>
              <dd>{PLACEMENT_MODE_LABEL[toolState.placementMode]}</dd>
            </div>
            <div>
              <dt>Accidental</dt>
              <dd>{ACCIDENTAL_LABEL[toolState.accidental]}</dd>
            </div>
            <div>
              <dt>Tempo</dt>
              <dd>{toolState.tempo} BPM</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{getTimeSignatureLabel(score.timeSignature)}</dd>
            </div>
            <div>
              <dt>Zoom</dt>
              <dd>{canvasZoom}%</dd>
            </div>
            <div>
              <dt>Measures</dt>
              <dd>{score.parts[0]?.staves[0]?.measures.length ?? 0}</dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>{countScoreEvents(score)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{editorMessage}</dd>
            </div>
            <div>
              <dt>Selected</dt>
              <dd>
                {selectedEventId ? (
                  <>
                    {findScoreEvent(score, selectedEventId)?.event.id ?? 'None'}
                    {selectedPitchIndex !== null ? ` pitch ${selectedPitchIndex + 1}` : ''}
                  </>
                ) : selectedMeasure ? (
                  `${selectedMeasure.staffId} M${selectedMeasure.measureIndex + 1}`
                ) : (
                  'None'
                )}
              </dd>
            </div>
            <div>
              <dt>History</dt>
              <dd>
                {pastScores.length}/{futureScores.length}
              </dd>
            </div>
            <div>
              <dt>Hover</dt>
              <dd>
                {hoverPosition
                  ? `${hoverPosition.staffId} M${hoverPosition.measureIndex + 1} B${
                      hoverPosition.beat + 1
                    } ${formatPitch(hoverPosition.pitch)}`
                  : 'None'}
              </dd>
            </div>
            <div>
              <dt>Cursor</dt>
              <dd>{formatInputCursor(inputCursor)}</dd>
            </div>
          </dl>
        </aside>

        <section
          className="sheet-stage"
          aria-label="Sheet surface"
          onClick={handleSheetStageClick}
        >
          <div
            className={`paper paper-${score.pageSize}`}
            style={
              {
                '--canvas-zoom': isPdfExportMode() ? 1 : canvasZoom / 100,
              } as CSSProperties
            }
          >
            <div className="paper-heading">
              <input
                aria-label="Score title"
                className="score-title-input"
                value={score.title}
                onChange={(event) =>
                  updateScoreMetadata({ title: event.target.value })
                }
                onClick={handleClearInteraction}
                onFocus={handleClearInteraction}
              />
              <div className="score-meta-row">
                <span>Moderato {'\u2669'} = {toolState.tempo}</span>
                <input
                  aria-label="Composer"
                  className="score-composer-input"
                  placeholder="Composer"
                  value={score.composer}
                  onChange={(event) =>
                    updateScoreMetadata({ composer: event.target.value })
                  }
                  onClick={handleClearInteraction}
                  onFocus={handleClearInteraction}
                />
              </div>
            </div>
            <div
              ref={notationViewportRef}
              className="notation-scroll"
              aria-label="Notation viewport"
            >
              <StaffRenderer
                duration={toolState.duration}
                dots={toolState.dots}
                entryMode={toolState.entryMode}
                activeEventId={activePlaybackEvent?.id ?? null}
                hoverPosition={hoverPosition}
                inputCursor={inputCursor}
                isInputArmed={toolState.isInputArmed}
                invalidMeasureKeys={invalidMeasureKeys}
                playbackBeat={playbackBeat}
                placementMode={toolState.placementMode}
                selectedEventId={selectedEventId}
                selectedPitchIndex={selectedPitchIndex}
                score={score}
                onClearInteraction={handleClearInteraction}
                onHoverPositionChange={handleHoverPositionChange}
                onPlaceAtPosition={handlePlaceAtPosition}
                onDeleteEvent={handleDeleteEvent}
                onMoveKeySignatureSymbol={handleMoveKeySignatureSymbol}
                onMeasureContextMenu={handleMeasureContextMenu}
                onMoveEvent={handleMoveEvent}
                onSelectMeasure={handleSelectMeasure}
                onSelectEvent={(eventId, pitchIndex) => {
                  updateToolState({ isInputArmed: false });
                  setHoverPosition(null);
                  setInputCursor(null);
                  setCursorSequenceLocked(false);
                  setSelectedEventId(eventId);
                  setSelectedMeasure(null);
                  setSelectedPitchIndex(pitchIndex ?? null);
                  setSelectedEventSource('manual');
                  setEditorMessage(
                    pitchIndex !== null && pitchIndex !== undefined
                      ? 'Notehead selected'
                      : 'Event selected',
                  );
                }}
                selectedMeasure={selectedMeasure}
              />
            </div>
          </div>
          {measureContextMenu ? (
            <div
              className="measure-context-menu"
              data-testid="measure-context-menu"
              role="menu"
              style={{
                left: measureContextMenu.clientX,
                top: measureContextMenu.clientY,
              }}
            >
              <p>
                Measure {measureContextMenu.measureIndex + 1} {measureContextMenu.staffId}
              </p>
              <button type="button" role="menuitem" onClick={handleClearMeasureContent}>
                Clear content
              </button>
              <button type="button" role="menuitem" onClick={handleInsertMeasureBefore}>
                Add measure before
              </button>
              <button type="button" role="menuitem" onClick={handleInsertMeasureAfter}>
                Add measure after
              </button>
              <button
                type="button"
                disabled={getMeasureCount() <= 1}
                role="menuitem"
                onClick={handleRequestDeleteMeasure}
              >
                Delete measure
              </button>
            </div>
          ) : null}
          {pendingMeasureDelete ? (
            <div
              className="measure-warning-backdrop"
              data-testid="measure-delete-warning"
              role="presentation"
            >
              <div
                aria-label="Delete measure warning"
                aria-modal="true"
                className="measure-warning-dialog"
                role="dialog"
              >
                <h2>Delete measure?</h2>
                <p>
                  This removes measure {pendingMeasureDelete.measureIndex + 1} from every
                  staff. This action can be undone.
                </p>
                <div className="measure-warning-actions">
                  <button
                    type="button"
                    className="tool-button"
                    onClick={() => setPendingMeasureDelete(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="tool-button danger"
                    onClick={handleConfirmDeleteMeasure}
                  >
                    Delete measure
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {pendingMeasureClear ? (
            <div
              className="measure-warning-backdrop"
              data-testid="measure-clear-warning"
              role="presentation"
            >
              <div
                aria-label="Clear measure content warning"
                aria-modal="true"
                className="measure-warning-dialog"
                role="dialog"
              >
                <h2>Clear measure content?</h2>
                <p>
                  This removes notes and rests from measure{' '}
                  {pendingMeasureClear.measureIndex + 1} on the selected staff.
                  This action can be undone.
                </p>
                <div className="measure-warning-actions">
                  <button
                    type="button"
                    className="tool-button"
                    onClick={() => setPendingMeasureClear(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="tool-button danger"
                    onClick={handleConfirmClearMeasureContent}
                  >
                    Clear content
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

export default App;
