import { countScoreEvents, findScoreEvent } from '../../domain/score/editing';
import { findClefChange } from '../../domain/score/clefChanges';
import type {
  ArticulationKind,
  GraceNoteAttachment,
  HairpinMark,
  NoteStep,
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
import {
  isGeneratedRestEvent,
  isPitchedScoreEvent,
} from '../../domain/score/events';
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

const DYNAMIC_MARK_OPTIONS = [
  'ppp',
  'pp',
  'p',
  'mp',
  'mf',
  'f',
  'ff',
  'fff',
  'fp',
  'sfz',
  'cresc.',
  'dim.',
] as const;

const DYNAMIC_MARK_GROUPS = [
  {
    label: 'Soft',
    marks: ['ppp', 'pp', 'p'] as const,
  },
  {
    label: 'Medium',
    marks: ['mp', 'mf'] as const,
  },
  {
    label: 'Loud',
    marks: ['f', 'ff', 'fff'] as const,
  },
  {
    label: 'Accent / change',
    marks: ['fp', 'sfz', 'cresc.', 'dim.'] as const,
  },
];

const NOTE_STEPS: NoteStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

type GracePreset = 'none' | 'lower' | 'upper' | 'turn';

function formatScoreEventSummary(
  selectedEvent: ReturnType<typeof findScoreEvent>,
  selectedPitchIndex: number | null,
) {
  if (!selectedEvent) {
    return 'None';
  }

  const beatLabel = `M${selectedEvent.measureIndex + 1} B${
    selectedEvent.event.beat + 1
  }`;
  const durationLabel = DURATION_LABEL[selectedEvent.event.duration];

  if (selectedEvent.event.kind === 'rest') {
    return `${durationLabel} rest ${beatLabel}`;
  }

  if (selectedEvent.event.kind === 'note') {
    return `${durationLabel} note ${formatPitch(
      selectedEvent.event.pitch,
    )} ${beatLabel}`;
  }

  const selectedPitch = selectedEvent.event.pitches[selectedPitchIndex ?? 0];
  const pitchLabel = selectedPitch
    ? formatPitch(selectedPitch)
    : selectedEvent.event.pitches.map(formatPitch).join(' ');

  return `${durationLabel} chord ${pitchLabel} ${beatLabel}`;
}

function formatVoiceIndex(voiceIndex: number) {
  return `V${voiceIndex + 1}`;
}

function getSelectedEventAnchorPitch(
  selectedEvent: ReturnType<typeof findScoreEvent>,
  selectedPitchIndex: number | null,
) {
  if (!selectedEvent || !isPitchedScoreEvent(selectedEvent.event)) {
    return null;
  }

  if (selectedEvent.event.kind === 'note') {
    return selectedEvent.event.pitch;
  }

  return (
    selectedEvent.event.pitches[selectedPitchIndex ?? 0] ??
    selectedEvent.event.pitches[0] ??
    null
  );
}

function stepPitch(
  pitch: NonNullable<ReturnType<typeof getSelectedEventAnchorPitch>>,
  direction: -1 | 1,
) {
  const stepIndex = NOTE_STEPS.indexOf(pitch.step);
  const nextStepIndex =
    (stepIndex + direction + NOTE_STEPS.length) % NOTE_STEPS.length;
  const octaveDelta =
    direction > 0 && pitch.step === 'B'
      ? 1
      : direction < 0 && pitch.step === 'C'
        ? -1
        : 0;

  return {
    step: NOTE_STEPS[nextStepIndex],
    octave: pitch.octave + octaveDelta,
  };
}

function createGraceNotesFromPreset(
  selectedEvent: ReturnType<typeof findScoreEvent>,
  selectedPitchIndex: number | null,
  preset: GracePreset,
): GraceNoteAttachment[] | null {
  if (preset === 'none') {
    return null;
  }

  const anchorPitch = getSelectedEventAnchorPitch(selectedEvent, selectedPitchIndex);

  if (!anchorPitch) {
    return null;
  }

  if (preset === 'turn') {
    return [
      {
        duration: 'sixteenth',
        pitches: [stepPitch(anchorPitch, 1)],
      },
      {
        duration: 'sixteenth',
        pitches: [stepPitch(anchorPitch, -1)],
      },
    ];
  }

  return [
    {
      duration: 'sixteenth',
      pitches: [stepPitch(anchorPitch, preset === 'upper' ? 1 : -1)],
      slash: true,
    },
  ];
}

function getPolyphonySummary(score: Score) {
  let multiVoiceMeasureCount = 0;
  const activeVoiceKeys = new Set<string>();

  score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        const activeVoiceIndexes = measure.voices
          .map((voice, voiceIndex) => ({
            hasUserEvents: voice.events.some(
              (event) => !isGeneratedRestEvent(event),
            ),
            voiceIndex,
          }))
          .filter((voice) => voice.hasUserEvents)
          .map((voice) => voice.voiceIndex);

        activeVoiceIndexes.forEach((voiceIndex) =>
          activeVoiceKeys.add(`${staff.id}:${voiceIndex}`),
        );

        if (activeVoiceIndexes.length > 1) {
          multiVoiceMeasureCount += 1;
        }
      });
    });
  });

  if (activeVoiceKeys.size <= 1 && multiVoiceMeasureCount === 0) {
    return 'Single voice';
  }

  return `${activeVoiceKeys.size} lanes / ${multiVoiceMeasureCount} multi-voice M`;
}

