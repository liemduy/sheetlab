import { countScoreEvents, findScoreEvent } from '../../domain/score/editing';
import type {
  PageSize,
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
  onPageSizeChange: (pageSize: PageSize) => void;
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
  onPageSizeChange,
  onScoreTypeChange,
  onTempoChange,
  onTimeSignatureChange,
}: ScoreSettingsPanelProps) {
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
                {findScoreEvent(score, selectedEventId)?.event.id ?? 'None'}
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
