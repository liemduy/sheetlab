import { useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
} from 'react';
import { createEmptyScore } from '../../domain/score/factories';
import {
  addMeasure,
  findScoreEvent,
  setMeasureKeySignature,
  setMeasureRepeatJump,
  setMeasureSectionMarker,
  setScoreTimeSignature,
  tryMoveKeySignatureSymbol,
  tryUpdateScoreEvent,
} from '../../domain/score/editing';
import { getActiveKeySignatureSelection } from '../../domain/score/keySignatures';
import type {
  EditableVoiceIndex,
  EditorToolState,
  EntryMode,
  PlacementMode,
} from '../editor/editorState';
import {
  DEFAULT_EDITOR_TOOL_STATE,
  PAGE_SIZE_LABEL,
} from '../editor/editorState';
import {
  EditorToolbar,
  type ToolbarPalette,
} from '../editor/EditorToolbar';
import { ScoreSettingsPanel } from '../editor/ScoreSettingsPanel';
import type {
  KeySignature,
  AnnotationKind,
  AnnotationPlacementSide,
  PageSize,
  RepeatJumpKind,
  Score,
  ScoreType,
  StaffId,
} from '../../domain/score/types';
import {
  getTimeSignatureLabel,
  parseTimeSignatureId,
} from '../../domain/score/timeSignatures';
import {
  getMeasureRepeatJump,
  getRepeatJumpOption,
} from '../../domain/score/repeatJumps';
import { getScoreRhythmIssues } from '../../domain/score/rhythm';
import type { MusicPosition } from '../sheet/interaction';
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
  const [annotationContextMenu, setAnnotationContextMenu] = useState<{
    clientX: number;
    clientY: number;
    eventId: string;
    kind: AnnotationKind;
  } | null>(null);
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
    updateToolState,
  });

  function handleClearInteraction() {
    updateToolState({ isInputArmed: false });
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
    clearTransientInteraction();
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
    clearTransientInteraction();
    scrollNotationIntoView();
  }

  function handleAddMeasure() {
    commitScoreChange(addMeasure(score), 'Measure added');
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
    clearPointerState();
    openMeasureContextMenu({ staffId, measureIndex }, clientX, clientY);
    setEditorMessage('Measure selected');
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
    clearPointerState();
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
    selectMeasure({
      staffId: selectedMeasure?.staffId ?? 'treble',
      measureIndex,
    });
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
      clearPointerState();
      selectMeasure({
        staffId: position.staffId,
        measureIndex: sourceMeasureIndex,
      });
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
    updateToolState({ isInputArmed: false });
    clearPointerState();
    clearMeasureUiState();
    selectMeasure({ staffId, measureIndex });
    setEditorMessage('Measure selected');
  }

  function handleSelectedEventAnnotationChange(
    update: Parameters<typeof tryUpdateScoreEvent>[2],
    message: string,
  ) {
    if (!selectedEventId) {
      return;
    }

    const result = tryUpdateScoreEvent(score, selectedEventId, update);

    if (result.updated) {
      commitScoreChange(result.score, message);
    } else {
      setEditorMessage(`Cannot update annotation: ${result.reason}`);
    }
  }

  function handleAnnotationContextMenu(
    eventId: string,
    kind: AnnotationKind,
    clientX: number,
    clientY: number,
  ) {
    updateToolState({ isInputArmed: false });
    clearPointerState();
    clearMeasureUiState();
    selectEvent(eventId, null);
    setAnnotationContextMenu({ clientX, clientY, eventId, kind });
    setEditorMessage('Annotation selected');
  }

  function handleAnnotationPlacementChange(
    side: AnnotationPlacementSide,
  ) {
    if (!annotationContextMenu) {
      return;
    }

    const result = tryUpdateScoreEvent(score, annotationContextMenu.eventId, {
      annotationPlacement: {
        kind: annotationContextMenu.kind,
        side,
      },
    });

    if (result.updated) {
      commitScoreChange(
        result.score,
        side === 'auto'
          ? 'Annotation placement reset'
          : `Annotation moved ${side}`,
      );
    } else {
      setEditorMessage(`Cannot update annotation placement: ${result.reason}`);
    }

    setAnnotationContextMenu(null);
  }

  function handleLyricMapChange(eventId: string, targetEventIds: string[]) {
    const result = tryUpdateScoreEvent(score, eventId, {
      lyricMap: { eventIds: targetEventIds },
    });

    if (result.updated) {
      commitScoreChange(result.score, 'Lyric map updated');
      selectEvent(eventId, null);
    } else {
      setEditorMessage(`Cannot update lyric map: ${result.reason}`);
    }
  }

  function handleSectionMarkerChange(sectionMarker: string | null) {
    const measureIndex = getScoreEditTargetMeasureIndex();

    commitScoreChange(
      setMeasureSectionMarker(score, measureIndex, sectionMarker),
      sectionMarker ? 'Section marker updated' : 'Section marker cleared',
    );
    selectMeasure({
      staffId: selectedMeasure?.staffId ?? 'treble',
      measureIndex,
    });
  }

  function handleSelectEvent(eventId: string, pitchIndex?: number | null) {
    const foundEvent = findScoreEvent(score, eventId);

    updateToolState({
      isInputArmed: false,
      voiceIndex:
        foundEvent?.voiceIndex === 1 || foundEvent?.voiceIndex === 0
          ? foundEvent.voiceIndex
          : toolState.voiceIndex,
    });
    clearPointerState();
    selectEvent(eventId, pitchIndex ?? null);
    setEditorMessage(
      pitchIndex !== null && pitchIndex !== undefined
        ? 'Notehead selected'
        : 'Event selected',
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
