import type { Score } from '../../domain/score/types';
import type { DurationValue } from '../../domain/score/types';
import type { EntryMode } from '../editor/editorState';
import type { MusicPosition } from './interaction';
import { VexFlowStaffRenderer } from './VexFlowStaffRenderer';

export interface StaffRendererProps {
  score: Score;
  hoverPosition?: MusicPosition | null;
  entryMode?: EntryMode;
  duration?: DurationValue;
  onHoverPositionChange?: (position: MusicPosition | null) => void;
  onPlaceAtPosition?: (position: MusicPosition) => void;
  onSelectEvent?: (eventId: string) => void;
  onDeleteEvent?: (eventId: string) => void;
  onMoveEvent?: (eventId: string, position: MusicPosition) => void;
  selectedEventId?: string | null;
  activeEventId?: string | null;
  playbackBeat?: number | null;
}

export function StaffRenderer(props: StaffRendererProps) {
  return <VexFlowStaffRenderer {...props} />;
}
