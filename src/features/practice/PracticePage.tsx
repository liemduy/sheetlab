import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { Score } from '../../domain/score/types';
import type { PlaybackController } from '../playback/audioEngine';
import { playTimelineAudio, warmUpPlaybackAudio } from '../playback/audioEngine';
import {
  buildPlaybackTimeline,
  getActiveTimelineEvents,
  getPlaybackScoreBeatAtSeconds,
} from '../playback/timeline';
import { getScoreSvgWidth } from '../sheet/layout';
import {
  getScorePageForMeasureIndex,
  getScorePageViewports,
} from '../sheet/pageLayout';
import { StaffRenderer, type PracticeFeedbackStatus } from '../sheet/StaffRenderer';
import {
  formatMidiNote,
  getMidiConnectionStatusLabel,
  getMidiInputLabel,
  isSustainPedalEvent,
  type ParsedMidiEvent,
} from './midiAccess';
import {
  buildPracticeTargets,
  getNextUnfinishedTargetIndex,
  getPracticeTargetAtSeconds,
  type PracticeHandMode,
  type PracticeTarget,
} from './practiceTimeline';
import {
  createMissedPracticeResult,
  evaluatePracticeTarget,
  formatMidiNoteList,
  getPracticeResultSummary,
  getPracticeAccuracyPercent,
  getPracticeResultMessage,
  type PracticeResult,
} from './noteMatcher';
import {
  buildPracticePedalTargets,
  createMissedPedalResult,
  evaluatePedalTarget,
  findNearestPedalTarget,
  type PracticePedalResult,
} from './practicePedal';
import {
  getPracticeExpressionCapabilitySummary,
  getPracticeTargetExpressionLabels,
} from './practiceExpressions';
import { useMidiInputs } from './useMidiInputs';

type PracticeMode = 'listen' | 'wait' | 'rhythm';
type PracticeReferenceMute = 'left' | 'none' | 'right';
type PracticeTimingLevel = 'beginner' | 'normal' | 'strict';

const PRACTICE_TIMING_TOLERANCE_MS = {
  beginner: 280,
  normal: 180,
  strict: 90,
} satisfies Record<PracticeTimingLevel, number>;
const RHYTHM_MISS_GRACE_SECONDS = 0.36;

