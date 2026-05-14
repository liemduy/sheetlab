import type { AnnotationKind, Clef, Score, StaffId } from '../../domain/score/types';
import type { DurationValue } from '../../domain/score/types';
import type { InputCursor } from '../editor/inputCursor';
import type { EntryMode, PlacementMode } from '../editor/editorState';
import type { MusicPosition } from './interaction';
import { VexFlowStaffRenderer } from './VexFlowStaffRenderer';

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
  selectedEventId?: string | null;
  selectedPitchIndex?: number | null;
  selectedMeasure?: { staffId: StaffId; measureIndex: number } | null;
  activeEventId?: string | null;
  activeEventIds?: readonly string[];
  playbackBeat?: number | null;
  placementMode?: PlacementMode;
  inputCursor?: InputCursor | null;
  clefChange?: Clef | null;
  invalidMeasureKeys?: readonly string[];
  showLayoutZones?: boolean;
  showLyricMap?: boolean;
  voiceIndex?: number;
}

export function StaffRenderer(props: StaffRendererProps) {
  return <VexFlowStaffRenderer {...props} />;
}
