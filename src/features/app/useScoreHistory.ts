import { useState } from 'react';
import type { Score, StaffId } from '../../domain/score/types';
import { getMeasureKey } from '../sheet/measureKey';

export function useScoreHistory(initialScore: Score) {
  const [score, setScore] = useState(initialScore);
  const [invalidMeasureKeys, setInvalidMeasureKeys] = useState<string[]>([]);
  const [pastScores, setPastScores] = useState<Score[]>([]);
  const [futureScores, setFutureScores] = useState<Score[]>([]);
  const [editorMessage, setEditorMessage] = useState('Ready');

  function commitScoreChange(nextScore: Score, message: string) {
    setPastScores((currentPast) => [...currentPast, score]);
    setFutureScores([]);
    setScore(nextScore);
    setInvalidMeasureKeys([]);
    setEditorMessage(message);
  }

  function markInvalidMeasure(
    staffId: StaffId,
    measureIndex: number,
    message: string,
  ) {
    const measureKey = getMeasureKey(staffId, measureIndex);

    setInvalidMeasureKeys((currentKeys) =>
      currentKeys.includes(measureKey)
        ? currentKeys
        : [...currentKeys, measureKey],
    );
    setEditorMessage(message);
  }

  return {
    commitScoreChange,
    editorMessage,
    futureScores,
    invalidMeasureKeys,
    markInvalidMeasure,
    pastScores,
    score,
    setEditorMessage,
    setFutureScores,
    setInvalidMeasureKeys,
    setPastScores,
    setScore,
  };
}
