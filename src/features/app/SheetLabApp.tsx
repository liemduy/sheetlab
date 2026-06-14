import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
} from 'react';
import {
  findScoreEvent,
  tryUpdateScoreEvent,
} from '../../domain/score/editing';
import { isPitchedScoreEvent } from '../../domain/score/events';
import { getEventAnnotationOffset } from '../../domain/score/annotationOffsets';
import {
  deleteClefChange,
  findClefChange,
  tryMoveClefChange,
  trySetClefChange,
} from '../../domain/score/clefChanges';
import {
  getScoreFixtureById,
  scoreFixtureCatalog,
} from '../../domain/score/fixtureCatalog';
import { findLyricMapSourceEventId } from '../../domain/score/lyricMapping';
import { isStemmedScoreEvent } from '../../domain/score/stemDirection';
import {
  ARTICULATION_LABEL,
  toggleArticulationKind,
} from '../../domain/score/articulations';
import {
  tryToggleSlurToNext,
  tryToggleTieToNext,
} from '../../domain/score/noteConnections';
import {
  OTTAVA_LABEL,
  tryClearOttavaForEvent,
  tryToggleOttavaToNext,
} from '../../domain/score/ottava';
import type {
  EditableVoiceIndex,
  EditorToolState,
  EntryMode,
  PlacementMode,
} from '../editor/editorState';
import {
  ACCIDENTAL_LABEL,
  DEFAULT_EDITOR_TOOL_STATE,
  DURATION_LABEL,
  DURATION_OPTIONS,
  PLACEMENT_MODE_LABEL,
  VOICE_LABEL,
  VOICE_OPTIONS,
} from '../editor/editorState';
import {
  CommandPalette,
  type CommandPaletteCommand,
} from '../editor/CommandPalette';
import {
  EditorToolbar,
  type ToolbarPalette,
} from '../editor/EditorToolbar';
import { ScoreSettingsPanel } from '../editor/ScoreSettingsPanel';
import { AuthControls } from '../auth/AuthControls';
import { AuthModal } from '../auth/AuthModal';
import { useAuthSession } from '../auth/useAuthSession';
import type { Clef, OttavaKind, Score, StaffId } from '../../domain/score/types';
import {
  SUPPORTED_TUPLET_ACTUAL_NOTES,
  getDefaultTupletNormalNotes,
} from '../../domain/score/tuplets';
import {
  getScoreRhythmIssues,
  type RhythmIssue,
} from '../../domain/score/rhythm';
import {
  getScoreMusicIssues,
  type ScoreMusicIssue,
} from '../../domain/score/musicIssues';
import { getMeasureKey } from '../sheet/measureKey';
import { snapInsertPositionToEventBoundary } from '../sheet/insertPosition';
import { getInsertTargetEvent } from '../sheet/insertPreview';
import type { MusicPosition } from '../sheet/interaction';
import { usePlaybackController } from './usePlaybackController';
import { useProjectActions } from './useProjectActions';
import {
  SheetSurface,
  type ReferenceBackground,
} from './SheetSurface';
import { useCursorPlacement } from './useCursorPlacement';
import { useCanvasZoom } from './useCanvasZoom';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useEditorSelection } from './useEditorSelection';
import { useMeasureEditing } from './useMeasureEditing';
import { useScoreEventEditing } from './useScoreEventEditing';
import { useScoreHistory } from './useScoreHistory';
import { useUndoRedoControls } from './useUndoRedoControls';
import { useAnnotationCommands } from './useAnnotationCommands';
import { useScoreCommands } from './useScoreCommands';
import { useCloudScores } from '../cloud/useCloudScores';
import type {
  AnnotationContextMenuState,
  AnnotationTarget,
  ClefChangeTarget,
} from './selectionTypes';
import {
  isPdfExportMode,
  loadInitialScoreForApp,
} from './appBootstrap';
import { getAdjacentSelectableScoreEvent } from './scoreEventNavigation';
import { saveAutosaveToStorage } from '../persistence/projectStorage';
import {
  DISABLED_CLOUD_SYNC_CONFIG,
  getCloudSyncStatusLabel,
} from '../cloud/cloudSync';

function getExportPreflightMessage(issues: RhythmIssue[]) {
  const issueCount = issues.length;
  const firstIssue = issues[0];
  const issueLabel = issueCount === 1 ? 'issue' : 'issues';

  if (!firstIssue) {
    return 'Ready to export PDF';
  }

  return `Export blocked: fix ${issueCount} rhythm ${issueLabel} before PDF (first: ${firstIssue.staffId} measure ${
    firstIssue.measureIndex + 1
  } ${firstIssue.reason})`;
}

function getMusicIssuePreflightMessage(issues: ScoreMusicIssue[]) {
  const issueCount = issues.length;
  const firstIssue = issues[0];
  const issueLabel = issueCount === 1 ? 'issue' : 'issues';

  if (!firstIssue) {
    return 'Ready to export PDF';
  }

  return `Export blocked: fix ${issueCount} music ${issueLabel} before PDF (first: ${firstIssue.message})`;
}

function cloneDemoScore(score: Score): Score {
  return JSON.parse(JSON.stringify(score)) as Score;
}

function scoreHasStaff(score: Score, staffId: StaffId) {
  return score.parts
    .flatMap((part) => part.staves)
    .some((staff) => staff.id === staffId);
}

function getLyricBulkTargetEventIds(
  score: Score,
  selectedEventId: string | null,
  lyricCount: number,
) {
  if (!selectedEventId || lyricCount <= 0) {
    return [];
  }

  const selectedEvent = findScoreEvent(score, selectedEventId);

  if (!selectedEvent) {
    return [];
  }

  return score.parts
    .flatMap((part) =>
      part.staves.flatMap((staff) =>
        staff.id === selectedEvent.staffId
          ? staff.measures.flatMap((measure) => {
              const voice = measure.voices[selectedEvent.voiceIndex];

              return (voice?.events ?? []).map((event) => ({
                event,
                measureIndex: measure.index,
              }));
            })
          : [],
      ),
    )
    .filter(
      ({ event, measureIndex }) =>
        isPitchedScoreEvent(event) &&
        (measureIndex > selectedEvent.measureIndex ||
          (measureIndex === selectedEvent.measureIndex &&
            event.beat >= selectedEvent.event.beat)),
    )
    .sort(
      (first, second) =>
        first.measureIndex - second.measureIndex ||
        first.event.beat - second.event.beat,
    )
    .slice(0, lyricCount)
    .map(({ event }) => event.id);
}

