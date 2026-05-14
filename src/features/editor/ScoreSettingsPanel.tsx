import { countScoreEvents, findScoreEvent } from '../../domain/score/editing';
import { findClefChange } from '../../domain/score/clefChanges';
import type {
  ArticulationKind,
  HairpinMark,
  OttavaKind,
  PageSize,
  PedalMark,
  Score,
  ScoreType,
  StaffId,
} from '../../domain/score/types';
import {
  ARTICULATION_KINDS,
  ARTICULATION_LABEL,
  ARTICULATION_SYMBOL,
} from '../../domain/score/articulations';
import {
  getOttavaMarkForSource,
  OTTAVA_KINDS,
  OTTAVA_LABEL,
} from '../../domain/score/ottava';
import { isPitchedScoreEvent } from '../../domain/score/events';
import {
  getTimeSignatureId,
  getTimeSignatureLabel,
  TIME_SIGNATURE_OPTIONS,
} from '../../domain/score/timeSignatures';
import { formatPitch } from '../sheet/interaction';
import type { MusicPosition } from '../sheet/interaction';
import type { ClefChangeTarget } from '../app/selectionTypes';
import { formatInputCursor } from './inputCursor';
import type { InputCursor } from './inputCursor';
import type { EditorToolState } from './editorState';
import {
  ACCIDENTAL_LABEL,
  DURATION_LABEL,
  PAGE_SIZE_LABEL,
  PLACEMENT_MODE_LABEL,
  SCORE_TYPE_LABEL,
  VOICE_LABEL,
} from './editorState';

const CLEF_CHANGE_LABEL = {
  bass: 'Insert bass clef',
  treble: 'Insert treble clef',
} as const;

interface ScoreSettingsPanelProps {
  canvasZoom: number;
  editorMessage: string;
  futureScoreCount: number;
  hoverPosition: MusicPosition | null;
  inputCursor: InputCursor | null;
  musicIssueCount: number;
  pastScoreCount: number;
  rhythmIssueCount: number;
  score: Score;
  selectedClefChange: ClefChangeTarget | null;
  selectedEventId: string | null;
  selectedMeasure: {
    staffId: StaffId;
    measureIndex: number;
  } | null;
  selectedPitchIndex: number | null;
  toolState: EditorToolState;
  onArticulationClear: () => void;
  onArticulationToggle: (articulation: ArticulationKind) => void;
  onChordSymbolChange: (chordSymbol: string | null) => void;
  onDynamicChange: (dynamic: string | null) => void;
  onFermataChange: (fermata: boolean) => void;
  onGlissandoChange: (glissando: boolean) => void;
  onHairpinChange: (hairpin: HairpinMark | null) => void;
  onLyricChange: (lyric: string | null) => void;
  onOttavaClear: () => void;
  onOttavaToggle: (ottava: OttavaKind) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
  onPedalChange: (pedal: PedalMark | null) => void;
  onReviewMusicIssue: () => void;
  onReviewRhythmIssue: () => void;
  onSectionMarkerChange: (sectionMarker: string | null) => void;
  onScoreTypeChange: (scoreType: ScoreType) => void;
  onSlurToNextToggle: () => void;
  onTempoChange: (value: string) => void;
  onTieToNextToggle: () => void;
  onTimeSignatureChange: (value: string) => void;
}

