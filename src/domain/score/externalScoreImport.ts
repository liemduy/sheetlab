import {
  importScoreFromAbc,
  type AbcImportResult,
} from './abcNotation';
import type {
  KeySignature,
  PedalMark,
  Score,
  ScoreEvent,
  StaffId,
  TimeSignature,
} from './types';

const ABC_UNITS_PER_QUARTER = 8;
const SUPPORTED_ABC_UNITS = [32, 24, 16, 12, 8, 6, 4, 3, 2, 1] as const;
const KEY_BY_FIFTHS = {
  '-7': 'Cb',
  '-6': 'Gb',
  '-5': 'Db',
  '-4': 'Ab',
  '-3': 'Eb',
  '-2': 'Bb',
  '-1': 'F',
  0: 'C',
  1: 'G',
  2: 'D',
  3: 'A',
  4: 'E',
  5: 'B',
  6: 'F#',
  7: 'C#',
} as const;
const STEP_BY_MIDI_INDEX = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const ACCIDENTAL_BY_MIDI_INDEX = ['', '^', '', '^', '', '', '^', '', '^', '', '^', ''];

interface AbcToken {
  isRest: boolean;
  pitches: string[];
  units: number;
}

interface MidiNoteEvent {
  channel: number;
  durationTicks: number;
  midiNote: number;
  startTicks: number;
  trackIndex: number;
}

interface MidiControlChangeEvent {
  channel: number;
  controller: number;
  ticks: number;
  trackIndex: number;
  value: number;
}

interface MidiProgramEvent {
  channel: number;
  program: number;
  ticks: number;
  trackIndex: number;
}

interface MidiTempoEvent {
  tempo: number;
  ticks: number;
}

interface MidiTimeSignatureEvent {
  beatUnit: number;
  beats: number;
  ticks: number;
}

interface MidiKeySignatureEvent {
  fifths: number;
  mode: 'major' | 'minor';
  ticks: number;
}

interface ParsedMidiFile {
  controlChanges: MidiControlChangeEvent[];
  format: number;
  keySignatures: MidiKeySignatureEvent[];
  notes: MidiNoteEvent[];
  ppq: number;
  programs: MidiProgramEvent[];
  tempo: number;
  tempos: MidiTempoEvent[];
  timeSignature: TimeSignature;
  timeSignatures: MidiTimeSignatureEvent[];
  trackCount: number;
}

interface MidiStaffLineResult {
  line: string;
  overlappedNoteCount: number;
  trimmedNoteCount: number;
}

export interface MidiImportTrackAnalysis {
  averageMidiNote: number | null;
  noteCount: number;
  pitchRange: [number, number] | null;
  trackIndex: number;
}

export interface MidiImportAnalysis {
  controlChangeCount: number;
  fileName: string;
  format: number;
  keySignature: KeySignature;
  measureEstimate: number;
  noteCount: number;
  pedalEventCount: number;
  pitchRange: [number, number] | null;
  splitMode: 'middle-c' | 'track';
  tempo: number;
  tempoChangeCount: number;
  ticksPerQuarter: number;
  timeSignature: TimeSignature;
  trackCount: number;
  tracks: MidiImportTrackAnalysis[];
}

function sanitizeAbcField(value: string | null | undefined, fallback: string) {
  const cleanValue = value?.replace(/\r?\n/g, ' ').trim() ?? '';

  return cleanValue || fallback;
}

function getClosestAbcUnits(quarterBeats: number) {
  const rawUnits = quarterBeats * ABC_UNITS_PER_QUARTER;

  return SUPPORTED_ABC_UNITS.reduce((bestUnits, units) =>
    Math.abs(units - rawUnits) < Math.abs(bestUnits - rawUnits)
      ? units
      : bestUnits,
  );
}

