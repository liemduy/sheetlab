import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Score } from '../../domain/score/types';
import type {
  AnnotationKind,
  AnnotationPlacementSide,
  Clef,
  DurationValue,
  StaffId,
} from '../../domain/score/types';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import { getKeySignatureSymbolMoveIssue } from '../../domain/score/keySignatures';
import { getEventDots } from '../../domain/score/events';
import { clampAnnotationOffset } from '../../domain/score/annotationOffsets';
import { getLyricMapTargetEventIds } from '../../domain/score/lyricMapping';
import {
  getActiveClef,
  getActiveClefState,
} from '../../domain/score/clefChanges';
import { getStoredPitchForClefOctaveShift } from '../../domain/score/pitchRange';
import type { AnnotationTarget } from '../app/selectionTypes';
import type { EntryMode, PlacementMode } from '../editor/editorState';
import type { InputCursor } from '../editor/inputCursor';
import {
  formatPitch,
  mapPointToMusicPosition,
  mapScoreStaffYToPitch,
} from './interaction';
import type { MusicPosition } from './interaction';
import {
  STAFF_LEFT,
  STAFF_LINE_SPACING,
  SVG_WIDTH,
  getLocalMeasureIndex,
  getScoreStaffTop,
  getMeasureX,
  getMeasureRight,
  isScoreSystemEndMeasure,
} from './layout';
import { getPitchYForScore } from './notationGeometry';
import { getBeatX } from './notationGeometry';
import { getMeasureKey } from './measureKey';
import {
  getKeySignatureSymbolLayouts,
  type KeySignatureSymbolLayout,
} from './keySignatureLayout';
import {
  inputCursorToMusicPosition,
  snapPositionToInputGrid,
} from './overlayPositioning';
import { snapInsertPositionToEventBoundary } from './insertPosition';
import { EventHitTarget } from './OverlayEventHitTarget';
import {
  GhostEvent,
  InsertionCursor,
  ClefChangePreview,
  RhythmSlots,
  StaffHoverGuide,
} from './OverlayInputLayer';
import {
  getInsertTargetEvent,
  resolveInsertDisplayPosition,
} from './insertPreview';
import { findClosestRenderedInsertTarget } from './renderedEventTargets';
import { KeySignatureSymbolTarget } from './OverlayKeySignatureTarget';
import {
  ClefChangeTarget,
  getClefChangeTargetLayouts,
  type ClefChangeTargetLayout,
} from './OverlayClefChangeTarget';
import {
  InvalidMeasureWarning,
  MeasureHitTarget,
} from './OverlayMeasureLayer';
import {
  AnnotationDragPreview,
  AnnotationHitTargets,
} from './OverlayAnnotationLayer';
import { resolveAnnotationDragOffset } from './annotationDrag';
import {
  LyricMapConnectors,
  LyricMapPreview,
  getClosestPitchedEventId,
  type LyricMapDragAnchor,
} from './OverlayLyricMapLayer';
import { PlaybackLayer } from './OverlayPlaybackLayer';
import {
  getScorePageViewBox,
  type ScorePageViewport,
} from './pageLayout';
import { VoiceZoneDebugOverlay } from './OverlayVoiceZoneLayer';
import { getNestedSvgPoint, getSvgPoint } from './overlaySvgPoint';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
  RenderedVoiceZoneLayout,
} from './renderedEventLayout';

