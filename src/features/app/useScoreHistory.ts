import {
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Score, StaffId } from '../../domain/score/types';
import { getMeasureKey } from '../sheet/measureKey';

const INVALID_MEASURE_FLASH_MS = 700;

export function useScoreHistory(initialScore: Score) {
  const [score, setScore] = useState(initialScore);
  const [invalidMeasureKeys, setInvalidMeasureKeys] = useState<string[]>([]);
  const [pastScores, setPastScores] = useState<Score[]>([]);
  const [futureScores, setFutureScores] = useState<Score[]>([]);
  const [editorMessage, setEditorMessage] = useState('Ready');
  const invalidMeasureFlashTimers = useRef(new Map<string, number>());

  useEffect(() => () => {
    invalidMeasureFlashTimers.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    invalidMeasureFlashTimers.current.clear();
  }, []);

  function commitScoreChange(nextScore: Score, message: string) {
    setPastScores((currentPast) => [...currentPast, score]);
    setFutureScores([]);
    setScore(nextScore);
    setInvalidMeasureKeys([]);
    invalidMeasureFlashTimers.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    invalidMeasureFlashTimers.current.clear();
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
    const currentTimer = invalidMeasureFlashTimers.current.get(measureKey);

    if (currentTimer !== undefined) {
      window.clearTimeout(currentTimer);
    }

    invalidMeasureFlashTimers.current.set(
      measureKey,
      window.setTimeout(() => {
        invalidMeasureFlashTimers.current.delete(measureKey);
        setInvalidMeasureKeys((currentKeys) =>
          currentKeys.filter((key) => key !== measureKey),
        );
      }, INVALID_MEASURE_FLASH_MS),
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