function getClosestSupportedUnitsAtMost(units: number, maxUnits: number) {
  const candidates = SUPPORTED_ABC_UNITS.filter((unit) => unit <= maxUnits);

  if (candidates.length === 0) {
    return 1;
  }

  return candidates.reduce((bestUnits, candidate) =>
    Math.abs(candidate - units) < Math.abs(bestUnits - units)
      ? candidate
      : bestUnits,
  );
}

function splitUnitsIntoSupportedUnits(units: number) {
  const result: number[] = [];
  let remaining = Math.max(0, Math.round(units));

  SUPPORTED_ABC_UNITS.forEach((unit) => {
    while (remaining >= unit) {
      result.push(unit);
      remaining -= unit;
    }
  });

  return result;
}

function getAbcDurationSuffix(units: number) {
  return units === 1 ? '' : String(units);
}

function encodeAbcPitch(step: string, octave: number, alter = 0) {
  const accidental = alter > 0 ? '^'.repeat(alter) : alter < 0 ? '_'.repeat(-alter) : '';

  if (octave >= 5) {
    return `${accidental}${step.toLowerCase()}${"'".repeat(Math.max(0, octave - 5))}`;
  }

  return `${accidental}${step}${','.repeat(Math.max(0, 4 - octave))}`;
}

function encodeMidiPitch(midiNote: number) {
  const pitchIndex = ((midiNote % 12) + 12) % 12;
  const octave = Math.floor(midiNote / 12) - 1;

  return `${ACCIDENTAL_BY_MIDI_INDEX[pitchIndex]}${encodeAbcPitch(
    STEP_BY_MIDI_INDEX[pitchIndex],
    octave,
  )}`;
}

function getMidiKeySignature(keySignatures: readonly MidiKeySignatureEvent[]) {
  const firstMajorKey = keySignatures.find((key) => key.mode === 'major');
  const key = String(firstMajorKey?.fifths ?? keySignatures[0]?.fifths ?? 0);

  return KEY_BY_FIFTHS[key as keyof typeof KEY_BY_FIFTHS] ?? 'C';
}

function getMeasureBeatsFromTimeSignature(timeSignature: TimeSignature) {
  return timeSignature.beats * (4 / timeSignature.beatUnit);
}

function getMeasureUnitsFromTimeSignature(timeSignature: TimeSignature) {
  return Math.max(
    1,
    Math.round(
      getMeasureBeatsFromTimeSignature(timeSignature) *
        ABC_UNITS_PER_QUARTER,
    ),
  );
}

function encodeAbcToken(token: AbcToken) {
  const suffix = getAbcDurationSuffix(token.units);

  if (token.isRest) {
    return `z${suffix}`;
  }

  if (token.pitches.length > 1) {
    return `[${token.pitches.join('')}]${suffix}`;
  }

  return `${token.pitches[0] ?? 'z'}${suffix}`;
}

function getTextContent(parent: Element | Document, selector: string) {
  return parent.querySelector(selector)?.textContent?.trim() ?? '';
}

function getMusicXmlKey(fifths: string | null) {
  const key = fifths ?? '0';

  return KEY_BY_FIFTHS[key as keyof typeof KEY_BY_FIFTHS] ?? 'C';
}

function getMusicXmlTempo(document: Document) {
  const soundTempo = document.querySelector('sound[tempo]')?.getAttribute('tempo');
  const metronomePerMinute = getTextContent(document, 'metronome per-minute');
  const tempo = Number(soundTempo ?? metronomePerMinute);

  return Number.isFinite(tempo) && tempo > 0 ? Math.round(tempo) : 96;
}

