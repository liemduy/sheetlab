import type { PlaybackTimelineEvent } from './timeline';
import { pitchToToneNote } from './pitch';
import type { Pitch, StaffId } from '../../domain/score/types';

export interface PlaybackController {
  audioStarted?: boolean;
  getElapsedSeconds?: () => number;
  startedAtMs: number;
  stop: () => void;
}

export interface PlaybackAudioOptions {
  delaySeconds?: number;
  endSeconds?: number;
  metronome?: {
    beatsPerMeasure: number;
    countInBeats?: number;
    tempo: number;
  };
  staffIds?: readonly StaffId[];
  startSeconds?: number;
}

const PLAYBACK_SCHEDULE_LEAD_SECONDS = 0.08;
const PLAYBACK_LOOKAHEAD_SECONDS = 2.5;
const PLAYBACK_SCHEDULER_INTERVAL_MS = 100;
const AUDIO_SCHEDULE_PAST_TOLERANCE_SECONDS = 0.02;
const ARPEGGIO_STEP_SECONDS = 0.045;
const ARPEGGIO_MIN_NOTE_SECONDS = 0.12;
let toneImportPromise: Promise<typeof import('tone')> | null = null;

function getAudioContextConstructor() {
  type AudioGlobal = typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

  return globalThis.AudioContext ?? (globalThis as AudioGlobal).webkitAudioContext;
}

async function getToneModule() {
  toneImportPromise ??= import('tone');

  return toneImportPromise;
}

function getAudioOutputLatencySeconds(Tone: typeof import('tone')) {
  const rawContext = Tone.getContext().rawContext as AudioContext & {
    outputLatency?: number;
  };
  const outputLatency =
    typeof rawContext.outputLatency === 'number' ? rawContext.outputLatency : 0;
  const baseLatency =
    typeof rawContext.baseLatency === 'number' ? rawContext.baseLatency : 0;

  return Math.max(outputLatency, baseLatency, 0);
}

function shouldScheduleTimelineEvent(
  event: PlaybackTimelineEvent,
  {
    endSeconds,
    staffIdSet,
    startSeconds,
  }: {
    endSeconds: number;
    staffIdSet: ReadonlySet<StaffId> | null;
    startSeconds: number;
  },
) {
  return (
    event.pitches.length > 0 &&
    event.startSeconds >= startSeconds &&
    event.startSeconds < endSeconds &&
    (!staffIdSet || staffIdSet.has(event.staffId))
  );
}

function getMetronomeBeatCount({
  endSeconds,
  startSeconds,
  tempo,
}: {
  endSeconds: number;
  startSeconds: number;
  tempo: number;
}) {
  const secondsPerBeat = 60 / tempo;

  return Math.max(0, Math.ceil((endSeconds - startSeconds) / secondsPerBeat));
}

function isAccentBeat(beatIndex: number, beatsPerMeasure: number) {
  return ((beatIndex % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure === 0;
}

function createPianoLikeSynth(Tone: typeof import('tone')) {
  const compressor = new Tone.Compressor({
    attack: 0.006,
    ratio: 2.2,
    release: 0.34,
    threshold: -16,
  }).toDestination();
  const reverb = new Tone.Reverb({
    decay: 1.8,
    preDelay: 0.018,
    wet: 0.19,
  }).connect(compressor);
  const eq = new Tone.EQ3({
    high: -0.5,
    highFrequency: 2800,
    low: -2.5,
    lowFrequency: 180,
    mid: -0.5,
  }).connect(reverb);
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    envelope: {
      attack: 0.012,
      decay: 0.42,
      release: 1.35,
      sustain: 0.08,
    },
    harmonicity: 1.48,
    modulationIndex: 5.8,
    modulation: {
      type: 'sine',
    },
    modulationEnvelope: {
      attack: 0.006,
      decay: 0.18,
      release: 0.08,
      sustain: 0,
    },
    oscillator: {
      type: 'sine',
    },
    volume: -8,
  }).connect(eq);

  return {
    dispose: () => {
      synth.releaseAll();
      synth.dispose();
      eq.dispose();
      reverb.dispose();
      compressor.dispose();
    },
    synth,
  };
}

