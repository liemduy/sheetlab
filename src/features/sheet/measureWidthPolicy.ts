import type { Score } from '../../domain/score/types';
import { getMeasurePreflightMinWidth } from './measurePreflight';

export function getMeasureReadableMinWidthForLocalIndex(
  score: Score,
  measureIndex: number,
  localMeasureIndex: number,
) {
  return getMeasurePreflightMinWidth(score, measureIndex, localMeasureIndex);
}