function pushMusicXmlNoteToken(
  tokens: AbcToken[],
  note: Element,
  divisions: number,
  warnings: string[],
) {
  const durationValue = Number(getTextContent(note, 'duration'));
  const units = getClosestAbcUnits(
    Number.isFinite(durationValue) && divisions > 0
      ? durationValue / divisions
      : 1,
  );
  const isChord = Boolean(note.querySelector('chord'));
  const isRest = Boolean(note.querySelector('rest'));

  if (isRest) {
    tokens.push({ isRest: true, pitches: [], units });
    return;
  }

  const pitch = note.querySelector('pitch');

  if (!pitch) {
    warnings.push('Skipped a MusicXML note without pitch/rest data');
    return;
  }

  const step = getTextContent(pitch, 'step') || 'C';
  const octave = Number(getTextContent(pitch, 'octave') || 4);
  const alter = Number(getTextContent(pitch, 'alter') || 0);
  const encodedPitch = encodeAbcPitch(
    step,
    Number.isFinite(octave) ? octave : 4,
    Number.isFinite(alter) ? alter : 0,
  );

  if (isChord && tokens.length > 0) {
    const previousToken = tokens[tokens.length - 1];

    if (!previousToken.isRest) {
      previousToken.pitches.push(encodedPitch);
      previousToken.units = Math.max(previousToken.units, units);
      return;
    }
  }

  tokens.push({ isRest: false, pitches: [encodedPitch], units });
}

export function importScoreFromMusicXml(xml: string): AbcImportResult {
  if (typeof DOMParser === 'undefined') {
    throw new Error('MusicXML import requires DOMParser support');
  }

  const warnings: string[] = [];
  const document = new DOMParser().parseFromString(xml, 'application/xml');

  if (document.querySelector('parsererror')) {
    throw new Error('Invalid MusicXML document');
  }

  const title =
    getTextContent(document, 'work-title') ||
    getTextContent(document, 'movement-title') ||
    'Imported MusicXML Score';
  const composer =
    document.querySelector('creator[type="composer"]')?.textContent?.trim() ??
    getTextContent(document, 'creator');
  const firstMeasure = document.querySelector('part measure');
  const beats = Number(getTextContent(firstMeasure ?? document, 'time beats') || 4);
  const beatType = Number(getTextContent(firstMeasure ?? document, 'time beat-type') || 4);
  const key = getMusicXmlKey(
    (firstMeasure ?? document).querySelector('key fifths')?.textContent?.trim() ?? null,
  );
  const tempo = getMusicXmlTempo(document);
  const partElements = [...document.querySelectorAll('part')].slice(0, 2);
  const voiceLines = partElements.length > 1
    ? [
        { id: 'T', part: partElements[0], staffId: 'treble' },
        { id: 'B', part: partElements[1], staffId: 'bass' },
      ]
    : [{ id: 'T', part: partElements[0], staffId: 'treble' }];
  const bodyLines = voiceLines.map(({ id, part }) => {
    let divisions = 1;
    const measureTexts = [...(part?.querySelectorAll('measure') ?? [])].map((measure) => {
      const nextDivisions = Number(getTextContent(measure, 'attributes divisions'));

      if (Number.isFinite(nextDivisions) && nextDivisions > 0) {
        divisions = nextDivisions;
      }

      const tokens: AbcToken[] = [];

      [...measure.querySelectorAll(':scope > note')].forEach((note) =>
        pushMusicXmlNoteToken(tokens, note, divisions, warnings),
      );

      return tokens.length > 0 ? tokens.map(encodeAbcToken).join(' ') : 'z32';
    });

    return `[V:${id}] ${measureTexts.join(' | ')} |`;
  });
  const abc = [
    'X:1',
    `T:${sanitizeAbcField(title, 'Imported MusicXML Score')}`,
    composer ? `C:${sanitizeAbcField(composer, '')}` : null,
    `M:${Number.isFinite(beats) ? beats : 4}/${Number.isFinite(beatType) ? beatType : 4}`,
    'L:1/32',
    `Q:1/4=${tempo}`,
    voiceLines.length > 1 ? '%%score (T B)' : null,
    voiceLines.length > 1 ? 'V:T clef=treble name="Right hand"' : null,
    voiceLines.length > 1 ? 'V:B clef=bass name="Left hand"' : null,
    `K:${key}`,
    ...bodyLines,
  ].filter(Boolean).join('\n');
  const result = importScoreFromAbc(abc);

  return {
    score: result.score,
    warnings: [
      ...warnings,
      ...result.warnings,
    ],
  };
}