function schedulePianoEvent(
  synth: ReturnType<typeof createPianoLikeSynth>['synth'],
  Tone: typeof import('tone'),
  event: PlaybackTimelineEvent,
  startAudioSeconds: number,
) {
  const toneStartSeconds = Math.max(Tone.now(), startAudioSeconds);

  if (!event.arpeggio || event.pitches.length <= 1) {
    synth.triggerAttackRelease(
      event.pitches.map(pitchToToneNote),
      event.soundDurationSeconds,
      toneStartSeconds,
      event.velocity,
    );
    return;
  }

  event.pitches.forEach((pitch, pitchIndex) => {
    const noteStartSeconds = toneStartSeconds + pitchIndex * ARPEGGIO_STEP_SECONDS;
    const remainingSeconds =
      event.soundDurationSeconds - pitchIndex * ARPEGGIO_STEP_SECONDS;
    const noteDurationSeconds = Math.max(
      ARPEGGIO_MIN_NOTE_SECONDS,
      remainingSeconds,
    );

    synth.triggerAttackRelease(
      pitchToToneNote(pitch),
      noteDurationSeconds,
      noteStartSeconds,
      event.velocity,
    );
  });
}

export async function warmUpPlaybackAudio() {
  if (!getAudioContextConstructor()) {
    return false;
  }

  const Tone = await getToneModule();
  await Tone.start();

  return Tone.getContext().state === 'running';
}

