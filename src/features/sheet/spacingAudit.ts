import type { Score } from '../../domain/score/types';
import { hasImportedSystemLayout } from '../../domain/score/importedLayout';
import { SYSTEM_READABILITY_BREATHING_ROOM, SYSTEM_WIDTH } from './layoutConstants';
import { getSystemPreflightMinWidth } from './measurePreflight';
import {
  IMPORTED_SYSTEM_READABILITY_BREATHING_ROOM,
  computeScoreSystems,
} from './systemLayout';

export interface ScoreSpacingAuditIssue {
  kind: 'multi-measure-system-overfull';
  measureIndexes: number[];
  overflow: number;
  systemIndex: number;
}

export function auditScoreSpacing(score: Score): ScoreSpacingAuditIssue[] {
  const readableLimit = hasImportedSystemLayout(score)
    ? SYSTEM_WIDTH - IMPORTED_SYSTEM_READABILITY_BREATHING_ROOM
    : SYSTEM_WIDTH - SYSTEM_READABILITY_BREATHING_ROOM;

  return computeScoreSystems(score).flatMap((system, systemIndex) => {
    const minWidth = getSystemPreflightMinWidth(score, system.measureIndexes);
    const overflow = minWidth - readableLimit;

    return overflow > 0.0001 && system.measureIndexes.length > 1
      ? [
          {
            kind: 'multi-measure-system-overfull' as const,
            measureIndexes: system.measureIndexes,
            overflow,
            systemIndex,
          },
        ]
      : [];
  });
}