function readAscii(view: DataView, offset: number, length: number) {
  let value = '';

  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }

  return value;
}

function readVarLength(view: DataView, state: { offset: number }) {
  let value = 0;
  let byte = 0;

  do {
    byte = view.getUint8(state.offset);
    state.offset += 1;
    value = (value << 7) + (byte & 0x7f);
  } while (byte & 0x80);

  return value;
}

function parseMidiTrack(
  view: DataView,
  startOffset: number,
  endOffset: number,
  trackIndex: number,
) {
  const controlChanges: MidiControlChangeEvent[] = [];
  const keySignatures: MidiKeySignatureEvent[] = [];
  const notes: MidiNoteEvent[] = [];
  const programs: MidiProgramEvent[] = [];
  const tempos: MidiTempoEvent[] = [];
  const timeSignatures: MidiTimeSignatureEvent[] = [];
  const activeNotes = new Map<number, { startTicks: number }[]>();
  const state = { offset: startOffset };
  let runningStatus = 0;
  let ticks = 0;

  while (state.offset < endOffset) {
    ticks += readVarLength(view, state);

    let status = view.getUint8(state.offset);

    if (status < 0x80) {
      status = runningStatus;
    } else {
      state.offset += 1;
      runningStatus = status;
    }

    if (status === 0xff) {
      const metaType = view.getUint8(state.offset);
      state.offset += 1;
      const length = readVarLength(view, state);

      if (metaType === 0x51 && length === 3) {
        const microsPerQuarter =
          (view.getUint8(state.offset) << 16) |
          (view.getUint8(state.offset + 1) << 8) |
          view.getUint8(state.offset + 2);

        tempos.push({
          tempo: Math.round(60000000 / microsPerQuarter),
          ticks,
        });
      }

      if (metaType === 0x58 && length >= 4) {
        timeSignatures.push({
          beatUnit: 2 ** view.getUint8(state.offset + 1),
          beats: view.getUint8(state.offset),
          ticks,
        });
      }

      if (metaType === 0x59 && length >= 2) {
        keySignatures.push({
          fifths: view.getInt8(state.offset),
          mode: view.getUint8(state.offset + 1) === 1 ? 'minor' : 'major',
          ticks,
        });
      }

      state.offset += length;
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      state.offset += readVarLength(view, state);
      continue;
    }

    const eventType = status & 0xf0;
    const channel = status & 0x0f;
    const dataByteCount = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
    const firstDataByte = view.getUint8(state.offset);
    const secondDataByte = dataByteCount > 1 ? view.getUint8(state.offset + 1) : 0;

    state.offset += dataByteCount;

    if (eventType === 0xb0) {
      controlChanges.push({
        channel,
        controller: firstDataByte,
        ticks,
        trackIndex,
        value: secondDataByte,
      });
    } else if (eventType === 0xc0) {
      programs.push({
        channel,
        program: firstDataByte,
        ticks,
        trackIndex,
      });
    } else if (eventType === 0x90 && secondDataByte > 0) {
      const currentNotes = activeNotes.get(firstDataByte) ?? [];

      currentNotes.push({ startTicks: ticks });
      activeNotes.set(firstDataByte, currentNotes);
    } else if (eventType === 0x80 || (eventType === 0x90 && secondDataByte === 0)) {
      const currentNotes = activeNotes.get(firstDataByte) ?? [];
      const activeNote = currentNotes.shift();

      if (currentNotes.length === 0) {
        activeNotes.delete(firstDataByte);
      }

      if (activeNote && ticks > activeNote.startTicks) {
        notes.push({
          channel,
          durationTicks: ticks - activeNote.startTicks,
          midiNote: firstDataByte,
          startTicks: activeNote.startTicks,
          trackIndex,
        });
      }
    }
  }

  return {
    controlChanges,
    keySignatures,
    notes,
    programs,
    tempos,
    timeSignatures,
  };
}

