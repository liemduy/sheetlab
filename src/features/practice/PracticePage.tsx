import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { Score } from '../../domain/score/types';
import {
  buildFingeringHints,
  type FingeringHint,
} from '../fingering/fingeringHints';
import type { PlaybackController } from '../playback/audioEngine';
import { playTimelineAudio, warmUpPlaybackAudio } from '../playback/audioEngine';
import {
  buildPlaybackTimeline,
  getActiveTimelineEvents,
  getPlaybackScoreBeatAtSeconds,
} from '../playback/timeline';
import { getScoreSvgWidth } from '../sheet/layout';
import {
  getInitialScorePageIndexes,
  getNearbyScorePageIndexes,
  getScorePageForMeasureIndex,
  getScorePageViewports,
} from '../sheet/pageLayout';
import { StaffRenderer, type PracticeFeedbackStatus } from '../sheet/StaffRenderer';
import {
  formatMidiNote,
  getMidiConnectionStatusLabel,
  getMidiInputLabel,
  getMidiPracticeReadinessLabel,
  isSustainPedalEvent,
  type ParsedMidiEvent,
} from './midiAccess';
import {
  buildPracticeTargets,
  formatPracticeTargetVoiceLabel,
  getNextUnfinishedTargetIndex,
  type PracticeHandMode,
  type PracticeOrnamentMode,
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
  getMidiChordSettleMs,
  getMidiChordWindowLabel,
  mergeBufferedMidiNotes,
} from './midiChordBuffer';
import {
  evaluatePracticeHolds,
  type PracticeNoteLifecycle,
} from './practiceHold';
import { findSequentialPracticeTarget } from './practiceMatcher';
import {
  buildPracticePedalTargets,
  createMissedPedalResult,
  evaluatePedalTarget,
  findNearestPedalTarget,
  type PracticePedalResult,
} from './practicePedal';
import {
  buildPracticeExpressionFeedback,
  getPracticeExpressionCapabilitySummary,
  getPracticeTargetExpressionLabels,
} from './practiceExpressions';
import { buildPracticeReviewSummary } from './practiceReview';
import {
  canTransitionPracticeSession,
  getPracticeSessionStatusLabel,
  type PracticeSessionStatus,
} from './practiceSession';
import {
  findPracticeTargetInDynamicWindow,
  getPracticeTimingToleranceMs,
  PRACTICE_TIMING_TOLERANCE_MS,
  type PracticeTimingLevel,
} from './practiceTiming';
import {
  getPracticeScorePercent,
  listTopPracticeScores,
  savePracticeAttempt,
  type PracticeTopScore,
} from '../cloud/practiceScoreRepository';
import { useMidiInputs } from './useMidiInputs';

type PracticeMode = 'listen' | 'wait' | 'rhythm';
type PedalPracticeMode = 'guide' | 'off' | 'score';
type PracticeReferenceMute = 'left' | 'none' | 'right';
const RHYTHM_MISS_GRACE_SECONDS = 0.36;
const PAGE_OBSERVER_DELAY_MS = 160;

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

function getCorrectTargetIds(results: ReadonlyMap<string, PracticeResult>) {
  const targetIds = new Set<string>();

  results.forEach((result, targetId) => {
    if (result.status === 'correct') {
      targetIds.add(targetId);
    }
  });

  return targetIds;
}

function getTargetByEventId(
  targets: readonly PracticeTarget[],
  eventId: string,
) {
  return targets.find((target) => target.eventIds.includes(eventId)) ?? null;
}

function getTargetSliceByEventRange(
  targets: readonly PracticeTarget[],
  range: { startEventId: string; endEventId: string } | null,
) {
  if (!range) {
    return targets;
  }

  const startIndex = targets.findIndex((target) =>
    target.eventIds.includes(range.startEventId),
  );
  const endIndex = targets.findIndex((target) =>
    target.eventIds.includes(range.endEventId),
  );

  if (startIndex < 0 || endIndex < 0) {
    return targets;
  }

  const fromIndex = Math.min(startIndex, endIndex);
  const toIndex = Math.max(startIndex, endIndex);

  return targets.slice(fromIndex, toIndex + 1);
}

function getTargetLabel(target: PracticeTarget | null) {
  if (!target) {
    return 'No playable target';
  }

  return `M${target.measureIndex + 1} beat ${target.beat + 1}: ${formatMidiNoteList(
    target.midiNotes,
  )} (${formatPracticeTargetVoiceLabel(target)})`;
}

function getTargetDeltaLabel(
  currentTarget: PracticeTarget | null,
  nextTarget: PracticeTarget | null,
) {
  if (!currentTarget || !nextTarget) {
    return 'End';
  }

  const deltaSeconds = Math.max(
    0,
    nextTarget.startSeconds - currentTarget.startSeconds,
  );

  return `${deltaSeconds.toFixed(1)}s`;
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

function getMeasureIssueCount(review: {
  holdIssues: number;
  noteIssues: number;
  pedalIssues: number;
  timingIssues: number;
}) {
  return (
    review.holdIssues +
    review.noteIssues +
    review.pedalIssues +
    review.timingIssues
  );
}

function getCoachModeCue(mode: PracticeMode) {
  if (mode === 'listen') {
    return 'Listen mode: press keys to find them on the score';
  }

  if (mode === 'wait') {
    return 'Wait mode: get the next note or chord right';
  }

  return 'Rhythm mode: notes, timing, and hold are being checked';
}

function getPedalModeLabel(mode: PedalPracticeMode) {
  if (mode === 'off') {
    return 'Off';
  }

  if (mode === 'score') {
    return 'Score';
  }

  return 'Guide';
}

function getOrnamentModeLabel(mode: PracticeOrnamentMode) {
  if (mode === 'strict') {
    return 'Strict';
  }

  if (mode === 'ignore') {
    return 'Ignore';
  }

  return 'Guide';
}

function formatTopScoreDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  });
}

function createPerformanceClockController(
  delaySeconds = 0,
  startOffsetSeconds = 0,
): PlaybackController {
  const startedAtMs =
    performance.now() + delaySeconds * 1000 - startOffsetSeconds * 1000;

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
  fingeringHints: readonly FingeringHint[];
  onRangeEventPick?: (eventId: string) => void;
  playbackBeat: number | null;
  practiceFeedbackByEventId: Readonly<Record<string, PracticeFeedbackStatus>>;
  rangeEventIds: readonly string[];
  score: Score;
  showFingeringHints: boolean;
  showMeasureNumbers: boolean;
}