interface NotationOverlayProps {
  activeEventId?: string | null;
  activeEventIds?: readonly string[];
  rangeEventIds?: readonly string[];
  clefChange?: Clef | null;
  dots: number;
  duration: DurationValue;
  entryMode: EntryMode;
  annotationLayouts?: RenderedAnnotationLayout[];
  eventLayouts?: Record<string, RenderedEventLayout>;
  hoverPosition?: MusicPosition | null;
  inputCursor?: InputCursor | null;
  isInputArmed?: boolean;
  invalidMeasureKeys?: readonly string[];
  showLayoutZones?: boolean;
  showLyricMap?: boolean;
  onClearInteraction?: () => void;
  onHoverPositionChange?: (position: MusicPosition | null) => void;
  onPlaceAtPosition?: (position: MusicPosition) => void;
  onSelectEvent?: (eventId: string, pitchIndex?: number | null) => void;
  onRangeEventPick?: (eventId: string) => void;
  onDeleteEvent?: (eventId: string, pitchIndex?: number | null) => void;
  onMeasureContextMenu?: (
    staffId: StaffId,
    measureIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
  onAnnotationContextMenu?: (
    eventId: string,
    kind: AnnotationKind,
    clientX: number,
    clientY: number,
    side: Exclude<AnnotationPlacementSide, 'auto'>,
    offset: { x: number; y: number },
  ) => void;
  onAnnotationOffsetChange?: (
    eventId: string,
    kind: AnnotationKind,
    offset: { x: number; y: number },
  ) => void;
  onSelectAnnotation?: (target: AnnotationTarget) => void;
  onLyricMapChange?: (eventId: string, targetEventIds: string[]) => void;
  onMoveEvent?: (
    eventId: string,
    position: MusicPosition,
    pitchIndex?: number | null,
  ) => void;
  onMoveKeySignatureSymbol?: (
    sourceMeasureIndex: number,
    symbolIndex: number,
    position: MusicPosition,
  ) => void;
  onMoveClefChange?: (
    target: {
      clefChangeId: string;
      measureIndex: number;
      staffId: StaffId;
    },
    position: MusicPosition,
  ) => void;
  onSelectClefChange?: (target: {
    clefChangeId: string;
    measureIndex: number;
    staffId: StaffId;
  }) => void;
  onSelectMeasure?: (staffId: StaffId, measureIndex: number) => void;
  pageViewport?: ScorePageViewport;
  playbackBeat?: number | null;
  placementMode?: PlacementMode;
  score: Score;
  selectedEventId?: string | null;
  selectedClefChangeId?: string | null;
  selectedAnnotation?: AnnotationTarget | null;
  selectedMeasure?: { staffId: StaffId; measureIndex: number } | null;
  selectedPitchIndex?: number | null;
  svgHeight: number;
  svgWidth?: number;
  voiceZoneLayouts?: RenderedVoiceZoneLayout[];
  voiceIndex?: number;
}

const KEY_SIGNATURE_SYMBOL_DISPLAY_TEXT = {
  flat: '♭',
  sharp: '♯',
} as const;

export function NotationOverlay({
  activeEventId,
  activeEventIds = [],
  rangeEventIds = [],
  annotationLayouts = [],
  clefChange = null,
  dots,
  duration,
  entryMode,
  eventLayouts = {},
  hoverPosition,
  inputCursor,
  isInputArmed = false,
  invalidMeasureKeys = [],
  onClearInteraction,
  onHoverPositionChange,
  onMoveEvent,
  onMoveClefChange,
  onMoveKeySignatureSymbol,
  onAnnotationContextMenu,
  onAnnotationOffsetChange,
  onSelectAnnotation,
  onLyricMapChange,
  onPlaceAtPosition,
  onDeleteEvent,
  onMeasureContextMenu,
  onSelectMeasure,
  onSelectEvent,
  onRangeEventPick,
  onSelectClefChange,
  pageViewport,
  playbackBeat,
  placementMode = 'place',
  score,
  selectedEventId,
  selectedClefChangeId,
  selectedAnnotation,
  selectedMeasure,
  selectedPitchIndex,
  showLayoutZones = false,
  showLyricMap = false,
  svgHeight,
  svgWidth = SVG_WIDTH,
  voiceZoneLayouts = [],
  voiceIndex = 0,
}: NotationOverlayProps) {
  const [dragState, setDragState] = useState<{
    eventId: string;
    hasMoved: boolean;
    originPosition: MusicPosition | null;
    pitchIndex: number | null;
    previewPosition: MusicPosition | null;
    startClientX: number;
    startClientY: number;
    startSvgX: number;
    startSvgY: number;
  } | null>(null);
  const [keySignatureDragState, setKeySignatureDragState] = useState<{
    hasMoved: boolean;
    layout: KeySignatureSymbolLayout;
    previewPosition: MusicPosition | null;
    startClientX: number;
    startClientY: number;
    startSvgX: number;
    startSvgY: number;
  } | null>(null);
  const [clefChangeDragState, setClefChangeDragState] = useState<{
    hasMoved: boolean;
    layout: ClefChangeTargetLayout;
    previewIssue: string | null;
    previewPosition: MusicPosition | null;
    startClientX: number;
    startClientY: number;
    startSvgX: number;
    startSvgY: number;
  } | null>(null);
  const [lyricMapDragState, setLyricMapDragState] = useState<(LyricMapDragAnchor & {
    previewPoint: { x: number; y: number } | null;
  }) | null>(null);
  const [annotationDragState, setAnnotationDragState] = useState<{
    hasMoved: boolean;
    layout: RenderedAnnotationLayout;
    previewOffset: { x: number; y: number } | null;
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
    startSvgX: number;
    startSvgY: number;
  } | null>(null);
  const [deleteHoverEventId, setDeleteHoverEventId] = useState<string | null>(
    null,
  );
  const suppressNextPlaceRef = useRef(false);
  const staves = score.parts[0]?.staves ?? [];
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const viewBox = getScorePageViewBox(pageViewport, svgWidth, svgHeight);
  const visibleMeasureIndexSet = pageViewport
    ? new Set(pageViewport.measureIndexes)
    : null;
  const isMeasureVisible = (measureIndex: number) =>
    !visibleMeasureIndexSet || visibleMeasureIndexSet.has(measureIndex);
  const playbackMeasureIndex =
    playbackBeat !== null && playbackBeat !== undefined
      ? Math.floor(playbackBeat / beatsPerMeasure)
      : null;
  const visiblePlaybackBeat =
    playbackMeasureIndex === null || isMeasureVisible(playbackMeasureIndex)
      ? playbackBeat
      : null;
  const keySignatureSymbolLayouts = getKeySignatureSymbolLayouts(score);
  const clefChangeTargetLayouts = getClefChangeTargetLayouts({
    eventLayouts,
    score,
  });
  const invalidMeasureKeySet = new Set(invalidMeasureKeys);
  const activeEventIdSet = new Set([
    ...activeEventIds,
    ...rangeEventIds,
    ...(activeEventId ? [activeEventId] : []),
  ]);
  const ariaLabel =
    score.type === 'grand' ? 'Grand staff notation system' : 'Treble staff notation system';
  const draggedEvent =
    dragState === null
      ? null
      : staves
          .flatMap((staff) => staff.measures)
          .flatMap((measure) => measure.voices)
          .flatMap((voice) => voice.events)
          .find((event) => event.id === dragState.eventId) ?? null;
  const inputCursorPosition =
    inputCursor && (hoverPosition || inputCursor.source === 'keyboard')
      ? inputCursorToMusicPosition(inputCursor, score)
      : null;
  const cursorMatchesHover =
    Boolean(inputCursor && hoverPosition) &&
    inputCursor?.staffId === hoverPosition?.staffId &&
    inputCursor?.measureIndex === hoverPosition?.measureIndex &&
    Math.abs((inputCursor?.beat ?? 0) - (hoverPosition?.beat ?? 0)) <= 0.0001;
  const hoverSourcePosition =
    cursorMatchesHover ? inputCursorPosition : hoverPosition ?? inputCursorPosition;
  const preferredStaffId =
    hoverPosition?.staffId ?? inputCursor?.staffId ?? null;
  const snappedHoverPosition = hoverSourcePosition
    ? snapPositionToInputGrid(
        hoverSourcePosition,
        duration,
        dots,
        score,
        eventLayouts,
        voiceIndex,
        { preferRenderedPosition: !cursorMatchesHover },
      )
    : null;
  const shouldShowInputPreview =
    isInputArmed &&
    !dragState &&
    !keySignatureDragState &&
    !clefChangeDragState &&
    !lyricMapDragState &&
    !annotationDragState &&
    !deleteHoverEventId &&
    !selectedEventId;
  const displayHoverPosition =
    shouldShowInputPreview && placementMode === 'insert' && snappedHoverPosition
      ? resolveInsertDisplayPosition({
          dots,
          duration,
          eventLayouts,
          position: snappedHoverPosition,
          score,
          voiceIndex,
        })
      : shouldShowInputPreview
        ? snappedHoverPosition
        : null;
  const displayInputCursor =
    inputCursor && displayHoverPosition
      ? {
          ...inputCursor,
          beat: displayHoverPosition.beat,
          clientX: displayHoverPosition.clientX,
          clientY: displayHoverPosition.clientY,
          measureIndex: displayHoverPosition.measureIndex,
          pitchPreview: displayHoverPosition.pitch,
          staffId: displayHoverPosition.staffId,
          staffIndex: displayHoverPosition.staffIndex,
        }
      : placementMode === 'insert'
        ? null
        : inputCursor;

  function getEventMusicPosition(event: MouseEvent<SVGSVGElement>) {
    const position = mapPointToMusicPosition(
      getSvgPoint(event, svgHeight),
      score,
      {
        dots,
        duration,
        preferredStaffId,
      },
    );

    return position
      ? {
          ...position,
          clientX: event.clientX,
          clientY: event.clientY,
        }
      : null;
  }

  function getDragMusicPosition(event: MouseEvent<SVGSVGElement>) {
    const point = getSvgPoint(event, svgHeight);

    if (!dragState?.originPosition) {
      const position = mapPointToMusicPosition(point, score, {
        dots: draggedEvent ? getEventDots(draggedEvent) : dots,
        duration: draggedEvent?.duration ?? duration,
        preferredStaffId,
      });

      return position
        ? {
            ...position,
            clientX: event.clientX,
            clientY: event.clientY,
          }
        : null;
    }

    const origin = dragState.originPosition;
    const mappedPosition = mapPointToMusicPosition(
      {
        ...point,
        x: origin.x,
      },
      score,
      {
        dots: draggedEvent ? getEventDots(draggedEvent) : dots,
        duration: draggedEvent?.duration ?? duration,
        preferredStaffId: origin.staffId,
      },
    );
    const targetStaffIndex = mappedPosition?.staffIndex ?? origin.staffIndex;
    const staff = staves[targetStaffIndex];

    if (!staff) {
      return null;
    }

    const targetMeasureIndex = mappedPosition?.measureIndex ?? origin.measureIndex;
    const activeClefState = getActiveClefState(
      score,
      staff.id,
      targetMeasureIndex,
      origin.beat,
    );
    const displayPitch = mapScoreStaffYToPitch(
      point.y,
      activeClefState.clef,
      targetStaffIndex,
      score,
      targetMeasureIndex,
    );
    const y = getPitchYForScore(
      displayPitch,
      activeClefState.clef,
      targetStaffIndex,
      score,
      targetMeasureIndex,
    );
    const pitch = getStoredPitchForClefOctaveShift(
      displayPitch,
      activeClefState.octaveShift,
    );

    return {
      ...origin,
      clientX: event.clientX,
      clientY: event.clientY,
      pitch,
      staffId: staff.id,
      staffIndex: targetStaffIndex,
      measureIndex: targetMeasureIndex,
      y,
    };
  }

  function getAnnotationAttachmentPoint(layout: RenderedAnnotationLayout) {
    const eventLayout = eventLayouts[layout.eventId];

    if (!eventLayout) {
      return null;
    }

    const pitchLayout =
      eventLayout.pitchLayouts.length > 0
        ? eventLayout.pitchLayouts.reduce((anchoredPitch, candidate) => {
            if (layout.side === 'above') {
              return candidate.y < anchoredPitch.y ? candidate : anchoredPitch;
            }

            return candidate.y > anchoredPitch.y ? candidate : anchoredPitch;
          })
        : null;

    return pitchLayout
      ? { x: pitchLayout.x, y: pitchLayout.y }
      : { x: eventLayout.x, y: eventLayout.y };
  }

  function getKeySignatureDragMusicPosition(event: MouseEvent<SVGSVGElement>) {
    if (!keySignatureDragState) {
      return null;
    }

    const layout = keySignatureDragState.layout;
    const staff = staves[layout.staffIndex];

    if (!staff) {
      return null;
    }

    const point = getSvgPoint(event, svgHeight);
    const activeClef = getActiveClef(
      score,
      staff.id,
      layout.measureIndex,
      0,
    );
    const pitch = mapScoreStaffYToPitch(
      point.y,
      activeClef,
      layout.staffIndex,
      score,
      layout.measureIndex,
    );
    const y = getPitchYForScore(
      pitch,
      activeClef,
      layout.staffIndex,
      score,
      layout.measureIndex,
    );

    return {
      beat: 0,
      clientX: event.clientX,
      clientY: event.clientY,
      measureIndex: layout.sourceMeasureIndex,
      pitch,
      staffId: staff.id,
      staffIndex: layout.staffIndex,
      x: layout.x,
      y,
    };
  }

  function getClefChangeDragMusicPosition(event: MouseEvent<SVGSVGElement>) {
    const point = getSvgPoint(event, svgHeight);
    const pointerPosition = getEventMusicPosition(event);

    if (!pointerPosition) {
      return null;
    }

    const boundaryPosition = snapInsertPositionToEventBoundary(
      score,
      pointerPosition,
      voiceIndex,
    );
    const targetEvent = getInsertTargetEvent(
      score,
      boundaryPosition,
      voiceIndex,
    );
    const renderedTarget =
      targetEvent && eventLayouts[targetEvent.id]
        ? {
            beat: targetEvent.beat,
            layout: eventLayouts[targetEvent.id],
          }
        : findClosestRenderedInsertTarget({
            eventLayouts,
            measureIndex: boundaryPosition.measureIndex,
            pointerX: point.x,
            staffId: boundaryPosition.staffId,
            voiceIndex,
          });
    const targetLayout = renderedTarget?.layout;

    return {
      ...boundaryPosition,
      beat: renderedTarget?.beat ?? targetEvent?.beat ?? boundaryPosition.beat,
      clientX: event.clientX,
      clientY: event.clientY,
      pitch: pointerPosition.pitch,
      x:
        targetLayout?.staffId === boundaryPosition.staffId &&
        targetLayout.measureIndex === boundaryPosition.measureIndex
          ? targetLayout.x
          : getBeatX(
              boundaryPosition.measureIndex,
              renderedTarget?.beat ?? targetEvent?.beat ?? boundaryPosition.beat,
              beatsPerMeasure,
              score,
            ),
      y: pointerPosition.y,
    };
  }

  function getClefChangePreviewIssue(position: MusicPosition | null) {
    if (!position) {
      return 'missing-target';
    }

    return getInsertTargetEvent(score, position, voiceIndex)
      ? null
      : 'target-note-required';
  }

  const keySignaturePreviewIssue =
    keySignatureDragState?.previewPosition
      ? getKeySignatureSymbolMoveIssue(
          score,
          keySignatureDragState.layout.sourceMeasureIndex,
          keySignatureDragState.layout.symbolIndex,
          keySignatureDragState.previewPosition.pitch,
        ) ??
        (keySignatureSymbolLayouts.some(
          (layout) =>
            layout.sourceMeasureIndex ===
              keySignatureDragState.layout.sourceMeasureIndex &&
            layout.symbolIndex !== keySignatureDragState.layout.symbolIndex &&
            layout.accidental === keySignatureDragState.layout.accidental &&
            (layout.pitch.step === keySignatureDragState.previewPosition?.pitch.step ||
              Math.abs(layout.y - (keySignatureDragState.previewPosition?.y ?? NaN)) <
                0.1),
        )
          ? 'duplicate-step'
          : null)
      : null;

  return (
    <svg
      aria-label={ariaLabel}
      className="staff-renderer notation-overlay"
      data-testid="staff-renderer"
      role="img"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      onMouseMove={(event) => {
        if (annotationDragState) {
          const point = getSvgPoint(event, svgHeight);
          const clientMovement = Math.hypot(
            event.clientX - annotationDragState.startClientX,
            event.clientY - annotationDragState.startClientY,
          );
          const svgDeltaX = point.x - annotationDragState.startSvgX;
          const svgDeltaY = point.y - annotationDragState.startSvgY;
          const svgMovement = Math.hypot(svgDeltaX, svgDeltaY);
          const hasMoved =
            annotationDragState.hasMoved ||
            Math.max(clientMovement, svgMovement) > 3;

          setAnnotationDragState({
            ...annotationDragState,
            hasMoved,
            previewOffset: hasMoved
              ? resolveAnnotationDragOffset({
                  offset: clampAnnotationOffset({
                    x: annotationDragState.startOffsetX + svgDeltaX,
                    y: annotationDragState.startOffsetY + svgDeltaY,
                  }),
                })
              : annotationDragState.previewOffset,
          });
          onHoverPositionChange?.(null);
          return;
        }

        if (lyricMapDragState) {
          const point = getSvgPoint(event, svgHeight);

          setLyricMapDragState({
            ...lyricMapDragState,
            previewPoint: point,
          });
          onHoverPositionChange?.(null);
          return;
        }

        if (keySignatureDragState) {
          const point = getSvgPoint(event, svgHeight);
          const clientMovement = Math.hypot(
            event.clientX - keySignatureDragState.startClientX,
            event.clientY - keySignatureDragState.startClientY,
          );
          const svgMovement = Math.hypot(
            point.x - keySignatureDragState.startSvgX,
            point.y - keySignatureDragState.startSvgY,
          );
          const hasMoved =
            keySignatureDragState.hasMoved ||
            Math.max(clientMovement, svgMovement) > 3;

          setKeySignatureDragState({
            ...keySignatureDragState,
            hasMoved,
            previewPosition: hasMoved
              ? getKeySignatureDragMusicPosition(event)
              : keySignatureDragState.previewPosition,
          });
          onHoverPositionChange?.(null);
          return;
        }

        if (clefChangeDragState) {
          const point = getSvgPoint(event, svgHeight);
          const clientMovement = Math.hypot(
            event.clientX - clefChangeDragState.startClientX,
            event.clientY - clefChangeDragState.startClientY,
          );
          const svgMovement = Math.hypot(
            point.x - clefChangeDragState.startSvgX,
            point.y - clefChangeDragState.startSvgY,
          );
          const hasMoved =
            clefChangeDragState.hasMoved ||
            Math.max(clientMovement, svgMovement) > 3;
          const previewPosition = hasMoved
            ? getClefChangeDragMusicPosition(event)
            : clefChangeDragState.previewPosition;

          setClefChangeDragState({
            ...clefChangeDragState,
            hasMoved,
            previewIssue: hasMoved
              ? getClefChangePreviewIssue(previewPosition)
              : clefChangeDragState.previewIssue,
            previewPosition,
          });
          onHoverPositionChange?.(null);
          return;
        }

        if (dragState) {
          const position = getDragMusicPosition(event);
          const point = getSvgPoint(event, svgHeight);
          const clientMovement = Math.hypot(
            event.clientX - dragState.startClientX,
            event.clientY - dragState.startClientY,
          );
          const svgMovement = Math.hypot(
            point.x - dragState.startSvgX,
            point.y - dragState.startSvgY,
          );
          const hasMoved =
            dragState.hasMoved || Math.max(clientMovement, svgMovement) > 3;

          setDragState({
            ...dragState,
            hasMoved,
            previewPosition: hasMoved ? position : dragState.previewPosition,
          });
          onHoverPositionChange?.(null);
          return;
        }

        const position = getDragMusicPosition(event);

        onHoverPositionChange?.(
          isInputArmed && position
            ? snapPositionToInputGrid(
                position,
                duration,
                dots,
                score,
                eventLayouts,
                voiceIndex,
                { preferRenderedPosition: true },
              )
            : null,
        );
      }}
      onMouseLeave={() => {
        setDragState(null);
        setKeySignatureDragState(null);
        setClefChangeDragState(null);
        setLyricMapDragState(null);
        setAnnotationDragState(null);
        setDeleteHoverEventId(null);
        onHoverPositionChange?.(null);
      }}
      onMouseUp={(event) => {
        if (annotationDragState) {
          if (
            annotationDragState.hasMoved &&
            annotationDragState.previewOffset
          ) {
            suppressNextPlaceRef.current = true;
            onAnnotationOffsetChange?.(
              annotationDragState.layout.eventId,
              annotationDragState.layout.kind,
              annotationDragState.previewOffset,
            );
          }

          setAnnotationDragState(null);
          return;
        }

        if (lyricMapDragState) {
          const point = getSvgPoint(event, svgHeight);
          const targetEventId = getClosestPitchedEventId(point, eventLayouts);

          if (targetEventId) {
            suppressNextPlaceRef.current = true;
            onLyricMapChange?.(
              lyricMapDragState.eventId,
              getLyricMapTargetEventIds(
                score,
                lyricMapDragState.eventId,
                targetEventId,
              ),
            );
          }

          setLyricMapDragState(null);
          return;
        }

        if (keySignatureDragState) {
          const position = getKeySignatureDragMusicPosition(event);

          if (keySignatureDragState.hasMoved && position) {
            suppressNextPlaceRef.current = true;
            onMoveKeySignatureSymbol?.(
              keySignatureDragState.layout.sourceMeasureIndex,
              keySignatureDragState.layout.symbolIndex,
              position,
            );
          }

          setKeySignatureDragState(null);
          return;
        }

        if (clefChangeDragState) {
          const position = getClefChangeDragMusicPosition(event);

          if (clefChangeDragState.hasMoved && position) {
            suppressNextPlaceRef.current = true;
            onMoveClefChange?.(
              {
                clefChangeId: clefChangeDragState.layout.id,
                measureIndex: clefChangeDragState.layout.measureIndex,
                staffId: clefChangeDragState.layout.staffId,
              },
              position,
            );
          }

          setClefChangeDragState(null);
          return;
        }

        if (!dragState) {
          return;
        }

        const position = getDragMusicPosition(event);

        if (dragState.hasMoved && position) {
          suppressNextPlaceRef.current = true;
          if (dragState.pitchIndex !== null) {
            onMoveEvent?.(dragState.eventId, position, dragState.pitchIndex);
          } else {
            onMoveEvent?.(dragState.eventId, position);
          }
        }

        setDragState(null);
      }}
      onClick={(event) => {
        if (suppressNextPlaceRef.current) {
          suppressNextPlaceRef.current = false;
          return;
        }

        const position = getEventMusicPosition(event);
        const placementPosition = position
          ? snapPositionToInputGrid(
              position,
              duration,
              dots,
              score,
              eventLayouts,
              voiceIndex,
              { preferRenderedPosition: true },
            )
          : null;

        if (isInputArmed && placementPosition) {
          onPlaceAtPosition?.(placementPosition);
        } else {
          onClearInteraction?.();
        }
      }}
      onContextMenu={(event) => {
        const position = getEventMusicPosition(event);

        if (!position) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onHoverPositionChange?.(null);
        onMeasureContextMenu?.(
          position.staffId,
          position.measureIndex,
          event.clientX,
          event.clientY,
        );
      }}
    >
      <rect
        className="staff-page-bg"
        x={viewBox.x}
        y={viewBox.y}
        width={viewBox.width}
        height={viewBox.height}
      />
      <VoiceZoneDebugOverlay
        show={showLayoutZones}
        zones={voiceZoneLayouts}
      />
      <RhythmSlots
        entryMode={entryMode}
        eventLayouts={eventLayouts}
        inputCursor={displayInputCursor}
        isInputArmed={shouldShowInputPreview && !clefChange}
        score={score}
        voiceIndex={voiceIndex}
      />
      {!dragState && displayHoverPosition && !displayInputCursor ? (
        <StaffHoverGuide
          position={displayHoverPosition}
          score={score}
        />
      ) : null}
      {score.type === 'grand' && staves.length > 1
        ? (staves[0]?.measures ?? [])
            .filter((measure) => isMeasureVisible(measure.index))
            .filter((measure) => getLocalMeasureIndex(measure.index, score) === 0)
            .map((measure) => (
              <line
                key={`grand-${measure.index}`}
                className="measure-guide"
                data-testid="grand-staff-connector"
                x1={STAFF_LEFT}
                x2={STAFF_LEFT}
                y1={getScoreStaffTop(score, 0, measure.index)}
                y2={
                  getScoreStaffTop(score, staves.length - 1, measure.index) +
                  STAFF_LINE_SPACING * 4
                }
              />
            ))
        : null}
      {displayHoverPosition ? (
        <>
          {placementMode === 'insert' ? (
            <InsertionCursor
              position={displayHoverPosition}
              score={score}
            />
          ) : null}
          {clefChange ? (
            <ClefChangePreview
              clef={clefChange}
              position={displayHoverPosition}
              score={score}
            />
          ) : (
            <GhostEvent
              dots={dots}
              duration={duration}
              entryMode={entryMode}
              position={displayHoverPosition}
              score={score}
            />
          )}
        </>
      ) : null}
      {staves.map((staff, staffIndex) => (
        <g key={staff.id} data-testid={`staff-${staff.id}`}>
          {staff.measures
            .filter((measure) => isMeasureVisible(measure.index))
            .map((measure) => (
              <MeasureHitTarget
                key={`measure-hit-${staff.id}-${measure.index}`}
                isInputArmed={isInputArmed}
                isSelected={
                  selectedMeasure?.staffId === staff.id &&
                  selectedMeasure.measureIndex === measure.index
                }
                measureIndex={measure.index}
                onMeasureContextMenu={onMeasureContextMenu}
                onSelectMeasure={onSelectMeasure}
                score={score}
                staff={staff}
                staffIndex={staffIndex}
              />
            ))}
          {staff.measures.filter((measure) => isMeasureVisible(measure.index)).map((measure) =>
            invalidMeasureKeySet.has(getMeasureKey(staff.id, measure.index)) ? (
              <InvalidMeasureWarning
                key={`invalid-${staff.id}-${measure.index}`}
                measureIndex={measure.index}
                score={score}
                staffId={staff.id}
                staffIndex={staffIndex}
              />
            ) : null,
          )}
          {staff.measures.filter((measure) => isMeasureVisible(measure.index)).flatMap((measure, measureOffset) => {
            const staffTop = getScoreStaffTop(score, staffIndex, measure.index);
            const lines = [
              {
                key: `start-${measure.index}`,
                x: getMeasureX(measure.index, score),
              },
            ];
            const isSystemEnd =
              isScoreSystemEndMeasure(score, measure.index) ||
              measureOffset === staff.measures.length - 1;

            if (isSystemEnd) {
              lines.push({
                key: `end-${measure.index}`,
                x: getMeasureRight(measure.index, score),
              });
            }

            return lines.map((line) => (
              <line
                key={line.key}
                className="measure-guide"
                data-testid={`measure-barline-${staff.id}`}
                x1={line.x}
                x2={line.x}
                y1={staffTop}
                y2={staffTop + STAFF_LINE_SPACING * 4}
              />
            ));
          })}
          {staff.measures.filter((measure) => isMeasureVisible(measure.index)).flatMap((measure) =>
            measure.voices.flatMap((voice, voiceIndexForTarget) =>
              voice.events.map((event) => (
                <EventHitTarget
                  key={`${event.id}-voice-${voiceIndexForTarget}`}
                  activeEventId={activeEventId}
                  isPlaybackActive={activeEventIdSet.has(event.id)}
                  beatsPerMeasure={beatsPerMeasure}
                  event={event}
                  eventLayout={eventLayouts[event.id]}
                  isInputArmed={isInputArmed}
                  measureIndex={measure.index}
                  onDeleteEvent={onDeleteEvent}
                  onDeleteHoverChange={setDeleteHoverEventId}
                  onStartDrag={(
                    eventId,
                    pitchIndex,
                    originPosition,
                    dragEvent,
                  ) => {
                    const startPoint = getNestedSvgPoint(dragEvent);

                    setDragState({
                      eventId,
                      hasMoved: false,
                      originPosition,
                      pitchIndex,
                      previewPosition: null,
                      startClientX: dragEvent.clientX,
                      startClientY: dragEvent.clientY,
                      startSvgX: startPoint.x,
                      startSvgY: startPoint.y,
                    });
                  }}
                  onRangeEventPick={onRangeEventPick}
                  onSelectEvent={onSelectEvent}
                  placementMode={placementMode}
                  selectedEventId={selectedEventId}
                  selectedPitchIndex={selectedPitchIndex}
                  score={score}
                  staff={staff}
                  staffIndex={staffIndex}
                  voiceIndex={voiceIndexForTarget}
                />
              )),
            ),
          )}
        </g>
      ))}
      <LyricMapConnectors
        annotationLayouts={annotationLayouts}
        eventLayouts={eventLayouts}
        onStartDrag={(drag) => {
          suppressNextPlaceRef.current = true;
          setLyricMapDragState({
            ...drag,
            previewPoint: null,
          });
          onHoverPositionChange?.(null);
        }}
        score={score}
        show={showLyricMap}
      />
      <LyricMapPreview dragState={lyricMapDragState} />
      <AnnotationHitTargets
        layouts={annotationLayouts}
        onAnnotationContextMenu={onAnnotationContextMenu}
        onSelectAnnotation={onSelectAnnotation}
        selectedAnnotation={selectedAnnotation}
        onAnnotationStartDrag={(layout, dragEvent) => {
          const startPoint = getNestedSvgPoint(dragEvent);

          suppressNextPlaceRef.current = true;
          setAnnotationDragState({
            hasMoved: false,
            layout,
            previewOffset: null,
            startClientX: dragEvent.clientX,
            startClientY: dragEvent.clientY,
            startOffsetX: layout.offsetX,
            startOffsetY: layout.offsetY,
            startSvgX: startPoint.x,
            startSvgY: startPoint.y,
          });
          onHoverPositionChange?.(null);
        }}
      />
      {keySignatureSymbolLayouts
        .filter((layout) => isMeasureVisible(layout.sourceMeasureIndex))
        .map((layout) => (
        <KeySignatureSymbolTarget
          key={layout.id}
          layout={layout}
          onStartDrag={(targetLayout, dragEvent) => {
            const startPoint = getNestedSvgPoint(dragEvent);

            setKeySignatureDragState({
              hasMoved: false,
              layout: targetLayout,
              previewPosition: null,
              startClientX: dragEvent.clientX,
              startClientY: dragEvent.clientY,
              startSvgX: startPoint.x,
              startSvgY: startPoint.y,
            });
            onHoverPositionChange?.(null);
          }}
        />
      ))}
      {clefChangeTargetLayouts
        .filter((layout) => isMeasureVisible(layout.measureIndex))
        .map((layout) => (
        <ClefChangeTarget
          key={layout.id}
          isInputArmed={isInputArmed}
          isSelected={selectedClefChangeId === layout.id}
          layout={layout}
          onSelect={(targetLayout) =>
            onSelectClefChange?.({
              clefChangeId: targetLayout.id,
              measureIndex: targetLayout.measureIndex,
              staffId: targetLayout.staffId,
            })
          }
          onStartDrag={(targetLayout, dragEvent) => {
            const startPoint = getNestedSvgPoint(dragEvent);

            setClefChangeDragState({
              hasMoved: false,
              layout: targetLayout,
              previewIssue: null,
              previewPosition: null,
              startClientX: dragEvent.clientX,
              startClientY: dragEvent.clientY,
              startSvgX: startPoint.x,
              startSvgY: startPoint.y,
            });
            onHoverPositionChange?.(null);
          }}
        />
      ))}
      <PlaybackLayer
        beatsPerMeasure={beatsPerMeasure}
        eventLayouts={eventLayouts}
        playbackBeat={visiblePlaybackBeat}
        score={score}
        staffCount={staves.length}
      />
      {dragState?.previewPosition && draggedEvent ? (
        <GhostEvent
          dots={getEventDots(draggedEvent)}
          duration={draggedEvent.duration}
          entryMode={draggedEvent.kind === 'rest' ? 'rest' : 'note'}
          position={dragState.previewPosition}
          score={score}
        />
      ) : null}
      {keySignatureDragState?.previewPosition ? (
        <text
          className={`key-signature-symbol-preview${
            keySignaturePreviewIssue ? ' is-invalid' : ''
          }`}
          data-invalid-reason={keySignaturePreviewIssue ?? undefined}
          data-testid="key-signature-symbol-preview"
          dominantBaseline="central"
          textAnchor="middle"
          x={keySignatureDragState.layout.x}
          y={keySignatureDragState.previewPosition.y}
        >
          {KEY_SIGNATURE_SYMBOL_DISPLAY_TEXT[keySignatureDragState.layout.accidental]}
        </text>
      ) : null}
      {clefChangeDragState?.previewPosition ? (
        <ClefChangePreview
          clef={clefChangeDragState.layout.clef}
          isInvalid={Boolean(clefChangeDragState.previewIssue)}
          position={clefChangeDragState.previewPosition}
          score={score}
        />
      ) : null}
      {annotationDragState?.previewOffset ? (
        <AnnotationDragPreview
          attachmentPoint={getAnnotationAttachmentPoint(annotationDragState.layout)}
          layout={annotationDragState.layout}
          offset={annotationDragState.previewOffset}
        />
      ) : null}
    </svg>
  );
}