function parseMidiFile(arrayBuffer: ArrayBuffer): ParsedMidiFile {
  const view = new DataView(arrayBuffer);

  if (readAscii(view, 0, 4) !== 'MThd') {
    throw new Error('Invalid MIDI header');
  }

  const format = view.getUint16(8);
  const headerLength = view.getUint32(4);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  const ppq = division & 0x8000 ? 480 : division;
  const controlChanges: MidiControlChangeEvent[] = [];
  const keySignatures: MidiKeySignatureEvent[] = [];
  const notes: MidiNoteEvent[] = [];
  const programs: MidiProgramEvent[] = [];
  const tempos: MidiTempoEvent[] = [];
  const timeSignatures: MidiTimeSignatureEvent[] = [];
  let offset = 8 + headerLength;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (readAscii(view, offset, 4) !== 'MTrk') {
      throw new Error('Invalid MIDI track header');
    }

    const trackLength = view.getUint32(offset + 4);
    const track = parseMidiTrack(
      view,
      offset + 8,
      offset + 8 + trackLength,
      trackIndex,
    );

    controlChanges.push(...track.controlChanges);
    keySignatures.push(...track.keySignatures);
    notes.push(...track.notes);
    programs.push(...track.programs);
    tempos.push(...track.tempos);
    timeSignatures.push(...track.timeSignatures);
    offset += 8 + trackLength;
  }

  const firstTimeSignature = timeSignatures
    .sort((first, second) => first.ticks - second.ticks)[0];

  return {
    controlChanges,
    format,
    keySignatures,
    notes,
    ppq: ppq || 480,
    programs,
    tempo: tempos.sort((first, second) => first.ticks - second.ticks)[0]?.tempo ?? 120,
    tempos,
    timeSignature: firstTimeSignature
      ? {
          beatUnit: firstTimeSignature.beatUnit,
          beats: firstTimeSignature.beats,
        }
      : {
          beatUnit: 4,
          beats: 4,
        },
    timeSignatures,
    trackCount,
  };
}

function getTrackAnalyses(notes: readonly MidiNoteEvent[]): MidiImportTrackAnalysis[] {
  const notesByTrack = new Map<number, MidiNoteEvent[]>();

  notes.forEach((note) => {
    const trackNotes = notesByTrack.get(note.trackIndex) ?? [];

    trackNotes.push(note);
    notesByTrack.set(note.trackIndex, trackNotes);
  });

  return [...notesByTrack.entries()]
    .sort(([firstTrackIndex], [secondTrackIndex]) => firstTrackIndex - secondTrackIndex)
    .map(([trackIndex, trackNotes]) => {
      const midiNotes = trackNotes.map((note) => note.midiNote);

      return {
        averageMidiNote: midiNotes.length > 0
          ? midiNotes.reduce((sum, midiNote) => sum + midiNote, 0) /
            midiNotes.length
          : null,
        noteCount: trackNotes.length,
        pitchRange: midiNotes.length > 0
          ? [
              Math.min(...midiNotes),
              Math.max(...midiNotes),
            ] as [number, number]
          : null,
        trackIndex,
      };
    });
}

function getTrackStaffMap(notes: readonly MidiNoteEvent[]) {
  const trackAnalyses = getTrackAnalyses(notes).filter(
    (track) => track.noteCount > 0 && track.averageMidiNote !== null,
  );

  if (trackAnalyses.length !== 2) {
    return null;
  }

  const [higherTrack, lowerTrack] = [...trackAnalyses].sort(
    (first, second) =>
      (second.averageMidiNote ?? 0) - (first.averageMidiNote ?? 0),
  );

  return new Map<number, StaffId>([
    [higherTrack.trackIndex, 'treble'],
    [lowerTrack.trackIndex, 'bass'],
  ]);
}

function getStaffIdForNote(
  note: MidiNoteEvent,
  trackStaffByIndex: ReadonlyMap<number, StaffId> | null,
): StaffId {
  return trackStaffByIndex?.get(note.trackIndex) ??
    (note.midiNote >= 60 ? 'treble' : 'bass');
}

