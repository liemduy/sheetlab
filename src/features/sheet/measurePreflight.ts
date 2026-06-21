import type {
  AnnotationKind,
  Measure,
  Score,
  ScoreEvent,
} from '../../domain/score/types';
import { hasImportedSystemLayout } from '../../domain/score/importedLayout';
import { getEventDurationBeats } from '../../domain/score/eventDuration';
import {
  isGeneratedRestEvent,
} from '../../domain/score/events';
import { getKeySignatureAccidentalCount } from '../../domain/score/keySignatures';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import {
  FIRST_MEASURE_LEFT_PADDING,
  MEASURE_LEFT_PADDING,
  MEASURE_RIGHT_PADDING,
  MIN_FIRST_MEASURE_READABLE_WIDTH,
  MIN_MEASURE_READABLE_WIDTH,
  MIN_READABLE_EXTRA_SLOT_WIDTH,
} from './layoutConstants';
import {
  ANNOTATION_HORIZONTAL_GAP,
  ANNOTATION_METRICS,
  getEventAnnotationKinds,
  getEventAnnotationText,
} from './annotationLayoutPolicy';
import {
  getMeasureReadableInkWidthBonus,
  getMeasureReadableSlotWeight,
} from './measureDensity';
import {
  getEventCoreInkWidth,
  getEventInkProfile,
} from './eventInkMetrics';
import { getPedalMarkFromText, getPedalMarkMetrics } from './pedalMarks';

const KEY_SIGNATURE_SYMBOL_READABLE_WIDTH = 14;
const FIRST_SYSTEM_TIME_SIGNATURE_READABLE_WIDTH = 20;
const RHYTHM_SLOT_GAP = 6;
const RANGE_MARK_WIDTH_BONUS = 12;
const SECTION_MARKER_WIDTH_BONUS = 20;
const ANNOTATION_SPACING_PROTRUSION_RATIO = 0.25;
const IMPORTED_PREFLIGHT_WIDTH_SCALE = 0.66;
const IMPORTED_FIRST_MEASURE_MIN_WIDTH = 112;
const IMPORTED_MEASURE_MIN_WIDTH = 96;
const IMPORTED_INK_ACCIDENTAL_BONUS = 16;
const IMPORTED_INK_CHORD_PITCH_BONUS = 18;
const IMPORTED_INK_SHORT_EVENT_BONUS = 10;
const IMPORTED_INK_GRACE_NOTE_BONUS = 10;
const IMPORTED_INK_TUPLET_BONUS = 6;
const IMPORTED_INK_EXTRA_EVENT_BONUS = 8;
const IMPORTED_CHROMATIC_CHORD_FLOOR = 900;
const IMPORTED_CHROMATIC_RUN_FLOOR = 760;
const IMPORTED_DENSE_SHORT_FLOOR = 620;

export interface MeasurePreflightMetrics {
  annotationWidth: number;
  baseReadableMinWidth: number;
  estimatedInkWidth: number;
  eventCount: number;
  importedInkPressureBonus: number;
  importedInkPressureFloor: number;
  maxSlotWidth: number;
  minWidth: number;
  rhythmSlotCount: number;
  staffSymbolWidth: number;
}

interface ImportedInkPressureProfile {
  accidentalCount: number;
  chordExtraPitchCount: number;
  eventCount: number;
  graceNoteCount: number;
  shortEventCount: number;
  tupletCount: number;
}

const preflightCache = new WeakMap<Score, Map<string, MeasurePreflightMetrics>>();

function getMeasurePreflightCache(score: Score) {
  let cache = preflightCache.get(score);

  if (!cache) {
    cache = new Map<string, MeasurePreflightMetrics>();
    preflightCache.set(score, cache);
  }

  return cache;
}

function normalizeBeat(beat: number) {
  return Number(Math.max(0, beat).toFixed(4));
}

function getScoreMeasures(score: Score, measureIndex: number) {
  return score.parts
    .flatMap((part) => part.staves)
    .map((staff) => staff.measures.find((measure) => measure.index === measureIndex))
    .filter((measure): measure is Measure => Boolean(measure));
}

function getScoreMeasureEvents(score: Score, measureIndex: number) {
  return getScoreMeasures(score, measureIndex).flatMap((measure) =>
    measure.voices.flatMap((voice) => voice.events),
  );
}

