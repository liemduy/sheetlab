import type {
  AnnotationKind,
  AnnotationOffset,
  AnnotationPlacementSide,
  Clef,
  Score,
  StaffId,
} from '../../domain/score/types';
import type { DurationValue } from '../../domain/score/types';
import type { InputCursor } from '../editor/inputCursor';
import type { EntryMode, PlacementMode } from '../editor/editorState';
import type { AnnotationTarget } from '../app/selectionTypes';
import type { FingeringHint } from '../fingering/fingeringHints';
import type { MusicPosition } from './interaction';
import type { ScorePageViewport } from './pageLayout';
import { VexFlowStaffRenderer } from './VexFlowStaffRenderer';

export type PracticeFeedbackStatus = 'correct' | 'missed' | 'partial' | 'wrong';

export interface StaffRendererProps {
  score: Score;
  hoverPosition?: MusicPosition | null;
  entryMode?: EntryMode;
  duration?: DurationValue;
  dots?: number;
  isInputArmed?: boolean;
  onHoverPositionChange?: (position: MusicPosition | null) => void;
  onPlaceAtPosition?: (position: MusicPosition) => void;
  onClearInteraction?: () => void;
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
    offset: AnnotationOffset,
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
  selectedClefChangeId?: string | null;
  selectedAnnotation?: AnnotationTarget | null;
  selectedEventId?: string | null;
  selectedPitchIndex?: number | null;
  selectedMeasure?: { staffId: StaffId; measureIndex: number } | null;
  activeEventId?: string | null;
  activeEventIds?: readonly string[];
  rangeEventIds?: readonly string[];
  practiceFeedbackByEventId?: Readonly<Record<string, PracticeFeedbackStatus>>;
  playbackBeat?: number | null;
  placementMode?: PlacementMode;
  inputCursor?: InputCursor | null;
  pageViewport?: ScorePageViewport;
  clefChange?: Clef | null;
  invalidMeasureKeys?: readonly string[];
  fingeringHints?: readonly FingeringHint[];
  showFingeringHints?: boolean;
  showLayoutZones?: boolean;
  showLyricMap?: boolean;
  showMeasureNumbers?: boolean;
  voiceIndex?: number;
}

export function StaffRenderer(props: StaffRendererProps) {
  return <VexFlowStaffRenderer {...props} />;
}