export function analyzeMidiFile(
  arrayBuffer: ArrayBuffer,
  fileName = 'Imported MIDI Score',
): MidiImportAnalysis {
  const parsedMidi = parseMidiFile(arrayBuffer);
  const midiNotes = parsedMidi.notes.map((note) => note.midiNote);
  const lastTick = Math.max(
    0,
    ...parsedMidi.notes.map((note) => note.startTicks + note.durationTicks),
  );

  return {
    controlChangeCount: parsedMidi.controlChanges.length,
    fileName,
    format: parsedMidi.format,
    keySignature: getMidiKeySignature(parsedMidi.keySignatures),
    measureEstimate: Math.max(
      1,
      Math.ceil(
        lastTick /
          parsedMidi.ppq /
          getMeasureBeatsFromTimeSignature(parsedMidi.timeSignature),
      ),
    ),
    noteCount: parsedMidi.notes.length,
    pedalEventCount: parsedMidi.controlChanges.filter(
      (event) => event.controller === 64,
    ).length,
    pitchRange: midiNotes.length > 0
      ? [Math.min(...midiNotes), Math.max(...midiNotes)]
      : null,
    splitMode: getTrackStaffMap(parsedMidi.notes) ? 'track' : 'middle-c',
    tempo: parsedMidi.tempo,
    tempoChangeCount: parsedMidi.tempos.length,
    ticksPerQuarter: parsedMidi.ppq,
    timeSignature: parsedMidi.timeSignature,
    trackCount: parsedMidi.trackCount,
    tracks: getTrackAnalyses(parsedMidi.notes),
  };
}

function buildMidiStaffLine({
  id,
  measureCount,
  measureUnits,
  notes,
  ppq,
}: {
  id: string;
  measureCount: number;
  measureUnits: number;
  notes: readonly MidiNoteEvent[];
  ppq: number;
}): MidiStaffLineResult {
  const measureTokens = Array.from({ length: measureCount }, () => [] as AbcToken[]);
  const groupedNotes = new Map<number, MidiNoteEvent[]>();
  let overlappedNoteCount = 0;
  let trimmedNoteCount = 0;

  notes.forEach((note) => {
    const startUnits = Math.round((note.startTicks / ppq) * ABC_UNITS_PER_QUARTER);
    const group = groupedNotes.get(startUnits) ?? [];

    group.push(note);
    groupedNotes.set(startUnits, group);
  });

  const columns = [...groupedNotes.entries()]
    .map(([startUnits, group]) => ({
      durationUnits: Math.max(
        ...group.map((note) => getClosestAbcUnits(note.durationTicks / ppq)),
      ),
      group,
      startUnits,
    }))
    .sort((first, second) => first.startUnits - second.startUnits);

  measureTokens.forEach((measure, measureIndex) => {
    const measureStartUnits = measureIndex * measureUnits;
    const measureEndUnits = measureStartUnits + measureUnits;
    const measureColumns = columns.filter(
      (column) =>
        column.startUnits >= measureStartUnits &&
        column.startUnits < measureEndUnits,
    );
    let cursorUnits = 0;

    measureColumns.forEach((column, columnIndex) => {
      let localStartUnits = column.startUnits - measureStartUnits;

      if (localStartUnits < cursorUnits) {
        overlappedNoteCount += column.group.length;
        localStartUnits = cursorUnits;
      }

      if (localStartUnits >= measureUnits) {
        trimmedNoteCount += column.group.length;
        return;
      }

      splitUnitsIntoSupportedUnits(localStartUnits - cursorUnits).forEach(
        (units) =>
          measure.push({
            isRest: true,
            pitches: [],
            units,
          }),
      );

      const nextColumnStartUnits =
        measureColumns[columnIndex + 1]?.startUnits ?? measureEndUnits;
      const maxUnits = Math.max(
        1,
        Math.min(
          measureUnits - localStartUnits,
          nextColumnStartUnits - measureStartUnits - localStartUnits,
        ),
      );
      const units = getClosestSupportedUnitsAtMost(
        column.durationUnits,
        maxUnits,
      );

      if (units < column.durationUnits) {
        trimmedNoteCount += column.group.length;
      }

      measure.push({
        isRest: false,
        pitches: [
          ...new Set(
            column.group
              .map((note) => encodeMidiPitch(note.midiNote))
              .sort(),
          ),
        ],
        units,
      });
      cursorUnits = localStartUnits + units;
    });

    splitUnitsIntoSupportedUnits(measureUnits - cursorUnits).forEach((units) =>
      measure.push({
        isRest: true,
        pitches: [],
        units,
      }),
    );
  });

  return {
    line: `[V:${id}] ${measureTokens
      .map((tokens) => tokens.map(encodeAbcToken).join(' '))
      .join(' | ')}`,
    overlappedNoteCount,
    trimmedNoteCount,
  };
}

