import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Score } from '../../domain/score/types';
import type {
  AnnotationKind,
  DurationValue,
  StaffId,
} from '../../domain/score/types';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import { getKeySignatureSymbolMoveIssue } from '../../domain/score/keySignatures';
import { getEventDots } from '../../domain/score/events';
import { getLyricMapTargetEventIds } from '../../domain/score/lyricMapping';
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
import { snapInsertPositionToEventBoundary } from './insertPosition';
import { getPitchYForScore } from './notationGeometry';
import { getMeasureKey } from './measureKey';
import {
  getKeySignatureSymbolLayouts,
  type KeySignatureSymbolLayout,
} from './keySignatureLayout';
import {
  inputCursorToMusicPosition,
  snapPositionToInputGrid,
} from './overlayPositioning';
import { EventHitTarget } from './OverlayEventHitTarget';
import {
  GhostEvent,
  InsertionCursor,
  RhythmSlots,
  StaffHoverGuide,
} from './OverlayInputLayer';
import { KeySignatureSymbolTarget } from './OverlayKeySignatureTarget';
import {
  InvalidMeasureWarning,
  MeasureHitTarget,
} from './OverlayMeasureLayer';
import { AnnotationHitTargets } from './OverlayAnnotationLayer';
import {
  LyricMapConnectors,
  LyricMapPreview,
  getClosestPitchedEventId,
  type LyricMapDragAnchor,
} from './OverlayLyricMapLayer';
import { PlaybackLayer } from './OverlayPlaybackLayer';
import { getNestedSvgPoint, getSvgPoint } from './overlaySvgPoint';
import type {
  RenderedAnnotationLayout,
  RenderedEventLayout,
} from './renderedEventLayout';

interface NotationOverlayProps {
  activeEventId?: string | null;
  activeEventIds?: readonly string[];
  dots: number;
  duration: DurationValue;
  entryMode: EntryMode;
  annotationLayouts?: RenderedAnnotationLayout[];
  eventLayouts?: Record<string, RenderedEventLayout>;
  hoverPosition?: MusicPosition | null;
  inputCursor?: InputCursor | null;
  isInputArmed?: boolean;
  invalidMeasureKeys?: readonly string[];
  showLyricMap?: boolean;
  onClearInteraction?: () => void;
  onHoverPositionChange?: (position: MusicPosition | null) => void;
  onPlaceAtPosition?: (position: MusicPosition) => void;
  onSelectEvent?: (eventId: string, pitchIndex?: number | null) => void;
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
  ) => void;
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
  onSelectMeasure?: (staffId: StaffId, measureIndex: number) => void;
  playbackBeat?: number | null;
  placementMode?: PlacementMode;
  score: Score;
  selectedEventId?: string | null;
  selectedMeasure?: { staffId: StaffId; measureIndex: number } | null;
  selectedPitchIndex?: number | null;
  svgHeight: number;
  voiceIndex?: number;
}

const KEY_SIGNATURE_SYMBOL_TEXT = {
  flat: '♭',
  sharp: '♯',
} as const;

