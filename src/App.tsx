import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createEmptyScore, deserializeScore } from './domain/score/factories';
import { isPitchedScoreEvent } from './domain/score/events';
import {
  addMeasure,
  countScoreEvents,
  deleteScoreEvent,
  deleteScoreEventPitch,
  findScoreEvent,
  tryInsertScoreEvent,
  tryPlaceScoreEvent,
  tryUpdateScoreEvent,
} from './domain/score/editing';
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
  PageSize,
  Pitch,
  Score,
  ScoreType,
  StaffId,
} from './domain/score/types';
import { StaffRenderer } from './features/sheet/StaffRenderer';
import { formatPitch } from './features/sheet/interaction';
import type { MusicPosition } from './features/sheet/interaction';
import { snapInsertPositionToEventBoundary } from './features/sheet/insertPosition';
import { getMeasureKey } from './features/sheet/measureKey';
import { findNextRhythmSlotAfter } from './features/sheet/rhythmSlots';
import { playTimelineAudio } from './features/playback/audioEngine';
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
} from './features/persistence/projectStorage';

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
        measureIndex: nextSlot.measureIndex,
      }
    : placementPosition;

  return createInputCursorFromPosition(
    nextPosition,
    duration,
    'note-input',
    score.timeSignature.beats,
    dots,
  );
}

function App() {
  type SelectionSource = 'manual';

  const [toolState, setToolState] = useState<EditorToolState>(
    DEFAULT_EDITOR_TOOL_STATE,
  );
  const [hoverPosition, setHoverPosition] = useState<MusicPosition | null>(null);
  const [inputCursor, setInputCursor] = useState<InputCursor | null>(null);
  const [score, setScore] = useState(() =>
    createEmptyScore(DEFAULT_EDITOR_TOOL_STATE.scoreType, {
      tempo: DEFAULT_EDITOR_TOOL_STATE.tempo,
    }),
  );
  const [invalidMeasureKeys, setInvalidMeasureKeys] = useState<string[]>([]);
  const [pastScores, setPastScores] = useState<Score[]>([]);
  const [futureScores, setFutureScores] = useState<Score[]>([]);
  const [editorMessage, setEditorMessage] = useState('Ready');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedPitchIndex, setSelectedPitchIndex] = useState<number | null>(null);
  const [selectedEventSource, setSelectedEventSource] =
    useState<SelectionSource | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackElapsedSeconds, setPlaybackElapsedSeconds] = useState(0);
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
    updateSelectedEvent({ duration }, 'Event duration updated');
  }

  function handleDottedChange(dotted: boolean) {
    const dots = dotted ? 1 : 0;

    updateToolState({ dots });
    setCursorSequenceLocked(false);
    setHoverPosition(null);
    setInputCursor(null);
    updateSelectedEvent({ dots }, dotted ? 'Dotted note enabled' : 'Dotted note disabled');
  }

  function handleClearInteraction() {
    updateToolState({ isInputArmed: false });
    setHoverPosition(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setSelectedEventId(null);
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
      return;
    }

    setInputCursor((currentCursor) => {
      const shouldKeepSequentialBeat =
        isCursorSequenceLockedRef.current &&
        currentCursor !== null &&
        currentCursor.staffId === nextHoverPosition.staffId &&
        (currentCursor.measureIndex === nextHoverPosition.measureIndex ||
          isNearSequentialCursor(currentCursor, nextHoverPosition));
      const nextCursor = shouldKeepSequentialBeat
        ? {
            ...currentCursor,
            pitchPreview: nextHoverPosition.pitch,
            staffIndex: nextHoverPosition.staffIndex,
          }
        : createInputCursorFromPosition(
            nextHoverPosition,
            toolState.duration,
            'note-input',
            score.timeSignature.beats,
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
      }),
      'New score',
    );
    setHoverPosition(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setSelectedEventId(null);
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
      }),
      'Score reset',
    );
    setHoverPosition(null);
    setInputCursor(null);
    setCursorSequenceLocked(false);
    setSelectedEventId(null);
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
    scrollNotationIntoView();
  }

  function handleAddMeasure() {
    commitScoreChange(addMeasure(score), 'Measure added');
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
    setSelectedPitchIndex(null);
    setSelectedEventSource(null);
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

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
      );
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (
        selectedEventId &&
        (event.key === 'Delete' || event.key === 'Backspace') &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        handleDeleteEvent(selectedEventId);
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown);

    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [score, selectedEventId, selectedPitchIndex]);

  return (
    <main className="app-shell" aria-label="SheetLab music editor">
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
                onClick={() => {
                  handleDurationChange(duration);
                  scrollNotationIntoView();
                }}
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
                  scrollNotationIntoView();
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
                    scrollNotationIntoView();
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
              disabled={!selectedEventId}
              onClick={handleDeleteSelected}
            >
              Delete
            </button>
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
          <div className={`paper paper-${score.pageSize}`}>
            <div className="paper-heading">
              <h2>{score.title}</h2>
              <div className="score-meta-row">
                <span>Moderato {'\u2669'} = {toolState.tempo}</span>
                <span>{score.composer || 'Composer'}</span>
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
                onMoveEvent={handleMoveEvent}
                onSelectEvent={(eventId, pitchIndex) => {
                  updateToolState({ isInputArmed: false });
                  setHoverPosition(null);
                  setInputCursor(null);
                  setCursorSequenceLocked(false);
                  setSelectedEventId(eventId);
                  setSelectedPitchIndex(pitchIndex ?? null);
                  setSelectedEventSource('manual');
                  setEditorMessage(
                    pitchIndex !== null && pitchIndex !== undefined
                      ? 'Notehead selected'
                      : 'Event selected',
                  );
                }}
              />
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
