import { useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
} from 'react';
import { createEmptyScore } from '../../domain/score/factories';
import { isPitchedScoreEvent } from '../../domain/score/events';
import {
  addMeasure,
  clearMeasureContent,
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
} from '../../domain/score/editing';
import {
  applyActiveKeySignatureToPitch,
  getActiveKeySignatureSelection,
} from '../../domain/score/keySignatures';
import type {
  AccidentalChoice,
  EditorToolState,
  EntryMode,
  PlacementMode,
} from '../editor/editorState';
import {
  DEFAULT_EDITOR_TOOL_STATE,
  PAGE_SIZE_LABEL,
} from '../editor/editorState';
import {
  createInputCursorFromPosition,
} from '../editor/inputCursor';
import type { InputCursor } from '../editor/inputCursor';
import {
  EditorToolbar,
  type ToolbarPalette,
} from '../editor/EditorToolbar';
import { ScoreSettingsPanel } from '../editor/ScoreSettingsPanel';
import type {
  DurationValue,
  KeySignature,
  PageSize,
  RepeatJumpKind,
  Score,
  ScoreType,
  StaffId,
} from '../../domain/score/types';
import {
  getMeasureBeats,
  getTimeSignatureLabel,
  parseTimeSignatureId,
} from '../../domain/score/timeSignatures';
import {
  getMeasureRepeatJump,
  getRepeatJumpOption,
} from '../../domain/score/repeatJumps';
import { getScoreRhythmIssues } from '../../domain/score/rhythm';
import type { MusicPosition } from '../sheet/interaction';
import { snapInsertPositionToEventBoundary } from '../sheet/insertPosition';
import { getMeasureKey } from '../sheet/measureKey';
import {
  playPitchPreview,
} from '../playback/audioEngine';
import { usePlaybackController } from './usePlaybackController';
import { useProjectActions } from './useProjectActions';
import { SheetSurface } from './SheetSurface';
import { useCanvasZoom } from './useCanvasZoom';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useScoreHistory } from './useScoreHistory';
import {
  isPdfExportMode,
  loadInitialScoreForApp,
} from './appBootstrap';
import {
  createCursorAfterPlacement,
  hasPitchedEventAtPosition,
  musicPositionFromCursor,
  pitchesMatch,
  shouldUseSequentialCursor,
} from './inputCursorFlow';