export function ScoreSettingsPanel({
  canvasZoom,
  editorMessage,
  futureScoreCount,
  hoverPosition,
  inputCursor,
  musicIssueCount,
  pastScoreCount,
  rhythmIssueCount,
  score,
  selectedClefChange,
  selectedEventId,
  selectedMeasure,
  selectedPitchIndex,
  toolState,
  onArticulationClear,
  onArticulationToggle,
  onChordSymbolChange,
  onDynamicChange,
  onFermataChange,
  onGlissandoChange,
  onHairpinChange,
  onLyricChange,
  onOttavaClear,
  onOttavaToggle,
  onPageSizeChange,
  onPedalChange,
  onReviewMusicIssue,
  onReviewRhythmIssue,
  onSectionMarkerChange,
  onScoreTypeChange,
  onSlurToNextToggle,
  onTempoChange,
  onTieToNextToggle,
  onTimeSignatureChange,
}: ScoreSettingsPanelProps) {
  const selectedEvent = selectedEventId
    ? findScoreEvent(score, selectedEventId)
    : null;
  const selectedClefChangeInfo = selectedClefChange
    ? findClefChange(
        score,
        selectedClefChange.staffId,
        selectedClefChange.clefChangeId,
      )
    : null;
  const selectedEventArticulations = selectedEvent?.event.articulations ?? [];
  const canEditArticulations = Boolean(
    selectedEvent && isPitchedScoreEvent(selectedEvent.event),
  );
  const canEditConnections = canEditArticulations;
  const hasTieToNext = Boolean(selectedEvent?.event.ties?.length);
  const hasSlurToNext = Boolean(selectedEvent?.event.slurs?.length);
  const selectedOttava = selectedEventId
    ? getOttavaMarkForSource(score, selectedEventId)
    : null;
  const selectedSectionMeasureIndex =
    selectedMeasure?.measureIndex ?? selectedEvent?.measureIndex ?? null;
  const selectedSectionMarker =
    selectedSectionMeasureIndex !== null
      ? score.parts[0]?.staves[0]?.measures.find(
          (measure) => measure.index === selectedSectionMeasureIndex,
        )?.sectionMarker ?? ''
      : '';

  function normalizeNullableInput(value: string) {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  return (
    <aside className="left-panel" aria-label="Score settings">
      <h2>Score Setup</h2>
      <label>
        Score type
        <select
          value={toolState.scoreType}
          onChange={(event) => onScoreTypeChange(event.target.value as ScoreType)}
        >
          <option value="treble">Treble only</option>
          <option value="grand">Grand staff piano</option>
        </select>
      </label>
      <label>
        Page size
        <select
          value={score.pageSize}
          onChange={(event) => onPageSizeChange(event.target.value as PageSize)}
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
          onChange={(event) => onTempoChange(event.target.value)}
        />
      </label>
      <label>
        Time signature
        <select
          value={getTimeSignatureId(score.timeSignature)}
          onChange={(event) => onTimeSignatureChange(event.target.value)}
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
      <section className="annotation-editor" aria-label="Annotation editor">
        <h3>Annotations</h3>
        <label>
          Chord symbol
          <input
            key={`chord-${selectedEventId ?? 'none'}-${
              selectedEvent?.event.chordSymbol ?? ''
            }`}
            type="text"
            defaultValue={selectedEvent?.event.chordSymbol ?? ''}
            disabled={!selectedEvent}
            placeholder="D, E7/D, C#m..."
            onBlur={(event) =>
              onChordSymbolChange(normalizeNullableInput(event.target.value))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <label>
          Lyric
          <input
            key={`lyric-${selectedEventId ?? 'none'}-${
              selectedEvent?.event.lyric ?? ''
            }`}
            type="text"
            defaultValue={selectedEvent?.event.lyric ?? ''}
            disabled={!selectedEvent}
            placeholder="syllable"
            onBlur={(event) =>
              onLyricChange(normalizeNullableInput(event.target.value))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <label>
          Dynamic
          <input
            key={`dynamic-${selectedEventId ?? 'none'}-${
              selectedEvent?.event.dynamic ?? ''
            }`}
            type="text"
            defaultValue={selectedEvent?.event.dynamic ?? ''}
            disabled={!selectedEvent}
            placeholder="pp, p, mf..."
            onBlur={(event) =>
              onDynamicChange(normalizeNullableInput(event.target.value))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <label>
          Pedal
          <select
            key={`pedal-${selectedEventId ?? 'none'}-${
              selectedEvent?.event.pedal ?? 'none'
            }`}
            defaultValue={selectedEvent?.event.pedal ?? 'none'}
            disabled={!selectedEvent}
            onChange={(event) =>
              onPedalChange(
                event.target.value === 'none'
                  ? null
                  : (event.target.value as PedalMark),
              )
            }
          >
            <option value="none">None</option>
            <option value="start">Ped.</option>
            <option value="release">*</option>
            <option value="start-release">Ped. *</option>
          </select>
        </label>
        <div
          className="articulation-editor"
          aria-label="Articulation editor"
        >
          <span>Articulations</span>
          <div className="articulation-toggle-group">
            {ARTICULATION_KINDS.map((articulation) => {
              const isActive = selectedEventArticulations.includes(articulation);

              return (
                <button
                  key={articulation}
                  type="button"
                  aria-label={`Toggle ${ARTICULATION_LABEL[articulation]} articulation`}
                  aria-pressed={isActive}
                  className={`articulation-toggle${isActive ? ' is-active' : ''}`}
                  disabled={!canEditArticulations}
                  title={ARTICULATION_LABEL[articulation]}
                  onClick={() => onArticulationToggle(articulation)}
                >
                  <span aria-hidden="true">
                    {ARTICULATION_SYMBOL[articulation]}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              aria-label="Clear articulations"
              className="articulation-clear"
              disabled={!canEditArticulations || selectedEventArticulations.length === 0}
              onClick={onArticulationClear}
            >
              Clear
            </button>
          </div>
        </div>
        <label className="checkbox-row">
          <input
            key={`fermata-${selectedEventId ?? 'none'}-${
              selectedEvent?.event.fermata ? 'on' : 'off'
            }`}
            type="checkbox"
            defaultChecked={Boolean(selectedEvent?.event.fermata)}
            disabled={!selectedEvent}
            onChange={(event) => onFermataChange(event.target.checked)}
          />
          Fermata
        </label>
        <label className="checkbox-row">
          <input
            key={`glissando-${selectedEventId ?? 'none'}-${
              selectedEvent?.event.glissando ? 'on' : 'off'
            }`}
            type="checkbox"
            defaultChecked={Boolean(selectedEvent?.event.glissando)}
            disabled={!selectedEvent}
            onChange={(event) => onGlissandoChange(event.target.checked)}
          />
          Glissando to next note
        </label>
        <label>
          Hairpin
          <select
            key={`hairpin-${selectedEventId ?? 'none'}-${
              selectedEvent?.event.hairpin ?? 'none'
            }`}
            defaultValue={selectedEvent?.event.hairpin ?? 'none'}
            disabled={!selectedEvent}
            onChange={(event) =>
              onHairpinChange(
                event.target.value === 'none'
                  ? null
                  : (event.target.value as HairpinMark),
              )
            }
          >
            <option value="none">None</option>
            <option value="crescendo">Crescendo</option>
            <option value="diminuendo">Diminuendo</option>
          </select>
        </label>
        <div
          className="articulation-editor"
          aria-label="Connection mark editor"
        >
          <span>Connections</span>
          <div className="articulation-toggle-group">
            <button
              type="button"
              aria-label="Toggle tie to next note"
              aria-pressed={hasTieToNext}
              className={`articulation-toggle${hasTieToNext ? ' is-active' : ''}`}
              disabled={!canEditConnections}
              title="Tie to next same pitch"
              onClick={onTieToNextToggle}
            >
              Tie
            </button>
            <button
              type="button"
              aria-label="Toggle slur to next note"
              aria-pressed={hasSlurToNext}
              className={`articulation-toggle${hasSlurToNext ? ' is-active' : ''}`}
              disabled={!canEditConnections}
              title="Slur to next note"
              onClick={onSlurToNextToggle}
            >
              Slur
            </button>
          </div>
        </div>
        <div
          className="articulation-editor"
          aria-label="Ottava range editor"
        >
          <span>Ottava</span>
          <div className="articulation-toggle-group">
            {OTTAVA_KINDS.map((ottava) => {
              const isActive = selectedOttava?.ottava === ottava;

              return (
                <button
                  key={ottava}
                  type="button"
                  aria-label={`Toggle ${OTTAVA_LABEL[ottava]} to next note`}
                  aria-pressed={isActive}
                  className={`articulation-toggle${isActive ? ' is-active' : ''}`}
                  disabled={!canEditConnections}
                  title={`${OTTAVA_LABEL[ottava]} to next note`}
                  onClick={() => onOttavaToggle(ottava)}
                >
                  {OTTAVA_LABEL[ottava]}
                </button>
              );
            })}
            <button
              type="button"
              aria-label="Clear ottava range"
              className="articulation-clear"
              disabled={!canEditConnections || !selectedOttava}
              onClick={onOttavaClear}
            >
              Clear
            </button>
          </div>
        </div>
        <label>
          Section marker
          <input
            key={`section-${selectedSectionMeasureIndex ?? 'none'}-${selectedSectionMarker}`}
            type="text"
            defaultValue={selectedSectionMarker}
            disabled={selectedSectionMeasureIndex === null}
            placeholder="Intro, A1, B..."
            onBlur={(event) =>
              onSectionMarkerChange(normalizeNullableInput(event.target.value))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
      </section>
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
          <dd>
            {toolState.clefChange
              ? CLEF_CHANGE_LABEL[toolState.clefChange]
              : toolState.isInputArmed
                ? 'Write'
                : 'Select'}
          </dd>
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
          <dt>Voice</dt>
          <dd>{VOICE_LABEL[toolState.voiceIndex]}</dd>
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
          <dt>Rhythm</dt>
          <dd>
            {rhythmIssueCount === 0 ? (
              'OK'
            ) : (
              <button
                type="button"
                aria-label="Review first rhythm issue"
                className="state-action"
                onClick={onReviewRhythmIssue}
              >
                {`${rhythmIssueCount} issue${
                  rhythmIssueCount === 1 ? '' : 's'
                }`}
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt>Music</dt>
          <dd>
            {musicIssueCount === 0 ? (
              'OK'
            ) : (
              <button
                type="button"
                aria-label="Review first music issue"
                className="state-action"
                onClick={onReviewMusicIssue}
              >
                {`${musicIssueCount} issue${
                  musicIssueCount === 1 ? '' : 's'
                }`}
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{editorMessage}</dd>
        </div>
        <div>
          <dt>Selected</dt>
          <dd>
            {selectedClefChange && selectedClefChangeInfo ? (
              `${selectedClefChangeInfo.change.clef} clef M${
                selectedClefChangeInfo.measureIndex + 1
              } B${selectedClefChangeInfo.change.beat + 1}`
            ) : selectedEventId ? (
              <>
                {selectedEvent?.event.id ?? 'None'}
                {selectedPitchIndex !== null
                  ? ` pitch ${selectedPitchIndex + 1}`
                  : ''}
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
            {pastScoreCount}/{futureScoreCount}
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
  );
}
