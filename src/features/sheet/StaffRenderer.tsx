import type { Score } from '../../domain/score/types';
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
  onSelectEvent?: (eventId: string) => void;
  onDeleteEvent?: (eventId: string) => void;
  onMoveEvent?: (eventId: string, position: MusicPosition) => void;
  selectedEventId?: string | null;
  activeEventId?: string | null;
  playbackBeat?: number | null;
  placementMode?: PlacementMode;
  inputCursor?: InputCursor | null;
  invalidMeasureKeys?: readonly string[];
}

export function StaffRenderer(props: StaffRendererProps) {
  return <VexFlowStaffRenderer {...props} />;
}