function SheetLabApp() {
  type SelectionSource = 'manual';

  const [initialScore] = useState(loadInitialScoreForApp);
  const [toolState, setToolState] = useState<EditorToolState>(
    () => ({
      ...DEFAULT_EDITOR_TOOL_STATE,
      scoreType: initialScore.type,
      tempo: initialScore.tempo,
    }),
  );
  const {
    commitScoreChange,
    editorMessage,
    futureScores,
    invalidMeasureKeys,
    markInvalidMeasure,
    pastScores,
    score,
    setEditorMessage,
    setFutureScores,
    setInvalidMeasureKeys,
    setPastScores,
    setScore,
  } = useScoreHistory(initialScore);
  const [hoverPosition, setHoverPosition] = useState<MusicPosition | null>(null);
  const [inputCursor, setInputCursor] = useState<InputCursor | null>(null);
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
  const [openPalette, setOpenPalette] = useState<ToolbarPalette>(null);
  const eventCounter = useRef(1);
  const notationViewportRef = useRef<HTMLDivElement | null>(null);
  const isCursorSequenceLockedRef = useRef(false);
  const { canvasZoom, handleCanvasZoomChange } =
    useCanvasZoom(notationViewportRef);

  function setCursorSequenceLocked(isLocked: boolean) {
    isCursorSequenceLockedRef.current = isLocked;
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
      const sequentialCursor =
        inputCursor &&
        shouldUseSequentialCursor(
          inputCursor,
          isCursorSequenceLockedRef.current,
          nextHoverPosition,
        )
          ? inputCursor
          : null;
      const cursorPosition = sequentialCursor
        ? musicPositionFromCursor(sequentialCursor, nextHoverPosition)
        : nextHoverPosition;
      const nextCursor = createInputCursorFromPosition(
        cursorPosition,
        toolState.duration,
        'note-input',
        getMeasureBeats(score.timeSignature),
        toolState.dots,
      );

      setHoverPosition(musicPositionFromCursor(nextCursor, cursorPosition));

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

  function handleEntryModeChange(entryMode: EntryMode) {
    updateToolState({ entryMode });
  }

  function handlePlacementModeChange(placementMode: PlacementMode) {
    updateToolState({ placementMode });
    setCursorSequenceLocked(false);
  }

  function handlePlaceAtPosition(position: MusicPosition) {
    if (!toolState.isInputArmed) {
      handleClearInteraction();
      return;
    }

    const sequentialCursor =
      inputCursor &&
      shouldUseSequentialCursor(
        inputCursor,
        isCursorSequenceLockedRef.current,
        position,
      ) &&
      !hasPitchedEventAtPosition(score, position)
        ? inputCursor
        : null;
    const sequentialPlacementPosition =
      sequentialCursor
        ? musicPositionFromCursor(sequentialCursor, position)
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

  function handleSelectEvent(eventId: string, pitchIndex?: number | null) {
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

  function handleLoadedScoreFromFile(
    loadedScore: Score,
    message: string,
    options?: { closePalette?: boolean },
  ) {
    commitScoreChange(loadedScore, message);
    setToolState((current) => ({
      ...current,
      scoreType: loadedScore.type,
      tempo: loadedScore.tempo,
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
    if (options?.closePalette) {
      setOpenPalette(null);
    }
  }

  const {
    handleDownloadAbc,
    handleDownloadProject,
    handleExportPdf,
    handleImportAbcFile,
    handleImportProjectFile,
    handleLoadProject,
    handleSaveProject,
    importAbcInputRef,
    importInputRef,
  } = useProjectActions({
    onScoreLoaded: handleLoadedScoreFromFile,
    score,
    setEditorMessage,
  });
  const {
    activePlaybackEvent,
    handlePlaybackToggle,
    isPlaying,
    playbackBeat,
  } = usePlaybackController({
    score,
    setEditorMessage,
  });
  const activeKeySignatureSelection = getActiveKeySignatureSelection(
    score,
    getKeySignatureTargetMeasureIndex(),
  );
  const activeRepeatJump = getMeasureRepeatJump(
    score,
    getScoreEditTargetMeasureIndex(),
  );
  const rhythmIssues = getScoreRhythmIssues(score);
  const activeInvalidMeasureKeys = [
    ...new Set([
      ...invalidMeasureKeys,
      ...rhythmIssues.map((issue) =>
        getMeasureKey(issue.staffId, issue.measureIndex),
      ),
    ]),
  ];

  useEditorShortcuts({
    futureScores,
    onDeleteEvent: handleDeleteEvent,
    onRedo: handleRedo,
    onRequestClearMeasureContent: handleRequestClearMeasureContent,
    onUndo: handleUndo,
    pastScores,
    score,
    selectedEventId,
    selectedMeasure,
    selectedPitchIndex,
  });

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

        <EditorToolbar
          activeKeySignatureSelection={activeKeySignatureSelection}
          activeRepeatJump={activeRepeatJump}
          canvasZoom={canvasZoom}
          futureScoreCount={futureScores.length}
          importAbcInputRef={importAbcInputRef}
          importInputRef={importInputRef}
          isPlaying={isPlaying}
          openPalette={openPalette}
          pastScoreCount={pastScores.length}
          scoreTimeSignature={score.timeSignature}
          canDeleteSelection={Boolean(selectedEventId || selectedMeasure)}
          toolState={toolState}
          onAccidentalChange={handleAccidentalChange}
          onAddMeasure={handleAddMeasure}
          onCanvasZoomChange={handleCanvasZoomChange}
          onClearInteraction={handleClearInteraction}
          onDeleteSelected={handleDeleteSelected}
          onDottedChange={handleDottedChange}
          onDownloadAbc={handleDownloadAbc}
          onDownloadProject={handleDownloadProject}
          onDurationChange={handleDurationChange}
          onEntryModeChange={handleEntryModeChange}
          onExportPdf={() => void handleExportPdf()}
          onImportAbcFile={handleImportAbcFile}
          onImportProjectFile={handleImportProjectFile}
          onKeySignatureChange={handleKeySignatureChange}
          onLoadProject={handleLoadProject}
          onOpenPaletteChange={setOpenPalette}
          onPlacementModeChange={handlePlacementModeChange}
          onPlaybackToggle={handlePlaybackToggle}
          onRedo={handleRedo}
          onRepeatJumpChange={handleRepeatJumpChange}
          onResetScore={handleResetScore}
          onSaveProject={handleSaveProject}
          onTimeSignatureChange={handleTimeSignatureChange}
          onUndo={handleUndo}
        />
      </header>

      <section className="workspace">
        <ScoreSettingsPanel
          canvasZoom={canvasZoom}
          editorMessage={editorMessage}
          futureScoreCount={futureScores.length}
          hoverPosition={hoverPosition}
          inputCursor={inputCursor}
          pastScoreCount={pastScores.length}
          rhythmIssueCount={rhythmIssues.length}
          score={score}
          selectedEventId={selectedEventId}
          selectedMeasure={selectedMeasure}
          selectedPitchIndex={selectedPitchIndex}
          toolState={toolState}
          onPageSizeChange={handlePageSizeChange}
          onScoreTypeChange={handleScoreTypeChange}
          onTempoChange={handleTempoChange}
          onTimeSignatureChange={handleTimeSignatureChange}
        />

        <SheetSurface
          activeEventId={activePlaybackEvent?.id ?? null}
          activeInvalidMeasureKeys={activeInvalidMeasureKeys}
          canvasZoom={canvasZoom}
          getMeasureCount={getMeasureCount}
          hoverPosition={hoverPosition}
          inputCursor={inputCursor}
          isPdfExportMode={isPdfExportMode()}
          measureContextMenu={measureContextMenu}
          notationViewportRef={notationViewportRef}
          pendingMeasureClear={pendingMeasureClear}
          pendingMeasureDelete={pendingMeasureDelete}
          playbackBeat={playbackBeat}
          score={score}
          selectedEventId={selectedEventId}
          selectedMeasure={selectedMeasure}
          selectedPitchIndex={selectedPitchIndex}
          toolState={toolState}
          onClearInteraction={handleClearInteraction}
          onClearMeasureContent={handleClearMeasureContent}
          onConfirmClearMeasureContent={handleConfirmClearMeasureContent}
          onConfirmDeleteMeasure={handleConfirmDeleteMeasure}
          onDeleteEvent={handleDeleteEvent}
          onHoverPositionChange={handleHoverPositionChange}
          onInsertMeasureAfter={handleInsertMeasureAfter}
          onInsertMeasureBefore={handleInsertMeasureBefore}
          onMeasureContextMenu={handleMeasureContextMenu}
          onMoveEvent={handleMoveEvent}
          onMoveKeySignatureSymbol={handleMoveKeySignatureSymbol}
          onPlaceAtPosition={handlePlaceAtPosition}
          onRequestDeleteMeasure={handleRequestDeleteMeasure}
          onSelectEvent={handleSelectEvent}
          onSelectMeasure={handleSelectMeasure}
          onSetPendingMeasureClear={setPendingMeasureClear}
          onSetPendingMeasureDelete={setPendingMeasureDelete}
          onSheetStageClick={handleSheetStageClick}
          onUpdateScoreMetadata={updateScoreMetadata}
        />
      </section>
    </main>
  );
}

export default SheetLabApp;
