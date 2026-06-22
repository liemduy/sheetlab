import type { ScoreEvent } from '../../domain/score/types';
import {
  getEventDots,
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';

export interface EventInkProfile {
  accidentalCount: number;
  articulationCount: number;
  chordExtraPitchCount: number;
  dotCount: number;
  graceNoteCount: number;
  hasArpeggio: boolean;
  isGeneratedRest: boolean;
  isRest: boolean;
  isShortBeamedDuration: boolean;
  pitchCount: number;
  slashGraceNoteCount: number;
  tupletCount: number;
}

export const EVENT_INK_METRICS = {
  accidentalBottomPadding: 16,
  accidentalTopPadding: 30,
  accidentalWidth: 15,
  additionalChordPitchWidth: 10,
  arpeggioPadding: 14,
  arpeggioWidth: 15,
  articulationPadding: 14,
  articulationWidth: 8,
  dotWidth: 7,
  graceNotePadding: 18,
  graceNoteWidth: 13,
  noteheadPadding: 10,
  noteheadWidth: 18,
  restWidth: 16,
  shortBeamBottomPadding: 18,
  shortDurationWidth: 8,
  slashGraceNoteWidth: 3,
  tupletWidth: 8,
} as const;

export function isShortBeamedDuration(event: ScoreEvent) {
  return (
    event.duration === 'eighth' ||
    event.duration === 'sixteenth' ||
    event.duration === 'thirtySecond' ||
    event.duration === 'sixtyFourth'
  );
}

export function getEventInkProfile(event: ScoreEvent): EventInkProfile {
  const pitches = getEventPitches(event);
  const graceNotes = event.graceNotes ?? [];

  return {
    accidentalCount:
      event.kind === 'rest'
        ? 0
        : pitches.filter((pitch) => Boolean(pitch.accidental)).length,
    articulationCount: event.articulations?.length ?? 0,
    chordExtraPitchCount: Math.max(0, pitches.length - 1),
    dotCount: getEventDots(event),
    graceNoteCount: graceNotes.length,
    hasArpeggio: Boolean(event.arpeggio),
    isGeneratedRest: isGeneratedRestEvent(event),
    isRest: event.kind === 'rest',
    isShortBeamedDuration: isShortBeamedDuration(event),
    pitchCount: pitches.length,
    slashGraceNoteCount: graceNotes.filter((note) => note.slash).length,
    tupletCount: event.tuplet ? 1 : 0,
  };
}

export function getEventCoreInkWidth(event: ScoreEvent) {
  const profile = getEventInkProfile(event);

  if (profile.isGeneratedRest) {
    return 0;
  }

  if (profile.isRest) {
    return EVENT_INK_METRICS.restWidth;
  }

  return (
    EVENT_INK_METRICS.noteheadWidth +
    profile.accidentalCount * EVENT_INK_METRICS.accidentalWidth +
    profile.chordExtraPitchCount * EVENT_INK_METRICS.additionalChordPitchWidth +
    profile.dotCount * EVENT_INK_METRICS.dotWidth +
    (profile.isShortBeamedDuration ? EVENT_INK_METRICS.shortDurationWidth : 0) +
    profile.tupletCount * EVENT_INK_METRICS.tupletWidth +
    profile.graceNoteCount * EVENT_INK_METRICS.graceNoteWidth +
    profile.slashGraceNoteCount * EVENT_INK_METRICS.slashGraceNoteWidth +
    (profile.hasArpeggio ? EVENT_INK_METRICS.arpeggioWidth : 0) +
    profile.articulationCount * EVENT_INK_METRICS.articulationWidth
  );
}

export function getEstimatedEventTopInkPadding(event: ScoreEvent) {
  const profile = getEventInkProfile(event);

  return Math.max(
    EVENT_INK_METRICS.noteheadPadding,
    profile.accidentalCount > 0 ? EVENT_INK_METRICS.accidentalTopPadding : 0,
    profile.graceNoteCount > 0 ? EVENT_INK_METRICS.graceNotePadding : 0,
    profile.articulationCount > 0 ? EVENT_INK_METRICS.articulationPadding : 0,
    profile.hasArpeggio ? EVENT_INK_METRICS.arpeggioPadding : 0,
  );
}

export function getEstimatedEventBottomInkPadding(event: ScoreEvent) {
  const profile = getEventInkProfile(event);

  return Math.max(
    EVENT_INK_METRICS.noteheadPadding,
    profile.accidentalCount > 0 ? EVENT_INK_METRICS.accidentalBottomPadding : 0,
    profile.isShortBeamedDuration ? EVENT_INK_METRICS.shortBeamBottomPadding : 0,
    profile.graceNoteCount > 0 ? EVENT_INK_METRICS.graceNotePadding : 0,
    profile.articulationCount > 0 ? EVENT_INK_METRICS.articulationPadding : 0,
    profile.hasArpeggio ? EVENT_INK_METRICS.arpeggioPadding : 0,
  );
}
