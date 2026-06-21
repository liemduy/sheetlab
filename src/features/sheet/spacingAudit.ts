import type { Score } from '../../domain/score/types';
import { hasImportedSystemLayout } from '../../domain/score/importedLayout';
import { SYSTEM_READABILITY_BREATHING_ROOM, SYSTEM_WIDTH } from './layoutConstants';
import { getMeasureWidth } from './layout';
import {
  getMeasurePreflightMinWidth,
  getSystemPreflightMinWidth,
} from './measurePreflight';
import {
  IMPORTED_SYSTEM_READABILITY_BREATHING_ROOM,
  computeScoreSystems,
} from './systemLayout';

export interface ScoreSpacingAuditIssue {
  kind: 'measure-under-readable-minimum' | 'multi-measure-system-overfull';
  actualWidth?: number;
  measureIndex?: number;
  measureIndexes?: number[];
  readableMinWidth?: number;
  overflow: number;
  systemIndex: number;
}

export function auditScoreSpacing(score: Score): ScoreSpacingAuditIssue[] {
  const usesImportedLayout = hasImportedSystemLayout(score);
  const readableLimit = usesImportedLayout
    ? SYSTEM_WIDTH - IMPORTED_SYSTEM_READABILITY_BREATHING_ROOM
    : SYSTEM_WIDTH - SYSTEM_READABILITY_BREATHING_ROOM;

  return computeScoreSystems(score).flatMap((system, systemIndex) => {
    const minWidth = getSystemPreflightMinWidth(score, system.measureIndexes);
    const overflow = minWidth - readableLimit;
    const systemIssues: ScoreSpacingAuditIssue[] =
      overflow > 0.0001 && system.measureIndexes.length > 1
        ? [
            {
              kind: 'multi-measure-system-overfull',
              measureIndexes: system.measureIndexes,
              overflow,
              systemIndex,
            },
          ]
        : [];
    const shouldReportMeasureCompression =
      minWidth > SYSTEM_WIDTH + 0.0001 &&
      (!usesImportedLayout || system.measureIndexes.length > 1);
    const measureIssues =
      shouldReportMeasureCompression
        ? system.measureIndexes.flatMap((measureIndex, localMeasureIndex) => {
        const readableMinWidth = getMeasurePreflightMinWidth(
          score,
          measureIndex,
          localMeasureIndex,
        );
        const actualWidth = getMeasureWidth(measureIndex, score);
        const measureOverflow = readableMinWidth - actualWidth;

        return measureOverflow > 0.0001
          ? [
              {
                actualWidth,
                kind: 'measure-under-readable-minimum' as const,
                measureIndex,
                overflow: measureOverflow,
                readableMinWidth,
                systemIndex,
              },
            ]
          : [];
        })
        : [];

    return [...systemIssues, ...measureIssues];
  });
}