function getMeasureStaffSymbolWidthBonus(
  score: Score,
  measureIndex: number,
  localMeasureIndex: number,
) {
  const maxKeySignatureSymbols = Math.max(
    0,
    ...getScoreMeasures(score, measureIndex).map((measure) =>
      Math.max(
        measure.keySignatureSymbols?.length ?? 0,
        measure.keySignature
          ? Math.abs(getKeySignatureAccidentalCount(measure.keySignature))
          : 0,
      ),
    ),
  );
  const keySignatureBonus =
    maxKeySignatureSymbols * KEY_SIGNATURE_SYMBOL_READABLE_WIDTH;
  const timeSignatureBonus =
    measureIndex === 0 && localMeasureIndex === 0
      ? FIRST_SYSTEM_TIME_SIGNATURE_READABLE_WIDTH
      : 0;

  return keySignatureBonus + timeSignatureBonus;
}

function getTextAnnotationWidth(kind: AnnotationKind, text: string) {
  const pedalMark = kind === 'pedal' ? getPedalMarkFromText(text) : null;

  if (pedalMark) {
    return getPedalMarkMetrics(pedalMark).width + ANNOTATION_HORIZONTAL_GAP * 2;
  }

  const metrics = ANNOTATION_METRICS[kind];

  return (
    Math.max(metrics.minWidth, text.length * metrics.charWidth) +
    ANNOTATION_HORIZONTAL_GAP * 2
  );
}

function getEventAnnotationWidth(event: ScoreEvent) {
  return getEventAnnotationKinds(event).reduce((maxWidth, kind) => {
    const text = getEventAnnotationText(event, kind);

    if (!text) {
      return maxWidth;
    }

    const offset = event.annotationOffsets?.[kind]?.x ?? 0;
    const width = getTextAnnotationWidth(kind, text) + Math.abs(offset);

    return Math.max(maxWidth, width);
  }, 0);
}

function getEventPreflightWidth(event: ScoreEvent) {
  const coreWidth = getEventCoreInkWidth(event);
  const annotationWidth = getEventAnnotationWidth(event);
  const annotationProtrusion = Math.max(0, annotationWidth - coreWidth);

  return coreWidth + annotationProtrusion * ANNOTATION_SPACING_PROTRUSION_RATIO;
}

function getMeasureSlotWidths(score: Score, measureIndex: number) {
  const slots = new Map<number, number>();

  getScoreMeasureEvents(score, measureIndex).forEach((event) => {
    if (isGeneratedRestEvent(event)) {
      return;
    }

    const beat = normalizeBeat(event.beat);
    const eventWidth = getEventPreflightWidth(event);

    slots.set(beat, Math.max(slots.get(beat) ?? 0, eventWidth));
  });

  return [...slots]
    .sort(([firstBeat], [secondBeat]) => firstBeat - secondBeat)
    .map(([, width]) => width);
}

function getMeasureAnnotationWidth(score: Score, measureIndex: number) {
  return getScoreMeasureEvents(score, measureIndex).reduce(
    (maxWidth, event) => Math.max(maxWidth, getEventAnnotationWidth(event)),
    0,
  );
}

function emptyImportedInkPressureProfile(): ImportedInkPressureProfile {
  return {
    accidentalCount: 0,
    chordExtraPitchCount: 0,
    eventCount: 0,
    graceNoteCount: 0,
    shortEventCount: 0,
    tupletCount: 0,
  };
}

function addImportedInkPressureEvent(
  profile: ImportedInkPressureProfile,
  event: ScoreEvent,
) {
  if (isGeneratedRestEvent(event)) {
    return;
  }

  const eventInkProfile = getEventInkProfile(event);

  profile.eventCount += 1;
  profile.accidentalCount += eventInkProfile.accidentalCount;
  profile.chordExtraPitchCount += eventInkProfile.chordExtraPitchCount;
  profile.graceNoteCount += eventInkProfile.graceNoteCount;
  profile.tupletCount += eventInkProfile.tupletCount;

  if (eventInkProfile.isShortBeamedDuration) {
    profile.shortEventCount += 1;
  }
}

function getImportedInkPressureScore(profile: ImportedInkPressureProfile) {
  return (
    profile.eventCount +
    profile.accidentalCount * 1.25 +
    profile.chordExtraPitchCount * 1.25 +
    profile.shortEventCount * 0.75 +
    profile.graceNoteCount +
    profile.tupletCount * 0.5
  );
}

