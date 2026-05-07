import type { StaffId } from '../../domain/score/types';

export function getMeasureKey(staffId: StaffId, measureIndex: number) {
  return `${staffId}:${measureIndex}`;
}