const DEMO_SCORE_OPTIONS = scoreFixtureCatalog.map((fixture) => ({
  id: fixture.id,
  label: fixture.label,
}));
const CLOUD_SYNC_STATUS_LABEL = getCloudSyncStatusLabel(
  DISABLED_CLOUD_SYNC_CONFIG,
);

const loadPracticePage = () => import('../practice/PracticePage');
const PracticePage = lazy(() =>
  loadPracticePage().then((module) => ({ default: module.PracticePage })),
);

function SheetLabApp() {
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
  const {
    clearSelection,
    selectedClefChange,
    selectedEventId,
    selectedEventSource,
    selectedMeasure,
    selectedPitchIndex,
    selectEvent,
    selectClefChange,
    selectMeasure,
    setSelectedMeasure,
  } = useEditorSelection();
  const {
    clearPointerState,
    handleKeyboardCursorDurationChange,
    handleKeyboardCursorMove,
    handleKeyboardCursorStaffChange,
    handleKeyboardPitchStepInput,
    handleKeyboardPlaceAtCursor,
    handleHoverPositionChange,
    handlePlaceAtPosition,
    hoverPosition,
    inputCursor,
  } = useCursorPlacement({
    clearSelection,
    commitScoreChange,
    markInvalidMeasure,
    onInactivePlace: handleClearInteraction,
    score,
    setEditorMessage,
    toolState,
    updateToolState,
  });
  const {
    clearMeasureUiState,
    getMeasureCount,
    handleClearMeasureContent,
    handleConfirmClearMeasureContent,
    handleConfirmDeleteMeasure,
    handleInsertMeasureAfter,
    handleInsertMeasureBefore,
    handleRequestClearMeasureContent,
    handleRequestDeleteMeasure,
    measureContextMenu,
    openMeasureContextMenu,
    pendingMeasureClear,
    pendingMeasureDelete,
    setPendingMeasureClear,
    setPendingMeasureDelete,
  } = useMeasureEditing({
    clearSelection,
    commitScoreChange,
    score,
    selectedMeasure,
    selectMeasure,
  });
  const [openPalette, setOpenPalette] = useState<ToolbarPalette>(null);
  const [appMode, setAppMode] = useState<'editor' | 'practice'>('editor');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [annotationContextMenu, setAnnotationContextMenu] =
    useState<AnnotationContextMenuState | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] =
    useState<AnnotationTarget | null>(null);
  const notationViewportRef = useRef<HTMLDivElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const [referenceBackground, setReferenceBackground] =
    useState<ReferenceBackground | null>(null);
  const authSession = useAuthSession();
  const { canvasZoom, handleCanvasZoomChange } =
    useCanvasZoom(notationViewportRef);

  useEffect(() => {
    if (isPdfExportMode()) {
      return;
    }

    const autosaveTimer = window.setTimeout(() => {
      saveAutosaveToStorage(score);
    }, 800);

    return () => window.clearTimeout(autosaveTimer);
  }, [score]);

  useEffect(
    () => () => {
      if (referenceBackground?.url) {
        URL.revokeObjectURL(referenceBackground.url);
      }
    },
    [referenceBackground?.url],
  );

  function clearTransientInteraction() {
    clearPointerState();
    clearMeasureUiState();
    setAnnotationContextMenu(null);
    setSelectedAnnotation(null);
    clearSelection();
  }

  function updateScoreMetadata(update: Partial<Pick<Score, 'composer' | 'title'>>) {
    setScore((currentScore) => ({
      ...currentScore,
      ...update,
    }));
  }

  async function handleImportReferenceFile(fileList: FileList | null) {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    const isPdfFile =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImageFile = file.type.startsWith('image/');

    if (!isPdfFile && !isImageFile) {
      setEditorMessage('Reference must be an image or PDF');
      if (referenceInputRef.current) {
        referenceInputRef.current.value = '';
      }
      return;
    }

    setReferenceBackground({
      kind: isPdfFile ? 'pdf' : 'image',
      name: file.name,
      opacity: 0.28,
      url: URL.createObjectURL(file),
    });
    setEditorMessage(`Reference loaded: ${file.name}`);

    if (referenceInputRef.current) {
      referenceInputRef.current.value = '';
    }
  }

  function handleReferenceOpacityChange(value: string) {
    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue)) {
      return;
    }

    setReferenceBackground((current) =>
      current
        ? {
            ...current,
            opacity: Math.min(0.85, Math.max(0.05, parsedValue / 100)),
          }
        : current,
    );
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

  const {
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
  } = useScoreEventEditing({
    clearMeasureSelection: () => setSelectedMeasure(null),
    clearMeasureUiState,
    clearPointerState,
    clearSelection,
    commitScoreChange,
    markInvalidMeasure,
    onRequestClearMeasureContent: handleRequestClearMeasureContent,
    score,
    selectEvent,
    selectedEventId,
    selectedEventSource,
    selectedMeasure,
    selectedPitchIndex,
    setEditorMessage,
    toolState,
    updateToolState,
  });

  const {
    activeKeySignatureSelection,
    activeRepeatJump,
    handleAddMeasure,
    handleKeySignatureChange,
    handleMoveKeySignatureSymbol,
    handlePageSizeChange,
    handleRepeatJumpChange,
    handleResetScore,
    handleScoreTypeChange,
    handleSectionMarkerChange,
    handleTempoChange,
    handleTimeSignatureChange,
  } = useScoreCommands({
    clearPointerState,
    clearTransientInteraction,
    commitScoreChange,
    hoverPosition,
    inputCursor,
    score,
    scrollNotationIntoView,
    selectMeasure,
    selectedEventId,
    selectedMeasure,
    setEditorMessage,
    setOpenPalette,
    setScore,
    setSelectedMeasure,
    toolState,
    updateToolState,
  });

  function handleClearInteraction() {
    updateToolState({ clefChange: null, isInputArmed: false, tuplet: null });
    clearTransientInteraction();
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

  function handleMeasureContextMenu(
    staffId: StaffId,
    measureIndex: number,
    clientX: number,
    clientY: number,
  ) {
    updateToolState({ clefChange: null, isInputArmed: false });
    clearPointerState();
    setSelectedAnnotation(null);
    openMeasureContextMenu({ staffId, measureIndex }, clientX, clientY);
    setEditorMessage('Measure selected');
  }

  function handleEntryModeChange(entryMode: EntryMode) {
    updateToolState({ clefChange: null, entryMode });
    setEditorMessage(entryMode === 'note' ? 'Note entry enabled' : 'Rest entry enabled');
  }

  function handleVoiceIndexChange(voiceIndex: EditableVoiceIndex) {
    updateToolState({ voiceIndex });
    setEditorMessage(VOICE_LABEL[voiceIndex]);
  }

  function handlePlacementModeChange(placementMode: PlacementMode) {
    updateToolState({ placementMode });
    setEditorMessage(`${PLACEMENT_MODE_LABEL[placementMode]} mode`);
  }

  function handleClefChangeToolChange(clef: Clef) {
    if (selectedClefChange) {
      const foundClefChange = findClefChange(
        score,
        selectedClefChange.staffId,
        selectedClefChange.clefChangeId,
      );

      if (foundClefChange) {
        const result = trySetClefChange(
          score,
          selectedClefChange.staffId,
          foundClefChange.measureIndex,
          foundClefChange.change.beat,
          clef,
        );

        updateToolState({
          clefChange: null,
          isInputArmed: false,
          tuplet: null,
        });
        clearPointerState();
        clearMeasureUiState();

        if (result.updated) {
          commitScoreChange(result.score, 'Clef change updated');
          selectClefChange({
            clefChangeId: selectedClefChange.clefChangeId,
            measureIndex: foundClefChange.measureIndex,
            staffId: selectedClefChange.staffId,
          });
          setEditorMessage(`Clef change set to ${clef}`);
        } else {
          markInvalidMeasure(
            selectedClefChange.staffId,
            foundClefChange.measureIndex,
            `Cannot replace clef: ${result.reason}`,
          );
        }

        return;
      }

      clearSelection();
    }

    updateToolState({
      clefChange: clef,
      isInputArmed: true,
      placementMode: 'insert',
      tuplet: null,
    });
    clearPointerState();
    clearMeasureUiState();
    clearSelection();
    setEditorMessage(`Insert ${clef} clef`);
  }

  function handleSelectClefChange(target: ClefChangeTarget) {
    const foundClefChange = findClefChange(
      score,
      target.staffId,
      target.clefChangeId,
    );

    updateToolState({ clefChange: null, isInputArmed: false, tuplet: null });
    clearPointerState();
    clearMeasureUiState();
    setSelectedAnnotation(null);
    selectClefChange(target);
    setEditorMessage(
      foundClefChange
        ? `${foundClefChange.change.clef} clef change selected`
        : 'Clef change selected',
    );
  }

  function handleDeleteClefChange(target = selectedClefChange) {
    if (!target) {
      return;
    }

    const foundClefChange = findClefChange(
      score,
      target.staffId,
      target.clefChangeId,
    );

    if (!foundClefChange) {
      clearSelection();
      setEditorMessage('Clef change not found');
      return;
    }

    commitScoreChange(
      deleteClefChange(score, target.staffId, target.clefChangeId),
      'Clef change deleted',
    );
    updateToolState({ clefChange: null, isInputArmed: false, tuplet: null });
    clearPointerState();
    clearSelection();
  }

  function handleDeleteCurrentSelection() {
    if (selectedClefChange) {
      handleDeleteClefChange(selectedClefChange);
      return;
    }

    handleDeleteSelected();
  }

  function handleMoveClefChange(
    target: ClefChangeTarget,
    position: MusicPosition,
  ) {
    const dropPosition = snapInsertPositionToEventBoundary(
      score,
      position,
      toolState.voiceIndex,
    );
    const targetEvent = getInsertTargetEvent(
      score,
      dropPosition,
      toolState.voiceIndex,
    );

    if (!targetEvent) {
      markInvalidMeasure(
        dropPosition.staffId,
        dropPosition.measureIndex,
        'Cannot move clef: target-note-required',
      );
      clearPointerState();
      return;
    }

    const result = tryMoveClefChange(
      score,
      target.staffId,
      target.clefChangeId,
      dropPosition.staffId,
      dropPosition.measureIndex,
      targetEvent.beat,
    );

    updateToolState({ clefChange: null, isInputArmed: false, tuplet: null });
    clearPointerState();

    if (result.updated) {
      commitScoreChange(result.score, 'Clef change moved');
      selectClefChange({
        clefChangeId: target.clefChangeId,
        measureIndex: dropPosition.measureIndex,
        staffId: dropPosition.staffId,
      });
    } else {
      markInvalidMeasure(
        dropPosition.staffId,
        dropPosition.measureIndex,
        `Cannot move clef: ${result.reason}`,
      );
    }
  }

  function handleSelectMeasure(staffId: StaffId, measureIndex: number) {
    updateToolState({ clefChange: null, isInputArmed: false, tuplet: null });
    clearPointerState();
    clearMeasureUiState();
    setSelectedAnnotation(null);
    selectMeasure({ staffId, measureIndex });
    setEditorMessage('Measure selected');
  }

  function handleSelectAnnotation(target: AnnotationTarget) {
    updateToolState({ clefChange: null, isInputArmed: false, tuplet: null });
    clearPointerState();
    clearMeasureUiState();
    setAnnotationContextMenu(null);
    selectEvent(target.eventId, null);
    setSelectedAnnotation(target);
    setEditorMessage('Annotation selected');
  }

  const {
    handleAnnotationContextMenu,
    handleAnnotationOffsetChange,
    handleAnnotationPlacementChange,
    handleLyricMapChange,
    handleSelectedEventAnnotationChange,
  } = useAnnotationCommands({
    annotationContextMenu,
    clearMeasureUiState,
    clearPointerState,
    commitScoreChange,
    score,
    selectAnnotation: handleSelectAnnotation,
    selectEvent,
    selectedEventId,
    setAnnotationContextMenu,
    setEditorMessage,
    updateToolState,
  });

  function handleSelectEvent(eventId: string, pitchIndex?: number | null) {
    const selectionEventId = findLyricMapSourceEventId(score, eventId);
    const foundEvent = findScoreEvent(score, selectionEventId);
    const selectedPitchIndex =
      selectionEventId === eventId ? pitchIndex ?? null : null;

    updateToolState({
      clefChange: null,
      isInputArmed: false,
      tuplet: null,
      voiceIndex:
        foundEvent?.voiceIndex === 1 || foundEvent?.voiceIndex === 0
          ? foundEvent.voiceIndex
          : toolState.voiceIndex,
    });
    clearPointerState();
    setSelectedAnnotation(null);
    selectEvent(selectionEventId, selectedPitchIndex);
    setEditorMessage(
      selectedPitchIndex !== null && selectedPitchIndex !== undefined
        ? 'Notehead selected'
        : selectionEventId === eventId
          ? 'Event selected'
          : 'Mapped lyric selected',
    );
  }

  function handleSelectAdjacentEvent(direction: -1 | 1) {
    const target = getAdjacentSelectableScoreEvent(
      score,
      selectedEventId,
      direction,
    );

    if (!target) {
      setEditorMessage('No event to select');
      return;
    }

    handleSelectEvent(target.event.id);
  }

  function handleTieToNextToggle() {
    if (!selectedEventId) {
      return;
    }

    const result = tryToggleTieToNext(
      score,
      selectedEventId,
      selectedPitchIndex,
    );

    if (result.updated) {
      commitScoreChange(result.score, 'Tie updated');
      selectEvent(selectedEventId, selectedPitchIndex);
    } else {
      setEditorMessage(`Cannot tie: ${result.reason}`);
    }
  }

  function handleSlurToNextToggle() {
    if (!selectedEventId) {
      return;
    }

    const result = tryToggleSlurToNext(score, selectedEventId);

    if (result.updated) {
      commitScoreChange(result.score, 'Slur updated');
      selectEvent(selectedEventId, selectedPitchIndex);
    } else {
      setEditorMessage(`Cannot slur: ${result.reason}`);
    }
  }

  function handleOttavaToggle(ottava: OttavaKind) {
    if (!selectedEventId) {
      return;
    }

    const result = tryToggleOttavaToNext(score, selectedEventId, ottava);

    if (result.updated) {
      commitScoreChange(result.score, `${OTTAVA_LABEL[ottava]} updated`);
      selectEvent(selectedEventId, selectedPitchIndex);
    } else {
      setEditorMessage(`Cannot set ${OTTAVA_LABEL[ottava]}: ${result.reason}`);
    }
  }

  function handleOttavaClear() {
    if (!selectedEventId) {
      return;
    }

    const result = tryClearOttavaForEvent(score, selectedEventId);

    if (result.updated) {
      commitScoreChange(result.score, 'Ottava cleared');
      selectEvent(selectedEventId, selectedPitchIndex);
    } else {
      setEditorMessage('No ottava range on selected note');
    }
  }

  function handleLyricBulkApply(lyrics: string[]) {
    const sourceEventId = selectedEventId;

    if (!sourceEventId) {
      setEditorMessage('Select a note before applying lyric line');
      return;
    }

    const targetEventIds = getLyricBulkTargetEventIds(
      score,
      sourceEventId,
      lyrics.length,
    );

    if (targetEventIds.length === 0) {
      setEditorMessage('Select a note before applying lyric line');
      return;
    }

    const nextScore = targetEventIds.reduce((currentScore, eventId, index) => {
      const result = tryUpdateScoreEvent(currentScore, eventId, {
        lyric: lyrics[index] ?? null,
      });

      return result.updated ? result.score : currentScore;
    }, score);

    commitScoreChange(nextScore, `Applied ${targetEventIds.length} lyric syllables`);
    selectEvent(sourceEventId, selectedPitchIndex);
  }

  const { handleRedo, handleUndo } = useUndoRedoControls({
    clearTransientInteraction,
    futureScores,
    pastScores,
    score,
    setEditorMessage,
    setFutureScores,
    setInvalidMeasureKeys,
    setPastScores,
    setScore,
    updateToolState,
  });

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
      clefChange: null,
      isInputArmed: false,
      tuplet: null,
    }));
    clearTransientInteraction();
    if (options?.closePalette) {
      setOpenPalette(null);
    }
  }

  const {
    handleDownloadAbc,
    handleDownloadProject,
    handleExportPdf,
    handleImportAbcFile,
    handleImportExternalScoreFile,
    handleImportProjectFile,
    handleLoadAutosave,
    handleLoadProject,
    handleLoadProjectFromLibrary,
    handleSaveProject: handleSaveProjectLocally,
    importAbcInputRef,
    importExternalScoreInputRef,
    importInputRef,
    projectLibrary,
  } = useProjectActions({
    onScoreLoaded: handleLoadedScoreFromFile,
    score,
    setEditorMessage,
  });
  const {
    cloudScores,
    cloudStatusLabel,
    isLoadingCloudScores,
    loadScoreFromCloud,
    refreshCloudScores,
    saveScoreToCloud,
  } = useCloudScores({
    onScoreLoaded: handleLoadedScoreFromFile,
    setEditorMessage,
    user: authSession.user,
  });
  const {
    activePlaybackEvent,
    activePlaybackEventIds,
    handlePlaybackFromSelectedEvent,
    handlePlaybackStop,
    handlePlaybackToggle,
    isPlaybackPaused,
    isPlaying,
    playbackBeat,
  } = usePlaybackController({
    score,
    setEditorMessage,
  });
  const rhythmIssues = useMemo(() => getScoreRhythmIssues(score), [score]);
  const musicIssues = useMemo(
    () => getScoreMusicIssues(score, rhythmIssues),
    [rhythmIssues, score],
  );
  const blockingMusicIssues = musicIssues.filter(
    (issue) => issue.severity === 'error',
  );
  const selectedScoreEvent = selectedEventId
    ? findScoreEvent(score, selectedEventId)
    : null;
  const canFlipSelection = Boolean(
    selectedEventSource === 'manual' &&
      selectedScoreEvent &&
      isStemmedScoreEvent(selectedScoreEvent.event),
  );
  const activeInvalidMeasureKeys = [
    ...new Set([
      ...invalidMeasureKeys,
      ...rhythmIssues.map((issue) =>
        getMeasureKey(issue.staffId, issue.measureIndex),
      ),
      ...blockingMusicIssues.flatMap((issue) =>
        issue.staffId !== undefined && issue.measureIndex !== undefined
          ? [getMeasureKey(issue.staffId, issue.measureIndex)]
          : [],
      ),
    ]),
  ];

  function handlePracticeOpen() {
    if (isPlaying || isPlaybackPaused) {
      handlePlaybackStop('Playback stopped');
    }

    setOpenPalette(null);
    setIsCommandPaletteOpen(false);
    clearTransientInteraction();
    setAppMode('practice');
    setEditorMessage('Practice mode');
  }

  function handleSaveProject() {
    handleSaveProjectLocally();
    void saveScoreToCloud(score);
  }

  function handleDemoScoreLoad(fixtureId: string) {
    const fixture = getScoreFixtureById(fixtureId);

    if (!fixture) {
      setEditorMessage('Demo score not found');
      return;
    }

    handleLoadedScoreFromFile(
      cloneDemoScore(fixture.score),
      `Demo loaded: ${fixture.label}`,
      { closePalette: true },
    );
  }

  function handleReviewFirstRhythmIssue() {
    const firstIssue = rhythmIssues[0];

    if (!firstIssue) {
      setEditorMessage('Rhythm OK');
      return;
    }

    selectMeasure({
      measureIndex: firstIssue.measureIndex,
      staffId: firstIssue.staffId,
    });
    setInvalidMeasureKeys(activeInvalidMeasureKeys);
    scrollNotationIntoView();
    setEditorMessage(
      `Review rhythm issue: ${firstIssue.staffId} measure ${
        firstIssue.measureIndex + 1
      } ${firstIssue.reason}`,
    );
  }

  function handleReviewFirstMusicIssue() {
    const firstIssue = musicIssues[0];

    if (!firstIssue) {
      setEditorMessage('Music validation OK');
      return;
    }

    if (firstIssue.staffId !== undefined && firstIssue.measureIndex !== undefined) {
      selectMeasure({
        measureIndex: firstIssue.measureIndex,
        staffId: firstIssue.staffId,
      });
    }
    setInvalidMeasureKeys(activeInvalidMeasureKeys);
    scrollNotationIntoView();
    setEditorMessage(`Review music issue: ${firstIssue.message}`);
  }

  function handleExportPdfWithPreflight() {
    if (blockingMusicIssues.length > 0) {
      const firstIssue = blockingMusicIssues[0];

      if (
        firstIssue?.staffId !== undefined &&
        firstIssue.measureIndex !== undefined
      ) {
        selectMeasure({
          measureIndex: firstIssue.measureIndex,
          staffId: firstIssue.staffId,
        });
        scrollNotationIntoView();
      }

      setInvalidMeasureKeys(activeInvalidMeasureKeys);
      setEditorMessage(getMusicIssuePreflightMessage(blockingMusicIssues));
      return;
    }

    void handleExportPdf();
  }

  function handleCommandPaletteOpen() {
    setOpenPalette(null);
    setIsCommandPaletteOpen(true);
  }

  function handlePlaybackShortcut() {
    if (isPlaying || isPlaybackPaused) {
      void handlePlaybackToggle();
      return;
    }

    if (selectedEventId) {
      void handlePlaybackFromSelectedEvent(selectedEventId);
      return;
    }

    void handlePlaybackToggle();
  }

  function handleSelectedAnnotationNudge({
    deltaX = 0,
    deltaY = 0,
    reset = false,
  }: {
    deltaX?: number;
    deltaY?: number;
    reset?: boolean;
  }) {
    if (!selectedAnnotation) {
      return;
    }

    const found = findScoreEvent(score, selectedAnnotation.eventId);

    if (!found) {
      setSelectedAnnotation(null);
      setEditorMessage('Annotation not found');
      return;
    }

    const currentOffset = getEventAnnotationOffset(
      found.event,
      selectedAnnotation.kind,
    );
    const nextOffset = reset
      ? { x: 0, y: 0 }
      : {
          x: currentOffset.x + deltaX,
          y: currentOffset.y + deltaY,
        };
    const result = tryUpdateScoreEvent(score, selectedAnnotation.eventId, {
      annotationOffset: {
        kind: selectedAnnotation.kind,
        offset: nextOffset,
      },
    });

    if (result.updated) {
      commitScoreChange(
        result.score,
        reset ? 'Annotation position reset' : 'Annotation nudged',
      );
      selectEvent(selectedAnnotation.eventId, null);
      setSelectedAnnotation(selectedAnnotation);
    } else {
      setEditorMessage(`Cannot move annotation: ${result.reason}`);
    }
  }

  const canUseTrebleStaff = scoreHasStaff(score, 'treble');
  const canUseBassStaff = scoreHasStaff(score, 'bass');
  const commandPaletteCommands: CommandPaletteCommand[] = [
    {
      group: 'Mode',
      id: 'select-tool',
      label: 'Select tool',
      run: handleClearInteraction,
      shortcut: 'Esc',
    },
    ...DURATION_OPTIONS.map((duration, index) => ({
      group: 'Duration',
      id: `duration-${duration}`,
      label: DURATION_LABEL[duration],
      run: () => handleDurationChange(duration),
      shortcut: String(7 - index),
    })),
    {
      group: 'Duration',
      id: 'toggle-dotted',
      label: toolState.dots > 0 ? 'Disable dotted note' : 'Enable dotted note',
      run: () => handleDottedChange(toolState.dots === 0),
      shortcut: '.',
    },
    {
      group: 'Entry',
      id: 'entry-note',
      label: 'Note entry',
      run: () => handleEntryModeChange('note'),
      shortcut: 'A-G',
    },
    {
      group: 'Entry',
      id: 'entry-rest',
      label: 'Rest entry',
      run: () => handleEntryModeChange('rest'),
      shortcut: 'R',
    },
    {
      disabled: !canUseTrebleStaff,
      group: 'Piano',
      id: 'right-hand-input',
      label: 'Right hand input',
      run: () => handleKeyboardCursorStaffChange('treble'),
      shortcut: 'PageUp',
    },
    {
      disabled: !canUseBassStaff,
      group: 'Piano',
      id: 'left-hand-input',
      label: 'Left hand input',
      run: () => handleKeyboardCursorStaffChange('bass'),
      shortcut: 'PageDown',
    },
    {
      disabled:
        !selectedEventId ||
        selectedEventSource !== 'manual' ||
        !canUseTrebleStaff,
      group: 'Piano',
      id: 'move-selected-right-hand',
      label: 'Move selected event to right hand staff',
      run: () => handleMoveSelectedEventToStaff('treble'),
    },
    {
      disabled:
        !selectedEventId ||
        selectedEventSource !== 'manual' ||
        !canUseBassStaff,
      group: 'Piano',
      id: 'move-selected-left-hand',
      label: 'Move selected event to left hand staff',
      run: () => handleMoveSelectedEventToStaff('bass'),
    },
    {
      group: 'Placement',
      id: 'placement-place',
      label: PLACEMENT_MODE_LABEL.place,
      run: () => handlePlacementModeChange('place'),
    },
    {
      group: 'Placement',
      id: 'placement-insert',
      label: PLACEMENT_MODE_LABEL.insert,
      run: () => handlePlacementModeChange('insert'),
      shortcut: 'I',
    },
    ...VOICE_OPTIONS.map((voiceIndex) => ({
      group: 'Voice',
      id: `voice-${voiceIndex + 1}`,
      label: VOICE_LABEL[voiceIndex],
      run: () => handleVoiceIndexChange(voiceIndex),
    })),
    ...(['none', 'natural', 'sharp', 'flat'] as const).map((accidental) => ({
      group: 'Accidental',
      id: `accidental-${accidental}`,
      label: ACCIDENTAL_LABEL[accidental],
      run: () => handleAccidentalChange(accidental),
    })),
    {
      group: 'Tuplet',
      id: 'tuplet-off',
      label: 'Tuplet off',
      run: () => handleTupletChange(null),
      shortcut: 'Ctrl/Cmd+0',
    },
    ...SUPPORTED_TUPLET_ACTUAL_NOTES.map((actualNotes) => ({
      group: 'Tuplet',
      id: `tuplet-${actualNotes}`,
      label:
        actualNotes === 3
          ? `Triplet ${actualNotes}:${getDefaultTupletNormalNotes(actualNotes)}`
          : `Tuplet ${actualNotes}:${getDefaultTupletNormalNotes(actualNotes)}`,
      run: () => handleTupletChange(actualNotes),
      shortcut: `Ctrl/Cmd+${actualNotes}`,
    })),
    {
      disabled: !canFlipSelection,
      group: 'Edit',
      id: 'flip-direction',
      label: 'Flip selected direction',
      run: handleFlipSelectedDirection,
      shortcut: 'X',
    },
    {
      disabled: !selectedEventId && !selectedMeasure && !selectedClefChange,
      group: 'Edit',
      id: 'delete-selection',
      label: 'Delete selected item',
      run: handleDeleteCurrentSelection,
      shortcut: 'Del',
    },
    {
      disabled: pastScores.length === 0,
      group: 'History',
      id: 'undo',
      label: 'Undo',
      run: handleUndo,
      shortcut: 'Ctrl/Cmd+Z',
    },
    {
      disabled: futureScores.length === 0,
      group: 'History',
      id: 'redo',
      label: 'Redo',
      run: handleRedo,
      shortcut: 'Ctrl/Cmd+Y',
    },
    {
      group: 'View',
      id: 'toggle-fingering-hints',
      label: toolState.showFingeringHints
        ? 'Hide fingering hints'
        : 'Show fingering hints',
      run: () =>
        updateToolState({
          showFingeringHints: !toolState.showFingeringHints,
        }),
    },
    {
      group: 'View',
      id: 'toggle-lyric-map',
      label: toolState.showLyricMap ? 'Hide lyric map' : 'Show lyric map',
      run: () => updateToolState({ showLyricMap: !toolState.showLyricMap }),
    },
    {
      group: 'View',
      id: 'toggle-measure-numbers',
      label: toolState.showMeasureNumbers
        ? 'Hide measure numbers'
        : 'Show measure numbers',
      run: () =>
        updateToolState({
          showMeasureNumbers: !toolState.showMeasureNumbers,
        }),
    },
    {
      group: 'View',
      id: 'toggle-layout-zones',
      label: toolState.showLayoutZones ? 'Hide layout zones' : 'Show layout zones',
      run: () => updateToolState({ showLayoutZones: !toolState.showLayoutZones }),
    },
    {
      group: 'Transport',
      id: 'playback-toggle',
      label: isPlaying
        ? 'Pause playback'
        : isPlaybackPaused
          ? 'Resume playback'
          : 'Play from start',
      run: () => void handlePlaybackToggle(),
      shortcut: 'Space',
    },
    {
      disabled: isPlaying || isPlaybackPaused || !selectedEventId,
      group: 'Transport',
      id: 'playback-from-selected',
      label: 'Play from selected event',
      run: () => void handlePlaybackFromSelectedEvent(selectedEventId),
    },
    {
      group: 'Practice',
      id: 'practice-mode',
      label: 'Practice mode',
      run: handlePracticeOpen,
    },
    {
      group: 'Score',
      id: 'add-measure',
      label: 'Add measure',
      run: handleAddMeasure,
    },
  ];

  useEditorShortcuts({
    disabled: appMode === 'practice',
    futureScores,
    inputCursorActive: Boolean(inputCursor),
    isInputArmed: toolState.isInputArmed,
    onClearShortcut: handleClearInteraction,
    onCommandPaletteShortcut: handleCommandPaletteOpen,
    onDottedShortcut: () => handleDottedChange(toolState.dots === 0),
    onDeleteClefChange: handleDeleteClefChange,
    onDeleteEvent: handleDeleteEvent,
    onDurationShortcut: handleDurationChange,
    onEntryModeShortcut: handleEntryModeChange,
    onFlipDirection: handleFlipSelectedDirection,
    onKeyboardCursorDurationChange: handleKeyboardCursorDurationChange,
    onKeyboardCursorMove: handleKeyboardCursorMove,
    onKeyboardPitchStepInput: handleKeyboardPitchStepInput,
    onKeyboardPlaceAtCursor: handleKeyboardPlaceAtCursor,
    onNudgeSelectedAnnotation: handleSelectedAnnotationNudge,
    onPlacementModeShortcut: handlePlacementModeChange,
    onPlaybackShortcut: handlePlaybackShortcut,
    onRedo: handleRedo,
    onRequestClearMeasureContent: handleRequestClearMeasureContent,
    onSelectAdjacentEvent: handleSelectAdjacentEvent,
    onTransposeSelectedPitch: handleTransposeSelectedPitch,
    onTupletShortcut: handleTupletChange,
    onUndo: handleUndo,
    pastScores,
    score,
    selectedClefChange,
    selectedAnnotation,
    selectedEventId,
    selectedMeasure,
    selectedPitchIndex,
    toolDots: toolState.dots,
    toolDuration: toolState.duration,
    toolEntryMode: toolState.entryMode,
    toolPlacementMode: toolState.placementMode,
  });

  if (appMode === 'practice') {
    return (
      <Suspense
        fallback={
          <main className="app-shell practice-shell" data-testid="practice-loading">
            <div className="practice-loading">Loading practice</div>
          </main>
        }
      >
        <PracticePage
          cloudUserId={authSession.user?.id ?? null}
          score={score}
          showMeasureNumbers={toolState.showMeasureNumbers}
          onMeasureNumbersToggle={(showMeasureNumbers) =>
            updateToolState({ showMeasureNumbers })
          }
          onBackToEditor={() => {
            setAppMode('editor');
            setEditorMessage('Editor mode');
          }}
        />
      </Suspense>
    );
  }

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

        <AuthControls
          cloudScores={cloudScores}
          cloudStatusLabel={
            authSession.status === 'loading' ? 'Checking cloud' : cloudStatusLabel
          }
          isConfigured={authSession.isConfigured}
          isLoadingCloudScores={isLoadingCloudScores}
          user={authSession.user}
          onAuthOpen={() => setIsAuthModalOpen(true)}
          onCloudScoreLoad={(cloudScoreId) => void loadScoreFromCloud(cloudScoreId)}
          onCloudScoresRefresh={() => void refreshCloudScores()}
          onSignOut={() => {
            void authSession.signOut();
            setEditorMessage('Signed out');
          }}
        />

        <EditorToolbar
          activeKeySignatureSelection={activeKeySignatureSelection}
          activeRepeatJump={activeRepeatJump}
          canvasZoom={canvasZoom}
          cloudStatusLabel={
            authSession.user ? cloudStatusLabel : CLOUD_SYNC_STATUS_LABEL
          }
          futureScoreCount={futureScores.length}
          importAbcInputRef={importAbcInputRef}
          importExternalScoreInputRef={importExternalScoreInputRef}
          importInputRef={importInputRef}
          importReferenceInputRef={referenceInputRef}
          isPlaybackPaused={isPlaybackPaused}
          isPlaying={isPlaying}
          openPalette={openPalette}
          pastScoreCount={pastScores.length}
          projectLibraryOptions={projectLibrary}
          scoreTimeSignature={score.timeSignature}
          demoScoreOptions={DEMO_SCORE_OPTIONS}
          canDeleteSelection={Boolean(
            selectedEventId || selectedMeasure || selectedClefChange,
          )}
          canFlipSelection={canFlipSelection}
          inputCursor={inputCursor}
          toolState={toolState}
          onAccidentalChange={handleAccidentalChange}
          onAddMeasure={handleAddMeasure}
          onCanvasZoomChange={handleCanvasZoomChange}
          onClefChangeToolChange={handleClefChangeToolChange}
          onClearInteraction={handleClearInteraction}
          onCommandPaletteOpen={handleCommandPaletteOpen}
          onDeleteSelected={handleDeleteCurrentSelection}
          onDottedChange={handleDottedChange}
          onDownloadAbc={handleDownloadAbc}
          onDownloadProject={handleDownloadProject}
          onDurationChange={handleDurationChange}
          onDemoScoreLoad={handleDemoScoreLoad}
          onEntryModeChange={handleEntryModeChange}
          onExportPdf={handleExportPdfWithPreflight}
          onFlipDirection={handleFlipSelectedDirection}
          onImportAbcFile={handleImportAbcFile}
          onImportExternalScoreFile={handleImportExternalScoreFile}
          onImportProjectFile={handleImportProjectFile}
          onImportReferenceFile={handleImportReferenceFile}
          onKeySignatureChange={handleKeySignatureChange}
          onFingeringHintsToggle={(showFingeringHints) =>
            updateToolState({ showFingeringHints })
          }
          onLayoutZoneToggle={(showLayoutZones) =>
            updateToolState({ showLayoutZones })
          }
          onLoadProject={handleLoadProject}
          onLoadAutosave={handleLoadAutosave}
          onProjectLibraryLoad={handleLoadProjectFromLibrary}
          onLyricMapToggle={(showLyricMap) => updateToolState({ showLyricMap })}
          onMeasureNumbersToggle={(showMeasureNumbers) =>
            updateToolState({ showMeasureNumbers })
          }
          onOpenPaletteChange={setOpenPalette}
          onPlacementModeChange={handlePlacementModeChange}
          onPlaybackStop={handlePlaybackStop}
          onPlaybackToggle={handlePlaybackToggle}
          onPracticeOpen={handlePracticeOpen}
          onPracticePreload={() => void loadPracticePage()}
          onRedo={handleRedo}
          onReferenceClear={() => setReferenceBackground(null)}
          onReferenceOpacityChange={handleReferenceOpacityChange}
          onRepeatJumpChange={handleRepeatJumpChange}
          onResetScore={handleResetScore}
          onSaveProject={handleSaveProject}
          onTimeSignatureChange={handleTimeSignatureChange}
          onTupletChange={handleTupletChange}
          onUndo={handleUndo}
          onVoiceIndexChange={handleVoiceIndexChange}
          referenceBackgroundName={referenceBackground?.name ?? null}
          referenceOpacity={Math.round((referenceBackground?.opacity ?? 0.28) * 100)}
        />
      </header>
      {isAuthModalOpen ? (
        <AuthModal onClose={() => setIsAuthModalOpen(false)} />
      ) : null}

      <section className="workspace">
        <ScoreSettingsPanel
          canvasZoom={canvasZoom}
          editorMessage={editorMessage}
          futureScoreCount={futureScores.length}
          hoverPosition={hoverPosition}
          inputCursor={inputCursor}
          pastScoreCount={pastScores.length}
          musicIssueCount={musicIssues.length}
          rhythmIssueCount={rhythmIssues.length}
          score={score}
          selectedEventId={selectedEventId}
          selectedClefChange={selectedClefChange}
          selectedMeasure={selectedMeasure}
          selectedPitchIndex={selectedPitchIndex}
          toolState={toolState}
          onArticulationClear={() =>
            handleSelectedEventAnnotationChange(
              { articulations: null },
              'Articulations cleared',
            )
          }
          onArticulationToggle={(articulation) => {
            const selectedEvent = selectedEventId
              ? findScoreEvent(score, selectedEventId)?.event
              : null;
            const nextArticulations = toggleArticulationKind(
              selectedEvent?.articulations,
              articulation,
            );

            handleSelectedEventAnnotationChange(
              { articulations: nextArticulations },
              nextArticulations?.includes(articulation)
                ? `${ARTICULATION_LABEL[articulation]} enabled`
                : `${ARTICULATION_LABEL[articulation]} disabled`,
            );
          }}
          onChordSymbolChange={(chordSymbol) =>
            handleSelectedEventAnnotationChange(
              { chordSymbol },
              chordSymbol ? 'Chord symbol updated' : 'Chord symbol cleared',
            )
          }
          onDynamicChange={(dynamic) =>
            handleSelectedEventAnnotationChange(
              { dynamic },
              dynamic ? 'Dynamic updated' : 'Dynamic cleared',
            )
          }
          onFermataChange={(fermata) =>
            handleSelectedEventAnnotationChange(
              { fermata },
              fermata ? 'Fermata enabled' : 'Fermata disabled',
            )
          }
          onGlissandoChange={(glissando) =>
            handleSelectedEventAnnotationChange(
              { glissando },
              glissando ? 'Glissando enabled' : 'Glissando disabled',
            )
          }
          onGraceNotesChange={(graceNotes) =>
            handleSelectedEventAnnotationChange(
              { graceNotes },
              graceNotes ? 'Grace notes updated' : 'Grace notes cleared',
            )
          }
          onHairpinChange={(hairpin) =>
            handleSelectedEventAnnotationChange(
              { hairpin },
              hairpin ? 'Hairpin updated' : 'Hairpin cleared',
            )
          }
          onPageSizeChange={handlePageSizeChange}
          onLyricChange={(lyric) =>
            handleSelectedEventAnnotationChange(
              { lyric },
              lyric ? 'Lyric updated' : 'Lyric cleared',
            )
          }
          onLyricBulkApply={handleLyricBulkApply}
          onOttavaClear={handleOttavaClear}
          onOttavaToggle={handleOttavaToggle}
          onPedalChange={(pedal) =>
            handleSelectedEventAnnotationChange(
              { pedal },
              pedal ? 'Pedal mark updated' : 'Pedal mark cleared',
            )
          }
          onReviewMusicIssue={handleReviewFirstMusicIssue}
          onReviewRhythmIssue={handleReviewFirstRhythmIssue}
          onScoreTypeChange={handleScoreTypeChange}
          onSectionMarkerChange={handleSectionMarkerChange}
          onSlurToNextToggle={handleSlurToNextToggle}
          onTempoChange={handleTempoChange}
          onTieToNextToggle={handleTieToNextToggle}
          onTimeSignatureChange={handleTimeSignatureChange}
        />

        <SheetSurface
          activeEventId={activePlaybackEvent?.id ?? null}
          activeEventIds={activePlaybackEventIds}
          activeInvalidMeasureKeys={activeInvalidMeasureKeys}
          annotationContextMenu={annotationContextMenu}
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
          referenceBackground={referenceBackground}
          score={score}
          selectedAnnotation={selectedAnnotation}
          selectedClefChange={selectedClefChange}
          selectedEventId={selectedEventId}
          selectedMeasure={selectedMeasure}
          selectedPitchIndex={selectedPitchIndex}
          toolState={toolState}
          onClearInteraction={handleClearInteraction}
          onClearMeasureContent={handleClearMeasureContent}
          onConfirmClearMeasureContent={handleConfirmClearMeasureContent}
          onConfirmDeleteMeasure={handleConfirmDeleteMeasure}
          onAnnotationContextMenu={handleAnnotationContextMenu}
          onAnnotationOffsetChange={handleAnnotationOffsetChange}
          onAnnotationPlacementChange={handleAnnotationPlacementChange}
          onDeleteEvent={handleDeleteEvent}
          onHoverPositionChange={handleHoverPositionChange}
          onInsertMeasureAfter={handleInsertMeasureAfter}
          onInsertMeasureBefore={handleInsertMeasureBefore}
          onLyricMapChange={handleLyricMapChange}
          onMeasureContextMenu={handleMeasureContextMenu}
          onMoveEvent={handleMoveEvent}
          onMoveKeySignatureSymbol={handleMoveKeySignatureSymbol}
          onMoveClefChange={handleMoveClefChange}
          onPlaceAtPosition={handlePlaceAtPosition}
          onRequestDeleteMeasure={handleRequestDeleteMeasure}
          onSelectAnnotation={handleSelectAnnotation}
          onSelectEvent={handleSelectEvent}
          onSelectClefChange={handleSelectClefChange}
          onSelectMeasure={handleSelectMeasure}
          onSetPendingMeasureClear={setPendingMeasureClear}
          onSetPendingMeasureDelete={setPendingMeasureDelete}
          onSetAnnotationContextMenu={setAnnotationContextMenu}
          onSheetStageClick={handleSheetStageClick}
          onUpdateScoreMetadata={updateScoreMetadata}
        />
        <CommandPalette
          commands={commandPaletteCommands}
          open={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
        />
      </section>
    </main>
  );
}

export default SheetLabApp;