function getMeasureMaxImportedInkPressureProfile(
  score: Score,
  measureIndex: number,
) {
  const profiles: ImportedInkPressureProfile[] = [];

  score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      const measure = staff.measures.find(
        (candidate) => candidate.index === measureIndex,
      );

      measure?.voices.forEach((voice) => {
        const profile = emptyImportedInkPressureProfile();

        voice.events.forEach((event) => {
          addImportedInkPressureEvent(profile, event);
        });
        profiles.push(profile);
      });
    });
  });

  return profiles.reduce(
    (maxProfile, profile) =>
      getImportedInkPressureScore(profile) >
      getImportedInkPressureScore(maxProfile)
        ? profile
        : maxProfile,
    emptyImportedInkPressureProfile(),
  );
}

function getImportedInkPressureBonus(profile: ImportedInkPressureProfile) {
  return (
    profile.accidentalCount * IMPORTED_INK_ACCIDENTAL_BONUS +
    profile.chordExtraPitchCount * IMPORTED_INK_CHORD_PITCH_BONUS +
    profile.shortEventCount * IMPORTED_INK_SHORT_EVENT_BONUS +
    profile.graceNoteCount * IMPORTED_INK_GRACE_NOTE_BONUS +
    profile.tupletCount * IMPORTED_INK_TUPLET_BONUS +
    Math.max(0, profile.eventCount - 8) * IMPORTED_INK_EXTRA_EVENT_BONUS
  );
}

function getImportedInkPressureFloor(profile: ImportedInkPressureProfile) {
  const chromaticChordFloor =
    profile.accidentalCount >= 6 && profile.chordExtraPitchCount >= 4
      ? IMPORTED_CHROMATIC_CHORD_FLOOR
      : 0;
  const chromaticRunFloor =
    profile.accidentalCount >= 9 && profile.shortEventCount >= 6
      ? IMPORTED_CHROMATIC_RUN_FLOOR
      : 0;
  const denseShortFloor =
    profile.eventCount >= 10 && profile.shortEventCount >= 6
      ? IMPORTED_DENSE_SHORT_FLOOR
      : 0;

  return Math.max(chromaticChordFloor, chromaticRunFloor, denseShortFloor);
}

function getMeasureHeaderWidthBonus(score: Score, measureIndex: number) {
  return getScoreMeasures(score, measureIndex).some((measure) => measure.sectionMarker)
    ? SECTION_MARKER_WIDTH_BONUS
    : 0;
}

function getMeasureRangeMarkWidthBonus(score: Score, measureIndex: number) {
  const rangeMarks = score.marks?.filter((mark) => {
    if (mark.scope !== 'range') {
      return false;
    }

    const startMeasureIndex = Math.min(
      mark.start.measureIndex,
      mark.end.measureIndex,
    );
    const endMeasureIndex = Math.max(mark.start.measureIndex, mark.end.measureIndex);

    return (
      measureIndex >= startMeasureIndex &&
      measureIndex <= endMeasureIndex &&
      (mark.kind === 'hairpin' || mark.kind === 'ottava')
    );
  });

  return Math.min(36, (rangeMarks?.length ?? 0) * RANGE_MARK_WIDTH_BONUS);
}

function getEstimatedInkWidth({
  localMeasureIndex,
  score,
  measureIndex,
  staffSymbolWidth,
}: {
  localMeasureIndex: number;
  measureIndex: number;
  score: Score;
  staffSymbolWidth: number;
}) {
  const slotWidths = getMeasureSlotWidths(score, measureIndex);
  const slotTotal = slotWidths.reduce((total, width) => total + width, 0);
  const slotGapTotal = Math.max(0, slotWidths.length - 1) * RHYTHM_SLOT_GAP;
  const leftPadding =
    localMeasureIndex === 0 ? FIRST_MEASURE_LEFT_PADDING : MEASURE_LEFT_PADDING;
  const measureDecorationWidth =
    getMeasureHeaderWidthBonus(score, measureIndex) +
    getMeasureRangeMarkWidthBonus(score, measureIndex);

  return (
    leftPadding +
    MEASURE_RIGHT_PADDING +
    staffSymbolWidth +
    slotTotal +
    slotGapTotal +
    measureDecorationWidth
  );
}