function getPedalTransitionMarks(
  controlChanges: readonly MidiControlChangeEvent[],
) {
  const marks: Array<{ mark: PedalMark; ticks: number }> = [];
  let isPedalDown = false;

  controlChanges
    .filter((event) => event.controller === 64)
    .sort((first, second) => first.ticks - second.ticks)
    .forEach((event) => {
      const nextIsPedalDown = event.value >= 64;

      if (nextIsPedalDown === isPedalDown) {
        return;
      }

      isPedalDown = nextIsPedalDown;
      marks.push({
        mark: nextIsPedalDown ? 'start' : 'release',
        ticks: event.ticks,
      });
    });

  return marks;
}

function mergePedalMark(existing: PedalMark | undefined, next: PedalMark) {
  if (!existing || existing === next) {
    return next;
  }

  return 'start-release';
}

function findPedalTargetEventId(
  score: Score,
  measureIndex: number,
  beat: number,
) {
  const staffOrder: StaffId[] = ['bass', 'treble'];

  for (const staffId of staffOrder) {
    const staff = score.parts[0]?.staves.find(
      (candidate) => candidate.id === staffId,
    );
    const events = staff?.measures[measureIndex]?.voices
      .flatMap((voice) => voice.events)
      .filter((event) => event.kind !== 'rest')
      .sort((first, second) => {
        const firstIsAfter = first.beat >= beat ? 0 : 1;
        const secondIsAfter = second.beat >= beat ? 0 : 1;

        return firstIsAfter - secondIsAfter ||
          Math.abs(first.beat - beat) - Math.abs(second.beat - beat);
      }) ?? [];

    if (events[0]) {
      return events[0].id;
    }
  }

  return null;
}

function applyMidiPedalMarks({
  controlChanges,
  measureUnits,
  ppq,
  score,
}: {
  controlChanges: readonly MidiControlChangeEvent[];
  measureUnits: number;
  ppq: number;
  score: Score;
}) {
  const pedalMarksByEventId = new Map<string, PedalMark>();

  getPedalTransitionMarks(controlChanges).forEach((pedal) => {
    const absoluteUnits = Math.round(
      (pedal.ticks / ppq) * ABC_UNITS_PER_QUARTER,
    );
    const measureIndex = Math.floor(absoluteUnits / measureUnits);
    const beat = (absoluteUnits - measureIndex * measureUnits) /
      ABC_UNITS_PER_QUARTER;
    const eventId = findPedalTargetEventId(score, measureIndex, beat);

    if (!eventId) {
      return;
    }

    pedalMarksByEventId.set(
      eventId,
      mergePedalMark(pedalMarksByEventId.get(eventId), pedal.mark),
    );
  });

  if (pedalMarksByEventId.size === 0) {
    return {
      appliedPedalMarkCount: 0,
      score,
    };
  }

  return {
    appliedPedalMarkCount: pedalMarksByEventId.size,
    score: {
      ...score,
      parts: score.parts.map((part) => ({
        ...part,
        staves: part.staves.map((staff) => ({
          ...staff,
          measures: staff.measures.map((measure) => ({
            ...measure,
            voices: measure.voices.map((voice) => ({
              ...voice,
              events: voice.events.map((event) => {
                const pedal = pedalMarksByEventId.get(event.id);

                return pedal
                  ? {
                      ...event,
                      pedal: mergePedalMark(event.pedal, pedal),
                    }
                  : event;
              }),
            })),
          })),
        })),
      })),
    },
  };
}

