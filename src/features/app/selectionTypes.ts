import type { StaffId } from '../../domain/score/types';

export interface MeasureTarget {
  staffId: StaffId;
  measureIndex: number;
}

export interface MeasureContextMenuState extends MeasureTarget {
  clientX: number;
  clientY: number;
}

export type SelectionSource = 'manual';
