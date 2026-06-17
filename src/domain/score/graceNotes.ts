import type {
  GraceNoteAttachment,
  GraceNoteKind,
  GraceNotePlaybackPolicy,
  GraceNotePlaybackTiming,
  GraceNoteStealTime,
  Pitch,
  Score,
} from './types';

const DEFAULT_ACCIACCATURA_FIXED_MS = 65;
const DEFAULT_APPOGGIATURA_RATIO = 0.5;

export const GRACE_NOTE_KINDS: readonly GraceNoteKind[] = [
  'acciaccatura',
  'appoggiatura',
];

export const GRACE_NOTE_PLAYBACK_TIMINGS: readonly GraceNotePlaybackTiming[] = [
  'beforeBeat',
  'onBeat',
];

export const GRACE_NOTE_STEAL_TIME_OPTIONS: readonly GraceNoteStealTime[] = [
  'none',
  'previous',
  'main',
];

export function getGraceNoteKind(graceNote: GraceNoteAttachment): GraceNoteKind {
  return graceNote.kind ?? (graceNote.slash ? 'acciaccatura' : 'appoggiatura');
}

export function getGraceNoteDisplayDuration(graceNote: GraceNoteAttachment) {
  return graceNote.displayDuration ?? graceNote.duration ?? 'sixteenth';
}

export function getGraceNoteSlash(graceNote: GraceNoteAttachment) {
  return graceNote.slash ?? getGraceNoteKind(graceNote) === 'acciaccatura';
}

export function getDefaultGraceNotePlayback(
  kind: GraceNoteKind,
): Required<Pick<GraceNotePlaybackPolicy, 'stealTimeFrom' | 'timing'>> &
  Pick<GraceNotePlaybackPolicy, 'durationRatio' | 'fixedMs'> {
  if (kind === 'appoggiatura') {
    return {
      durationRatio: DEFAULT_APPOGGIATURA_RATIO,
      stealTimeFrom: 'main',
      timing: 'onBeat',
    };
  }

  return {
    fixedMs: DEFAULT_ACCIACCATURA_FIXED_MS,
    stealTimeFrom: 'none',
    timing: 'beforeBeat',
  };
}

export function getGraceNotePlayback(
  graceNote: GraceNoteAttachment,
): Required<Pick<GraceNotePlaybackPolicy, 'stealTimeFrom' | 'timing'>> &
  Pick<GraceNotePlaybackPolicy, 'durationRatio' | 'fixedMs'> {
  const defaults = getDefaultGraceNotePlayback(getGraceNoteKind(graceNote));

  return {
    ...defaults,
    ...graceNote.playback,
    stealTimeFrom: graceNote.playback?.stealTimeFrom ?? defaults.stealTimeFrom,
    timing: graceNote.playback?.timing ?? defaults.timing,
  };
}

function normalizeGraceNotePlayback(
  graceNote: GraceNoteAttachment,
): GraceNotePlaybackPolicy {
  const playback = getGraceNotePlayback(graceNote);

  return {
    durationRatio:
      playback.durationRatio !== undefined
        ? Math.min(1, Math.max(0.05, playback.durationRatio))
        : undefined,
    fixedMs:
      playback.fixedMs !== undefined
        ? Math.min(500, Math.max(12, Math.round(playback.fixedMs)))
        : undefined,
    stealTimeFrom: playback.stealTimeFrom,
    timing: playback.timing,
  };
}

export function createGraceNoteAttachment({
  displayDuration = 'sixteenth',
  id,
  kind = 'acciaccatura',
  pitches,
  playback,
  slash,
  slurToMain = true,
}: {
  displayDuration?: GraceNoteAttachment['displayDuration'];
  id?: string;
  kind?: GraceNoteKind;
  pitches: Pitch[];
  playback?: GraceNotePlaybackPolicy;
  slash?: boolean;
  slurToMain?: boolean;
}): GraceNoteAttachment {
  const graceNote: GraceNoteAttachment = {
    displayDuration,
    id,
    kind,
    pitches,
    slash: slash ?? kind === 'acciaccatura',
    slurToMain,
    ...(playback ? { playback } : {}),
  };

  return {
    ...graceNote,
    playback: normalizeGraceNotePlayback(graceNote),
  };
}

export function normalizeGraceNoteAttachment(
  graceNote: GraceNoteAttachment,
  eventId: string,
  index: number,
): GraceNoteAttachment {
  const kind = getGraceNoteKind(graceNote);
  const normalizedGraceNote: GraceNoteAttachment = {
    displayDuration: getGraceNoteDisplayDuration(graceNote),
    id: graceNote.id ?? `grace-${eventId}-${index + 1}`,
    kind,
    pitches: graceNote.pitches,
    slash: getGraceNoteSlash(graceNote),
    slurToMain: graceNote.slurToMain ?? true,
    ...(graceNote.playback ? { playback: graceNote.playback } : {}),
  };

  return {
    ...normalizedGraceNote,
    playback: normalizeGraceNotePlayback(normalizedGraceNote),
  };
}

export function normalizeGraceNotes(
  graceNotes: readonly GraceNoteAttachment[] | null | undefined,
  eventId: string,
) {
  if (!graceNotes || graceNotes.length === 0) {
    return undefined;
  }

  const normalizedGraceNotes = graceNotes
    .filter((graceNote) => graceNote.pitches.length > 0)
    .map((graceNote, index) =>
      normalizeGraceNoteAttachment(graceNote, eventId, index),
    );

  return normalizedGraceNotes.length > 0 ? normalizedGraceNotes : undefined;
}

export function normalizeScoreGraceNotes(score: Score): Score {
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => ({
        ...staff,
        measures: staff.measures.map((measure) => ({
          ...measure,
          voices: measure.voices.map((voice) => ({
            ...voice,
            events: voice.events.map((event) =>
              event.graceNotes
                ? {
                    ...event,
                    graceNotes: normalizeGraceNotes(event.graceNotes, event.id),
                  }
                : event,
            ),
          })),
        })),
      })),
    })),
  };
}