export function importScoreFromMidi(
  arrayBuffer: ArrayBuffer,
  fileName = 'Imported MIDI Score',
): AbcImportResult {
  const parsedMidi = parseMidiFile(arrayBuffer);
  const {
    controlChanges,
    keySignatures,
    notes,
    ppq,
    tempo,
    timeSignature,
  } = parsedMidi;

  if (notes.length === 0) {
    throw new Error('No MIDI notes found');
  }

  const lastTick = Math.max(
    ...notes.map((note) => note.startTicks + note.durationTicks),
  );
  const measureUnits = getMeasureUnitsFromTimeSignature(timeSignature);
  const measureCount = Math.max(
    1,
    Math.ceil(
      lastTick /
        ppq /
        getMeasureBeatsFromTimeSignature(timeSignature),
    ),
  );
  const trackStaffByIndex = getTrackStaffMap(notes);
  const trebleNotes = notes.filter(
    (note) => getStaffIdForNote(note, trackStaffByIndex) === 'treble',
  );
  const bassNotes = notes.filter(
    (note) => getStaffIdForNote(note, trackStaffByIndex) === 'bass',
  );
  const trebleLine = buildMidiStaffLine({
    id: 'T',
    measureCount,
    measureUnits,
    notes: trebleNotes,
    ppq,
  });
  const bassLine = buildMidiStaffLine({
    id: 'B',
    measureCount,
    measureUnits,
    notes: bassNotes,
    ppq,
  });
  const abc = [
    'X:1',
    `T:${sanitizeAbcField(fileName.replace(/\.(mid|midi)$/i, ''), 'Imported MIDI Score')}`,
    `M:${timeSignature.beats}/${timeSignature.beatUnit}`,
    'L:1/32',
    `Q:1/4=${tempo}`,
    '%%score (T B)',
    'V:T clef=treble name="Right hand"',
    'V:B clef=bass name="Left hand"',
    `K:${getMidiKeySignature(keySignatures)}`,
    trebleLine.line,
    bassLine.line,
  ].join('\n');
  const result = importScoreFromAbc(abc);
  const { appliedPedalMarkCount, score } = applyMidiPedalMarks({
    controlChanges,
    measureUnits,
    ppq,
    score: result.score,
  });
  const overlappedNoteCount =
    trebleLine.overlappedNoteCount + bassLine.overlappedNoteCount;
  const trimmedNoteCount =
    trebleLine.trimmedNoteCount + bassLine.trimmedNoteCount;

  return {
    score,
    warnings: [
      'MIDI import quantizes timing to a 1/32-note notation grid',
      trackStaffByIndex
        ? 'MIDI import split hands by detected note tracks'
        : 'MIDI import split hands at middle C',
      overlappedNoteCount > 0
        ? `MIDI import flattened ${overlappedNoteCount} overlapping note${
            overlappedNoteCount === 1 ? '' : 's'
          } into a single notation voice`
        : null,
      trimmedNoteCount > 0
        ? `MIDI import shortened ${trimmedNoteCount} sustained note${
            trimmedNoteCount === 1 ? '' : 's'
          } to keep measures readable`
        : null,
      appliedPedalMarkCount > 0
        ? `MIDI import mapped ${appliedPedalMarkCount} sustain pedal mark${
            appliedPedalMarkCount === 1 ? '' : 's'
          }`
        : null,
      ...result.warnings,
    ].filter(Boolean) as string[],
  };
}