function getComposerAction({
  eventCount,
  inputCursor,
  musicIssueCount,
  rhythmIssueCount,
  selectedClefChange,
  selectedEventId,
  selectedMeasure,
  toolState,
}: {
  eventCount: number;
  inputCursor: InputCursor | null;
  musicIssueCount: number;
  rhythmIssueCount: number;
  selectedClefChange: ClefChangeTarget | null;
  selectedEventId: string | null;
  selectedMeasure: { staffId: StaffId; measureIndex: number } | null;
  toolState: EditorToolState;
}) {
  if (musicIssueCount > 0) {
    return 'Review music validation';
  }

  if (rhythmIssueCount > 0) {
    return 'Review rhythm';
  }

  if (selectedClefChange) {
    return 'Edit selected clef change';
  }

  if (selectedEventId) {
    return 'Edit selected event';
  }

  if (selectedMeasure) {
    return 'Edit selected measure';
  }

  if (toolState.clefChange) {
    return CLEF_CHANGE_LABEL[toolState.clefChange];
  }

  if (toolState.isInputArmed) {
    return inputCursor
      ? `${DURATION_LABEL[inputCursor.duration]} ${
          toolState.entryMode === 'note' ? 'note' : 'rest'
        } ready`
      : `${DURATION_LABEL[toolState.duration]} ${
          toolState.entryMode === 'note' ? 'note' : 'rest'
        } armed`;
  }

  return eventCount === 0 ? 'Score is empty' : 'Select or continue writing';
}

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
  onGraceNotesChange: (graceNotes: GraceNoteAttachment[] | null) => void;
  onHairpinChange: (hairpin: HairpinMark | null) => void;
  onLyricChange: (lyric: string | null) => void;
  onLyricBulkApply: (lyrics: string[]) => void;
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
  onGraceNotesChange,
  onHairpinChange,
  onLyricChange,
  onLyricBulkApply,
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
  const selectedDynamic = selectedEvent?.event.dynamic ?? null;
  const hasCustomDynamic =
    selectedDynamic !== null &&
    !DYNAMIC_MARK_OPTIONS.includes(
      selectedDynamic as (typeof DYNAMIC_MARK_OPTIONS)[number],
    );
  const eventCount = countScoreEvents(score);
  const selectedGraceCount = selectedEvent?.event.graceNotes?.length ?? 0;
  const selectedSummary = selectedClefChange && selectedClefChangeInfo
    ? `${selectedClefChangeInfo.change.clef} clef M${
        selectedClefChangeInfo.measureIndex + 1
      } B${selectedClefChangeInfo.change.beat + 1}`
    : selectedEventId
      ? formatScoreEventSummary(selectedEvent, selectedPitchIndex)
      : selectedMeasure
        ? `${selectedMeasure.staffId} measure ${selectedMeasure.measureIndex + 1}`
        : 'None';
  const selectedVoiceSummary = selectedEvent
    ? `${selectedEvent.staffId} ${formatVoiceIndex(selectedEvent.voiceIndex)}`
    : selectedMeasure
      ? selectedMeasure.staffId
      : 'None';
  const polyphonySummary = getPolyphonySummary(score);
  const composerAction = getComposerAction({
    eventCount,
    inputCursor,
    musicIssueCount,
    rhythmIssueCount,
    selectedClefChange,
    selectedEventId,
    selectedMeasure,
    toolState,
  });

  function normalizeNullableInput(value: string) {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  function parseBulkLyrics(value: string) {
    return value
      .split(/\s+/)
      .map((lyric) => lyric.trim())
      .filter(Boolean);
  }

  return (
    <aside className="left-panel" aria-label="Score settings">
      <h2>Score Setup</h2>
      <section className="composer-flow-panel" aria-label="Composer flow">
        <div>
          <span>Now</span>
          <strong>{composerAction}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong>{selectedSummary}</strong>
        </div>
        <div>
          <span>Events</span>
          <strong>{eventCount}</strong>
        </div>
      </section>
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
          Lyric line
          <textarea
            key={`lyric-bulk-${selectedEventId ?? 'none'}`}
            disabled={!selectedEvent}
            placeholder="nhap cac am tiet cach nhau bang khoang trang"
            rows={2}
            onBlur={(event) => {
              const lyrics = parseBulkLyrics(event.target.value);

              if (lyrics.length > 0) {
                onLyricBulkApply(lyrics);
                event.target.value = '';
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <label>
          Dynamic
          <select
            aria-label="Dynamic"
            key={`dynamic-${selectedEventId ?? 'none'}-${
              selectedEvent?.event.dynamic ?? ''
            }`}
            value={selectedDynamic ?? 'none'}
            disabled={!selectedEvent}
            onChange={(event) =>
              onDynamicChange(
                event.target.value === 'none' ? null : event.target.value,
              )
            }
          >
            <option value="none">None</option>
            {DYNAMIC_MARK_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.marks.map((dynamic) => (
                  <option key={dynamic} value={dynamic}>
                    {dynamic}
                  </option>
                ))}
              </optgroup>
            ))}
            {hasCustomDynamic ? (
              <option value={selectedDynamic}>{selectedDynamic} (custom)</option>
            ) : null}
          </select>
        </label>
        <div className="annotation-symbol-picker" aria-label="Quick dynamic picker">
          {DYNAMIC_MARK_GROUPS.flatMap((group) => group.marks).map((dynamic) => (
            <button
              key={dynamic}
              type="button"
              className={selectedDynamic === dynamic ? 'is-active' : ''}
              disabled={!selectedEvent}
              onClick={() => onDynamicChange(dynamic)}
            >
              {dynamic}
            </button>
          ))}
        </div>
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
        <label>
          Grace
          <select
            key={`grace-${selectedEventId ?? 'none'}-${selectedGraceCount}`}
            defaultValue={selectedGraceCount > 0 ? 'custom' : 'none'}
            disabled={!selectedEvent || !canEditArticulations}
            onChange={(event) => {
              const preset = event.target.value as GracePreset | 'custom';

              if (preset !== 'custom') {
                onGraceNotesChange(
                  createGraceNotesFromPreset(
                    selectedEvent,
                    selectedPitchIndex,
                    preset,
                  ),
                );
              }
            }}
          >
            <option value="none">None</option>
            <option value="lower">Lower grace</option>
            <option value="upper">Upper grace</option>
            <option value="turn">Two-note turn</option>
            {selectedGraceCount > 0 ? (
              <option value="custom">Custom ({selectedGraceCount})</option>
            ) : null}
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
          <dt>Polyphony</dt>
          <dd>{polyphonySummary}</dd>
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
          <dd>{eventCount}</dd>
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
          <dd>{selectedSummary}</dd>
        </div>
        <div>
          <dt>Sel lane</dt>
          <dd>{selectedVoiceSummary}</dd>
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
