import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { EditorToolState } from '../editor/editorState';
import type { InputCursor } from '../editor/inputCursor';
import { buildFingeringHints } from '../fingering/fingeringHints';
import { StaffRenderer } from '../sheet/StaffRenderer';
import type { MusicPosition } from '../sheet/interaction';
import { getScoreSvgWidth } from '../sheet/layout';
import {
  getInitialScorePageIndexes,
  getNearbyScorePageIndexes,
  getScorePageForMeasureIndex,
  getScorePageViewports,
} from '../sheet/pageLayout';
import type {
  AnnotationKind,
  AnnotationOffset,
  AnnotationPlacementSide,
  Score,
  StaffId,
} from '../../domain/score/types';
import type {
  AnnotationContextMenuState,
  AnnotationTarget,
  ClefChangeTarget,
  MeasureContextMenuState,
  MeasureTarget,
} from './selectionTypes';

const PAGE_OBSERVER_DELAY_MS = 160;

export interface ReferenceBackground {
  kind: 'image' | 'pdf';
  name: string;
  opacity: number;
  url: string;
}

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
  referenceBackground: ReferenceBackground | null;
  score: Score;
  selectedAnnotation: AnnotationTarget | null;
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
    side: Exclude<AnnotationPlacementSide, 'auto'>,
    offset: AnnotationOffset,
  ) => void;
  onAnnotationPlacementChange: (side: AnnotationPlacementSide) => void;
  onAnnotationOffsetChange: (
    eventId: string,
    kind: AnnotationKind,
    offset: { x: number; y: number },
  ) => void;
  onSelectAnnotation: (target: AnnotationTarget) => void;
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
  referenceBackground,
  score,
  selectedAnnotation,
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
  onSelectAnnotation,
  onSelectClefChange,
  onSelectMeasure,
  onSetAnnotationContextMenu,
  onSetPendingMeasureClear,
  onSetPendingMeasureDelete,
  onSheetStageClick,
  onUpdateScoreMetadata,
}: SheetSurfaceProps) {
  const pageViewports = useMemo(() => getScorePageViewports(score), [score]);
  const fingeringHints = useMemo(
    () => (toolState.showFingeringHints ? buildFingeringHints(score) : []),
    [score, toolState.showFingeringHints],
  );
  const [renderedPageIndexes, setRenderedPageIndexes] = useState<Set<number>>(
    () => getInitialScorePageIndexes(1),
  );
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const playbackMeasureIndex =
    playbackBeat !== null ? Math.floor(playbackBeat / beatsPerMeasure) : null;
  const scoreSvgWidth = getScoreSvgWidth(score);
  const stageRef = useRef<HTMLElement | null>(null);
  const lastFollowedPlaybackMeasureRef = useRef<number | null>(null);

  function scrollPageIntoView(pageIndex: number, behavior: ScrollBehavior = 'smooth') {
    const pageElement = stageRef.current?.querySelector<HTMLElement>(
      `.paper-page[data-page-index="${pageIndex}"]`,
    );

    pageElement?.scrollIntoView({
      behavior,
      block: 'start',
      inline: 'nearest',
    });
  }

  function handlePageNavigation(pageIndex: number) {
    const safePageIndex = Math.min(
      pageViewports.length - 1,
      Math.max(0, pageIndex),
    );

    setCurrentPageIndex(safePageIndex);
    setRenderedPageIndexes(
      getNearbyScorePageIndexes(safePageIndex, pageViewports.length),
    );
    window.requestAnimationFrame(() => scrollPageIntoView(safePageIndex));
  }

  useEffect(() => {
    setRenderedPageIndexes(getInitialScorePageIndexes(pageViewports.length));
    setCurrentPageIndex(0);
  }, [pageViewports.length, score.id]);

  useEffect(() => {
    if (isPdfExportMode || pageViewports.length <= 1) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setRenderedPageIndexes(
        new Set(pageViewports.map((pageViewport) => pageViewport.index)),
      );
      return;
    }

    let observer: IntersectionObserver | null = null;
    const observerDelay = window.setTimeout(() => {
      const pageElements =
        stageRef.current?.querySelectorAll<HTMLElement>('.paper-page') ?? [];

      observer = new IntersectionObserver(
        (entries) => {
          const visiblePage = entries.reduce<{
            index: number;
            ratio: number;
          } | null>((bestPage, entry) => {
            if (!entry.isIntersecting) {
              return bestPage;
            }

            const pageIndex = Number(
              (entry.target as HTMLElement).dataset.pageIndex,
            );

            if (!Number.isFinite(pageIndex)) {
              return bestPage;
            }

            if (!bestPage || entry.intersectionRatio > bestPage.ratio) {
              return { index: pageIndex, ratio: entry.intersectionRatio };
            }

            return bestPage;
          }, null);

          if (!visiblePage) {
            return;
          }

          setCurrentPageIndex(visiblePage.index);
          setRenderedPageIndexes(
            getNearbyScorePageIndexes(visiblePage.index, pageViewports.length),
          );
        },
        {
          root: null,
          rootMargin: '360px 0px',
        },
      );

      pageElements.forEach((pageElement) => observer?.observe(pageElement));
    }, PAGE_OBSERVER_DELAY_MS);

    return () => {
      window.clearTimeout(observerDelay);
      observer?.disconnect();
    };
  }, [isPdfExportMode, pageViewports.length]);

  useEffect(() => {
    if (playbackMeasureIndex === null) {
      return;
    }

    const playbackPage = getScorePageForMeasureIndex(
      pageViewports,
      playbackMeasureIndex,
    );

    if (!playbackPage) {
      return;
    }

    setRenderedPageIndexes(
      getNearbyScorePageIndexes(playbackPage.index, pageViewports.length),
    );
    setCurrentPageIndex(playbackPage.index);
  }, [pageViewports, playbackMeasureIndex]);

  useEffect(() => {
    if (!selectedMeasure) {
      return;
    }

    const selectedPage = getScorePageForMeasureIndex(
      pageViewports,
      selectedMeasure.measureIndex,
    );

    if (!selectedPage) {
      return;
    }

    setRenderedPageIndexes(
      getNearbyScorePageIndexes(selectedPage.index, pageViewports.length),
    );
    setCurrentPageIndex(selectedPage.index);
  }, [pageViewports, selectedMeasure]);

  useEffect(() => {
    if (playbackMeasureIndex === null) {
      lastFollowedPlaybackMeasureRef.current = null;
      return;
    }

    if (lastFollowedPlaybackMeasureRef.current === playbackMeasureIndex) {
      return;
    }

    lastFollowedPlaybackMeasureRef.current = playbackMeasureIndex;
    window.requestAnimationFrame(() => {
      const playhead = stageRef.current?.querySelector('.playhead');

      if (!(playhead instanceof SVGElement)) {
        return;
      }

      const bounds = playhead.getBoundingClientRect();
      const topGuard = 180;
      const bottomGuard = window.innerHeight - 96;

      if (bounds.top < topGuard || bounds.bottom > bottomGuard) {
        playhead.scrollIntoView({
          block: 'center',
          inline: 'nearest',
        });
      }
    });
  }, [playbackMeasureIndex]);

  return (
    <section
      ref={stageRef}
      className="sheet-stage"
      aria-label="Sheet surface"
      onClick={onSheetStageClick}
    >
      <div
        ref={notationViewportRef}
        className="paper-stack"
        style={
          {
            '--canvas-zoom': isPdfExportMode ? 1 : canvasZoom / 100,
          } as CSSProperties
        }
      >
        {pageViewports.length > 1 && !isPdfExportMode ? (
          <div className="sheet-page-controls" aria-label="Score pages">
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPageIndex <= 0}
              onClick={(event) => {
                event.stopPropagation();
                handlePageNavigation(currentPageIndex - 1);
              }}
            >
              {'<'}
            </button>
            <span>
              Page {currentPageIndex + 1} / {pageViewports.length}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPageIndex >= pageViewports.length - 1}
              onClick={(event) => {
                event.stopPropagation();
                handlePageNavigation(currentPageIndex + 1);
              }}
            >
              {'>'}
            </button>
          </div>
        ) : null}
        {pageViewports.map((pageViewport) => {
          const isPlaybackPage =
            playbackMeasureIndex !== null &&
            pageViewport.measureIndexes.includes(playbackMeasureIndex);
          const shouldRenderPage =
            isPdfExportMode ||
            pageViewports.length <= 1 ||
            renderedPageIndexes.has(pageViewport.index) ||
            isPlaybackPage;

          return (
            <div
              key={pageViewport.index}
              className={`paper paper-page paper-${score.pageSize}`}
              data-page-index={pageViewport.index}
              style={
                {
                  '--canvas-zoom': isPdfExportMode ? 1 : canvasZoom / 100,
                } as CSSProperties
              }
            >
              {pageViewport.index === 0 ? (
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
              ) : null}
              <div
                className="notation-scroll"
                aria-label={
                  pageViewports.length === 1
                    ? 'Notation viewport'
                    : `Notation viewport page ${pageViewport.index + 1}`
                }
              >
                {referenceBackground ? (
                  <div
                    aria-hidden="true"
                    className={`reference-background reference-background-${referenceBackground.kind}`}
                    style={{ opacity: referenceBackground.opacity }}
                  >
                    {referenceBackground.kind === 'pdf' ? (
                      <object
                        data={referenceBackground.url}
                        title={referenceBackground.name}
                        type="application/pdf"
                      />
                    ) : (
                      <img
                        alt=""
                        src={referenceBackground.url}
                      />
                    )}
                  </div>
                ) : null}
                {shouldRenderPage ? (
                  <StaffRenderer
                    duration={toolState.duration}
                    dots={toolState.dots}
                    entryMode={toolState.entryMode}
                    activeEventId={isPlaybackPage ? activeEventId : null}
                    activeEventIds={isPlaybackPage ? activeEventIds : []}
                    hoverPosition={hoverPosition}
                    inputCursor={inputCursor}
                    isInputArmed={toolState.isInputArmed}
                    clefChange={toolState.clefChange}
                    invalidMeasureKeys={activeInvalidMeasureKeys}
                    fingeringHints={fingeringHints}
                    pageViewport={pageViewport}
                    playbackBeat={isPlaybackPage ? playbackBeat : null}
                    placementMode={toolState.placementMode}
                    selectedEventId={selectedEventId}
                    selectedAnnotation={selectedAnnotation}
                    selectedPitchIndex={selectedPitchIndex}
                    score={score}
                    showLayoutZones={toolState.showLayoutZones}
                    showFingeringHints={toolState.showFingeringHints}
                    showLyricMap={toolState.showLyricMap}
                    showMeasureNumbers={toolState.showMeasureNumbers}
                    voiceIndex={toolState.voiceIndex}
                    onClearInteraction={onClearInteraction}
                    onAnnotationContextMenu={onAnnotationContextMenu}
                    onAnnotationOffsetChange={onAnnotationOffsetChange}
                    onSelectAnnotation={onSelectAnnotation}
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
                    selectedClefChangeId={
                      selectedClefChange?.clefChangeId ?? null
                    }
                    selectedMeasure={selectedMeasure}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="page-render-placeholder"
                    style={{
                      aspectRatio: `${scoreSvgWidth} / ${pageViewport.height}`,
                    }}
                  />
                )}
              </div>
              {pageViewports.length > 1 ? (
                <div className="paper-page-number">
                  {pageViewport.index + 1} / {pageViewports.length}
                </div>
              ) : null}
            </div>
          );
        })}
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
            onClick={() => {
              onAnnotationOffsetChange(
                annotationContextMenu.eventId,
                annotationContextMenu.kind,
                { x: 0, y: 0 },
              );
              onSetAnnotationContextMenu(null);
            }}
          >
            Reset position
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