function PracticeSheet({
  activeEventIds,
  currentMeasureIndex,
  fingeringHints,
  onRangeEventPick,
  playbackBeat,
  practiceFeedbackByEventId,
  rangeEventIds,
  score,
  showFingeringHints,
  showMeasureNumbers,
}: PracticeSheetProps) {
  const pageViewports = useMemo(() => getScorePageViewports(score), [score]);
  const [renderedPageIndexes, setRenderedPageIndexes] = useState<Set<number>>(
    () => getInitialScorePageIndexes(1),
  );
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const scoreSvgWidth = getScoreSvgWidth(score);
  const stageRef = useRef<HTMLElement | null>(null);
  const lastFollowedPageRef = useRef<number | null>(null);
  const currentPage =
    currentMeasureIndex !== null
      ? getScorePageForMeasureIndex(pageViewports, currentMeasureIndex)
      : null;

  function scrollPageIntoView(pageIndex: number, behavior: ScrollBehavior = 'smooth') {
    const pageElement = stageRef.current?.querySelector<HTMLElement>(
      `.paper-page[data-page-index="${pageIndex}"]`,
    );

    pageElement?.scrollIntoView({
      behavior,
      block: 'start',
      inline: 'nearest',
    });
  }

  function handlePageNavigation(pageIndex: number) {
    const safePageIndex = Math.min(
      pageViewports.length - 1,
      Math.max(0, pageIndex),
    );

    setCurrentPageIndex(safePageIndex);
    setRenderedPageIndexes(
      getNearbyScorePageIndexes(safePageIndex, pageViewports.length),
    );
    window.requestAnimationFrame(() => scrollPageIntoView(safePageIndex));
  }

  useEffect(() => {
    setRenderedPageIndexes(getInitialScorePageIndexes(pageViewports.length));
    setCurrentPageIndex(0);
    lastFollowedPageRef.current = null;
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
          const visiblePage = entries.reduce<{
            index: number;
            ratio: number;
          } | null>((bestPage, entry) => {
            if (!entry.isIntersecting) {
              return bestPage;
            }

            const pageIndex = Number(
              (entry.target as HTMLElement).dataset.pageIndex,
            );

            if (!Number.isFinite(pageIndex)) {
              return bestPage;
            }

            if (!bestPage || entry.intersectionRatio > bestPage.ratio) {
              return { index: pageIndex, ratio: entry.intersectionRatio };
            }

            return bestPage;
          }, null);

          if (!visiblePage) {
            return;
          }

          setCurrentPageIndex(visiblePage.index);
          setRenderedPageIndexes(
            getNearbyScorePageIndexes(visiblePage.index, pageViewports.length),
          );
        },
        {
          root: null,
          rootMargin: '360px 0px',
        },
      );

      pageElements.forEach((pageElement) => observer?.observe(pageElement));
    }, PAGE_OBSERVER_DELAY_MS);

    return () => {
      window.clearTimeout(observerDelay);
      observer?.disconnect();
    };
  }, [pageViewports]);

  useEffect(() => {
    if (!currentPage) {
      return;
    }

    setCurrentPageIndex(currentPage.index);
    setRenderedPageIndexes(
      getNearbyScorePageIndexes(currentPage.index, pageViewports.length),
    );

    if (lastFollowedPageRef.current !== currentPage.index) {
      lastFollowedPageRef.current = currentPage.index;
      window.requestAnimationFrame(() => scrollPageIntoView(currentPage.index));
    }
  }, [currentPage, pageViewports.length]);

  return (
    <section ref={stageRef} className="practice-stage" aria-label="Practice sheet">
      <div
        className="paper-stack practice-paper-stack"
        style={{ '--canvas-zoom': 0.94 } as CSSProperties}
      >
        {pageViewports.length > 1 ? (
          <div className="sheet-page-controls" aria-label="Practice pages">
            <button
              type="button"
              aria-label="Previous practice page"
              disabled={currentPageIndex <= 0}
              onClick={() => handlePageNavigation(currentPageIndex - 1)}
            >
              {'<'}
            </button>
            <span>
              Page {currentPageIndex + 1} / {pageViewports.length}
            </span>
            <button
              type="button"
              aria-label="Next practice page"
              disabled={currentPageIndex >= pageViewports.length - 1}
              onClick={() => handlePageNavigation(currentPageIndex + 1)}
            >
              {'>'}
            </button>
          </div>
        ) : null}
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
                    fingeringHints={fingeringHints}
                    isInputArmed={false}
                    onRangeEventPick={onRangeEventPick}
                    pageViewport={pageViewport}
                    playbackBeat={isCurrentPage ? playbackBeat : null}
                    practiceFeedbackByEventId={practiceFeedbackByEventId}
                    rangeEventIds={rangeEventIds}
                    score={score}
                    showFingeringHints={showFingeringHints}
                    showMeasureNumbers={showMeasureNumbers}
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
  cloudUserId?: string | null;
  onBackToEditor: () => void;
  onMeasureNumbersToggle?: (showMeasureNumbers: boolean) => void;
  score: Score;
  showMeasureNumbers?: boolean;
}

