import type {
  AnnotationKind,
  AnnotationOffset,
  AnnotationPlacementSide,
  StaffId,
} from '../../domain/score/types';

export interface MeasureTarget {
  staffId: StaffId;
  measureIndex: number;
}

export interface ClefChangeTarget extends MeasureTarget {
  clefChangeId: string;
}

export interface MeasureContextMenuState extends MeasureTarget {
  clientX: number;
  clientY: number;
}

export interface AnnotationContextMenuState {
  clientX: number;
  clientY: number;
  eventId: string;
  kind: AnnotationKind;
  offset: AnnotationOffset;
  side: Exclude<AnnotationPlacementSide, 'auto'>;
}

export interface AnnotationTarget {
  eventId: string;
  kind: AnnotationKind;
}

export type SelectionSource = 'manual';