export async function playTimelineAudio(
  timeline: PlaybackTimelineEvent[],
  options: PlaybackAudioOptions = {},
): Promise<PlaybackController> {
  if (!getAudioContextConstructor()) {
    const performanceStartedAtMs =
      performance.now() + Math.max(0, options.delaySeconds ?? 0) * 1000;

    return {
      audioStarted: false,
      getElapsedSeconds: () =>
        (performance.now() - performanceStartedAtMs) / 1000,
      startedAtMs: performanceStartedAtMs,
      stop: () => undefined,
    };
  }

  const Tone = await getToneModule();
  const audioStarted = await warmUpPlaybackAudio();
  const pianoSynth = createPianoLikeSynth(Tone);
  const audioNowSeconds = Tone.now();
  const audioImmediateSeconds = Tone.immediate();
  const toneLookAheadSeconds = Math.max(
    0,
    audioNowSeconds - audioImmediateSeconds,
  );
  const outputLatencySeconds = getAudioOutputLatencySeconds(Tone);
  const scheduledStartSeconds =
    audioNowSeconds + PLAYBACK_SCHEDULE_LEAD_SECONDS;
  const startSeconds = Math.max(0, options.startSeconds ?? 0);
  const endSeconds = Math.max(
    startSeconds,
    options.endSeconds ?? Number.POSITIVE_INFINITY,
  );
  const delaySeconds = Math.max(0, options.delaySeconds ?? 0);
  const staffIdSet = options.staffIds ? new Set(options.staffIds) : null;
  const playbackStartAudioSeconds =
    scheduledStartSeconds + delaySeconds + outputLatencySeconds;
  const startedAtMs =
    performance.now() +
    Math.max(
      0,
      playbackStartAudioSeconds - audioImmediateSeconds,
      toneLookAheadSeconds +
        PLAYBACK_SCHEDULE_LEAD_SECONDS +
        outputLatencySeconds,
    ) *
      1000;

  if (audioStarted) {
    const metronomeSynth = options.metronome
      ? new Tone.Synth({
          envelope: {
            attack: 0.002,
            decay: 0.035,
            release: 0.02,
            sustain: 0,
          },
          oscillator: {
            type: 'square',
          },
        }).toDestination()
      : null;
    let schedulerTimer: ReturnType<typeof globalThis.setInterval> | null = null;
    let nextTimelineEventIndex = timeline.findIndex(
      (event) => event.startSeconds >= startSeconds,
    );
    let nextMetronomeBeatIndex = -Math.max(
      0,
      options.metronome?.countInBeats ?? 0,
    );

    if (nextTimelineEventIndex < 0) {
      nextTimelineEventIndex = timeline.length;
    }

    const scheduleTimelineWindow = () => {
      const currentAudioSeconds = Tone.immediate();
      const elapsedPlaybackSeconds = Math.max(
        0,
        currentAudioSeconds - playbackStartAudioSeconds,
      );
      const scheduleUntilSeconds = Math.min(
        endSeconds,
        startSeconds + elapsedPlaybackSeconds + PLAYBACK_LOOKAHEAD_SECONDS,
      );

      while (nextTimelineEventIndex < timeline.length) {
        const event = timeline[nextTimelineEventIndex];

        if (!event || event.startSeconds >= endSeconds) {
          nextTimelineEventIndex = timeline.length;
          break;
        }

        if (event.startSeconds > scheduleUntilSeconds) {
          break;
        }

        nextTimelineEventIndex += 1;

        if (
          !shouldScheduleTimelineEvent(event, {
            endSeconds,
            staffIdSet,
            startSeconds,
          })
        ) {
          continue;
        }

        const eventStartAudioSeconds =
          scheduledStartSeconds + delaySeconds + event.startSeconds - startSeconds;

        if (
          eventStartAudioSeconds <
          currentAudioSeconds - AUDIO_SCHEDULE_PAST_TOLERANCE_SECONDS
        ) {
          continue;
        }

        schedulePianoEvent(
          pianoSynth.synth,
          Tone,
          event,
          eventStartAudioSeconds,
        );
      }
    };

    const scheduleMetronomeWindow = () => {
      if (!options.metronome || !metronomeSynth) {
        return;
      }

      const secondsPerBeat = 60 / options.metronome.tempo;
      const practiceBeatCount = getMetronomeBeatCount({
        endSeconds,
        startSeconds,
        tempo: options.metronome.tempo,
      });
      const currentAudioSeconds = Tone.immediate();
      const scheduleUntilAudioSeconds =
        currentAudioSeconds + PLAYBACK_LOOKAHEAD_SECONDS;

      while (nextMetronomeBeatIndex < practiceBeatCount) {
        const clickTime =
          scheduledStartSeconds +
          delaySeconds +
          nextMetronomeBeatIndex * secondsPerBeat;

        if (
          clickTime <
          currentAudioSeconds - AUDIO_SCHEDULE_PAST_TOLERANCE_SECONDS
        ) {
          nextMetronomeBeatIndex += 1;
          continue;
        }

        if (clickTime > scheduleUntilAudioSeconds) {
          break;
        }

        const playbackBeatIndex = Math.floor(
          startSeconds / secondsPerBeat + nextMetronomeBeatIndex,
        );
        const accented = isAccentBeat(
          playbackBeatIndex,
          options.metronome.beatsPerMeasure,
        );

        metronomeSynth.triggerAttackRelease(
          accented ? 1320 : 880,
          0.035,
          Math.max(Tone.now(), clickTime),
          accented ? 0.42 : 0.26,
        );
        nextMetronomeBeatIndex += 1;
      }
    };

    const schedulePlaybackWindow = () => {
      scheduleTimelineWindow();
      scheduleMetronomeWindow();

      if (
        nextTimelineEventIndex >= timeline.length &&
        (!options.metronome ||
          nextMetronomeBeatIndex >=
            getMetronomeBeatCount({
              endSeconds,
              startSeconds,
              tempo: options.metronome.tempo,
            }))
      ) {
        if (schedulerTimer !== null) {
          globalThis.clearInterval(schedulerTimer);
          schedulerTimer = null;
        }
      }
    };

    schedulePlaybackWindow();
    schedulerTimer = globalThis.setInterval(
      schedulePlaybackWindow,
      PLAYBACK_SCHEDULER_INTERVAL_MS,
    );

    return {
      audioStarted,
      getElapsedSeconds: () =>
        Tone.immediate() - playbackStartAudioSeconds,
      startedAtMs,
      stop: () => {
        if (schedulerTimer !== null) {
          globalThis.clearInterval(schedulerTimer);
        }
        pianoSynth.dispose();
        metronomeSynth?.dispose();
      },
    };
  }

  return {
    audioStarted,
    getElapsedSeconds: () =>
      Tone.immediate() - playbackStartAudioSeconds,
    startedAtMs,
    stop: () => {
      pianoSynth.dispose();
    },
  };
}

export async function playPitchPreview(
  pitches: Pitch[],
  durationSeconds = 0.24,
): Promise<void> {
  if (!getAudioContextConstructor() || pitches.length === 0) {
    return;
  }

  const Tone = await getToneModule();
  const audioStarted = await warmUpPlaybackAudio();

  if (!audioStarted) {
    return;
  }

  const pianoSynth = createPianoLikeSynth(Tone);

  pianoSynth.synth.triggerAttackRelease(
    pitches.map(pitchToToneNote),
    durationSeconds,
    Tone.now(),
  );
  globalThis.setTimeout(() => {
    pianoSynth.dispose();
  }, (durationSeconds + 1.2) * 1000);
}
