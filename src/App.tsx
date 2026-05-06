import { useEffect, useRef, useState } from 'react';
import { createEmptyScore, deserializeScore } from './domain/score/factories';
import {
  addMeasure,
  countScoreEvents,
  deleteScoreEvent,
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
  DEFAULT_EDITOR_TOOL_STATE,
  DURATION_LABEL,
  DURATION_OPTIONS,
  PAGE_SIZE_LABEL,
  PLACEMENT_MODE_LABEL,
  SCORE_TYPE_LABEL,
} from './features/editor/editorState';
import type {
  DurationValue,
  PageSize,
  Score,
  ScoreType,
} from './domain/score/types';
import { StaffRenderer } from './features/sheet/StaffRenderer';
import { formatPitch } from './features/sheet/interaction';
import type { MusicPosition } from './features/sheet/interaction';
import { snapInsertPositionToEventBoundary } from './features/sheet/insertPosition';
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

function App() {
  type SelectionSource = 'created' | 'manual';

  const [toolState, setToolState] = useState<EditorToolState>(
    DEFAULT_EDITOR_TOOL_STATE,
  );
  const [hoverPosition, setHoverPosition] = useState<MusicPosition | null>(null);
  const [score, setScore] = useState(() =>
    createEmptyScore(DEFAULT_EDITOR_TOOL_STATE.scoreType, {
      tempo: DEFAULT_EDITOR_TOOL_STATE.tempo,
    }),
  );
  const [pastScores, setPastScores] = useState<Score[]>([]);
  const [futureScores, setFutureScores] = useState<Score[]>([]);
  const [editorMessage, setEditorMessage] = useState('Ready');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
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

  function commitScoreChange(nextScore: Score, message: string) {
    setPastScores((currentPast) => [...currentPast, score]);
    setFutureScores([]);
    setScore(nextScore);
    setEditorMessage(message);
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

    const result = tryUpdateScoreEvent(score, selectedEventId, update);

    if (result.updated) {
      commitScoreChange(result.score, successMessage);
    } else {
      setEditorMessage(`Cannot update: ${result.reason}`);
    }
  }

  function handleDurationChange(duration: DurationValue) {
    updateToolState({ duration });
    updateSelectedEvent({ duration }, 'Event duration updated');
  }

  function handleScoreTypeChange(scoreType: ScoreType) {
    updateToolState({ scoreType });
    commitScoreChange(
      createEmptyScore(scoreType, {
        pageSize: score.pageSize,
        tempo: toolState.tempo,
      }),
      'New score',
    );
    setHoverPosition(null);
    setSelectedEventId(null);
    setSelectedEventSource(null);
    scrollNotationIntoView();
  }

  function handleResetScore() {
    updateToolState({ placementMode: 'place' });
    commitScoreChange(
      createEmptyScore(toolState.scoreType, {
        pageSize: score.pageSize,
        tempo: toolState.tempo,
      }),
      'Score reset',
    );
    setHoverPosition(null);
    setSelectedEventId(null);
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
    const placementPosition =
      toolState.placementMode === 'insert'
        ? snapInsertPositionToEventBoundary(score, position)
        : position;
    const accidental =
      toolState.accidental === 'none' ? undefined : toolState.accidental;
    const eventId = `event-${eventCounter.current++}`;

    const placeRequest = {
      eventId,
      staffId: placementPosition.staffId,
      measureIndex: placementPosition.measureIndex,
      beat: placementPosition.beat,
      duration: toolState.duration,
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
      setSelectedEventId(eventId);
      setSelectedEventSource('created');
    } else {
      setEditorMessage(`Cannot place: ${result.reason}`);
    }
  }

  function handleDeleteSelected() {
    if (!selectedEventId) {
      return;
    }

    commitScoreChange(deleteScoreEvent(score, selectedEventId), 'Event deleted');
    setSelectedEventId(null);
    setSelectedEventSource(null);
  }

  function handleDeleteEvent(eventId: string) {
    commitScoreChange(deleteScoreEvent(score, eventId), 'Event deleted');
    if (selectedEventId === eventId) {
      setSelectedEventId(null);
      setSelectedEventSource(null);
    }
  }

  function handleMoveEvent(eventId: string, position: MusicPosition) {
    const result = tryUpdateScoreEvent(score, eventId, {
      beat: position.beat,
      measureIndex: position.measureIndex,
      pitch: position.pitch,
      staffId: position.staffId,
    });

    if (result.updated) {
      commitScoreChange(result.score, 'Event moved');
      setSelectedEventId(eventId);
      setSelectedEventSource('manual');
    } else {
      setEditorMessage(`Cannot move: ${result.reason}`);
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
    setSelectedEventSource(null);
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
    setSelectedEventSource(null);
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
    }));
    setSelectedEventId(null);
    setSelectedEventSource(null);
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
      }));
      setSelectedEventId(null);
      setSelectedEventSource(null);
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

  function handleExportPdf() {
    setEditorMessage('Opening print dialog');
    window.print();
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
  }, [score, selectedEventId]);

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
            {DURATION_OPTIONS.map((duration) => (
              <button
                key={duration}
                type="button"
                className={`tool-button${
                  toolState.duration === duration ? ' is-active' : ''
                }`}
                aria-pressed={toolState.duration === duration}
                onClick={() => {
                  handleDurationChange(duration);
                  scrollNotationIntoView();
                }}
              >
                {DURATION_LABEL[duration]}
              </button>
            ))}
          </div>
          <div className="toolbar-group" aria-label="Entry tools">
            {(['note', 'rest'] satisfies EntryMode[]).map((entryMode) => (
              <button
                key={entryMode}
                type="button"
                className={`tool-button${
                  toolState.entryMode === entryMode ? ' is-active' : ''
                }`}
                aria-pressed={toolState.entryMode === entryMode}
                onClick={() => {
                  updateToolState({ entryMode });
                  scrollNotationIntoView();
                }}
              >
                {entryMode === 'note' ? 'Note' : 'Rest'}
              </button>
            ))}
          </div>
          <div className="toolbar-group" aria-label="Placement tools">
            {(['place', 'insert'] satisfies PlacementMode[]).map(
              (placementMode) => (
                <button
                  key={placementMode}
                  type="button"
                  className={`tool-button${
                    toolState.placementMode === placementMode ? ' is-active' : ''
                  }`}
                  aria-pressed={toolState.placementMode === placementMode}
                  onClick={() => {
                    updateToolState({ placementMode });
                    scrollNotationIntoView();
                  }}
                >
                  {PLACEMENT_MODE_LABEL[placementMode]}
                </button>
              ),
            )}
          </div>
          <div className="toolbar-group" aria-label="Transport and history">
            <button
              type="button"
              className={`tool-button${isPlaying ? ' is-active' : ''}`}
              onClick={handlePlaybackToggle}
            >
              {isPlaying ? 'Stop' : 'Play'}
            </button>
            <button
              type="button"
              className="tool-button"
              disabled={pastScores.length === 0}
              onClick={handleUndo}
            >
              Undo
            </button>
            <button
              type="button"
              className="tool-button"
              disabled={futureScores.length === 0}
              onClick={handleRedo}
            >
              Redo
            </button>
            <button type="button" className="tool-button" onClick={handleAddMeasure}>
              Add Measure
            </button>
            <button type="button" className="tool-button" onClick={handleResetScore}>
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
            <button type="button" className="tool-button" onClick={handleExportPdf}>
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
            Accidental
            <select
              value={toolState.accidental}
              onChange={(event) =>
                handleAccidentalChange(event.target.value as AccidentalChoice)
              }
            >
              <option value="none">None</option>
              <option value="natural">Natural</option>
              <option value="sharp">Sharp</option>
              <option value="flat">Flat</option>
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
              <dt>Duration</dt>
              <dd>{DURATION_LABEL[toolState.duration]}</dd>
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
                {selectedEventId
                  ? findScoreEvent(score, selectedEventId)?.event.id ?? 'None'
                  : 'None'}
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
          </dl>
        </aside>

        <section className="sheet-stage" aria-label="Sheet surface">
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
                entryMode={toolState.entryMode}
                activeEventId={activePlaybackEvent?.id ?? null}
                hoverPosition={hoverPosition}
                playbackBeat={playbackBeat}
                placementMode={toolState.placementMode}
                selectedEventId={selectedEventId}
                score={score}
                onHoverPositionChange={setHoverPosition}
                onPlaceAtPosition={handlePlaceAtPosition}
                onDeleteEvent={handleDeleteEvent}
                onMoveEvent={handleMoveEvent}
                onSelectEvent={(eventId) => {
                  setSelectedEventId(eventId);
                  setSelectedEventSource('manual');
                  setEditorMessage('Event selected');
                }}
              />
            </div>
            <p className="surface-note">
              V0.4 notation surface. Hover to preview, click to place,
              insert to shift later notes, drag selected notes to repair them.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
