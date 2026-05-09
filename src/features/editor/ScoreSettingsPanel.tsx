import { countScoreEvents, findScoreEvent } from '../../domain/score/editing';
import type {
  PageSize,
  PedalMark,
  Score,
  ScoreType,
  StaffId,
} from '../../domain/score/types';
import {
  getTimeSignatureId,
  getTimeSignatureLabel,
  TIME_SIGNATURE_OPTIONS,
} from '../../domain/score/timeSignatures';
import { formatPitch } from '../sheet/interaction';
import type { MusicPosition } from '../sheet/interaction';
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

interface ScoreSettingsPanelProps {
  canvasZoom: number;
  editorMessage: string;
  futureScoreCount: number;
  hoverPosition: MusicPosition | null;
  inputCursor: InputCursor | null;
  pastScoreCount: number;
  rhythmIssueCount: number;
  score: Score;
  selectedEventId: string | null;
  selectedMeasure: {
    staffId: StaffId;
    measureIndex: number;
  } | null;
  selectedPitchIndex: number | null;
  toolState: EditorToolState;
  onChordSymbolChange: (chordSymbol: string | null) => void;
  onDynamicChange: (dynamic: string | null) => void;
  onFermataChange: (fermata: boolean) => void;
  onGlissandoChange: (glissando: boolean) => void;
  onLyricChange: (lyric: string | null) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
  onPedalChange: (pedal: PedalMark | null) => void;
  onSectionMarkerChange: (sectionMarker: string | null) => void;
  onScoreTypeChange: (scoreType: ScoreType) => void;
  onTempoChange: (value: string) => void;
  onTimeSignatureChange: (value: string) => void;
}

export function ScoreSettingsPanel({
  canvasZoom,
  editorMessage,
  futureScoreCount,
  hoverPosition,
  inputCursor,
  pastScoreCount,
  rhythmIssueCount,
  score,
  selectedEventId,
  selectedMeasure,
  selectedPitchIndex,
  toolState,
  onChordSymbolChange,
  onDynamicChange,
  onFermataChange,
  onGlissandoChange,
  onLyricChange,
  onPageSizeChange,
  onPedalChange,
  onSectionMarkerChange,
  onScoreTypeChange,
  onTempoChange,
  onTimeSignatureChange,
}: ScoreSettingsPanelProps) {
  const selectedEvent = selectedEventId
    ? findScoreEvent(score, selectedEventId)
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
            {rhythmIssueCount === 0
              ? 'OK'
              : `${rhythmIssueCount} issue${rhythmIssueCount === 1 ? '' : 's'}`}
          </dd>
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