export function PracticePage({
  cloudUserId = null,
  onBackToEditor,
  onMeasureNumbersToggle,
  score,
  showMeasureNumbers = false,
}: PracticePageProps) {
  const measureCount = useMemo(() => getPracticeMeasureCount(score), [score]);
  const [mode, setMode] = useState<PracticeMode>('wait');
  const [handMode, setHandMode] = useState<PracticeHandMode>('both');
  const [measureStart, setMeasureStart] = useState(1);
  const [measureEnd, setMeasureEnd] = useState(measureCount);
  const [isLooping, setIsLooping] = useState(false);
  const [isReferenceEnabled, setIsReferenceEnabled] = useState(true);
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState(true);
  const [showFingeringHints, setShowFingeringHints] = useState(
    () => !score.importedLayout,
  );
  const [isExpressionFeedbackEnabled, setIsExpressionFeedbackEnabled] =
    useState(true);
  const [pedalMode, setPedalMode] = useState<PedalPracticeMode>('guide');
  const [ornamentMode, setOrnamentMode] =
    useState<PracticeOrnamentMode>('guide');
  const [countInMeasures, setCountInMeasures] = useState(1);
  const [referenceMute, setReferenceMute] =
    useState<PracticeReferenceMute>('none');
  const [timingLevel, setTimingLevel] =
    useState<PracticeTimingLevel>('normal');
  const [sessionStatus, setSessionStatus] =
    useState<PracticeSessionStatus>('idle');
  const [rangeAnchorEventId, setRangeAnchorEventId] = useState<string | null>(null);
  const [directRange, setDirectRange] = useState<{
    startEventId: string;
    endEventId: string;
  } | null>(null);
  const [isGuidePlaying, setIsGuidePlaying] = useState(false);
  const [isGuidePaused, setIsGuidePaused] = useState(false);
  const [guidePausedOffsetSeconds, setGuidePausedOffsetSeconds] = useState(0);
  const [isPracticing, setIsPracticing] = useState(false);
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [results, setResults] = useState<Map<string, PracticeResult>>(
    () => new Map(),
  );
  const [pedalResults, setPedalResults] = useState<
    Map<string, PracticePedalResult>
  >(() => new Map());
  const [noteLifecycles, setNoteLifecycles] = useState<PracticeNoteLifecycle[]>(
    [],
  );
  const [completedAttempts, setCompletedAttempts] = useState(0);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [practiceMessage, setPracticeMessage] = useState('Ready');
  const [practiceTopScores, setPracticeTopScores] = useState<PracticeTopScore[]>(
    [],
  );
  const [practiceTopScoreStatus, setPracticeTopScoreStatus] =
    useState('Sign in to save scores');
  const [latencyOffsetMs, setLatencyOffsetMs] = useState(0);
  const activeMidiNotesRef = useRef<number[]>([]);
  const currentTargetIndexRef = useRef(currentTargetIndex);
  const elapsedSecondsRef = useRef(elapsedSeconds);
  const guideControllerRef = useRef<PlaybackController | null>(null);
  const guideAnimationFrameRef = useRef<number | null>(null);
  const guideEndTimerRef = useRef<number | null>(null);
  const guideRunIdRef = useRef(0);
  const hasGuideLeftCountInRef = useRef(false);
  const isLoopingRef = useRef(isLooping);
  const isGuidePausedRef = useRef(isGuidePaused);
  const isGuidePlayingRef = useRef(isGuidePlaying);
  const isPracticingRef = useRef(isPracticing);
  const modeRef = useRef(mode);
  const pendingMidiEvaluationTimerRef = useRef<number | null>(null);
  const pendingMidiNoteOnsRef = useRef<number[]>([]);
  const pendingRhythmElapsedSecondsRef = useRef<number | null>(null);
  const noteLifecyclesRef = useRef(noteLifecycles);
  const pedalResultsRef = useRef(pedalResults);
  const resultsRef = useRef(results);
  const rhythmStartedAtRef = useRef(0);
  const latencyOffsetMsRef = useRef(latencyOffsetMs);
  const pedalModeRef = useRef(pedalMode);
  const timingLevelRef = useRef(timingLevel);
  const sessionStatusRef = useRef(sessionStatus);
  const sustainPedalDownRef = useRef(false);
  const savedPracticeAttemptKeyRef = useRef<string | null>(null);
  const normalizedMeasureStart = Math.min(measureStart, measureEnd) - 1;
  const normalizedMeasureEnd = Math.max(measureStart, measureEnd) - 1;
  const rangeSelectableTargets = useMemo(
    () => buildPracticeTargets(score, { handMode, ornamentMode: 'strict' }),
    [handMode, score],
  );
  const measureFilteredRawTargets = useMemo(
    () =>
      buildPracticeTargets(score, {
        handMode,
        measureEnd: normalizedMeasureEnd,
        measureStart: normalizedMeasureStart,
        ornamentMode,
      }),
    [handMode, normalizedMeasureEnd, normalizedMeasureStart, ornamentMode, score],
  );
  const rawTargets = useMemo(
    () => getTargetSliceByEventRange(measureFilteredRawTargets, directRange),
    [directRange, measureFilteredRawTargets],
  );
  const practiceStartSeconds = rawTargets[0]?.startSeconds ?? 0;
  const targets = useMemo(
    () =>
      rawTargets.map((target) => ({
        ...target,
        expectedReleaseSeconds:
          target.expectedReleaseSeconds === undefined
            ? undefined
            : target.expectedReleaseSeconds - practiceStartSeconds,
        startSeconds: target.startSeconds - practiceStartSeconds,
      })),
    [practiceStartSeconds, rawTargets],
  );
  const targetsRef = useRef(targets);
  const playbackTimeline = useMemo(() => buildPlaybackTimeline(score), [score]);
  const fingeringHints = useMemo(
    () => (showFingeringHints ? buildFingeringHints(score) : []),
    [score, showFingeringHints],
  );
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
  const isPedalScoringEnabled = mode === 'rhythm' && pedalMode === 'score';
  const scoredPedalTargets = useMemo(
    () => (isPedalScoringEnabled ? pedalTargets : []),
    [isPedalScoringEnabled, pedalTargets],
  );
  const scoredPedalResults = useMemo(
    () => (isPedalScoringEnabled ? pedalResults : new Map()),
    [isPedalScoringEnabled, pedalResults],
  );
  const currentTarget = targets[currentTargetIndex] ?? null;
  const nextTarget = targets[currentTargetIndex + 1] ?? null;
  const targetById = useMemo(
    () => new Map(targets.map((target) => [target.id, target])),
    [targets],
  );
  const resultSummary = useMemo(() => getPracticeResultSummary(results), [results]);
  const accuracyPercent = useMemo(
    () => getPracticeAccuracyPercent(results, targets.length),
    [results, targets.length],
  );
  const pedalSummary = useMemo(
    () => getPedalSummary(scoredPedalResults),
    [scoredPedalResults],
  );
  const holdResults = useMemo(
    () =>
      mode === 'rhythm'
        ? evaluatePracticeHolds(targets, noteLifecycles, {
            evaluationEndSeconds: Math.max(
              practiceDurationSeconds,
              elapsedSeconds,
            ),
          })
        : new Map(),
    [elapsedSeconds, mode, noteLifecycles, practiceDurationSeconds, targets],
  );
  const reviewSummary = useMemo(
    () =>
      buildPracticeReviewSummary({
        holdResults: mode === 'rhythm' ? holdResults : undefined,
        pedalResults: scoredPedalResults,
        pedalTargets: scoredPedalTargets,
        results,
        targets,
        getTimingToleranceMs: (target) =>
          getPracticeTimingToleranceMs(timingLevel, target, targets),
        timingToleranceMs: PRACTICE_TIMING_TOLERANCE_MS[timingLevel],
      }),
    [
      holdResults,
      mode,
      results,
      scoredPedalResults,
      scoredPedalTargets,
      targets,
      timingLevel,
    ],
  );
  const reviewScorePercent = useMemo(
    () => getPracticeScorePercent(reviewSummary),
    [reviewSummary],
  );
  const expressionLabels = useMemo(
    () => getPracticeTargetExpressionLabels(score, currentTarget),
    [currentTarget, score],
  );
  const expressionCapabilities = useMemo(
    () => getPracticeExpressionCapabilitySummary(score),
    [score],
  );
  const expressionFeedback = useMemo(
    () =>
      isExpressionFeedbackEnabled
        ? buildPracticeExpressionFeedback({
            lifecycles: noteLifecycles,
            score,
            targets,
          })
        : [],
    [isExpressionFeedbackEnabled, noteLifecycles, score, targets],
  );
  const currentExpressionFeedback = useMemo(
    () =>
      currentTarget
        ? expressionFeedback.filter(
            (feedback) => feedback.targetId === currentTarget.id,
          )
        : [],
    [currentTarget, expressionFeedback],
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
    (mode === 'rhythm' && isPracticing) || isGuidePlaying || isGuidePaused
      ? getPlaybackScoreBeatAtSeconds(
          playbackTimeline,
          score.tempo,
          Math.max(0, elapsedSeconds) + practiceStartSeconds,
        )
      : null;
  const practicePlaybackBeat =
    rhythmPlaybackBeat ?? currentTarget?.startBeat ?? null;

  const getCalibratedElapsedSeconds = useCallback(
    (rawElapsedSeconds: number) =>
      rawElapsedSeconds - latencyOffsetMsRef.current / 1000,
    [],
  );

  const updateSessionStatus = useCallback((nextStatus: PracticeSessionStatus) => {
    setSessionStatus((currentStatus) => {
      if (!canTransitionPracticeSession(currentStatus, nextStatus)) {
        sessionStatusRef.current = nextStatus;
        return nextStatus;
      }

      sessionStatusRef.current = nextStatus;
      return nextStatus;
    });
  }, []);

  function clearPendingMidiEvaluation() {
    if (pendingMidiEvaluationTimerRef.current !== null) {
      window.clearTimeout(pendingMidiEvaluationTimerRef.current);
      pendingMidiEvaluationTimerRef.current = null;
    }

    pendingMidiNoteOnsRef.current = [];
    pendingRhythmElapsedSecondsRef.current = null;
  }

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

  const setRecordedNoteLifecycles = useCallback(
    (nextLifecycles: PracticeNoteLifecycle[]) => {
      noteLifecyclesRef.current = nextLifecycles;
      setNoteLifecycles(nextLifecycles);
    },
    [],
  );

  const clearNoteLifecycles = useCallback(() => {
    setRecordedNoteLifecycles([]);
  }, [setRecordedNoteLifecycles]);

  const recordMidiNoteOnLifecycle = useCallback(
    (midiNote: number, startSeconds: number, velocity?: number) => {
      setRecordedNoteLifecycles([
        ...noteLifecyclesRef.current,
        { midiNote, startSeconds, velocity },
      ]);
    },
    [setRecordedNoteLifecycles],
  );

  const closeMidiNoteLifecycle = useCallback(
    (midiNote: number, endSeconds: number) => {
      let closed = false;
      const nextLifecycles = [...noteLifecyclesRef.current]
        .reverse()
        .map((lifecycle) => {
          if (
            closed ||
            lifecycle.midiNote !== midiNote ||
            lifecycle.endSeconds !== undefined
          ) {
            return lifecycle;
          }

          closed = true;
          return { ...lifecycle, endSeconds };
        })
        .reverse();

      if (closed) {
        setRecordedNoteLifecycles(nextLifecycles);
      }
    },
    [setRecordedNoteLifecycles],
  );

  const closeReleasedSustainedLifecycles = useCallback(
    (endSeconds: number) => {
      const physicallyHeldNotes = new Set(activeMidiNotesRef.current);
      let changed = false;
      const nextLifecycles = noteLifecyclesRef.current.map((lifecycle) => {
        if (
          lifecycle.endSeconds !== undefined ||
          physicallyHeldNotes.has(lifecycle.midiNote)
        ) {
          return lifecycle;
        }

        changed = true;
        return { ...lifecycle, endSeconds };
      });

      if (changed) {
        setRecordedNoteLifecycles(nextLifecycles);
      }
    },
    [setRecordedNoteLifecycles],
  );

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
    isGuidePausedRef.current = false;
    setIsGuidePaused(false);
    setGuidePausedOffsetSeconds(0);

    if (resetClock) {
      elapsedSecondsRef.current = 0;
      setElapsedSeconds(0);
    }
  }, []);

  const startGuidePlayback = useCallback(
    async ({
      forPractice,
      skipCountIn = false,
      startOffsetSeconds = 0,
    }: {
      forPractice: boolean;
      skipCountIn?: boolean;
      startOffsetSeconds?: number;
    }) => {
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

      const safeStartOffsetSeconds = Math.max(0, startOffsetSeconds);
      const delaySeconds = isMetronomeEnabled && !skipCountIn
        ? countInBeats * secondsPerBeat
        : 0;
      const runId = guideRunIdRef.current + 1;

      guideRunIdRef.current = runId;
      hasGuideLeftCountInRef.current = delaySeconds <= 0;
      elapsedSecondsRef.current = safeStartOffsetSeconds - delaySeconds;
      setElapsedSeconds(safeStartOffsetSeconds - delaySeconds);
      isGuidePausedRef.current = false;
      setIsGuidePaused(false);
      setGuidePausedOffsetSeconds(0);
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
            startSeconds: practiceStartSeconds + safeStartOffsetSeconds,
          })
        : createPerformanceClockController(delaySeconds, safeStartOffsetSeconds);

      if (guideRunIdRef.current !== runId) {
        controller.stop();
        return false;
      }

      guideControllerRef.current = controller;
      setPracticeMessage(
        delaySeconds > 0
          ? `Count-in ${countInBeats} beats`
          : forPractice
            ? getTargetLabel(
                targetsRef.current.find(
                  (target) => target.startSeconds >= safeStartOffsetSeconds,
                ) ?? targetsRef.current[0] ?? null,
              )
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

  const pauseGuidePlayback = useCallback(() => {
    if (!isGuidePlayingRef.current || isPracticingRef.current) {
      return;
    }

    guideRunIdRef.current += 1;
    const rawElapsedSeconds =
      guideControllerRef.current?.getElapsedSeconds?.() ??
      elapsedSecondsRef.current;
    const pausedAtSeconds = clampNumber(
      Math.max(0, rawElapsedSeconds),
      0,
      Math.max(0, practiceDurationSeconds),
    );

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

    elapsedSecondsRef.current = pausedAtSeconds;
    setElapsedSeconds(pausedAtSeconds);
    setGuidePausedOffsetSeconds(pausedAtSeconds);
    isGuidePausedRef.current = true;
    setIsGuidePaused(true);
    isGuidePlayingRef.current = false;
    setIsGuidePlaying(false);
    setPracticeMessage('Reference paused');
  }, [practiceDurationSeconds]);

  const resetPracticeRound = useCallback(
    (message: string, nextStatus: PracticeSessionStatus = 'running') => {
      clearPendingMidiEvaluation();
      clearResults();
      clearPedalResults();
      clearNoteLifecycles();
      sustainPedalDownRef.current = false;
      elapsedSecondsRef.current = 0;
      currentTargetIndexRef.current = targetsRef.current.length > 0 ? 0 : -1;
      rhythmStartedAtRef.current = performance.now();
      setElapsedSeconds(0);
      setCurrentTargetIndex(targetsRef.current.length > 0 ? 0 : -1);
      setIsReviewOpen(false);
      updateSessionStatus(nextStatus);
      setPracticeMessage(message);
    },
    [clearNoteLifecycles, clearPedalResults, clearResults, updateSessionStatus],
  );

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
      updateSessionStatus('review');
      setPracticeMessage(message);
      return false;
    },
    [resetPracticeRound, stopGuidePlayback, updateSessionStatus],
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

  const flushBufferedMidiNoteEvaluation = useCallback(() => {
    const playedNotes = mergeBufferedMidiNotes(
      activeMidiNotesRef.current,
      pendingMidiNoteOnsRef.current,
    );
    const bufferedRhythmElapsedSeconds =
      pendingRhythmElapsedSecondsRef.current;

    pendingMidiEvaluationTimerRef.current = null;
    pendingMidiNoteOnsRef.current = [];
    pendingRhythmElapsedSecondsRef.current = null;

    if (modeRef.current === 'wait') {
      const target = targetsRef.current[currentTargetIndexRef.current];

      if (!target) {
        return;
      }

      const result = evaluatePracticeTarget(target, playedNotes);

      upsertResult(result);

      if (result.status === 'correct') {
        advanceWaitTarget(target);
      } else {
        setPracticeMessage(getPracticeResultMessage(result));
      }

      return;
    }

    if (modeRef.current !== 'rhythm') {
      return;
    }

    const scoringElapsedSeconds =
      bufferedRhythmElapsedSeconds ??
      getCalibratedElapsedSeconds(elapsedSecondsRef.current);
    const rhythmMatch = findSequentialPracticeTarget({
      currentTargetIndex: currentTargetIndexRef.current,
      elapsedSeconds: scoringElapsedSeconds,
      resolvedTargetIds: getCorrectTargetIds(resultsRef.current),
      targets: targetsRef.current,
      timingLevel: timingLevelRef.current,
    });
    const rhythmTarget = rhythmMatch.target;

    if (!rhythmTarget) {
      setPracticeMessage('Off target chord');
      return;
    }

    const result = evaluatePracticeTarget(
      rhythmTarget,
      playedNotes,
      {
        elapsedSeconds: scoringElapsedSeconds,
        timingToleranceMs: getPracticeTimingToleranceMs(
          timingLevelRef.current,
          rhythmTarget,
          targetsRef.current,
        ),
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
  }, [advanceWaitTarget, getCalibratedElapsedSeconds, upsertResult]);

  const scheduleBufferedMidiNoteEvaluation = useCallback(
    (midiNote: number, scoringElapsedSeconds: number | null) => {
      pendingMidiNoteOnsRef.current = mergeBufferedMidiNotes(
        pendingMidiNoteOnsRef.current,
        [midiNote],
      );

      if (
        scoringElapsedSeconds !== null &&
        pendingRhythmElapsedSecondsRef.current === null
      ) {
        pendingRhythmElapsedSecondsRef.current = scoringElapsedSeconds;
      }

      if (pendingMidiEvaluationTimerRef.current !== null) {
        window.clearTimeout(pendingMidiEvaluationTimerRef.current);
      }

      pendingMidiEvaluationTimerRef.current = window.setTimeout(
        flushBufferedMidiNoteEvaluation,
        getMidiChordSettleMs(timingLevelRef.current),
      );
    },
    [flushBufferedMidiNoteEvaluation],
  );

  const handleMidiEvent = useCallback(
    (event: ParsedMidiEvent) => {
      const scoringElapsedSeconds = getCalibratedElapsedSeconds(
        elapsedSecondsRef.current,
      );

      if (event.type === 'note-on') {
        activeMidiNotesRef.current = [
          ...new Set([...activeMidiNotesRef.current, event.midiNote]),
        ].sort((a, b) => a - b);

        if (
          modeRef.current === 'rhythm' &&
          isPracticingRef.current &&
          scoringElapsedSeconds >= 0
        ) {
          recordMidiNoteOnLifecycle(
            event.midiNote,
            scoringElapsedSeconds,
            event.velocity,
          );
        }
      } else if (event.type === 'note-off') {
        activeMidiNotesRef.current = activeMidiNotesRef.current.filter(
          (midiNote) => midiNote !== event.midiNote,
        );

        if (
          modeRef.current === 'rhythm' &&
          isPracticingRef.current &&
          scoringElapsedSeconds >= 0 &&
          !sustainPedalDownRef.current
        ) {
          closeMidiNoteLifecycle(event.midiNote, scoringElapsedSeconds);
        }
      }

      if (isSustainPedalEvent(event)) {
        const isPedalDown = event.value >= 64;

        if (
          modeRef.current === 'rhythm' &&
          isPracticingRef.current &&
          scoringElapsedSeconds >= 0 &&
          !isPedalDown
        ) {
          closeReleasedSustainedLifecycles(scoringElapsedSeconds);
        }

        sustainPedalDownRef.current = isPedalDown;

        if (
          modeRef.current === 'rhythm' &&
          isPracticingRef.current &&
          scoringElapsedSeconds >= 0 &&
          pedalModeRef.current === 'score'
        ) {
          const action = isPedalDown ? 'down' : 'up';
          const target = findNearestPedalTarget(pedalTargetsRef.current, {
            action,
            elapsedSeconds: scoringElapsedSeconds,
            resolvedTargetIds: new Set(pedalResultsRef.current.keys()),
          });

          if (target) {
            const result = evaluatePedalTarget(
              target,
              scoringElapsedSeconds,
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

      if (modeRef.current !== 'wait' && modeRef.current !== 'rhythm') {
        return;
      }

      scheduleBufferedMidiNoteEvaluation(
        event.midiNote,
        modeRef.current === 'rhythm'
          ? getCalibratedElapsedSeconds(elapsedSecondsRef.current)
          : null,
      );
    },
    [
      closeMidiNoteLifecycle,
      closeReleasedSustainedLifecycles,
      getCalibratedElapsedSeconds,
      recordMidiNoteOnLifecycle,
      scheduleBufferedMidiNoteEvaluation,
      upsertPedalResult,
    ],
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
      (isGuidePlaying || isGuidePaused) && elapsedSeconds >= 0
        ? getActiveTimelineEvents(
            playbackTimeline,
            practiceStartSeconds + elapsedSeconds,
          )
        : [],
    [
      elapsedSeconds,
      isGuidePaused,
      isGuidePlaying,
      playbackTimeline,
      practiceStartSeconds,
    ],
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
      : (isGuidePlaying || isGuidePaused) && !isPracticing
        ? activeGuideEventIds
        : activePracticeEventIds;
  const rangeEventIds = useMemo(
    () =>
      directRange
        ? rawTargets.flatMap((target) => target.eventIds)
        : rangeAnchorEventId
          ? [rangeAnchorEventId]
          : [],
    [directRange, rangeAnchorEventId, rawTargets],
  );
  const visibleActiveEventIds = useMemo(
    () => [...new Set([...activeEventIds, ...rangeEventIds])],
    [activeEventIds, rangeEventIds],
  );

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
    isGuidePausedRef.current = isGuidePaused;
  }, [isGuidePaused]);

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
    latencyOffsetMsRef.current = latencyOffsetMs;
  }, [latencyOffsetMs]);

  useEffect(() => {
    pedalModeRef.current = pedalMode;
  }, [pedalMode]);

  useEffect(() => {
    timingLevelRef.current = timingLevel;
  }, [timingLevel]);

  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  useEffect(() => {
    if (!cloudUserId) {
      setPracticeTopScores([]);
      setPracticeTopScoreStatus('Sign in to save scores');
      return;
    }

    let active = true;

    setPracticeTopScoreStatus('Loading top scores...');
    listTopPracticeScores(score.id, cloudUserId)
      .then((topScores) => {
        if (!active) {
          return;
        }

        setPracticeTopScores(topScores);
        setPracticeTopScoreStatus(
          topScores.length > 0 ? 'Top 5 loaded' : 'No saved attempts yet',
        );
      })
      .catch(() => {
        if (active) {
          setPracticeTopScores([]);
          setPracticeTopScoreStatus('Top scores unavailable');
        }
      });

    return () => {
      active = false;
    };
  }, [cloudUserId, score.id]);

  useEffect(() => {
    if (
      !cloudUserId ||
      !isReviewOpen ||
      completedAttempts <= 0 ||
      reviewSummary.totalTargets === 0
    ) {
      return;
    }

    const attemptKey = [
      score.id,
      completedAttempts,
      mode,
      handMode,
      measureStart,
      measureEnd,
      reviewScorePercent,
      reviewSummary.resolvedTargets,
    ].join(':');

    if (savedPracticeAttemptKeyRef.current === attemptKey) {
      return;
    }

    savedPracticeAttemptKeyRef.current = attemptKey;
    setPracticeTopScoreStatus('Saving score...');
    savePracticeAttempt({
      durationSeconds: Math.max(0, elapsedSeconds),
      handMode,
      measureEnd: normalizedMeasureEnd + 1,
      measureStart: normalizedMeasureStart + 1,
      mode,
      score,
      summary: reviewSummary,
      userId: cloudUserId,
    })
      .then((topScores) => {
        setPracticeTopScores(topScores);
        setPracticeTopScoreStatus('Score saved');
      })
      .catch(() => {
        setPracticeTopScoreStatus('Score save failed');
      });
  }, [
    cloudUserId,
    completedAttempts,
    elapsedSeconds,
    handMode,
    isReviewOpen,
    measureEnd,
    measureStart,
    mode,
    normalizedMeasureEnd,
    normalizedMeasureStart,
    reviewScorePercent,
    reviewSummary,
    score,
  ]);

  useEffect(() => {
    pedalTargetsRef.current = pedalTargets;
  }, [pedalTargets]);

  useEffect(() => {
    targetsRef.current = targets;
    resultsRef.current = new Map();
    pedalResultsRef.current = new Map();
    noteLifecyclesRef.current = [];
    sustainPedalDownRef.current = false;
    setResults(new Map());
    setPedalResults(new Map());
    setNoteLifecycles([]);
    setCurrentTargetIndex(targets.length > 0 ? 0 : -1);
    currentTargetIndexRef.current = targets.length > 0 ? 0 : -1;
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    setIsPracticing(false);
    stopGuidePlayback(true);
    isPracticingRef.current = false;
    updateSessionStatus('idle');
    setPracticeMessage(targets.length > 0 ? getTargetLabel(targets[0]) : 'No playable notes');
  }, [stopGuidePlayback, targets, updateSessionStatus]);

  useEffect(() => {
    setMeasureStart((current) => clampNumber(current, 1, measureCount));
    setMeasureEnd((current) => clampNumber(current, 1, measureCount));
  }, [measureCount]);

  useEffect(
    () => () => {
      clearPendingMidiEvaluation();
      stopGuidePlayback(false);
    },
    [stopGuidePlayback],
  );

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
      const scoringElapsedSeconds =
        getCalibratedElapsedSeconds(nextElapsedSeconds);
      const currentRhythmTarget = findPracticeTargetInDynamicWindow(
        targetsSnapshot,
        scoringElapsedSeconds,
        timingLevelRef.current,
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

      if (!hasGuideLeftCountInRef.current) {
        hasGuideLeftCountInRef.current = true;
        updateSessionStatus(isPracticingRef.current ? 'running' : 'idle');
        setPracticeMessage(
          isPracticingRef.current
            ? getTargetLabel(targetsSnapshot[currentTargetIndexRef.current] ?? null)
            : 'Reference playing',
        );
      }

      if (isPracticingRef.current && modeRef.current === 'rhythm') {
        markMissedTargets(scoringElapsedSeconds);
        markMissedPedalTargets(scoringElapsedSeconds);
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
    getCalibratedElapsedSeconds,
    isGuidePlaying,
    isPracticing,
    mode,
    practiceDurationSeconds,
    startGuidePlayback,
    stopGuidePlayback,
    updateSessionStatus,
  ]);

  function handleModeChange(nextMode: PracticeMode) {
    clearNoteLifecycles();
    stopGuidePlayback(false);
    setMode(nextMode);
    setIsPracticing(false);
    isPracticingRef.current = false;
    setIsGuidePlaying(false);
    isGuidePlayingRef.current = false;
    setIsGuidePaused(false);
    isGuidePausedRef.current = false;
    updateSessionStatus('idle');
    setPracticeMessage(nextMode === 'listen' ? 'Listening' : getTargetLabel(currentTarget));
  }

  async function handleReferenceToggle() {
    if (isGuidePlaying && !isPracticing) {
      pauseGuidePlayback();
      updateSessionStatus('idle');
      return;
    }

    if (isGuidePaused && !isPracticing) {
      await warmUpPlaybackAudio();
      void startGuidePlayback({
        forPractice: false,
        skipCountIn: true,
        startOffsetSeconds: guidePausedOffsetSeconds,
      });
      return;
    }

    await warmUpPlaybackAudio();
    void startGuidePlayback({ forPractice: false });
  }

  function handleReferenceStop() {
    if (isGuidePlaying || isGuidePaused) {
      stopGuidePlayback(true);
      updateSessionStatus('idle');
      setPracticeMessage('Reference stopped');
    }
  }

  async function handlePracticeToggle() {
    if (isPracticing) {
      clearPendingMidiEvaluation();
      stopGuidePlayback(false);
      isPracticingRef.current = false;
      setIsPracticing(false);
      updateSessionStatus('paused');
      setPracticeMessage('Paused');
      return;
    }

    if (targets.length === 0) {
      setPracticeMessage('No playable notes in this range');
      return;
    }

    resetPracticeRound(
      getTargetLabel(targets[0] ?? null),
      mode === 'rhythm' && isMetronomeEnabled && countInBeats > 0
        ? 'countin'
        : 'running',
    );
    await warmUpPlaybackAudio();
    isPracticingRef.current = true;
    rhythmStartedAtRef.current = performance.now();
    setIsPracticing(true);

    if (mode === 'rhythm') {
      const started = await startGuidePlayback({ forPractice: true });

      if (!started) {
        isPracticingRef.current = false;
        setIsPracticing(false);
        updateSessionStatus('idle');
      }
    }
  }

  function handleMeasureStartChange(value: string) {
    const nextMeasureStart = parseMeasureInput(value, measureStart, measureCount);

    setMeasureStart(nextMeasureStart);
    setMeasureEnd((current) => Math.max(current, nextMeasureStart));
    setRangeAnchorEventId(null);
    setDirectRange(null);
  }

  function handleMeasureEndChange(value: string) {
    const nextMeasureEnd = parseMeasureInput(value, measureEnd, measureCount);

    setMeasureEnd(nextMeasureEnd);
    setMeasureStart((current) => Math.min(current, nextMeasureEnd));
    setRangeAnchorEventId(null);
    setDirectRange(null);
  }

  function handleLatencyOffsetChange(value: string) {
    const nextOffset = Number(value);

    if (!Number.isFinite(nextOffset)) {
      setLatencyOffsetMs(0);
      return;
    }

    setLatencyOffsetMs(clampNumber(Math.round(nextOffset), -250, 250));
  }

  const handleRangeEventPick = useCallback(
    (eventId: string) => {
      const pickedTarget = getTargetByEventId(rangeSelectableTargets, eventId);

      if (!pickedTarget) {
        setPracticeMessage('Range target unavailable');
        return;
      }

      if (!rangeAnchorEventId) {
        setDirectRange(null);
        setRangeAnchorEventId(eventId);
        setPracticeMessage(`Range start M${pickedTarget.measureIndex + 1}`);
        return;
      }

      const anchorTarget = getTargetByEventId(
        rangeSelectableTargets,
        rangeAnchorEventId,
      );

      if (!anchorTarget) {
        setRangeAnchorEventId(eventId);
        setPracticeMessage(`Range start M${pickedTarget.measureIndex + 1}`);
        return;
      }

      const measureStartIndex = Math.min(
        anchorTarget.measureIndex,
        pickedTarget.measureIndex,
      );
      const measureEndIndex = Math.max(
        anchorTarget.measureIndex,
        pickedTarget.measureIndex,
      );

      clearPendingMidiEvaluation();
      stopGuidePlayback(true);
      isPracticingRef.current = false;
      setIsPracticing(false);
      setMeasureStart(measureStartIndex + 1);
      setMeasureEnd(measureEndIndex + 1);
      setIsLooping(true);
      setDirectRange({
        startEventId: rangeAnchorEventId,
        endEventId: eventId,
      });
      setRangeAnchorEventId(null);
      setIsReviewOpen(false);
      updateSessionStatus('idle');
      setPracticeMessage(
        `Range M${measureStartIndex + 1}-M${measureEndIndex + 1} selected`,
      );
    },
    [
      rangeAnchorEventId,
      rangeSelectableTargets,
      stopGuidePlayback,
      updateSessionStatus,
    ],
  );

  function handleRetryMeasure(measureIndex: number) {
    const measureNumber = clampNumber(measureIndex + 1, 1, measureCount);

    clearPendingMidiEvaluation();
    clearNoteLifecycles();
    stopGuidePlayback(true);
    setMeasureStart(measureNumber);
    setMeasureEnd(measureNumber);
    setIsPracticing(false);
    isPracticingRef.current = false;
    setIsReviewOpen(false);
    setRangeAnchorEventId(null);
    setDirectRange(null);
    updateSessionStatus('idle');
    setPracticeMessage(`Retry M${measureNumber}`);
  }

  const restartCurrentMeasure = useCallback(() => {
    const activeTarget =
      targetsRef.current[currentTargetIndexRef.current] ?? targetsRef.current[0];
    const measureIndex = activeTarget?.measureIndex ?? normalizedMeasureStart;
    const firstTargetIndex = targetsRef.current.findIndex(
      (target) => target.measureIndex === measureIndex,
    );

    if (firstTargetIndex < 0) {
      setPracticeMessage('No playable notes in this measure');
      return;
    }

    const restartTarget = targetsRef.current[firstTargetIndex];
    const measureTargetIds = new Set(
      targetsRef.current
        .filter((target) => target.measureIndex === measureIndex)
        .map((target) => target.id),
    );
    const measurePedalTargetIds = new Set(
      pedalTargetsRef.current
        .filter((target) => target.measureIndex === measureIndex)
        .map((target) => target.id),
    );
    const nextResults = new Map(
      [...resultsRef.current].filter(([targetId]) => !measureTargetIds.has(targetId)),
    );
    const nextPedalResults = new Map(
      [...pedalResultsRef.current].filter(
        ([targetId]) => !measurePedalTargetIds.has(targetId),
      ),
    );

    clearPendingMidiEvaluation();
    resultsRef.current = nextResults;
    pedalResultsRef.current = nextPedalResults;
    setResults(nextResults);
    setPedalResults(nextPedalResults);
    currentTargetIndexRef.current = firstTargetIndex;
    elapsedSecondsRef.current = restartTarget.startSeconds;
    rhythmStartedAtRef.current =
      performance.now() - restartTarget.startSeconds * 1000;
    setCurrentTargetIndex(firstTargetIndex);
    setElapsedSeconds(restartTarget.startSeconds);
    setIsReviewOpen(false);

    if (modeRef.current === 'rhythm' && isPracticingRef.current) {
      stopGuidePlayback(false);
      updateSessionStatus('running');
      void startGuidePlayback({
        forPractice: true,
        skipCountIn: true,
        startOffsetSeconds: restartTarget.startSeconds,
      });
    } else if (isPracticingRef.current) {
      updateSessionStatus('running');
    } else {
      updateSessionStatus('idle');
    }

    setPracticeMessage(`Restart M${measureIndex + 1}`);
  }, [
    normalizedMeasureStart,
    startGuidePlayback,
    stopGuidePlayback,
    updateSessionStatus,
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();

      if (
        event.key.toLowerCase() !== 'r' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        tagName === 'input' ||
        tagName === 'select' ||
        tagName === 'textarea'
      ) {
        return;
      }

      event.preventDefault();
      restartCurrentMeasure();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [restartCurrentMeasure]);

  const midiStatusLabel = getMidiConnectionStatusLabel(status);
  const activeNotesLabel =
    activeMidiNotes.length > 0 ? formatMidiNoteList(activeMidiNotes) : 'None';
  const selectedInput = inputs.find((input) => input.id === selectedInputId) ?? null;
  const midiReadinessLabel = getMidiPracticeReadinessLabel({
    selectedInput,
    status,
    targetCount: targets.length,
  });
  const targetStaffLabel = formatPracticeTargetVoiceLabel(currentTarget);
  const nextTargetLabel = getTargetLabel(nextTarget);
  const nextTargetDeltaLabel = getTargetDeltaLabel(currentTarget, nextTarget);
  const midiChordWindowLabel = getMidiChordWindowLabel(
    getMidiChordSettleMs(timingLevel),
  );
  const lastMidiEvent = recentEvents[0] ?? null;
  const progressLabel = `${resultSummary.correct}/${targets.length}`;
  const guideMeasureIndex = activeGuideEvents[0]?.measureIndex ?? null;
  const currentMeasureIndex = currentTarget?.measureIndex ?? guideMeasureIndex;
  const isReferenceTransportActive =
    (isGuidePlaying || isGuidePaused) && !isPracticing;
  const referenceButtonLabel = isGuidePlaying
    ? 'Pause Ref'
    : isGuidePaused
      ? 'Resume Ref'
      : 'Reference';
  const weakestMeasureReview = reviewSummary.measureSummaries.reduce<
    (typeof reviewSummary.measureSummaries)[number] | null
  >((weakestReview, review) => {
    if (!weakestReview) {
      return review;
    }

    return getMeasureIssueCount(review) > getMeasureIssueCount(weakestReview)
      ? review
      : weakestReview;
  }, null);
  const coachHeadline = isReviewOpen
    ? weakestMeasureReview
      ? `Retry M${weakestMeasureReview.measureIndex + 1}`
      : 'Clean pass'
    : targets.length === 0
      ? 'No playable notes'
      : getCoachModeCue(mode);
  const coachDetail = isReviewOpen
    ? weakestMeasureReview
      ? weakestMeasureReview.labels[0] ?? 'Focus this measure first'
      : 'No issues found in this pass'
    : getTargetLabel(currentTarget);
  const practiceContextLabel = `M${normalizedMeasureStart + 1}-${
    normalizedMeasureEnd + 1
  } ${handMode} ${timingLevel} pedal ${getPedalModeLabel(
    pedalMode,
  )} ornaments ${getOrnamentModeLabel(ornamentMode)}`;

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
            className={`tool-button${isReferenceTransportActive ? ' is-active' : ''}`}
            data-testid="practice-reference"
            disabled={isPracticing}
            onClick={() => void handleReferenceToggle()}
          >
            {referenceButtonLabel}
          </button>
          <button
            type="button"
            className="tool-button"
            data-testid="practice-reference-stop"
            disabled={!isReferenceTransportActive}
            onClick={handleReferenceStop}
          >
            Stop Ref
          </button>
        </div>
      </header>

      <section className="practice-layout">
        <aside className="practice-panel" aria-label="Practice controls">
          <div className="practice-status" data-testid="practice-summary">
            <span>{midiStatusLabel}</span>
            <strong>{practiceMessage}</strong>
          </div>

          <section className="practice-coach-card" data-testid="practice-coach">
            <span>Coach</span>
            <strong>{coachHeadline}</strong>
            <small>{coachDetail}</small>
            <small>{practiceContextLabel}</small>
            {isReviewOpen && weakestMeasureReview ? (
              <button
                type="button"
                className="practice-review-retry"
                data-testid="practice-retry-weakest"
                onClick={() => handleRetryMeasure(weakestMeasureReview.measureIndex)}
              >
                Retry M{weakestMeasureReview.measureIndex + 1}
              </button>
            ) : null}
          </section>

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
              <span>Session</span>
              <strong>{getPracticeSessionStatusLabel(sessionStatus)}</strong>
            </div>
            <div>
              <span>Pedal</span>
              <strong>
                {isPedalScoringEnabled
                  ? `${pedalSummary.correct}/${scoredPedalTargets.length}`
                  : getPedalModeLabel(pedalMode)}
              </strong>
            </div>
          </div>

          <section className="practice-top-scores" aria-label="Practice top scores">
            <div className="practice-top-scores-header">
              <span>Top 5</span>
              <strong>{practiceTopScoreStatus}</strong>
            </div>
            <small className="practice-context-note">{practiceContextLabel}</small>
            <ol>
              {practiceTopScores.length > 0 ? (
                practiceTopScores.map((attempt, index) => (
                  <li key={attempt.id}>
                    <span>{index + 1}</span>
                    <strong>{attempt.scorePercent}%</strong>
                    <small>
                      {attempt.mode} {attempt.handMode} M
                      {attempt.rangeStartMeasure}-{attempt.rangeEndMeasure}{' '}
                      {formatTopScoreDate(attempt.finishedAt)}
                    </small>
                  </li>
                ))
              ) : (
                <li>
                  <span>-</span>
                  <strong>--</strong>
                  <small>{practiceTopScoreStatus}</small>
                </li>
              )}
            </ol>
          </section>

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
                    onClick={() => {
                      setHandMode(nextHandMode);
                      setRangeAnchorEventId(null);
                      setDirectRange(null);
                    }}
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
                data-testid="practice-fingering-hints-toggle"
                checked={showFingeringHints}
                onChange={(event) => setShowFingeringHints(event.target.checked)}
              />
              Fingering hints
            </label>
            <label className="practice-check-row">
              <input
                type="checkbox"
                data-testid="practice-measure-numbers-toggle"
                checked={showMeasureNumbers}
                onChange={(event) =>
                  onMeasureNumbersToggle?.(event.target.checked)
                }
              />
              Bar numbers
            </label>
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
            <label className="practice-check-row">
              <input
                type="checkbox"
                data-testid="practice-expression-feedback-toggle"
                checked={isExpressionFeedbackEnabled}
                onChange={(event) =>
                  setIsExpressionFeedbackEnabled(event.target.checked)
                }
              />
              Expression feedback
            </label>
            <label className="practice-field">
              Pedal mode
              <select
                data-testid="practice-pedal-mode"
                value={pedalMode}
                onChange={(event) =>
                  setPedalMode(event.target.value as PedalPracticeMode)
                }
              >
                <option value="guide">Guide</option>
                <option value="score">Score</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label className="practice-field">
              Ornaments
              <select
                data-testid="practice-ornament-mode"
                value={ornamentMode}
                onChange={(event) =>
                  setOrnamentMode(event.target.value as PracticeOrnamentMode)
                }
              >
                <option value="guide">Guide</option>
                <option value="strict">Strict</option>
                <option value="ignore">Ignore</option>
              </select>
            </label>
          </div>

          <details className="practice-disclosure" data-testid="practice-advanced">
            <summary>Advanced</summary>

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
              <option value="beginner">Beginner +/-280ms</option>
              <option value="normal">Normal +/-180ms</option>
              <option value="strict">Strict +/-90ms</option>
            </select>
          </label>

          <label className="practice-field">
            MIDI latency
            <input
              type="number"
              data-testid="practice-latency-offset"
              min={-250}
              max={250}
              step={5}
              value={latencyOffsetMs}
              onChange={(event) => handleLatencyOffsetChange(event.target.value)}
            />
          </label>

          </details>

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

          <div className="practice-inline-actions">
            <button
              type="button"
              className="tool-button"
              data-testid="practice-restart-measure"
              onClick={restartCurrentMeasure}
            >
              Restart M
            </button>
            <span>
              {rangeAnchorEventId
                ? 'Ctrl/Cmd-click an end note'
                : directRange
                  ? 'Direct range active'
                  : 'Ctrl/Cmd-click notes to set range'}
            </span>
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
            <small>Next {nextTargetLabel}</small>
            <small>Gap {nextTargetDeltaLabel}</small>
            {expressionLabels.length > 0 ? (
              <small>Expression {expressionLabels.join(' / ')}</small>
            ) : null}
            {currentExpressionFeedback.length > 0 ? (
              <small>
                Coach{' '}
                {currentExpressionFeedback
                  .slice(0, 2)
                  .map((feedback) => feedback.label)
                  .join(' / ')}
              </small>
            ) : null}
            <small>
              Active {activeNotesLabel}
              {sustainPedalDown ? ' + sustain' : ''}
            </small>
            {expressionCapabilities.length > 0 ? (
              <small>Score marks {expressionCapabilities.join(', ')}</small>
            ) : null}
          </div>

          <details className="practice-disclosure" data-testid="practice-midi-details">
            <summary>MIDI details</summary>

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

          <div
            className="practice-midi-debug"
            data-testid="practice-midi-debug"
            aria-label="MIDI debug"
          >
            <div>
              <span>Ready</span>
              <strong>{midiReadinessLabel}</strong>
            </div>
            <div>
              <span>Device</span>
              <strong>
                {selectedInput ? getMidiInputLabel(selectedInput) : 'None'}
              </strong>
            </div>
            <div>
              <span>Active</span>
              <strong>{activeNotesLabel}</strong>
            </div>
            <div>
              <span>Pedal</span>
              <strong>{sustainPedalDown ? 'Down' : 'Up'}</strong>
            </div>
            <div>
              <span>Latency</span>
              <strong>{latencyOffsetMs}ms</strong>
            </div>
            <div>
              <span>Chord</span>
              <strong>{midiChordWindowLabel}</strong>
            </div>
            <div>
              <span>Last</span>
              <strong>{lastMidiEvent ? getEventLabel(lastMidiEvent) : 'None'}</strong>
            </div>
            <div>
              <span>Raw</span>
              <strong>{lastMidiEvent?.rawData.join(' ') ?? '-'}</strong>
            </div>
          </div>

          </details>

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
              <dt>Hold issues</dt>
              <dd>{reviewSummary.holdIssueCount}</dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{Math.max(0, elapsedSeconds).toFixed(1)}s</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd>{latencyOffsetMs}ms</dd>
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
                  <span>Score</span>
                  <strong>{reviewScorePercent}%</strong>
                </div>
                <div>
                  <span>Notes</span>
                  <strong>{reviewSummary.noteAccuracyPercent}%</strong>
                </div>
                <div>
                  <span>Timing</span>
                  <strong>
                    {reviewSummary.timingScorePercent === null
                      ? 'n/a'
                      : `${reviewSummary.timingScorePercent}%`}
                  </strong>
                </div>
                <div>
                  <span>Hold</span>
                  <strong>
                    {reviewSummary.holdScorePercent === null
                      ? 'n/a'
                      : `${reviewSummary.holdScorePercent}%`}
                  </strong>
                </div>
                <div>
                  <span>Pedal</span>
                  <strong>
                    {reviewSummary.pedalScorePercent === null
                      ? 'n/a'
                      : `${reviewSummary.pedalScorePercent}%`}
                  </strong>
                </div>
                <div>
                  <span>Done</span>
                  <strong>
                    {reviewSummary.completionPercent}%
                  </strong>
                </div>
                <div>
                  <span>Median</span>
                  <strong>
                    {reviewSummary.medianTimingDeltaMs === null
                      ? 'n/a'
                      : `${reviewSummary.medianTimingDeltaMs}ms`}
                  </strong>
                </div>
                <div>
                  <span>Bias</span>
                  <strong>
                    {reviewSummary.meanTimingBiasMs === null
                      ? 'n/a'
                      : `${reviewSummary.meanTimingBiasMs}ms`}
                  </strong>
                </div>
                <div>
                  <span>Early</span>
                  <strong>{reviewSummary.earlyCount}</strong>
                </div>
                <div>
                  <span>Late</span>
                  <strong>{reviewSummary.lateCount}</strong>
                </div>
              </div>
              <ol className="practice-review-list">
                {reviewSummary.measureSummaries.length > 0 ? (
                  reviewSummary.measureSummaries.map((review) => (
                    <li key={review.measureIndex}>
                      <strong>M{review.measureIndex + 1}</strong>
                      <span>{review.labels.join(' / ')}</span>
                      <button
                        type="button"
                        className="practice-review-retry"
                        onClick={() => handleRetryMeasure(review.measureIndex)}
                      >
                        Retry
                      </button>
                    </li>
                  ))
                ) : (
                  <li>Clean pass</li>
                )}
              </ol>
              {isExpressionFeedbackEnabled && expressionFeedback.length > 0 ? (
                <ol
                  className="practice-review-list practice-expression-list"
                  aria-label="Expression feedback"
                >
                  {expressionFeedback.slice(0, 5).map((feedback, index) => (
                    <li key={`${feedback.targetId}-${feedback.kind}-${index}`}>
                      <strong>M{feedback.measureIndex + 1}</strong>
                      <span>{feedback.label}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ) : null}
        </aside>

        <PracticeSheet
          activeEventIds={visibleActiveEventIds}
          currentMeasureIndex={currentMeasureIndex}
          fingeringHints={fingeringHints}
          onRangeEventPick={handleRangeEventPick}
          playbackBeat={practicePlaybackBeat}
          practiceFeedbackByEventId={practiceFeedbackByEventId}
          rangeEventIds={rangeEventIds}
          score={score}
          showFingeringHints={showFingeringHints}
          showMeasureNumbers={showMeasureNumbers}
        />
      </section>
    </main>
  );
}