function getPracticeMeasureCount(score: Score) {
  return Math.max(
    1,
    ...score.parts.flatMap((part) =>
      part.staves.map((staff) => staff.measures.length),
    ),
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseMeasureInput(value: string, fallback: number, measureCount: number) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return clampNumber(Math.round(parsedValue), 1, measureCount);
}

function getInitialRenderedPageIndexes(pageCount: number) {
  return pageCount <= 1 ? new Set([0]) : new Set<number>();
}

function addPageIndex(currentPageIndexes: Set<number>, pageIndex: number) {
  if (currentPageIndexes.has(pageIndex)) {
    return currentPageIndexes;
  }

  const nextPageIndexes = new Set(currentPageIndexes);

  nextPageIndexes.add(pageIndex);
  return nextPageIndexes;
}

function addNearbyPageIndexes(
  currentPageIndexes: Set<number>,
  pageIndex: number,
  pageCount: number,
) {
  const nextPageIndexes = new Set(currentPageIndexes);
  const start = Math.max(0, pageIndex - 1);
  const end = Math.min(pageCount - 1, pageIndex + 1);

  for (let index = start; index <= end; index += 1) {
    nextPageIndexes.add(index);
  }

  return nextPageIndexes.size === currentPageIndexes.size
    ? currentPageIndexes
    : nextPageIndexes;
}

function getCorrectTargetIds(results: ReadonlyMap<string, PracticeResult>) {
  const targetIds = new Set<string>();

  results.forEach((result, targetId) => {
    if (result.status === 'correct') {
      targetIds.add(targetId);
    }
  });

  return targetIds;
}

function getTargetLabel(target: PracticeTarget | null) {
  if (!target) {
    return 'No playable target';
  }

  return `M${target.measureIndex + 1} beat ${target.beat + 1}: ${formatMidiNoteList(
    target.midiNotes,
  )}`;
}

function getEventLabel(event: ParsedMidiEvent) {
  if (event.type === 'note-on' || event.type === 'note-off') {
    return `${event.type} ${formatMidiNote(event.midiNote)} v${event.velocity}`;
  }

  return 'controller' in event ? `cc ${event.controller} = ${event.value}` : event.type;
}

function getReferenceStaffIds(referenceMute: PracticeReferenceMute) {
  if (referenceMute === 'left') {
    return ['treble'] as const;
  }

  if (referenceMute === 'right') {
    return ['bass'] as const;
  }

  return undefined;
}

function getPedalSummary(results: ReadonlyMap<string, PracticePedalResult>) {
  const summary = {
    correct: 0,
    early: 0,
    late: 0,
    missed: 0,
    total: results.size,
  };

  results.forEach((result) => {
    summary[result.status] += 1;
  });

  return summary;
}

function getPedalResultLabel(result: PracticePedalResult) {
  const action = result.action === 'down' ? 'Pedal down' : 'Pedal up';

  if (result.status === 'correct') {
    return `${action} ok`;
  }

  if (result.status === 'missed') {
    return `${action} missed`;
  }

  return `${action} ${Math.abs(result.deltaMs ?? 0)}ms ${result.status}`;
}

function createPerformanceClockController(delaySeconds = 0): PlaybackController {
  const startedAtMs = performance.now() + delaySeconds * 1000;

  return {
    audioStarted: false,
    getElapsedSeconds: () => (performance.now() - startedAtMs) / 1000,
    startedAtMs,
    stop: () => undefined,
  };
}

interface PracticeSheetProps {
  activeEventIds: readonly string[];
  currentMeasureIndex: number | null;
  playbackBeat: number | null;
  practiceFeedbackByEventId: Readonly<Record<string, PracticeFeedbackStatus>>;
  score: Score;
}

function PracticeSheet({
  activeEventIds,
  currentMeasureIndex,
  playbackBeat,
  practiceFeedbackByEventId,
  score,
}: PracticeSheetProps) {
  const pageViewports = useMemo(() => getScorePageViewports(score), [score]);
  const [renderedPageIndexes, setRenderedPageIndexes] = useState<Set<number>>(
    () => getInitialRenderedPageIndexes(1),
  );
  const scoreSvgWidth = getScoreSvgWidth(score);
  const stageRef = useRef<HTMLElement | null>(null);
  const currentPage =
    currentMeasureIndex !== null
      ? getScorePageForMeasureIndex(pageViewports, currentMeasureIndex)
      : null;

  useEffect(() => {
    setRenderedPageIndexes(getInitialRenderedPageIndexes(pageViewports.length));
  }, [pageViewports.length, score.id]);

  useEffect(() => {
    if (pageViewports.length <= 1) {
      return;
    }

    const firstPageDelay = window.setTimeout(() => {
      setRenderedPageIndexes((currentPageIndexes) =>
        addPageIndex(currentPageIndexes, 0),
      );
    }, 120);

    return () => window.clearTimeout(firstPageDelay);
  }, [pageViewports.length, score.id]);

  useEffect(() => {
    if (pageViewports.length <= 1) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setRenderedPageIndexes(
        new Set(pageViewports.map((pageViewport) => pageViewport.index)),
      );
      return;
    }

    let observer: IntersectionObserver | null = null;
    const observerDelay = window.setTimeout(() => {
      const pageElements =
        stageRef.current?.querySelectorAll<HTMLElement>('.paper-page') ?? [];

      observer = new IntersectionObserver(
        (entries) => {
          setRenderedPageIndexes((currentPageIndexes) => {
            let nextPageIndexes = currentPageIndexes;

            entries.forEach((entry) => {
              if (!entry.isIntersecting) {
                return;
              }

              const pageIndex = Number(
                (entry.target as HTMLElement).dataset.pageIndex,
              );

              if (!Number.isFinite(pageIndex)) {
                return;
              }

              nextPageIndexes = addNearbyPageIndexes(
                nextPageIndexes,
                pageIndex,
                pageViewports.length,
              );
            });

            return nextPageIndexes;
          });
        },
        {
          root: null,
          rootMargin: '360px 0px',
        },
      );

      pageElements.forEach((pageElement) => observer?.observe(pageElement));
    }, 600);

    return () => {
      window.clearTimeout(observerDelay);
      observer?.disconnect();
    };
  }, [pageViewports]);

  useEffect(() => {
    if (!currentPage) {
      return;
    }

    setRenderedPageIndexes((currentPageIndexes) =>
      addNearbyPageIndexes(
        currentPageIndexes,
        currentPage.index,
        pageViewports.length,
      ),
    );
  }, [currentPage, pageViewports.length]);

  return (
    <section ref={stageRef} className="practice-stage" aria-label="Practice sheet">
      <div
        className="paper-stack practice-paper-stack"
        style={{ '--canvas-zoom': 0.94 } as CSSProperties}
      >
        {pageViewports.map((pageViewport) => {
          const isCurrentPage = currentPage?.index === pageViewport.index;
          const shouldRenderPage =
            pageViewports.length <= 1 ||
            renderedPageIndexes.has(pageViewport.index) ||
            isCurrentPage;

          return (
            <div
              key={pageViewport.index}
              className={`paper paper-page paper-${score.pageSize}`}
              data-page-index={pageViewport.index}
              style={{ '--canvas-zoom': 0.94 } as CSSProperties}
            >
              {pageViewport.index === 0 ? (
                <div className="paper-heading">
                  <h2>{score.title}</h2>
                  <div className="score-meta-row">
                    <span>
                      Moderato {'\u2669'} = {score.tempo}
                    </span>
                    <span>{score.composer || 'Composer'}</span>
                  </div>
                </div>
              ) : null}
              <div
                className="notation-scroll"
                aria-label={
                  pageViewports.length === 1
                    ? 'Practice notation viewport'
                    : `Practice notation viewport page ${pageViewport.index + 1}`
                }
              >
                {shouldRenderPage ? (
                  <StaffRenderer
                    activeEventIds={activeEventIds}
                    isInputArmed={false}
                    pageViewport={pageViewport}
                    playbackBeat={isCurrentPage ? playbackBeat : null}
                    practiceFeedbackByEventId={practiceFeedbackByEventId}
                    score={score}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="page-render-placeholder"
                    style={{
                      aspectRatio: `${scoreSvgWidth} / ${pageViewport.height}`,
                    }}
                  />
                )}
              </div>
              {pageViewports.length > 1 ? (
                <div className="paper-page-number">
                  {pageViewport.index + 1} / {pageViewports.length}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface PracticePageProps {
  onBackToEditor: () => void;
  score: Score;
}

export function PracticePage({ onBackToEditor, score }: PracticePageProps) {
  const measureCount = useMemo(() => getPracticeMeasureCount(score), [score]);
  const [mode, setMode] = useState<PracticeMode>('wait');
  const [handMode, setHandMode] = useState<PracticeHandMode>('both');
  const [measureStart, setMeasureStart] = useState(1);
  const [measureEnd, setMeasureEnd] = useState(measureCount);
  const [isLooping, setIsLooping] = useState(false);
  const [isReferenceEnabled, setIsReferenceEnabled] = useState(true);
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState(true);
  const [countInMeasures, setCountInMeasures] = useState(1);
  const [referenceMute, setReferenceMute] =
    useState<PracticeReferenceMute>('none');
  const [timingLevel, setTimingLevel] =
    useState<PracticeTimingLevel>('normal');
  const [isGuidePlaying, setIsGuidePlaying] = useState(false);
  const [isPracticing, setIsPracticing] = useState(false);
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [results, setResults] = useState<Map<string, PracticeResult>>(
    () => new Map(),
  );
  const [pedalResults, setPedalResults] = useState<
    Map<string, PracticePedalResult>
  >(() => new Map());
  const [completedAttempts, setCompletedAttempts] = useState(0);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [practiceMessage, setPracticeMessage] = useState('Ready');
  const activeMidiNotesRef = useRef<number[]>([]);
  const currentTargetIndexRef = useRef(currentTargetIndex);
  const elapsedSecondsRef = useRef(elapsedSeconds);
  const guideControllerRef = useRef<PlaybackController | null>(null);
  const guideAnimationFrameRef = useRef<number | null>(null);
  const guideEndTimerRef = useRef<number | null>(null);
  const guideRunIdRef = useRef(0);
  const isLoopingRef = useRef(isLooping);
  const isGuidePlayingRef = useRef(isGuidePlaying);
  const isPracticingRef = useRef(isPracticing);
  const modeRef = useRef(mode);
  const pedalResultsRef = useRef(pedalResults);
  const resultsRef = useRef(results);
  const rhythmStartedAtRef = useRef(0);
  const normalizedMeasureStart = Math.min(measureStart, measureEnd) - 1;
  const normalizedMeasureEnd = Math.max(measureStart, measureEnd) - 1;
  const rawTargets = useMemo(
    () =>
      buildPracticeTargets(score, {
        handMode,
        measureEnd: normalizedMeasureEnd,
        measureStart: normalizedMeasureStart,
      }),
    [handMode, normalizedMeasureEnd, normalizedMeasureStart, score],
  );
  const practiceStartSeconds = rawTargets[0]?.startSeconds ?? 0;
  const targets = useMemo(
    () =>
      rawTargets.map((target) => ({
        ...target,
        startSeconds: target.startSeconds - practiceStartSeconds,
      })),
    [practiceStartSeconds, rawTargets],
  );
  const targetsRef = useRef(targets);
  const playbackTimeline = useMemo(() => buildPlaybackTimeline(score), [score]);
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const countInBeats = countInMeasures * beatsPerMeasure;
  const secondsPerBeat = 60 / score.tempo;
  const practiceEndSeconds = useMemo(
    () =>
      rawTargets.reduce(
        (endSeconds, target) =>
          Math.max(
            endSeconds,
            target.startSeconds + target.durationSeconds,
          ),
        practiceStartSeconds,
      ),
    [practiceStartSeconds, rawTargets],
  );
  const practiceDurationSeconds = Math.max(
    0,
    practiceEndSeconds - practiceStartSeconds,
  );
  const pedalTargets = useMemo(
    () =>
      buildPracticePedalTargets(score, {
        measureEnd: normalizedMeasureEnd,
        measureStart: normalizedMeasureStart,
        practiceStartSeconds,
      }),
    [normalizedMeasureEnd, normalizedMeasureStart, practiceStartSeconds, score],
  );
  const pedalTargetsRef = useRef(pedalTargets);
  const currentTarget = targets[currentTargetIndex] ?? null;
  const targetById = useMemo(
    () => new Map(targets.map((target) => [target.id, target])),
    [targets],
  );
  const resultSummary = useMemo(() => getPracticeResultSummary(results), [results]);
  const accuracyPercent = useMemo(
    () => getPracticeAccuracyPercent(results, targets.length),
    [results, targets.length],
  );
  const pedalSummary = useMemo(() => getPedalSummary(pedalResults), [pedalResults]);
  const expressionLabels = useMemo(
    () => getPracticeTargetExpressionLabels(score, currentTarget),
    [currentTarget, score],
  );
  const expressionCapabilities = useMemo(
    () => getPracticeExpressionCapabilitySummary(score),
    [score],
  );
  const practiceFeedbackByEventId = useMemo(() => {
    const feedbackByEventId: Record<string, PracticeFeedbackStatus> = {};

    results.forEach((result) => {
      const target = targetById.get(result.targetId);

      target?.eventIds.forEach((eventId) => {
        feedbackByEventId[eventId] = result.status;
      });
    });

    return feedbackByEventId;
  }, [results, targetById]);
  const rhythmPlaybackBeat =
    (mode === 'rhythm' && isPracticing) || isGuidePlaying
      ? getPlaybackScoreBeatAtSeconds(
          playbackTimeline,
          score.tempo,
          Math.max(0, elapsedSeconds) + practiceStartSeconds,
        )
      : null;
  const practicePlaybackBeat =
    rhythmPlaybackBeat ?? currentTarget?.startBeat ?? null;

  const clearResults = useCallback(() => {
    const nextResults = new Map<string, PracticeResult>();

    resultsRef.current = nextResults;
    setResults(nextResults);
  }, []);

  const clearPedalResults = useCallback(() => {
    const nextResults = new Map<string, PracticePedalResult>();

    pedalResultsRef.current = nextResults;
    setPedalResults(nextResults);
  }, []);

  const upsertResult = useCallback((result: PracticeResult) => {
    const nextResults = new Map(resultsRef.current);

    nextResults.set(result.targetId, result);
    resultsRef.current = nextResults;
    setResults(nextResults);
  }, []);

  const upsertPedalResult = useCallback((result: PracticePedalResult) => {
    const nextResults = new Map(pedalResultsRef.current);

    nextResults.set(result.targetId, result);
    pedalResultsRef.current = nextResults;
    setPedalResults(nextResults);
  }, []);

  const stopGuidePlayback = useCallback((resetClock = false) => {
    guideRunIdRef.current += 1;
    guideControllerRef.current?.stop();
    guideControllerRef.current = null;

    if (guideAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(guideAnimationFrameRef.current);
      guideAnimationFrameRef.current = null;
    }

    if (guideEndTimerRef.current !== null) {
      window.clearTimeout(guideEndTimerRef.current);
      guideEndTimerRef.current = null;
    }

    isGuidePlayingRef.current = false;
    setIsGuidePlaying(false);

    if (resetClock) {
      elapsedSecondsRef.current = 0;
      setElapsedSeconds(0);
    }
  }, []);

  const startGuidePlayback = useCallback(
    async ({ forPractice }: { forPractice: boolean }) => {
      stopGuidePlayback(false);

      const hasAudibleGuide = isReferenceEnabled || isMetronomeEnabled;

      if (!hasAudibleGuide && !forPractice) {
        setPracticeMessage('Enable reference or metronome first');
        return false;
      }

      if (practiceDurationSeconds <= 0) {
        setPracticeMessage('No playable notes in this range');
        return false;
      }

      const delaySeconds = isMetronomeEnabled
        ? countInBeats * secondsPerBeat
        : 0;
      const runId = guideRunIdRef.current + 1;

      guideRunIdRef.current = runId;
      elapsedSecondsRef.current = -delaySeconds;
      setElapsedSeconds(-delaySeconds);
      isGuidePlayingRef.current = true;
      setIsGuidePlaying(true);

      const controller = hasAudibleGuide
        ? await playTimelineAudio(isReferenceEnabled ? playbackTimeline : [], {
            delaySeconds,
            endSeconds: practiceEndSeconds,
            metronome: isMetronomeEnabled
              ? {
                  beatsPerMeasure,
                  countInBeats,
                  tempo: score.tempo,
                }
              : undefined,
            staffIds: getReferenceStaffIds(referenceMute),
            startSeconds: practiceStartSeconds,
          })
        : createPerformanceClockController(delaySeconds);

      if (guideRunIdRef.current !== runId) {
        controller.stop();
        return false;
      }

      guideControllerRef.current = controller;
      setPracticeMessage(
        delaySeconds > 0
          ? `Count-in ${countInBeats} beats`
          : forPractice
            ? getTargetLabel(targetsRef.current[0] ?? null)
            : 'Reference playing',
      );

      return true;
    },
    [
      beatsPerMeasure,
      countInBeats,
      isMetronomeEnabled,
      isReferenceEnabled,
      playbackTimeline,
      practiceDurationSeconds,
      practiceEndSeconds,
      practiceStartSeconds,
      referenceMute,
      score.tempo,
      secondsPerBeat,
      stopGuidePlayback,
    ],
  );

  const resetPracticeRound = useCallback((message: string) => {
    clearResults();
    clearPedalResults();
    elapsedSecondsRef.current = 0;
    currentTargetIndexRef.current = targetsRef.current.length > 0 ? 0 : -1;
    rhythmStartedAtRef.current = performance.now();
    setElapsedSeconds(0);
    setCurrentTargetIndex(targetsRef.current.length > 0 ? 0 : -1);
    setIsReviewOpen(false);
    setPracticeMessage(message);
  }, [clearPedalResults, clearResults]);

  const completePracticeRound = useCallback(
    (message: string) => {
      if (isLoopingRef.current && targetsRef.current.length > 0) {
        resetPracticeRound('Loop restarted');
        return true;
      }

      stopGuidePlayback(false);
      isPracticingRef.current = false;
      setIsPracticing(false);
      setCompletedAttempts((count) => count + 1);
      setIsReviewOpen(true);
      setPracticeMessage(message);
      return false;
    },
    [resetPracticeRound, stopGuidePlayback],
  );

  const advanceWaitTarget = useCallback(
    (target: PracticeTarget) => {
      const completedTargetIds = getCorrectTargetIds(resultsRef.current);

      completedTargetIds.add(target.id);
      const nextTargetIndex = getNextUnfinishedTargetIndex(
        targetsRef.current,
        completedTargetIds,
      );

      if (nextTargetIndex < 0) {
        completePracticeRound('Round complete');
        return;
      }

      currentTargetIndexRef.current = nextTargetIndex;
      setCurrentTargetIndex(nextTargetIndex);
      setPracticeMessage(getTargetLabel(targetsRef.current[nextTargetIndex] ?? null));
    },
    [completePracticeRound],
  );

  const handleMidiEvent = useCallback(
    (event: ParsedMidiEvent) => {
      if (event.type === 'note-on') {
        activeMidiNotesRef.current = [
          ...new Set([...activeMidiNotesRef.current, event.midiNote]),
        ].sort((a, b) => a - b);
      } else if (event.type === 'note-off') {
        activeMidiNotesRef.current = activeMidiNotesRef.current.filter(
          (midiNote) => midiNote !== event.midiNote,
        );
      }

      if (isSustainPedalEvent(event)) {
        if (
          modeRef.current === 'rhythm' &&
          isPracticingRef.current &&
          elapsedSecondsRef.current >= 0
        ) {
          const action = event.value >= 64 ? 'down' : 'up';
          const target = findNearestPedalTarget(pedalTargetsRef.current, {
            action,
            elapsedSeconds: elapsedSecondsRef.current,
            resolvedTargetIds: new Set(pedalResultsRef.current.keys()),
          });

          if (target) {
            const result = evaluatePedalTarget(
              target,
              elapsedSecondsRef.current,
            );

            upsertPedalResult(result);
            setPracticeMessage(getPedalResultLabel(result));
          } else {
            setPracticeMessage(
              action === 'down' ? 'Pedal down off target' : 'Pedal up off target',
            );
          }
        }

        return;
      }

      if (event.type !== 'note-on') {
        return;
      }

      if (modeRef.current === 'listen') {
        setPracticeMessage(`Heard ${formatMidiNote(event.midiNote)}`);
        return;
      }

      if (!isPracticingRef.current) {
        return;
      }

      if (modeRef.current === 'wait') {
        const target = targetsRef.current[currentTargetIndexRef.current];

        if (!target) {
          return;
        }

        const result = evaluatePracticeTarget(
          target,
          activeMidiNotesRef.current,
        );

        upsertResult(result);

        if (result.status === 'correct') {
          advanceWaitTarget(target);
        } else {
          setPracticeMessage(getPracticeResultMessage(result));
        }

        return;
      }

      const rhythmTarget = getPracticeTargetAtSeconds(
        targetsRef.current,
        elapsedSecondsRef.current,
      );

      if (!rhythmTarget) {
        setPracticeMessage(`Off target: ${formatMidiNote(event.midiNote)}`);
        return;
      }

      const result = evaluatePracticeTarget(
        rhythmTarget,
        activeMidiNotesRef.current,
        {
          elapsedSeconds: elapsedSecondsRef.current,
          timingToleranceMs: PRACTICE_TIMING_TOLERANCE_MS[timingLevel],
        },
      );

      upsertResult(result);
      setPracticeMessage(getPracticeResultMessage(result));

      if (result.status === 'correct') {
        const targetIndex = targetsRef.current.findIndex(
          (target) => target.id === rhythmTarget.id,
        );

        if (targetIndex >= currentTargetIndexRef.current) {
          const nextTargetIndex = Math.min(
            targetsRef.current.length - 1,
            targetIndex + 1,
          );

          currentTargetIndexRef.current = nextTargetIndex;
          setCurrentTargetIndex(nextTargetIndex);
        }
      }
    },
    [advanceWaitTarget, timingLevel, upsertPedalResult, upsertResult],
  );
  const {
    activeMidiNotes,
    connect,
    inputs,
    recentEvents,
    selectedInputId,
    setSelectedInputId,
    status,
    sustainPedalDown,
  } = useMidiInputs(handleMidiEvent);
  const activeListenEventIds = useMemo(
    () =>
      mode === 'listen'
        ? targets
            .filter((target) =>
              target.midiNotes.some((midiNote) =>
                activeMidiNotes.includes(midiNote),
              ),
            )
            .flatMap((target) => target.eventIds)
        : [],
    [activeMidiNotes, mode, targets],
  );
  const activeGuideEvents = useMemo(
    () =>
      isGuidePlaying && elapsedSeconds >= 0
        ? getActiveTimelineEvents(
            playbackTimeline,
            practiceStartSeconds + elapsedSeconds,
          )
        : [],
    [elapsedSeconds, isGuidePlaying, playbackTimeline, practiceStartSeconds],
  );
  const activeGuideEventIds = useMemo(
    () => [
      ...new Set(
        activeGuideEvents.flatMap((event) =>
          event.sustainedEventIds ?? [event.id],
        ),
      ),
    ],
    [activeGuideEvents],
  );
  const shouldHighlightPracticeTarget =
    mode === 'wait' || (mode === 'rhythm' && isPracticing);
  const activePracticeEventIds =
    shouldHighlightPracticeTarget && currentTarget ? currentTarget.eventIds : [];
  const activeEventIds =
    mode === 'listen'
      ? activeListenEventIds
      : isGuidePlaying && !isPracticing
        ? activeGuideEventIds
        : activePracticeEventIds;

  useEffect(() => {
    activeMidiNotesRef.current = activeMidiNotes;
  }, [activeMidiNotes]);

  useEffect(() => {
    currentTargetIndexRef.current = currentTargetIndex;
  }, [currentTargetIndex]);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  useEffect(() => {
    isGuidePlayingRef.current = isGuidePlaying;
  }, [isGuidePlaying]);

  useEffect(() => {
    isPracticingRef.current = isPracticing;
  }, [isPracticing]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    pedalTargetsRef.current = pedalTargets;
  }, [pedalTargets]);

  useEffect(() => {
    targetsRef.current = targets;
    resultsRef.current = new Map();
    pedalResultsRef.current = new Map();
    setResults(new Map());
    setPedalResults(new Map());
    setCurrentTargetIndex(targets.length > 0 ? 0 : -1);
    currentTargetIndexRef.current = targets.length > 0 ? 0 : -1;
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    setIsPracticing(false);
    stopGuidePlayback(true);
    isPracticingRef.current = false;
    setPracticeMessage(targets.length > 0 ? getTargetLabel(targets[0]) : 'No playable notes');
  }, [stopGuidePlayback, targets]);

  useEffect(() => {
    setMeasureStart((current) => clampNumber(current, 1, measureCount));
    setMeasureEnd((current) => clampNumber(current, 1, measureCount));
  }, [measureCount]);

  useEffect(() => () => stopGuidePlayback(false), [stopGuidePlayback]);

  useEffect(() => {
    if (!isGuidePlaying && !(isPracticing && mode === 'rhythm')) {
      return;
    }

    let animationFrameId = 0;

    function markMissedTargets(nextElapsedSeconds: number) {
      const nextResults = new Map(resultsRef.current);
      let changed = false;

      targetsRef.current.forEach((target) => {
        if (
          !nextResults.has(target.id) &&
          target.startSeconds + target.durationSeconds + RHYTHM_MISS_GRACE_SECONDS <
            nextElapsedSeconds
        ) {
          nextResults.set(target.id, createMissedPracticeResult(target));
          changed = true;
        }
      });

      if (changed) {
        resultsRef.current = nextResults;
        setResults(nextResults);
      }
    }

    function markMissedPedalTargets(nextElapsedSeconds: number) {
      const nextResults = new Map(pedalResultsRef.current);
      let changed = false;

      pedalTargetsRef.current.forEach((target) => {
        if (
          !nextResults.has(target.id) &&
          target.startSeconds + RHYTHM_MISS_GRACE_SECONDS < nextElapsedSeconds
        ) {
          nextResults.set(target.id, createMissedPedalResult(target));
          changed = true;
        }
      });

      if (changed) {
        pedalResultsRef.current = nextResults;
        setPedalResults(nextResults);
      }
    }

    function tick() {
      const nextElapsedSeconds = guideControllerRef.current?.getElapsedSeconds?.()
        ?? (performance.now() - rhythmStartedAtRef.current) / 1000;
      const targetsSnapshot = targetsRef.current;
      const currentRhythmTarget = getPracticeTargetAtSeconds(
        targetsSnapshot,
        nextElapsedSeconds,
        0.5,
      );

      elapsedSecondsRef.current = nextElapsedSeconds;
      setElapsedSeconds(nextElapsedSeconds);

      if (nextElapsedSeconds < 0) {
        setPracticeMessage(
          `Count-in ${Math.max(1, Math.ceil(Math.abs(nextElapsedSeconds)))}s`,
        );
        animationFrameId = window.requestAnimationFrame(tick);
        return;
      }

      if (isPracticingRef.current && modeRef.current === 'rhythm') {
        markMissedTargets(nextElapsedSeconds);
        markMissedPedalTargets(nextElapsedSeconds);
      }

      if (currentRhythmTarget) {
        const nextTargetIndex = targetsSnapshot.findIndex(
          (target) => target.id === currentRhythmTarget.id,
        );

        if (nextTargetIndex >= 0) {
          currentTargetIndexRef.current = nextTargetIndex;
          setCurrentTargetIndex(nextTargetIndex);
        }
      }

      if (
        practiceDurationSeconds > 0 &&
        nextElapsedSeconds > practiceDurationSeconds + RHYTHM_MISS_GRACE_SECONDS
      ) {
        if (isPracticingRef.current && modeRef.current === 'rhythm') {
          const looped = completePracticeRound('Rhythm pass complete');

          if (looped) {
            stopGuidePlayback(false);
            void startGuidePlayback({ forPractice: true });
          }

          return;
        }

        stopGuidePlayback(true);
        setPracticeMessage('Reference finished');
        return;
      }

      animationFrameId = window.requestAnimationFrame(tick);
    }

    animationFrameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [
    completePracticeRound,
    isGuidePlaying,
    isPracticing,
    mode,
    practiceDurationSeconds,
    startGuidePlayback,
    stopGuidePlayback,
  ]);

  function handleModeChange(nextMode: PracticeMode) {
    stopGuidePlayback(false);
    setMode(nextMode);
    setIsPracticing(false);
    isPracticingRef.current = false;
    setIsGuidePlaying(false);
    isGuidePlayingRef.current = false;
    setPracticeMessage(nextMode === 'listen' ? 'Listening' : getTargetLabel(currentTarget));
  }

  async function handleReferenceToggle() {
    if (isGuidePlaying && !isPracticing) {
      stopGuidePlayback(true);
      setPracticeMessage('Reference stopped');
      return;
    }

    await warmUpPlaybackAudio();
    void startGuidePlayback({ forPractice: false });
  }

  async function handlePracticeToggle() {
    if (isPracticing) {
      stopGuidePlayback(false);
      isPracticingRef.current = false;
      setIsPracticing(false);
      setPracticeMessage('Paused');
      return;
    }

    if (targets.length === 0) {
      setPracticeMessage('No playable notes in this range');
      return;
    }

    resetPracticeRound(getTargetLabel(targets[0] ?? null));
    await warmUpPlaybackAudio();
    isPracticingRef.current = true;
    rhythmStartedAtRef.current = performance.now();
    setIsPracticing(true);

    if (mode === 'rhythm') {
      const started = await startGuidePlayback({ forPractice: true });

      if (!started) {
        isPracticingRef.current = false;
        setIsPracticing(false);
      }
    }
  }

  function handleMeasureStartChange(value: string) {
    const nextMeasureStart = parseMeasureInput(value, measureStart, measureCount);

    setMeasureStart(nextMeasureStart);
    setMeasureEnd((current) => Math.max(current, nextMeasureStart));
  }

  function handleMeasureEndChange(value: string) {
    const nextMeasureEnd = parseMeasureInput(value, measureEnd, measureCount);

    setMeasureEnd(nextMeasureEnd);
    setMeasureStart((current) => Math.min(current, nextMeasureEnd));
  }

  const midiStatusLabel = getMidiConnectionStatusLabel(status);
  const targetStaffLabel = currentTarget?.staffIds.join(' + ') ?? 'none';
  const activeNotesLabel =
    activeMidiNotes.length > 0 ? formatMidiNoteList(activeMidiNotes) : 'None';
  const selectedInput = inputs.find((input) => input.id === selectedInputId) ?? null;
  const progressLabel = `${resultSummary.correct}/${targets.length}`;
  const guideMeasureIndex = activeGuideEvents[0]?.measureIndex ?? null;
  const currentMeasureIndex = currentTarget?.measureIndex ?? guideMeasureIndex;

  return (
    <main className="app-shell practice-shell" data-testid="practice-page">
      <header className="topbar practice-topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <div>
            <h1>Practice</h1>
            <p>{score.title}</p>
          </div>
        </div>
        <div className="practice-header-actions">
          <button type="button" className="tool-button" onClick={onBackToEditor}>
            Editor
          </button>
          <button
            type="button"
            className="tool-button"
            data-testid="connect-midi"
            disabled={status === 'requesting'}
            onClick={() => void connect()}
          >
            MIDI
          </button>
          <button
            type="button"
            className={`tool-button${isPracticing ? ' is-active' : ''}`}
            data-testid="practice-start"
            onClick={() => void handlePracticeToggle()}
          >
            {isPracticing ? 'Stop' : 'Start'}
          </button>
          <button
            type="button"
            className={`tool-button${isGuidePlaying && !isPracticing ? ' is-active' : ''}`}
            data-testid="practice-reference"
            disabled={isPracticing}
            onClick={() => void handleReferenceToggle()}
          >
            {isGuidePlaying && !isPracticing ? 'Stop Ref' : 'Reference'}
          </button>
        </div>
      </header>

      <section className="practice-layout">
        <aside className="practice-panel" aria-label="Practice controls">
          <div className="practice-status" data-testid="practice-summary">
            <span>{midiStatusLabel}</span>
            <strong>{practiceMessage}</strong>
          </div>

          <div className="practice-kpi-grid">
            <div>
              <span>Progress</span>
              <strong>{progressLabel}</strong>
            </div>
            <div>
              <span>Target</span>
              <strong>{targets.length}</strong>
            </div>
            <div>
              <span>Correct</span>
              <strong>{resultSummary.correct}</strong>
            </div>
            <div>
              <span>Missed</span>
              <strong>{resultSummary.missed}</strong>
            </div>
            <div>
              <span>Accuracy</span>
              <strong>{accuracyPercent}%</strong>
            </div>
            <div>
              <span>Pedal</span>
              <strong>
                {pedalSummary.correct}/{pedalTargets.length}
              </strong>
            </div>
          </div>

          <label className="practice-field">
            Device
            <select
              value={selectedInputId ?? ''}
              disabled={inputs.length === 0}
              onChange={(event) => setSelectedInputId(event.target.value || null)}
            >
              <option value="">
                {selectedInput ? getMidiInputLabel(selectedInput) : 'No input'}
              </option>
              {inputs.map((input) => (
                <option key={input.id} value={input.id}>
                  {getMidiInputLabel(input)}
                </option>
              ))}
            </select>
          </label>

          <div className="practice-control-block">
            <span className="practice-control-label">Mode</span>
            <div className="practice-segmented" role="group" aria-label="Practice mode">
              {(['listen', 'wait', 'rhythm'] satisfies PracticeMode[]).map(
                (practiceMode) => (
                  <button
                    key={practiceMode}
                    type="button"
                    className={mode === practiceMode ? 'is-active' : ''}
                    data-testid={`practice-mode-${practiceMode}`}
                    onClick={() => handleModeChange(practiceMode)}
                  >
                    {practiceMode}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="practice-control-block">
            <span className="practice-control-label">Hands</span>
            <div className="practice-segmented" role="group" aria-label="Hand mode">
              {(['both', 'right', 'left'] satisfies PracticeHandMode[]).map(
                (nextHandMode) => (
                  <button
                    key={nextHandMode}
                    type="button"
                    className={handMode === nextHandMode ? 'is-active' : ''}
                    onClick={() => setHandMode(nextHandMode)}
                  >
                    {nextHandMode}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="practice-control-block">
            <span className="practice-control-label">Guide</span>
            <label className="practice-check-row">
              <input
                type="checkbox"
                data-testid="practice-reference-enabled"
                checked={isReferenceEnabled}
                onChange={(event) => setIsReferenceEnabled(event.target.checked)}
              />
              Reference audio
            </label>
            <label className="practice-check-row">
              <input
                type="checkbox"
                data-testid="practice-metronome-enabled"
                checked={isMetronomeEnabled}
                onChange={(event) => setIsMetronomeEnabled(event.target.checked)}
              />
              Metronome
            </label>
          </div>

          <div className="practice-range-grid">
            <label className="practice-field">
              Count-in
              <select
                data-testid="practice-count-in"
                value={countInMeasures}
                onChange={(event) => setCountInMeasures(Number(event.target.value))}
              >
                <option value={0}>Off</option>
                <option value={1}>1 bar</option>
                <option value={2}>2 bars</option>
              </select>
            </label>
            <label className="practice-field">
              Mute
              <select
                data-testid="practice-reference-mute"
                value={referenceMute}
                onChange={(event) =>
                  setReferenceMute(event.target.value as PracticeReferenceMute)
                }
              >
                <option value="none">None</option>
                <option value="right">Right hand</option>
                <option value="left">Left hand</option>
              </select>
            </label>
          </div>

          <label className="practice-field">
            Timing
            <select
              data-testid="practice-timing"
              value={timingLevel}
              onChange={(event) =>
                setTimingLevel(event.target.value as PracticeTimingLevel)
              }
            >
              <option value="beginner">Beginner ±280ms</option>
              <option value="normal">Normal ±180ms</option>
              <option value="strict">Strict ±90ms</option>
            </select>
          </label>

          <div className="practice-range-grid">
            <label className="practice-field">
              From
              <input
                type="number"
                min={1}
                max={measureCount}
                value={measureStart}
                onChange={(event) => handleMeasureStartChange(event.target.value)}
              />
            </label>
            <label className="practice-field">
              To
              <input
                type="number"
                min={1}
                max={measureCount}
                value={measureEnd}
                onChange={(event) => handleMeasureEndChange(event.target.value)}
              />
            </label>
          </div>

          <label className="practice-check-row">
            <input
              type="checkbox"
              checked={isLooping}
              onChange={(event) => setIsLooping(event.target.checked)}
            />
            Loop range
          </label>

          <div className="practice-target-readout">
            <span>{targetStaffLabel}</span>
            <strong>{getTargetLabel(currentTarget)}</strong>
            {expressionLabels.length > 0 ? (
              <small>Expression {expressionLabels.join(' / ')}</small>
            ) : null}
            <small>
              Active {activeNotesLabel}
              {sustainPedalDown ? ' + sustain' : ''}
            </small>
            {expressionCapabilities.length > 0 ? (
              <small>Score marks {expressionCapabilities.join(', ')}</small>
            ) : null}
          </div>

          <ol className="practice-recent-events" aria-label="Recent MIDI events">
            {recentEvents.length > 0 ? (
              recentEvents.slice(0, 6).map((event, index) => (
                <li key={`${event.timestampMs}-${index}`}>
                  <span>{getEventLabel(event)}</span>
                  <time>{Math.round(event.timestampMs)}ms</time>
                </li>
              ))
            ) : (
              <li>
                <span>No MIDI events</span>
                <time>0ms</time>
              </li>
            )}
          </ol>

          <dl className="practice-result-list">
            <div>
              <dt>Partial</dt>
              <dd>{resultSummary.partial}</dd>
            </div>
            <div>
              <dt>Wrong</dt>
              <dd>{resultSummary.wrong}</dd>
            </div>
            <div>
              <dt>Pedal issues</dt>
              <dd>{pedalSummary.early + pedalSummary.late + pedalSummary.missed}</dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{Math.max(0, elapsedSeconds).toFixed(1)}s</dd>
            </div>
            <div>
              <dt>Measure</dt>
              <dd>
                {normalizedMeasureStart + 1}-{normalizedMeasureEnd + 1}
              </dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd>{completedAttempts}</dd>
            </div>
          </dl>

          {isReviewOpen ? (
            <section className="practice-review" aria-label="Practice review">
              <h2>Review</h2>
              <div className="practice-review-grid">
                <div>
                  <span>Notes</span>
                  <strong>{accuracyPercent}%</strong>
                </div>
                <div>
                  <span>Rhythm</span>
                  <strong>
                    {resultSummary.wrong + resultSummary.missed === 0
                      ? 'Clean'
                      : `${resultSummary.wrong + resultSummary.missed} issues`}
                  </strong>
                </div>
                <div>
                  <span>Pedal</span>
                  <strong>
                    {pedalTargets.length === 0
                      ? 'None'
                      : `${pedalSummary.correct}/${pedalTargets.length}`}
                  </strong>
                </div>
              </div>
              <ol className="practice-review-list">
                {[...results.values()].slice(-5).map((result) => (
                  <li key={result.targetId}>{getPracticeResultMessage(result)}</li>
                ))}
                {[...pedalResults.values()].slice(-3).map((result) => (
                  <li key={result.targetId}>{getPedalResultLabel(result)}</li>
                ))}
              </ol>
            </section>
          ) : null}
        </aside>

        <PracticeSheet
          activeEventIds={activeEventIds}
          currentMeasureIndex={currentMeasureIndex}
          playbackBeat={practicePlaybackBeat}
          practiceFeedbackByEventId={practiceFeedbackByEventId}
          score={score}
        />
      </section>
    </main>
  );
}