export function NotationOverlay({
  activeEventId,
  activeEventIds = [],
  annotationLayouts = [],
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
  onMoveKeySignatureSymbol,
  onAnnotationContextMenu,
  onLyricMapChange,
  onPlaceAtPosition,
  onDeleteEvent,
  onMeasureContextMenu,
  onSelectMeasure,
  onSelectEvent,
  playbackBeat,
  placementMode = 'place',
  score,
  selectedEventId,
  selectedMeasure,
  selectedPitchIndex,
  showLyricMap = false,
  svgHeight,
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
  const [lyricMapDragState, setLyricMapDragState] = useState<(LyricMapDragAnchor & {
    previewPoint: { x: number; y: number } | null;
  }) | null>(null);
  const [deleteHoverEventId, setDeleteHoverEventId] = useState<string | null>(
    null,
  );
  const suppressNextPlaceRef = useRef(false);
  const staves = score.parts[0]?.staves ?? [];
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const keySignatureSymbolLayouts = getKeySignatureSymbolLayouts(score);
  const invalidMeasureKeySet = new Set(invalidMeasureKeys);
  const activeEventIdSet = new Set([
    ...activeEventIds,
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
    inputCursor && hoverPosition
      ? inputCursorToMusicPosition(inputCursor, score)
      : null;
  const hoverSourcePosition = inputCursorPosition ?? hoverPosition;
  const snappedHoverPosition = hoverSourcePosition
    ? snapPositionToInputGrid(
        hoverSourcePosition,
        duration,
        dots,
        score,
        eventLayouts,
        voiceIndex,
      )
    : null;
  const shouldShowInputPreview =
    isInputArmed &&
    !dragState &&
    !keySignatureDragState &&
    !lyricMapDragState &&
    !deleteHoverEventId &&
    !selectedEventId;
  const displayHoverPosition =
    shouldShowInputPreview && placementMode === 'insert' && snappedHoverPosition
      ? snapInsertPositionToEventBoundary(score, snappedHoverPosition, voiceIndex)
      : shouldShowInputPreview
        ? snappedHoverPosition
        : null;

  function getEventMusicPosition(event: MouseEvent<SVGSVGElement>) {
    const position = mapPointToMusicPosition(
      getSvgPoint(event, svgHeight),
        score,
        {
          dots,
          duration,
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
        },
      );
    const targetStaffIndex = mappedPosition?.staffIndex ?? origin.staffIndex;
    const staff = staves[targetStaffIndex];

    if (!staff) {
      return null;
    }

    const targetMeasureIndex = mappedPosition?.measureIndex ?? origin.measureIndex;
    const pitch = mapScoreStaffYToPitch(
      point.y,
      staff.clef,
      targetStaffIndex,
      score,
      targetMeasureIndex,
    );
    const y = getPitchYForScore(
      pitch,
      staff.clef,
      targetStaffIndex,
      score,
      targetMeasureIndex,
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
    const pitch = mapScoreStaffYToPitch(
      point.y,
      staff.clef,
      layout.staffIndex,
      score,
      layout.measureIndex,
    );
    const y = getPitchYForScore(
      pitch,
      staff.clef,
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
      viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
      onMouseMove={(event) => {
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
              )
            : null,
        );
      }}
      onMouseLeave={() => {
        setDragState(null);
        setKeySignatureDragState(null);
        setLyricMapDragState(null);
        setDeleteHoverEventId(null);
        onHoverPositionChange?.(null);
      }}
      onMouseUp={(event) => {
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
      <rect className="staff-page-bg" x={0} y={0} width={SVG_WIDTH} height={svgHeight} />
      <RhythmSlots
        entryMode={entryMode}
        eventLayouts={eventLayouts}
        inputCursor={inputCursor}
        isInputArmed={shouldShowInputPreview}
        score={score}
        voiceIndex={voiceIndex}
      />
      {!dragState && displayHoverPosition && !inputCursor ? (
        <StaffHoverGuide
          position={displayHoverPosition}
          score={score}
        />
      ) : null}
      {score.type === 'grand' && staves.length > 1
        ? (staves[0]?.measures ?? [])
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
          <GhostEvent
            dots={dots}
            duration={duration}
            entryMode={entryMode}
            position={displayHoverPosition}
            score={score}
          />
        </>
      ) : null}
      {staves.map((staff, staffIndex) => (
        <g key={staff.id} data-testid={`staff-${staff.id}`}>
          {staff.measures.map((measure) => (
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
          {staff.measures.map((measure) =>
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
          {staff.measures.flatMap((measure, measureOffset) => {
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
          {staff.measures.flatMap((measure) =>
            measure.voices.flatMap((voice, voiceIndexForTarget) =>
              voice.events.map((event) => (
              <EventHitTarget
                key={event.id}
                activeEventId={activeEventId}
                isPlaybackActive={activeEventIdSet.has(event.id)}
                beatsPerMeasure={beatsPerMeasure}
                event={event}
                eventLayout={eventLayouts[event.id]}
                isInputArmed={isInputArmed}
                measureIndex={measure.index}
                onDeleteEvent={onDeleteEvent}
                onDeleteHoverChange={setDeleteHoverEventId}
                onStartDrag={(eventId, pitchIndex, originPosition, dragEvent) => {
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
      />
      {keySignatureSymbolLayouts.map((layout) => (
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
      <PlaybackLayer
        beatsPerMeasure={beatsPerMeasure}
        eventLayouts={eventLayouts}
        playbackBeat={playbackBeat}
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
          {KEY_SIGNATURE_SYMBOL_TEXT[keySignatureDragState.layout.accidental]}
        </text>
      ) : null}
    </svg>
  );
}
