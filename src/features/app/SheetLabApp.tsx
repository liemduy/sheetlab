import { useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
} from 'react';
import { findScoreEvent } from '../../domain/score/editing';
import { findLyricMapSourceEventId } from '../../domain/score/lyricMapping';
import type {
  EditableVoiceIndex,
  EditorToolState,
  EntryMode,
  PlacementMode,
} from '../editor/editorState';
import { DEFAULT_EDITOR_TOOL_STATE } from '../editor/editorState';
import {
  EditorToolbar,
  type ToolbarPalette,
} from '../editor/EditorToolbar';
import { ScoreSettingsPanel } from '../editor/ScoreSettingsPanel';
import type { Score, StaffId } from '../../domain/score/types';
import { getScoreRhythmIssues } from '../../domain/score/rhythm';
import { getMeasureKey } from '../sheet/measureKey';
import { usePlaybackController } from './usePlaybackController';
import { useProjectActions } from './useProjectActions';
import { SheetSurface } from './SheetSurface';
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
import type { AnnotationContextMenuState } from './selectionTypes';
import {
  isPdfExportMode,
  loadInitialScoreForApp,
} from './appBootstrap';

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
    selectedEventId,
    selectedEventSource,
    selectedMeasure,
    selectedPitchIndex,
    selectEvent,
    selectMeasure,
    setSelectedMeasure,
  } = useEditorSelection();
  const {
    clearPointerState,
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
  const [annotationContextMenu, setAnnotationContextMenu] =
    useState<AnnotationContextMenuState | null>(null);
  const notationViewportRef = useRef<HTMLDivElement | null>(null);
  const { canvasZoom, handleCanvasZoomChange } =
    useCanvasZoom(notationViewportRef);

  function clearTransientInteraction() {
    clearPointerState();
    clearMeasureUiState();
    setAnnotationContextMenu(null);
    clearSelection();
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

  const {
    handleAccidentalChange,
    handleDeleteEvent,
    handleDeleteSelected,
    handleDottedChange,
    handleDurationChange,
    handleMoveEvent,
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
    updateToolState({ isInputArmed: false, tuplet: null });
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
    updateToolState({ isInputArmed: false });
    clearPointerState();
    openMeasureContextMenu({ staffId, measureIndex }, clientX, clientY);
    setEditorMessage('Measure selected');
  }

  function handleEntryModeChange(entryMode: EntryMode) {
    updateToolState({ entryMode });
  }

  function handleVoiceIndexChange(voiceIndex: EditableVoiceIndex) {
    updateToolState({ voiceIndex });
  }

  function handlePlacementModeChange(placementMode: PlacementMode) {
    updateToolState({ placementMode });
  }

  function handleSelectMeasure(staffId: StaffId, measureIndex: number) {
    updateToolState({ isInputArmed: false, tuplet: null });
    clearPointerState();
    clearMeasureUiState();
    selectMeasure({ staffId, measureIndex });
    setEditorMessage('Measure selected');
  }

  const {
    handleAnnotationContextMenu,
    handleAnnotationPlacementChange,
    handleLyricMapChange,
    handleSelectedEventAnnotationChange,
  } = useAnnotationCommands({
    annotationContextMenu,
    clearMeasureUiState,
    clearPointerState,
    commitScoreChange,
    score,
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
      isInputArmed: false,
      tuplet: null,
      voiceIndex:
        foundEvent?.voiceIndex === 1 || foundEvent?.voiceIndex === 0
          ? foundEvent.voiceIndex
          : toolState.voiceIndex,
    });
    clearPointerState();
    selectEvent(selectionEventId, selectedPitchIndex);
    setEditorMessage(
      selectedPitchIndex !== null && selectedPitchIndex !== undefined
        ? 'Notehead selected'
        : selectionEventId === eventId
          ? 'Event selected'
          : 'Mapped lyric selected',
    );
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
    activePlaybackEventIds,
    handlePlaybackToggle,
    isPlaying,
    playbackBeat,
  } = usePlaybackController({
    score,
    setEditorMessage,
  });
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
    onTransposeSelectedPitch: handleTransposeSelectedPitch,
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
          onLayoutZoneToggle={(showLayoutZones) =>
            updateToolState({ showLayoutZones })
          }
          onLoadProject={handleLoadProject}
          onLyricMapToggle={(showLyricMap) => updateToolState({ showLyricMap })}
          onOpenPaletteChange={setOpenPalette}
          onPlacementModeChange={handlePlacementModeChange}
          onPlaybackToggle={handlePlaybackToggle}
          onRedo={handleRedo}
          onRepeatJumpChange={handleRepeatJumpChange}
          onResetScore={handleResetScore}
          onSaveProject={handleSaveProject}
          onTimeSignatureChange={handleTimeSignatureChange}
          onTupletChange={handleTupletChange}
          onUndo={handleUndo}
          onVoiceIndexChange={handleVoiceIndexChange}
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
          onPageSizeChange={handlePageSizeChange}
          onLyricChange={(lyric) =>
            handleSelectedEventAnnotationChange(
              { lyric },
              lyric ? 'Lyric updated' : 'Lyric cleared',
            )
          }
          onPedalChange={(pedal) =>
            handleSelectedEventAnnotationChange(
              { pedal },
              pedal ? 'Pedal mark updated' : 'Pedal mark cleared',
            )
          }
          onScoreTypeChange={handleScoreTypeChange}
          onSectionMarkerChange={handleSectionMarkerChange}
          onTempoChange={handleTempoChange}
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
          score={score}
          selectedEventId={selectedEventId}
          selectedMeasure={selectedMeasure}
          selectedPitchIndex={selectedPitchIndex}
          toolState={toolState}
          onClearInteraction={handleClearInteraction}
          onClearMeasureContent={handleClearMeasureContent}
          onConfirmClearMeasureContent={handleConfirmClearMeasureContent}
          onConfirmDeleteMeasure={handleConfirmDeleteMeasure}
          onAnnotationContextMenu={handleAnnotationContextMenu}
          onAnnotationPlacementChange={handleAnnotationPlacementChange}
          onDeleteEvent={handleDeleteEvent}
          onHoverPositionChange={handleHoverPositionChange}
          onInsertMeasureAfter={handleInsertMeasureAfter}
          onInsertMeasureBefore={handleInsertMeasureBefore}
          onLyricMapChange={handleLyricMapChange}
          onMeasureContextMenu={handleMeasureContextMenu}
          onMoveEvent={handleMoveEvent}
          onMoveKeySignatureSymbol={handleMoveKeySignatureSymbol}
          onPlaceAtPosition={handlePlaceAtPosition}
          onRequestDeleteMeasure={handleRequestDeleteMeasure}
          onSelectEvent={handleSelectEvent}
          onSelectMeasure={handleSelectMeasure}
          onSetPendingMeasureClear={setPendingMeasureClear}
          onSetPendingMeasureDelete={setPendingMeasureDelete}
          onSetAnnotationContextMenu={setAnnotationContextMenu}
          onSheetStageClick={handleSheetStageClick}
          onUpdateScoreMetadata={updateScoreMetadata}
        />
      </section>
    </main>
  );
}

export default SheetLabApp;
