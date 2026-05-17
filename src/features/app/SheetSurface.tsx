import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react';
import { countScoreEvents } from '../../domain/score/editing';
import type { EditorToolState } from '../editor/editorState';
import { DURATION_LABEL, VOICE_LABEL } from '../editor/editorState';
import type { InputCursor } from '../editor/inputCursor';
import { StaffRenderer } from '../sheet/StaffRenderer';
import type { MusicPosition } from '../sheet/interaction';
import type {
  AnnotationKind,
  AnnotationPlacementSide,
  Score,
  StaffId,
} from '../../domain/score/types';
import type {
  AnnotationContextMenuState,
  ClefChangeTarget,
  MeasureContextMenuState,
  MeasureTarget,
} from './selectionTypes';

interface SheetSurfaceProps {
  activeEventId: string | null;
  activeEventIds: readonly string[];
  activeInvalidMeasureKeys: string[];
  annotationContextMenu: AnnotationContextMenuState | null;
  canvasZoom: number;
  inputCursor: InputCursor | null;
  isPdfExportMode: boolean;
  hoverPosition: MusicPosition | null;
  measureContextMenu: MeasureContextMenuState | null;
  notationViewportRef: RefObject<HTMLDivElement | null>;
  pendingMeasureClear: MeasureTarget | null;
  pendingMeasureDelete: MeasureTarget | null;
  playbackBeat: number | null;
  score: Score;
  selectedEventId: string | null;
  selectedClefChange: ClefChangeTarget | null;
  selectedMeasure: MeasureTarget | null;
  selectedPitchIndex: number | null;
  toolState: EditorToolState;
  getMeasureCount: () => number;
  onClearInteraction: () => void;
  onClearMeasureContent: () => void;
  onConfirmClearMeasureContent: () => void;
  onConfirmDeleteMeasure: () => void;
  onAnnotationContextMenu: (
    eventId: string,
    kind: AnnotationKind,
    clientX: number,
    clientY: number,
  ) => void;
  onAnnotationPlacementChange: (side: AnnotationPlacementSide) => void;
  onAnnotationOffsetChange: (
    eventId: string,
    kind: AnnotationKind,
    offset: { x: number; y: number },
  ) => void;
  onDeleteEvent: (eventId: string, pitchIndex?: number | null) => void;
  onHoverPositionChange: (position: MusicPosition | null) => void;
  onLyricMapChange: (eventId: string, targetEventIds: string[]) => void;
  onInsertMeasureAfter: () => void;
  onInsertMeasureBefore: () => void;
  onMeasureContextMenu: (
    staffId: StaffId,
    measureIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
  onMoveEvent: (
    eventId: string,
    position: MusicPosition,
    pitchIndex?: number | null,
  ) => void;
  onMoveKeySignatureSymbol: (
    sourceMeasureIndex: number,
    symbolIndex: number,
    position: MusicPosition,
  ) => void;
  onMoveClefChange: (
    target: ClefChangeTarget,
    position: MusicPosition,
  ) => void;
  onPlaceAtPosition: (position: MusicPosition) => void;
  onRequestDeleteMeasure: () => void;
  onSelectEvent: (eventId: string, pitchIndex?: number | null) => void;
  onSelectClefChange: (target: ClefChangeTarget) => void;
  onSelectMeasure: (staffId: StaffId, measureIndex: number) => void;
  onSetAnnotationContextMenu: (target: AnnotationContextMenuState | null) => void;
  onSetPendingMeasureClear: (target: MeasureTarget | null) => void;
  onSetPendingMeasureDelete: (target: MeasureTarget | null) => void;
  onSheetStageClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onUpdateScoreMetadata: (
    update: Partial<Pick<Score, 'composer' | 'title'>>,
  ) => void;
}

export function SheetSurface({
  activeEventId,
  activeEventIds,
  activeInvalidMeasureKeys,
  annotationContextMenu,
  canvasZoom,
  getMeasureCount,
  hoverPosition,
  inputCursor,
  isPdfExportMode,
  measureContextMenu,
  notationViewportRef,
  pendingMeasureClear,
  pendingMeasureDelete,
  playbackBeat,
  score,
  selectedEventId,
  selectedClefChange,
  selectedMeasure,
  selectedPitchIndex,
  toolState,
  onClearInteraction,
  onClearMeasureContent,
  onConfirmClearMeasureContent,
  onConfirmDeleteMeasure,
  onAnnotationContextMenu,
  onAnnotationOffsetChange,
  onAnnotationPlacementChange,
  onDeleteEvent,
  onHoverPositionChange,
  onLyricMapChange,
  onInsertMeasureAfter,
  onInsertMeasureBefore,
  onMeasureContextMenu,
  onMoveEvent,
  onMoveClefChange,
  onMoveKeySignatureSymbol,
  onPlaceAtPosition,
  onRequestDeleteMeasure,
  onSelectEvent,
  onSelectClefChange,
  onSelectMeasure,
  onSetAnnotationContextMenu,
  onSetPendingMeasureClear,
  onSetPendingMeasureDelete,
  onSheetStageClick,
  onUpdateScoreMetadata,
}: SheetSurfaceProps) {
  const eventCount = countScoreEvents(score);
  const showComposerStartCue = !isPdfExportMode && eventCount === 0;

  return (
    <section
      className="sheet-stage"
      aria-label="Sheet surface"
      onClick={onSheetStageClick}
    >
      <div
        className={`paper paper-${score.pageSize}`}
        style={
          {
            '--canvas-zoom': isPdfExportMode ? 1 : canvasZoom / 100,
          } as CSSProperties
        }
      >
        <div className="paper-heading">
          <input
            aria-label="Score title"
            className="score-title-input"
            value={score.title}
            onChange={(event) =>
              onUpdateScoreMetadata({ title: event.target.value })
            }
            onClick={onClearInteraction}
            onFocus={onClearInteraction}
          />
          <div className="score-meta-row">
            <span>Moderato {'\u2669'} = {toolState.tempo}</span>
            <input
              aria-label="Composer"
              className="score-composer-input"
              placeholder="Composer"
              value={score.composer}
              onChange={(event) =>
                onUpdateScoreMetadata({ composer: event.target.value })
              }
              onClick={onClearInteraction}
              onFocus={onClearInteraction}
            />
          </div>
        </div>
        <div
          ref={notationViewportRef}
          className="notation-scroll"
          aria-label="Notation viewport"
        >
          {showComposerStartCue ? (
            <div
              className="composer-start-cue"
              aria-label="Empty score composer state"
            >
              <span>First event</span>
              <strong>
                {toolState.isInputArmed
                  ? `${DURATION_LABEL[toolState.duration]} ${
                      toolState.entryMode === 'note' ? 'note' : 'rest'
                    }`
                  : 'Select mode'}
              </strong>
              <span>
                {VOICE_LABEL[toolState.voiceIndex]} /{' '}
                {toolState.placementMode === 'insert' ? 'Insert' : 'Place'}
              </span>
            </div>
          ) : null}
          <StaffRenderer
            duration={toolState.duration}
            dots={toolState.dots}
            entryMode={toolState.entryMode}
            activeEventId={activeEventId}
            activeEventIds={activeEventIds}
            hoverPosition={hoverPosition}
            inputCursor={inputCursor}
            isInputArmed={toolState.isInputArmed}
            clefChange={toolState.clefChange}
            invalidMeasureKeys={activeInvalidMeasureKeys}
            playbackBeat={playbackBeat}
            placementMode={toolState.placementMode}
            selectedEventId={selectedEventId}
            selectedPitchIndex={selectedPitchIndex}
            score={score}
            showLayoutZones={toolState.showLayoutZones}
            showLyricMap={toolState.showLyricMap}
            voiceIndex={toolState.voiceIndex}
            onClearInteraction={onClearInteraction}
            onAnnotationContextMenu={onAnnotationContextMenu}
            onAnnotationOffsetChange={onAnnotationOffsetChange}
            onHoverPositionChange={onHoverPositionChange}
            onLyricMapChange={onLyricMapChange}
            onPlaceAtPosition={onPlaceAtPosition}
            onDeleteEvent={onDeleteEvent}
            onMoveKeySignatureSymbol={onMoveKeySignatureSymbol}
            onMoveClefChange={onMoveClefChange}
            onMeasureContextMenu={onMeasureContextMenu}
            onMoveEvent={onMoveEvent}
            onSelectMeasure={onSelectMeasure}
            onSelectEvent={onSelectEvent}
            onSelectClefChange={onSelectClefChange}
            selectedClefChangeId={selectedClefChange?.clefChangeId ?? null}
            selectedMeasure={selectedMeasure}
          />
        </div>
      </div>
      {measureContextMenu ? (
        <div
          className="measure-context-menu"
          data-testid="measure-context-menu"
          role="menu"
          style={{
            left: measureContextMenu.clientX,
            top: measureContextMenu.clientY,
          }}
        >
          <p>
            Measure {measureContextMenu.measureIndex + 1}{' '}
            {measureContextMenu.staffId}
          </p>
          <button type="button" role="menuitem" onClick={onClearMeasureContent}>
            Clear content
          </button>
          <button type="button" role="menuitem" onClick={onInsertMeasureBefore}>
            Add measure before
          </button>
          <button type="button" role="menuitem" onClick={onInsertMeasureAfter}>
            Add measure after
          </button>
          <button
            type="button"
            disabled={getMeasureCount() <= 1}
            role="menuitem"
            onClick={onRequestDeleteMeasure}
          >
            Delete measure
          </button>
        </div>
      ) : null}
      {annotationContextMenu ? (
        <div
          className="measure-context-menu annotation-context-menu"
          data-testid="annotation-context-menu"
          role="menu"
          style={{
            left: annotationContextMenu.clientX,
            top: annotationContextMenu.clientY,
          }}
        >
          <p>{annotationContextMenu.kind}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => onAnnotationPlacementChange('auto')}
          >
            Auto
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onAnnotationPlacementChange('above')}
          >
            Move above
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onAnnotationPlacementChange('below')}
          >
            Move below
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onSetAnnotationContextMenu(null)}
          >
            Close
          </button>
        </div>
      ) : null}
      {pendingMeasureDelete ? (
        <div
          className="measure-warning-backdrop"
          data-testid="measure-delete-warning"
          role="presentation"
        >
          <div
            aria-label="Delete measure warning"
            aria-modal="true"
            className="measure-warning-dialog"
            role="dialog"
          >
            <h2>Delete measure?</h2>
            <p>
              This removes measure {pendingMeasureDelete.measureIndex + 1} from
              every staff. This action can be undone.
            </p>
            <div className="measure-warning-actions">
              <button
                type="button"
                className="tool-button"
                onClick={() => onSetPendingMeasureDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tool-button danger"
                onClick={onConfirmDeleteMeasure}
              >
                Delete measure
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingMeasureClear ? (
        <div
          className="measure-warning-backdrop"
          data-testid="measure-clear-warning"
          role="presentation"
        >
          <div
            aria-label="Clear measure content warning"
            aria-modal="true"
            className="measure-warning-dialog"
            role="dialog"
          >
            <h2>Clear measure content?</h2>
            <p>
              This removes notes and rests from measure{' '}
              {pendingMeasureClear.measureIndex + 1} on the selected staff. This
              action can be undone.
            </p>
            <div className="measure-warning-actions">
              <button
                type="button"
                className="tool-button"
                onClick={() => onSetPendingMeasureClear(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tool-button danger"
                onClick={onConfirmClearMeasureContent}
              >
                Clear content
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
