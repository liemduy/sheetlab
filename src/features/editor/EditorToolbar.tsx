import type { RefObject } from 'react';
import {
  createKeySignatureSymbols,
  getKeySignatureLabel,
  KEY_SIGNATURE_OPTIONS,
} from '../../domain/score/keySignatures';
import {
  getRepeatJumpOption,
  REPEAT_JUMP_OPTIONS,
} from '../../domain/score/repeatJumps';
import type {
  DurationValue,
  KeySignature,
  RepeatJumpKind,
  TimeSignature,
} from '../../domain/score/types';
import {
  getTimeSignatureId,
  getTimeSignatureLabel,
  TIME_SIGNATURE_OPTIONS,
} from '../../domain/score/timeSignatures';
import type {
  AccidentalChoice,
  EditableVoiceIndex,
  EditorToolState,
  EntryMode,
  PlacementMode,
} from './editorState';
import {
  ACCIDENTAL_LABEL,
  ACCIDENTAL_SYMBOL,
  DURATION_LABEL,
  DURATION_OPTIONS,
  DURATION_SYMBOL,
  PLACEMENT_MODE_LABEL,
  VOICE_LABEL,
  VOICE_OPTIONS,
} from './editorState';

export const ZOOM_MIN = 70;
export const ZOOM_MAX = 180;
export const ZOOM_STEP = 5;
export const DEFAULT_CANVAS_ZOOM = 100;

export type ToolbarPalette = 'key' | 'repeat' | null;

const THUMBNAIL_ACCIDENTAL_Y = {
  flat: {
    A: 12,
    B: 19,
    D: 18,
    E: 11,
    G: 25,
  },
  sharp: {
    C: 22,
    F: 16,
  },
} as const;

function KeySignatureThumbnail({ keySignature }: { keySignature: KeySignature }) {
  const symbols = createKeySignatureSymbols(keySignature);

  return (
    <span className="signature-thumbnail" aria-hidden="true">
      <span className="signature-staff-lines" />
      {symbols.map((symbol, index) => (
        <span
          key={`${symbol.accidental}-${symbol.step}-${index}`}
          className="signature-accidental"
          style={{
            left: `${8 + index * 8}px`,
            top: `${
              THUMBNAIL_ACCIDENTAL_Y[symbol.accidental][
                symbol.step as keyof (typeof THUMBNAIL_ACCIDENTAL_Y)[typeof symbol.accidental]
              ]
            }px`,
          }}
        >
          {ACCIDENTAL_SYMBOL[symbol.accidental]}
        </span>
      ))}
    </span>
  );
}

function RepeatThumbnailStaff() {
  return (
    <>
      {[7, 12, 17, 22, 27].map((y) => (
        <line
          key={y}
          className="repeat-thumbnail-staff-line"
          x1={4}
          x2={68}
          y1={y}
          y2={y}
        />
      ))}
    </>
  );
}

function RepeatDots({ x }: { x: number }) {
  return (
    <>
      <circle className="repeat-thumbnail-dot" cx={x} cy={14} r={1.7} />
      <circle className="repeat-thumbnail-dot" cx={x} cy={20} r={1.7} />
    </>
  );
}

function RepeatBarlinePreview({ kind }: { kind: RepeatJumpKind }) {
  const showStart = kind === 'repeat-start' || kind === 'repeat-both';
  const showEnd = kind === 'repeat-end' || kind === 'repeat-both';

  return (
    <>
      {showStart ? (
        <g>
          <line className="repeat-thumbnail-thick-bar" x1={12} x2={12} y1={6} y2={28} />
          <line className="repeat-thumbnail-thin-bar" x1={17} x2={17} y1={6} y2={28} />
          <RepeatDots x={22} />
        </g>
      ) : null}
      {showEnd ? (
        <g>
          <RepeatDots x={50} />
          <line className="repeat-thumbnail-thin-bar" x1={55} x2={55} y1={6} y2={28} />
          <line className="repeat-thumbnail-thick-bar" x1={60} x2={60} y1={6} y2={28} />
        </g>
      ) : null}
    </>
  );
}

function isEndingRepeat(kind: RepeatJumpKind) {
  return kind === 'ending-1' || kind === 'ending-2' || kind === 'ending-3';
}