function getBaseReadableMinWidth(
  score: Score,
  measureIndex: number,
  localMeasureIndex: number,
  staffSymbolWidth: number,
) {
  const baseMinWidth =
    localMeasureIndex === 0
      ? MIN_FIRST_MEASURE_READABLE_WIDTH
      : MIN_MEASURE_READABLE_WIDTH;
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const extraSlots = Math.max(
    0,
    getMeasureReadableSlotWeight(score, measureIndex) - beatsPerMeasure,
  );

  return (
    baseMinWidth +
    extraSlots * MIN_READABLE_EXTRA_SLOT_WIDTH +
    getMeasureReadableInkWidthBonus(score, measureIndex) +
    staffSymbolWidth
  );
}

export function getMeasurePreflight(
  score: Score,
  measureIndex: number,
  localMeasureIndex: number,
): MeasurePreflightMetrics {
  const cache = getMeasurePreflightCache(score);
  const cacheKey = `${measureIndex}:${localMeasureIndex}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const staffSymbolWidth = getMeasureStaffSymbolWidthBonus(
    score,
    measureIndex,
    localMeasureIndex,
  );
  const baseReadableMinWidth = getBaseReadableMinWidth(
    score,
    measureIndex,
    localMeasureIndex,
    staffSymbolWidth,
  );
  const estimatedInkWidth = getEstimatedInkWidth({
    localMeasureIndex,
    measureIndex,
    score,
    staffSymbolWidth,
  });
  const slotWidths = getMeasureSlotWidths(score, measureIndex);
  const annotationWidth = getMeasureAnnotationWidth(score, measureIndex);
  const eventCount = getScoreMeasureEvents(score, measureIndex).filter(
    (event) => !isGeneratedRestEvent(event),
  ).length;
  const overflowBeat = Math.max(
    0,
    ...getScoreMeasureEvents(score, measureIndex).map(
      (event) => event.beat + getEventDurationBeats(event),
    ),
  );
  const overflowWidthBonus = Math.max(
    0,
    overflowBeat - getMeasureBeats(score.timeSignature),
  ) * MIN_READABLE_EXTRA_SLOT_WIDTH;
  const rawMinWidth = Math.max(
    baseReadableMinWidth,
    estimatedInkWidth,
    baseReadableMinWidth + overflowWidthBonus,
  );
  const importedMinWidthFloor =
    localMeasureIndex === 0
      ? IMPORTED_FIRST_MEASURE_MIN_WIDTH
      : IMPORTED_MEASURE_MIN_WIDTH;
  const importedInkPressureProfile = hasImportedSystemLayout(score)
    ? getMeasureMaxImportedInkPressureProfile(score, measureIndex)
    : emptyImportedInkPressureProfile();
  const importedInkPressureBonus = hasImportedSystemLayout(score)
    ? getImportedInkPressureBonus(importedInkPressureProfile)
    : 0;
  const importedInkPressureFloor = hasImportedSystemLayout(score)
    ? getImportedInkPressureFloor(importedInkPressureProfile)
    : 0;
  const minWidth = hasImportedSystemLayout(score)
    ? Math.max(
        importedMinWidthFloor,
        rawMinWidth * IMPORTED_PREFLIGHT_WIDTH_SCALE +
          importedInkPressureBonus,
        importedInkPressureFloor,
      )
    : rawMinWidth;
  const metrics = {
    annotationWidth,
    baseReadableMinWidth,
    estimatedInkWidth,
    eventCount,
    importedInkPressureBonus,
    importedInkPressureFloor,
    maxSlotWidth: Math.max(0, ...slotWidths),
    minWidth,
    rhythmSlotCount: slotWidths.length,
    staffSymbolWidth,
  };

  cache.set(cacheKey, metrics);
  return metrics;
}

export function getMeasurePreflightMinWidth(
  score: Score,
  measureIndex: number,
  localMeasureIndex: number,
) {
  return getMeasurePreflight(score, measureIndex, localMeasureIndex).minWidth;
}

export function getSystemPreflightMinWidth(
  score: Score,
  measureIndexes: number[],
) {
  return measureIndexes.reduce(
    (total, measureIndex, localMeasureIndex) =>
      total + getMeasurePreflightMinWidth(score, measureIndex, localMeasureIndex),
    0,
  );
}
