import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react';
import type { EditorToolState } from '../editor/editorState';
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
  onDeleteEvent: (eventId: string, pitchIndex?: number | null) => void;
  onHoverPositionChange: (position: MusicPosition | null) => void;
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
  onPlaceAtPosition: (position: MusicPosition) => void;
  onRequestDeleteMeasure: () => void;
  onSelectEvent: (eventId: string, pitchIndex?: number | null) => void;
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
  selectedMeasure,
  selectedPitchIndex,
  toolState,
  onClearInteraction,
  onClearMeasureContent,
  onConfirmClearMeasureContent,
  onConfirmDeleteMeasure,
  onAnnotationContextMenu,
  onAnnotationPlacementChange,
  onDeleteEvent,
  onHoverPositionChange,
  onInsertMeasureAfter,
  onInsertMeasureBefore,
  onMeasureContextMenu,
  onMoveEvent,
  onMoveKeySignatureSymbol,
  onPlaceAtPosition,
  onRequestDeleteMeasure,
  onSelectEvent,
  onSelectMeasure,
  onSetAnnotationContextMenu,
  onSetPendingMeasureClear,
  onSetPendingMeasureDelete,
  onSheetStageClick,
  onUpdateScoreMetadata,
}: SheetSurfaceProps) {
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
          <StaffRenderer
            duration={toolState.duration}
            dots={toolState.dots}
            entryMode={toolState.entryMode}
            activeEventId={activeEventId}
            activeEventIds={activeEventIds}
            hoverPosition={hoverPosition}
            inputCursor={inputCursor}
            isInputArmed={toolState.isInputArmed}
            invalidMeasureKeys={activeInvalidMeasureKeys}
            playbackBeat={playbackBeat}
            placementMode={toolState.placementMode}
            selectedEventId={selectedEventId}
            selectedPitchIndex={selectedPitchIndex}
            score={score}
            voiceIndex={toolState.voiceIndex}
            onClearInteraction={onClearInteraction}
            onAnnotationContextMenu={onAnnotationContextMenu}
            onHoverPositionChange={onHoverPositionChange}
            onPlaceAtPosition={onPlaceAtPosition}
            onDeleteEvent={onDeleteEvent}
            onMoveKeySignatureSymbol={onMoveKeySignatureSymbol}
            onMeasureContextMenu={onMeasureContextMenu}
            onMoveEvent={onMoveEvent}
            onSelectMeasure={onSelectMeasure}
            onSelectEvent={onSelectEvent}
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