function RepeatJumpThumbnail({ kind }: { kind: RepeatJumpKind }) {
  const option = getRepeatJumpOption(kind);
  const endingLabel =
    kind === 'ending-1'
      ? '1.'
      : kind === 'ending-2'
        ? '2.'
        : kind === 'ending-3'
          ? '3.'
          : null;

  return (
    <span className="repeat-thumbnail" aria-hidden="true">
      <svg className="repeat-thumbnail-svg" viewBox="0 0 72 34">
        <RepeatThumbnailStaff />
        {kind.startsWith('repeat') ? <RepeatBarlinePreview kind={kind} /> : null}
        {isEndingRepeat(kind) ? (
          <path
            className="repeat-thumbnail-volta"
            d="M 14 8 H 54 V 18"
          />
        ) : null}
        {endingLabel ? (
          <text className="repeat-thumbnail-text" x={19} y={20}>
            {endingLabel}
          </text>
        ) : null}
        {!kind.startsWith('repeat') && !isEndingRepeat(kind) ? (
          <text
            className="repeat-thumbnail-text repeat-thumbnail-main-text"
            x={36}
            y={20}
          >
            {option?.symbol ?? option?.label ?? kind}
          </text>
        ) : null}
      </svg>
    </span>
  );
}

interface EditorToolbarProps {
  activeKeySignatureSelection: KeySignature | 'custom';
  activeRepeatJump: RepeatJumpKind | null;
  canvasZoom: number;
  futureScoreCount: number;
  importAbcInputRef: RefObject<HTMLInputElement | null>;
  importInputRef: RefObject<HTMLInputElement | null>;
  isPlaying: boolean;
  openPalette: ToolbarPalette;
  pastScoreCount: number;
  scoreTimeSignature: TimeSignature;
  canDeleteSelection: boolean;
  toolState: EditorToolState;
  onAccidentalChange: (accidental: AccidentalChoice) => void;
  onAddMeasure: () => void;
  onCanvasZoomChange: (value: string) => void;
  onClearInteraction: () => void;
  onDeleteSelected: () => void;
  onDottedChange: (dotted: boolean) => void;
  onDownloadAbc: () => void;
  onDownloadProject: () => void;
  onDurationChange: (duration: DurationValue) => void;
  onEntryModeChange: (entryMode: EntryMode) => void;
  onExportPdf: () => void;
  onImportAbcFile: (fileList: FileList | null) => void | Promise<void>;
  onImportProjectFile: (fileList: FileList | null) => void | Promise<void>;
  onKeySignatureChange: (keySignature: KeySignature) => void;
  onLayoutZoneToggle: (show: boolean) => void;
  onLoadProject: () => void;
  onLyricMapToggle: (show: boolean) => void;
  onOpenPaletteChange: (palette: ToolbarPalette) => void;
  onPlacementModeChange: (placementMode: PlacementMode) => void;
  onPlaybackToggle: () => void | Promise<void>;
  onRedo: () => void;
  onRepeatJumpChange: (repeatJump: RepeatJumpKind | null) => void;
  onResetScore: () => void;
  onSaveProject: () => void;
  onTimeSignatureChange: (value: string) => void;
  onTupletChange: (actualNotes: 3 | null) => void;
  onUndo: () => void;
  onVoiceIndexChange: (voiceIndex: EditableVoiceIndex) => void;
}

export function EditorToolbar({
  activeKeySignatureSelection,
  activeRepeatJump,
  canvasZoom,
  futureScoreCount,
  importAbcInputRef,
  importInputRef,
  isPlaying,
  openPalette,
  pastScoreCount,
  scoreTimeSignature,
  canDeleteSelection,
  toolState,
  onAccidentalChange,
  onAddMeasure,
  onCanvasZoomChange,
  onClearInteraction,
  onDeleteSelected,
  onDottedChange,
  onDownloadAbc,
  onDownloadProject,
  onDurationChange,
  onEntryModeChange,
  onExportPdf,
  onImportAbcFile,
  onImportProjectFile,
  onKeySignatureChange,
  onLayoutZoneToggle,
  onLoadProject,
  onLyricMapToggle,
  onOpenPaletteChange,
  onPlacementModeChange,
  onPlaybackToggle,
  onRedo,
  onRepeatJumpChange,
  onResetScore,
  onSaveProject,
  onTimeSignatureChange,
  onTupletChange,
  onUndo,
  onVoiceIndexChange,
}: EditorToolbarProps) {
  return (
    <nav className="toolbar" aria-label="Editor toolbar">
      <div className="toolbar-group" aria-label="Duration tools">
        <span className="toolbar-group-label">Duration</span>
        <button
          type="button"
          aria-label="Select tool"
          className={`tool-button${!toolState.isInputArmed ? ' is-active' : ''}`}
          aria-pressed={!toolState.isInputArmed}
          title="Normal cursor: select, drag, or delete existing notes"
          onClick={onClearInteraction}
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
            onClick={() => onDurationChange(duration)}
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
          onClick={() => onDottedChange(toolState.dots === 0)}
        >
          <span className="tool-symbol" aria-hidden="true">
            .
          </span>
        </button>
        <button
          type="button"
          aria-label="Triplet"
          className={`tool-button${toolState.tuplet === 3 ? ' is-active' : ''}`}
          aria-pressed={toolState.tuplet === 3}
          title="Triplet: split the selected duration into three equal notes"
          onClick={() => onTupletChange(toolState.tuplet === 3 ? null : 3)}
        >
          <span className="tool-symbol tuplet-symbol" aria-hidden="true">
            3
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
              onClick={() => onAccidentalChange(accidental)}
            >
              <span className="tool-symbol" aria-hidden="true">
                {ACCIDENTAL_SYMBOL[accidental]}
              </span>
            </button>
          ),
        )}
      </div>
      <div className="toolbar-group" aria-label="Key signature tools">
        <span className="toolbar-group-label">Key</span>
        <div className="palette-host">
          <button
            type="button"
            aria-expanded={openPalette === 'key'}
            aria-label="Key signature menu"
            className="toolbar-select palette-trigger"
            title="Apply key signature at the selected measure or selected note measure"
            onClick={() => onOpenPaletteChange(openPalette === 'key' ? null : 'key')}
          >
            {activeKeySignatureSelection === 'custom'
              ? 'Custom key signature'
              : getKeySignatureLabel(activeKeySignatureSelection)}
          </button>
          {openPalette === 'key' ? (
            <div
              className="thumbnail-menu key-signature-menu"
              data-testid="key-signature-thumbnail-menu"
              role="menu"
            >
              {activeKeySignatureSelection === 'custom' ? (
                <div className="thumbnail-option is-current" aria-hidden="true">
                  <span className="signature-thumbnail">
                    <span className="signature-staff-lines" />
                  </span>
                  <span>Custom</span>
                </div>
              ) : null}
              {KEY_SIGNATURE_OPTIONS.map((keySignature) => (
                <button
                  key={keySignature}
                  type="button"
                  className={`thumbnail-option${
                    activeKeySignatureSelection === keySignature ? ' is-current' : ''
                  }`}
                  role="menuitem"
                  onClick={() => onKeySignatureChange(keySignature)}
                >
                  <KeySignatureThumbnail keySignature={keySignature} />
                  <span>{keySignature}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="toolbar-group" aria-label="Time signature tools">
        <span className="toolbar-group-label">Time</span>
        <select
          aria-label="Time signature"
          className="toolbar-select compact-select"
          value={getTimeSignatureId(scoreTimeSignature)}
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
      </div>
      <div className="toolbar-group" aria-label="Repeat and jump tools">
        <span className="toolbar-group-label">Repeats</span>
        <div className="palette-host">
          <button
            type="button"
            aria-expanded={openPalette === 'repeat'}
            aria-label="Repeat and jump menu"
            className="toolbar-select palette-trigger"
            title="Apply repeat or jump to the selected measure"
            onClick={() =>
              onOpenPaletteChange(openPalette === 'repeat' ? null : 'repeat')
            }
          >
            {activeRepeatJump
              ? getRepeatJumpOption(activeRepeatJump)?.label ?? activeRepeatJump
              : 'None'}
          </button>
          {openPalette === 'repeat' ? (
            <div
              className="thumbnail-menu repeat-menu"
              data-testid="repeat-jump-thumbnail-menu"
              role="menu"
            >
              <button
                type="button"
                className={`thumbnail-option${!activeRepeatJump ? ' is-current' : ''}`}
                role="menuitem"
                onClick={() => onRepeatJumpChange(null)}
              >
                <span className="repeat-thumbnail" aria-hidden="true">
                  <svg className="repeat-thumbnail-svg" viewBox="0 0 72 34">
                    <RepeatThumbnailStaff />
                    <text
                      className="repeat-thumbnail-text repeat-thumbnail-main-text"
                      x={36}
                      y={20}
                    >
                      {ACCIDENTAL_SYMBOL.none}
                    </text>
                  </svg>
                </span>
                <span>Clear</span>
              </button>
              {REPEAT_JUMP_OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  className={`thumbnail-option${
                    activeRepeatJump === option.kind ? ' is-current' : ''
                  }`}
                  role="menuitem"
                  title={option.description}
                  onClick={() => onRepeatJumpChange(option.kind)}
                >
                  <RepeatJumpThumbnail kind={option.kind} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
            onClick={() => onEntryModeChange(entryMode)}
          >
            <span className="tool-symbol" aria-hidden="true">
              {entryMode === 'note' ? '\u2669' : String.fromCodePoint(0x1d13d)}
            </span>
          </button>
        ))}
      </div>
      <div className="toolbar-group" aria-label="Voice tools">
        <span className="toolbar-group-label">Voice</span>
        {VOICE_OPTIONS.map((voiceIndex) => (
          <button
            key={voiceIndex}
            type="button"
            aria-label={VOICE_LABEL[voiceIndex]}
            className={`tool-button${
              toolState.voiceIndex === voiceIndex ? ' is-active' : ''
            }`}
            aria-pressed={toolState.voiceIndex === voiceIndex}
            title={`${VOICE_LABEL[voiceIndex]} entry lane`}
            onClick={() => onVoiceIndexChange(voiceIndex)}
          >
            V{voiceIndex + 1}
          </button>
        ))}
      </div>
      <div className="toolbar-group" aria-label="Placement tools">
        <span className="toolbar-group-label">Write mode</span>
        {(['place', 'insert'] satisfies PlacementMode[]).map((placementMode) => (
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
            onClick={() => onPlacementModeChange(placementMode)}
          >
            {PLACEMENT_MODE_LABEL[placementMode]}
          </button>
        ))}
      </div>
      <div className="toolbar-group" aria-label="Annotation view tools">
        <span className="toolbar-group-label">Annotations</span>
        <button
          type="button"
          aria-label="Show lyric map"
          aria-pressed={toolState.showLyricMap}
          className={`tool-button${toolState.showLyricMap ? ' is-active' : ''}`}
          title="Show dashed lyric-note links"
          onClick={() => onLyricMapToggle(!toolState.showLyricMap)}
        >
          Map
        </button>
        <button
          type="button"
          aria-label="Show layout zones"
          aria-pressed={toolState.showLayoutZones}
          className={`tool-button${toolState.showLayoutZones ? ' is-active' : ''}`}
          title="Show voice, annotation above, and annotation below zones"
          onClick={() => onLayoutZoneToggle(!toolState.showLayoutZones)}
        >
          Zones
        </button>
      </div>
      <div className="toolbar-group" aria-label="Transport and history">
        <span className="toolbar-group-label">Transport</span>
        <button
          type="button"
          aria-label={isPlaying ? 'Stop' : 'Play'}
          className={`tool-button${isPlaying ? ' is-active' : ''}`}
          onClick={() => void onPlaybackToggle()}
        >
          <span className="tool-symbol" aria-hidden="true">
            {isPlaying ? '\u25a0' : '\u25b6'}
          </span>
        </button>
        <button
          type="button"
          aria-label="Undo"
          className="tool-button"
          disabled={pastScoreCount === 0}
          onClick={onUndo}
        >
          {'\u21b6'}
        </button>
        <button
          type="button"
          aria-label="Redo"
          className="tool-button"
          disabled={futureScoreCount === 0}
          onClick={onRedo}
        >
          {'\u21b7'}
        </button>
        <button type="button" className="tool-button" onClick={onAddMeasure}>
          Add Measure
        </button>
        <button type="button" className="tool-button" onClick={onResetScore}>
          Reset
        </button>
        <button
          type="button"
          className="tool-button"
          disabled={!canDeleteSelection}
          onClick={onDeleteSelected}
        >
          Delete
        </button>
      </div>
      <div className="toolbar-group zoom-toolbar" aria-label="Canvas zoom tools">
        <span className="toolbar-group-label">Zoom</span>
        <input
          aria-label="Canvas zoom"
          className="zoom-slider"
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          value={canvasZoom}
          onChange={(event) => onCanvasZoomChange(event.target.value)}
        />
        <output className="zoom-value" aria-label="Current canvas zoom">
          {canvasZoom}%
        </output>
      </div>
      <div className="toolbar-group" aria-label="Project tools">
        <span className="toolbar-group-label">File</span>
        <button type="button" className="tool-button" onClick={onSaveProject}>
          Save
        </button>
        <button type="button" className="tool-button" onClick={onLoadProject}>
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
          onChange={(event) => void onImportProjectFile(event.target.files)}
        />
        <button type="button" className="tool-button" onClick={onDownloadProject}>
          Download JSON
        </button>
        <button
          type="button"
          className="tool-button"
          onClick={() => importAbcInputRef.current?.click()}
        >
          Import ABC
        </button>
        <input
          ref={importAbcInputRef}
          aria-label="Import ABC notation file"
          className="file-input"
          type="file"
          accept=".abc,text/vnd.abc,text/plain"
          onChange={(event) => void onImportAbcFile(event.target.files)}
        />
        <button type="button" className="tool-button" onClick={onDownloadAbc}>
          Download ABC
        </button>
        <button type="button" className="tool-button" onClick={onExportPdf}>
          Export PDF
        </button>
      </div>
    </nav>
  );
}
