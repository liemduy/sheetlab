import {
  importScoreFromAbc,
  type AbcImportResult,
} from './abcNotation';
import { unzipSync } from 'fflate';
import { createEmptyScore } from './factories';
import { setMeasureKeySignature } from './editing';
import { getEventDurationBeats } from './eventDuration';
import { getEventPitches } from './events';
import {
  createGraceNoteAttachment,
  normalizeGraceNotes,
} from './graceNotes';
import { createEmptyVoice } from './voices';
import type {
  Accidental,
  ArticulationKind,
  Clef,
  ClefChange,
  DurationValue,
  GraceNoteAttachment,
  HairpinMark,
  ImportedCreditLayout,
  ImportedMeasureLayout,
  KeySignature,
  NotationMark,
  NoteStep,
  OttavaKind,
  PedalMark,
  Pitch,
  RangeNotationMark,
  Score,
  ScoreEvent,
  ScorePosition,
  SlurMark,
  AnnotationPlacementSide,
  StaffId,
  TieMark,
  TimeSignature,
  TupletInfo,
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

interface MidiGraceNoteCandidate {
  graceNote: GraceNoteAttachment;
  sourceKey: string;
  staffId: StaffId;
  targetBeat: number;
  targetMeasureIndex: number;
}

interface MusicXmlDuration {
  dots: number;
  duration: DurationValue;
}

interface MusicXmlOctaveShiftMark {
  kind?: OttavaKind;
  number: string;
  placement?: AnnotationPlacementSide;
  type: 'down' | 'stop' | 'up';
}

interface MusicXmlWedgeMark {
  hairpin?: HairpinMark;
  number: string;
  placement?: AnnotationPlacementSide;
  type: 'crescendo' | 'diminuendo' | 'stop';
}

interface MusicXmlDirectionMark {
  beat: number;
  dynamic?: string;
  hairpin?: HairpinMark;
  octaveShift?: MusicXmlOctaveShiftMark;
  pedal?: PedalMark;
  pedalLine?: boolean;
  rehearsal?: string;
  staffId: StaffId;
  wedge?: MusicXmlWedgeMark;
  words?: string;
}

interface MusicXmlDirectionTargetContext {
  event: ScoreEvent;
  measureIndex: number;
  staffId: StaffId;
  voiceIndex: number;
}

interface MusicXmlTupletState {
  actualNotes: number;
  id: string;
  index: number;
  normalNotes: number;
}

interface MusicXmlConnectionSource {
  eventId: string;
  pitchIndex: number;
}

interface MusicXmlNoteMarks {
  arpeggio?: boolean;
  articulations?: ArticulationKind[];
  fermata?: boolean;
  slurs: Array<{
    id: string;
    type: 'start' | 'stop';
  }>;
  ties: Array<'start' | 'stop'>;
}

export interface MusicXmlImportAnalysis {
  backupCount: number;
  directionCount: number;
  dynamicCount: number;
  fileName: string;
  hairpinCount: number;
  lyricCount: number;
  measureCount: number;
  noteCount: number;
  partCount: number;
  pedalCount: number;
  restCount: number;
  staffCount: number;
  staffNoteCounts: Partial<Record<StaffId, number>>;
  voiceCount: number;
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

function midiNoteToPitch(midiNote: number): Pitch {
  const pitchIndex = ((midiNote % 12) + 12) % 12;
  const accidental =
    ACCIDENTAL_BY_MIDI_INDEX[pitchIndex] === '^' ? 'sharp' : undefined;

  return {
    accidental,
    octave: Math.floor(midiNote / 12) - 1,
    step: STEP_BY_MIDI_INDEX[pitchIndex] as NoteStep,
  };
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

const MUSIC_XML_BASE_DURATION_UNITS = [
  { duration: 'whole', units: 32 },
  { duration: 'half', units: 16 },
  { duration: 'quarter', units: 8 },
  { duration: 'eighth', units: 4 },
  { duration: 'sixteenth', units: 2 },
  { duration: 'thirtySecond', units: 1 },
  { duration: 'sixtyFourth', units: 0.5 },
] satisfies Array<{ duration: DurationValue; units: number }>;
const MUSIC_XML_DOT_MULTIPLIERS = [1, 1.5, 1.75, 1.875] as const;
const MUSIC_XML_DURATION_CANDIDATES = MUSIC_XML_BASE_DURATION_UNITS.flatMap(
  ({ duration, units }) =>
    MUSIC_XML_DOT_MULTIPLIERS.map((multiplier, dots) => ({
      dots,
      duration,
      units: units * multiplier,
    })),
);
const MUSIC_XML_DURATION_BY_TYPE = new Map<string, DurationValue>([
  ['whole', 'whole'],
  ['half', 'half'],
  ['quarter', 'quarter'],
  ['eighth', 'eighth'],
  ['8th', 'eighth'],
  ['16th', 'sixteenth'],
  ['sixteenth', 'sixteenth'],
  ['32nd', 'thirtySecond'],
  ['thirty-second', 'thirtySecond'],
  ['64th', 'sixtyFourth'],
  ['sixty-fourth', 'sixtyFourth'],
]);

function getDirectChild(parent: Element, localName: string) {
  return [...parent.children].find((child) => child.localName === localName) ??
    null;
}

function getDirectChildren(parent: Element, localName: string) {
  return [...parent.children].filter((child) => child.localName === localName);
}

function getDirectChildText(parent: Element, localName: string) {
  return getDirectChild(parent, localName)?.textContent?.trim() ?? '';
}

function parseMusicXmlDocument(xml: string) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('MusicXML import requires DOMParser support');
  }

  const document = new DOMParser().parseFromString(xml, 'application/xml');

  if (document.querySelector('parsererror')) {
    throw new Error('Invalid MusicXML document');
  }

  return document;
}

function getMusicXmlDurationUnits(
  parent: Element,
  divisions: number,
  warnings: string[],
) {
  const durationValue = Number(getTextContent(parent, 'duration'));

  if (!Number.isFinite(durationValue) || durationValue <= 0) {
    warnings.push('Skipped a MusicXML duration with invalid value');
    return 0;
  }

  return (durationValue / Math.max(1, divisions)) * ABC_UNITS_PER_QUARTER;
}

function getMusicXmlDuration(
  units: number,
  warnings: string[],
): MusicXmlDuration {
  const normalizedUnits = Math.max(0.5, units);
  const duration = MUSIC_XML_DURATION_CANDIDATES.reduce((best, candidate) =>
    Math.abs(candidate.units - normalizedUnits) <
    Math.abs(best.units - normalizedUnits)
      ? candidate
      : best,
  );

  if (!duration) {
    warnings.push(`Unsupported MusicXML duration units "${units}", using 1/64`);
    return { duration: 'sixtyFourth', dots: 0 };
  }

  return {
    dots: duration.dots,
    duration: duration.duration,
  };
}

function getMusicXmlGraceDuration(note: Element): DurationValue {
  return (
    MUSIC_XML_DURATION_BY_TYPE.get(getTextContent(note, 'type').toLowerCase()) ??
    'sixteenth'
  );
}

function getMusicXmlDirectChildCount(parent: Element, localName: string) {
  return [...parent.children].filter((child) => child.localName === localName).length;
}

function getMusicXmlNotatedDuration(note: Element): MusicXmlDuration | null {
  const duration = MUSIC_XML_DURATION_BY_TYPE.get(
    getTextContent(note, 'type').toLowerCase(),
  );

  return duration
    ? {
        dots: Math.min(3, getMusicXmlDirectChildCount(note, 'dot')),
        duration,
      }
    : null;
}

function getMusicXmlEventDuration(
  note: Element,
  durationUnits: number,
  warnings: string[],
): MusicXmlDuration {
  if (note.querySelector('time-modification')) {
    return getMusicXmlNotatedDuration(note) ?? getMusicXmlDuration(durationUnits, warnings);
  }

  return getMusicXmlDuration(durationUnits, warnings);
}

function getMusicXmlTupletSpec(note: Element) {
  const timeModification = note.querySelector('time-modification');

  if (!timeModification) {
    return null;
  }

  const actualNotes = Number(getTextContent(timeModification, 'actual-notes'));
  const normalNotes = Number(getTextContent(timeModification, 'normal-notes'));

  if (
    !Number.isInteger(actualNotes) ||
    actualNotes < 2 ||
    actualNotes > 9 ||
    !Number.isInteger(normalNotes) ||
    normalNotes < 1
  ) {
    return null;
  }

  return {
    actualNotes,
    normalNotes,
  };
}

function getMusicXmlTupletBoundary(note: Element) {
  const tuplet = note.querySelector('notations tuplet');
  const type = tuplet?.getAttribute('type');

  return type === 'start' || type === 'stop' ? type : null;
}

function getMusicXmlTupletInfo({
  eventCounter,
  measureIndex,
  note,
  staffId,
  stateKey,
  states,
}: {
  eventCounter: number;
  measureIndex: number;
  note: Element;
  staffId: StaffId;
  stateKey: string;
  states: Map<string, MusicXmlTupletState>;
}): TupletInfo | undefined {
  const spec = getMusicXmlTupletSpec(note);

  if (!spec) {
    return undefined;
  }

  const boundary = getMusicXmlTupletBoundary(note);
  let state = states.get(stateKey);

  if (
    !state ||
    boundary === 'start' ||
    state.actualNotes !== spec.actualNotes ||
    state.normalNotes !== spec.normalNotes ||
    state.index >= spec.actualNotes
  ) {
    state = {
      ...spec,
      id: `xml-tuplet-${measureIndex + 1}-${stateKey}-${eventCounter}`,
      index: 0,
    };
  }

  const tuplet = {
    actualNotes: spec.actualNotes,
    id: state.id,
    index: Math.min(state.index, spec.actualNotes - 1),
    normalNotes: spec.normalNotes,
  };
  const nextState = {
    ...state,
    index: state.index + 1,
  };

  if (boundary === 'stop' || nextState.index >= spec.actualNotes) {
    states.delete(stateKey);
  } else {
    states.set(stateKey, nextState);
  }

  return tuplet;
}

function isMusicXmlGraceNote(note: Element) {
  return Boolean(getDirectChild(note, 'grace'));
}

function parseMusicXmlPercentAttribute(element: Element, attribute: string) {
  const value = Number(element.getAttribute(attribute));

  return Number.isFinite(value) && value > 0 ? value / 100 : undefined;
}

function musicXmlGraceNoteHasSlurToMain(note: Element) {
  return [...note.querySelectorAll('notations slur')].some(
    (slur) => slur.getAttribute('type') === 'start',
  );
}

function createMusicXmlGraceNote(note: Element, pitch: Pitch): GraceNoteAttachment {
  const grace = getDirectChild(note, 'grace');
  const slash = grace?.getAttribute('slash') === 'yes';
  const stealTimeFromPrevious = grace
    ? parseMusicXmlPercentAttribute(grace, 'steal-time-previous')
    : undefined;
  const stealTimeFromFollowing = grace
    ? parseMusicXmlPercentAttribute(grace, 'steal-time-following')
    : undefined;
  const makeTime = grace
    ? parseMusicXmlPercentAttribute(grace, 'make-time')
    : undefined;
  const kind = slash ? 'acciaccatura' : 'appoggiatura';

  return createGraceNoteAttachment({
    displayDuration: getMusicXmlGraceDuration(note),
    kind,
    playback: {
      durationRatio: stealTimeFromFollowing ?? makeTime,
      stealTimeFrom: stealTimeFromFollowing
        ? 'main'
        : stealTimeFromPrevious
          ? 'previous'
          : kind === 'appoggiatura'
            ? 'main'
            : 'none',
      timing:
        kind === 'appoggiatura' || stealTimeFromFollowing
          ? 'onBeat'
          : 'beforeBeat',
    },
    pitches: [pitch],
    slash,
    slurToMain: musicXmlGraceNoteHasSlurToMain(note),
  });
}

function parseMusicXmlStaffId(element: Element, fallback: StaffId): StaffId {
  const staff = getDirectChildText(element, 'staff') || getTextContent(element, 'staff');

  if (staff === '1') {
    return 'treble';
  }

  return staff === '2' ? 'bass' : fallback;
}

function parseMusicXmlPitch(note: Element): Pitch | null {
  const pitch = note.querySelector('pitch');

  if (!pitch) {
    return null;
  }

  const step = getTextContent(pitch, 'step') as NoteStep;
  const octave = Number(getTextContent(pitch, 'octave') || 4);
  const alter = Number(getTextContent(pitch, 'alter') || 0);
  const accidental: Accidental | undefined =
    alter > 0 ? 'sharp' : alter < 0 ? 'flat' : undefined;

  if (!['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(step)) {
    return null;
  }

  return {
    accidental,
    octave: Number.isFinite(octave) ? octave : 4,
    step,
  };
}

const MUSIC_XML_ARTICULATION_BY_NAME: Partial<Record<string, ArticulationKind>> = {
  accent: 'accent',
  'breath-mark': 'breath',
  caesura: 'caesura',
  staccatissimo: 'staccatissimo',
  staccato: 'staccato',
  'strong-accent': 'marcato',
  tenuto: 'tenuto',
};

function getMusicXmlVoiceLabel(note: Element) {
  return getDirectChildText(note, 'voice') || '1';
}

function getMusicXmlArticulations(note: Element) {
  const articulations = note.querySelector('notations > articulations');

  if (!articulations) {
    return undefined;
  }

  const kinds = [...articulations.children].flatMap((child) => {
    const kind = MUSIC_XML_ARTICULATION_BY_NAME[child.localName];

    return kind ? [kind] : [];
  });

  return kinds.length > 0 ? [...new Set(kinds)] : undefined;
}

function getMusicXmlBoundaryType(element: Element) {
  const type = element.getAttribute('type');

  if (type === 'start' || type === 'stop') {
    return [type] as const;
  }

  if (type === 'continue') {
    return ['stop', 'start'] as const;
  }

  return [] as const;
}

function getMusicXmlNoteMarks(note: Element): MusicXmlNoteMarks {
  const slurs = [...note.querySelectorAll('notations slur')].flatMap((slur) =>
    getMusicXmlBoundaryType(slur).map((type) => ({
      id: slur.getAttribute('number') || '1',
      type,
    })),
  );
  const ties = [
    ...getDirectChildren(note, 'tie'),
    ...note.querySelectorAll('notations tied'),
  ].flatMap((tie) => [...getMusicXmlBoundaryType(tie)]);

  return {
    arpeggio: Boolean(note.querySelector('notations arpeggiate')),
    articulations: getMusicXmlArticulations(note),
    fermata: Boolean(note.querySelector('notations fermata')),
    slurs,
    ties: [...new Set(ties)],
  };
}

function getMusicXmlPitchConnectionKey(
  staffId: StaffId,
  voiceIndex: number,
  pitch: Pitch,
) {
  return `${staffId}:${voiceIndex}:${pitch.step}:${pitch.accidental ?? ''}:${pitch.octave}`;
}

function appendTieMark(event: ScoreEvent, tie: TieMark) {
  event.ties = [...(event.ties ?? []), tie];
}

function appendSlurMark(event: ScoreEvent, slur: SlurMark) {
  event.slurs = [...(event.slurs ?? []), slur];
}

function mergeMusicXmlMarksIntoEvent(event: ScoreEvent, marks: MusicXmlNoteMarks) {
  if (marks.arpeggio) {
    event.arpeggio = true;
  }

  if (marks.fermata) {
    event.fermata = true;
  }

  if (marks.articulations?.length) {
    event.articulations = [
      ...new Set([...(event.articulations ?? []), ...marks.articulations]),
    ];
  }
}

function parseMusicXmlClef(clef: Element): Clef | null {
  const sign = getDirectChildText(clef, 'sign');

  if (sign === 'G') {
    return 'treble';
  }

  if (sign === 'F') {
    return 'bass';
  }

  return null;
}

function parseMusicXmlClefStaffId(clef: Element, fallback: StaffId): StaffId {
  const number = clef.getAttribute('number') ?? '';

  if (number === '1') {
    return 'treble';
  }

  return number === '2' ? 'bass' : fallback;
}

function getMusicXmlLyric(note: Element) {
  return getTextContent(note, 'lyric text') || undefined;
}

function getMusicXmlPartStaffCount(part: Element | null) {
  if (!part) {
    return 1;
  }

  const declaredStaves = Number(getTextContent(part, 'attributes staves'));

  if (Number.isFinite(declaredStaves) && declaredStaves > 1) {
    return declaredStaves;
  }

  return part.querySelector('staff')?.textContent?.trim() === '2' ||
    Boolean([...part.querySelectorAll('staff')].find((staff) => staff.textContent?.trim() === '2'))
    ? 2
    : 1;
}

function getMusicXmlScoreTitle(document: Document) {
  return (
    getTextContent(document, 'work-title') ||
    getTextContent(document, 'movement-title') ||
    'Imported MusicXML Score'
  );
}

function getMusicXmlComposer(document: Document) {
  return document.querySelector('creator[type="composer"]')?.textContent?.trim() ??
    getTextContent(document, 'creator');
}

function getMusicXmlCreditLayouts(document: Document): ImportedCreditLayout[] {
  return [...document.querySelectorAll('credit')].reduce<ImportedCreditLayout[]>(
    (credits, credit) => {
      const words = getDirectChildren(credit, 'credit-words');
      const lines = words
        .map((word) => word.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter((line) => line.length > 0);
      const firstWord = words[0] ?? null;
      const page = Number(credit.getAttribute('page') ?? '1');
      const fontSize = Number(firstWord?.getAttribute('font-size') ?? '');

      if (lines.length === 0) {
        return credits;
      }

      credits.push({
        fontFamily: firstWord?.getAttribute('font-family') ?? undefined,
        fontSize: Number.isFinite(fontSize) && fontSize > 0
          ? fontSize
          : undefined,
        fontStyle: firstWord?.getAttribute('font-style') ?? undefined,
        fontWeight: firstWord?.getAttribute('font-weight') ?? undefined,
        justify: firstWord?.getAttribute('justify') ?? undefined,
        lines,
        page: Number.isFinite(page) && page >= 1 ? Math.round(page) : 1,
        type: getDirectChildText(credit, 'credit-type') || 'other',
        valign: firstWord?.getAttribute('valign') ?? undefined,
      });

      return credits;
    },
    [],
  );
}

function getMusicXmlOptionalNumber(value: string | null | undefined) {
  const number = Number(value);

  return Number.isFinite(number) ? number : undefined;
}

function getMusicXmlOptionalElementNumber(
  parent: Element | null,
  selector: string,
) {
  return parent
    ? getMusicXmlOptionalNumber(parent.querySelector(selector)?.textContent?.trim())
    : undefined;
}

function parseMusicXmlMeasureLayout(
  measure: Element,
  measureIndex: number,
): ImportedMeasureLayout | null {
  const print = getDirectChild(measure, 'print');
  const systemLayout = print?.querySelector('system-layout') ?? null;
  const staffLayout = print?.querySelector('staff-layout[number="2"]') ??
    print?.querySelector('staff-layout') ??
    null;
  const layout: ImportedMeasureLayout = {
    measureIndex,
  };
  const xmlWidth = getMusicXmlOptionalNumber(measure.getAttribute('width'));
  const systemDistance = getMusicXmlOptionalElementNumber(
    systemLayout,
    'system-distance',
  );
  const topSystemDistance = getMusicXmlOptionalElementNumber(
    systemLayout,
    'top-system-distance',
  );
  const staffDistance = getMusicXmlOptionalElementNumber(
    staffLayout,
    'staff-distance',
  );

  if (xmlWidth !== undefined && xmlWidth > 0) {
    layout.xmlWidth = xmlWidth;
  }

  if (print?.getAttribute('new-page') === 'yes') {
    layout.pageBreakBefore = measureIndex > 0;
  }

  if (print?.getAttribute('new-system') === 'yes') {
    layout.systemBreakBefore = measureIndex > 0;
  }

  if (systemDistance !== undefined) {
    layout.systemDistance = systemDistance;
  }

  if (topSystemDistance !== undefined) {
    layout.topSystemDistance = topSystemDistance;
  }

  if (staffDistance !== undefined) {
    layout.staffDistance = staffDistance;
  }

  return Object.keys(layout).length > 1 ? layout : null;
}

function getMusicXmlImportedMeasureLayouts(
  part: Element | null,
): ImportedMeasureLayout[] {
  return part
    ? [...part.querySelectorAll(':scope > measure')]
        .map((measure, measureIndex) =>
          parseMusicXmlMeasureLayout(measure, measureIndex),
        )
        .filter((layout): layout is ImportedMeasureLayout => Boolean(layout))
    : [];
}

function createMusicXmlEvent({
  beat,
  duration,
  eventCounter,
  graceNotes,
  isRest,
  lyric,
  pitch,
  tuplet,
}: {
  beat: number;
  duration: MusicXmlDuration;
  eventCounter: number;
  graceNotes?: GraceNoteAttachment[];
  isRest: boolean;
  lyric?: string;
  pitch: Pitch | null;
  tuplet?: TupletInfo;
}): ScoreEvent {
  const base = {
    beat,
    dots: duration.dots || undefined,
    duration: duration.duration,
    id: `xml-${eventCounter}`,
    lyric,
    tuplet,
  };

  if (isRest || !pitch) {
    return {
      ...base,
      kind: 'rest',
    };
  }

  return {
    ...base,
    graceNotes: normalizeGraceNotes(graceNotes, base.id),
    kind: 'note',
    pitch,
  };
}

function appendPitchToMusicXmlEvent(event: ScoreEvent, pitch: Pitch) {
  if (event.kind === 'chord') {
    return {
      ...event,
      pitches: [...event.pitches, pitch],
    };
  }

  if (event.kind === 'note') {
    const { pitch: previousPitch, ...base } = event;

    return {
      ...base,
      kind: 'chord',
      pitches: [previousPitch, pitch],
    } satisfies ScoreEvent;
  }

  return event;
}

function getDirectionBeat(direction: Element, cursorUnits: number, divisions: number) {
  const offset = Number(getTextContent(direction, 'offset'));
  const offsetUnits = Number.isFinite(offset)
    ? getClosestAbcUnits(offset / Math.max(1, divisions))
    : 0;

  return Math.max(0, cursorUnits + offsetUnits) / ABC_UNITS_PER_QUARTER;
}

function getMusicXmlDirectionPlacement(
  direction: Element,
  element?: Element | null,
): AnnotationPlacementSide | undefined {
  const explicitPlacement = direction.getAttribute('placement');

  if (explicitPlacement === 'above' || explicitPlacement === 'below') {
    return explicitPlacement;
  }

  const defaultY = getMusicXmlOptionalNumber(element?.getAttribute('default-y'));

  if (defaultY !== undefined) {
    return defaultY < 0 ? 'below' : 'above';
  }

  return undefined;
}

function getMusicXmlOctaveShiftKind(
  type: string,
  size: string,
  placement?: AnnotationPlacementSide,
): OttavaKind | undefined {
  if (type !== 'up' && type !== 'down') {
    return undefined;
  }

  const isBelow = placement === 'below' || (!placement && type === 'down');

  if (size === '15') {
    return isBelow ? '15mb' : '15ma';
  }

  return isBelow ? '8vb' : '8va';
}

function getMusicXmlDirectionText(direction: Element, localName: string) {
  return [...direction.querySelectorAll(localName)]
    .map((element) => element.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .trim();
}

function parseMusicXmlDirection(
  direction: Element,
  cursorUnits: number,
  divisions: number,
  fallbackStaffId: StaffId,
) {
  const dynamicElement = direction.querySelector('dynamics')?.firstElementChild;
  const pedalElement = direction.querySelector('pedal');
  const wedgeElement = direction.querySelector('wedge');
  const octaveShiftElement = direction.querySelector('octave-shift');
  const staffId = parseMusicXmlStaffId(direction, fallbackStaffId);
  const pedalType = pedalElement?.getAttribute('type') ?? '';
  const wedgeType = wedgeElement?.getAttribute('type') ?? '';
  const octaveShiftType = octaveShiftElement?.getAttribute('type') ?? '';
  const words = getMusicXmlDirectionText(direction, 'words');
  const rehearsal = getMusicXmlDirectionText(direction, 'rehearsal');
  const pedal: PedalMark | undefined =
    pedalType === 'start'
      ? 'start'
      : pedalType === 'stop'
        ? 'release'
        : pedalType === 'change'
          ? 'start-release'
          : undefined;
  const pedalLineAttribute = pedalElement?.getAttribute('line');
  const pedalLine = pedal
    ? pedalLineAttribute === 'no'
      ? false
      : pedalLineAttribute === 'yes'
        ? true
        : undefined
    : undefined;
  const hairpin: HairpinMark | undefined =
    wedgeType === 'crescendo'
      ? 'crescendo'
      : wedgeType === 'diminuendo'
        ? 'diminuendo'
        : undefined;
  const wedge: MusicXmlWedgeMark | undefined =
    wedgeType === 'crescendo' || wedgeType === 'diminuendo' || wedgeType === 'stop'
      ? {
          hairpin,
          number: wedgeElement?.getAttribute('number') || '1',
          placement: getMusicXmlDirectionPlacement(direction, wedgeElement),
          type: wedgeType,
        }
      : undefined;
  const octavePlacement = getMusicXmlDirectionPlacement(
    direction,
    octaveShiftElement,
  );
  const octaveShift: MusicXmlOctaveShiftMark | undefined =
    octaveShiftType === 'up' ||
    octaveShiftType === 'down' ||
    octaveShiftType === 'stop'
      ? {
          kind: getMusicXmlOctaveShiftKind(
            octaveShiftType,
            octaveShiftElement?.getAttribute('size') ?? '8',
            octavePlacement,
          ),
          number: octaveShiftElement?.getAttribute('number') || '1',
          placement: octavePlacement,
          type: octaveShiftType,
        }
      : undefined;

  if (
    !dynamicElement &&
    !pedal &&
    !hairpin &&
    !octaveShift &&
    !rehearsal &&
    !wedge &&
    !words
  ) {
    return null;
  }

  return {
    beat: getDirectionBeat(direction, cursorUnits, divisions),
    dynamic: dynamicElement?.localName,
    hairpin,
    octaveShift,
    pedal,
    pedalLine,
    rehearsal,
    staffId,
    wedge,
    words,
  } satisfies MusicXmlDirectionMark;
}

function findDirectionTargetEvent(
  contexts: MusicXmlDirectionTargetContext[],
  beat: number,
) {
  return contexts
    .filter(({ event }) => event.kind !== 'rest')
    .sort((first, second) => {
      const firstIsAfter = first.event.beat >= beat ? 0 : 1;
      const secondIsAfter = second.event.beat >= beat ? 0 : 1;

      return firstIsAfter - secondIsAfter ||
        Math.abs(first.event.beat - beat) - Math.abs(second.event.beat - beat);
    })[0] ?? null;
}

function applyMusicXmlDirectionMarks(
  eventsByMeasure: Map<string, ScoreEvent[]>,
  measureIndex: number,
  marks: readonly MusicXmlDirectionMark[],
  handlers?: {
    onHairpinDirection?: (
      mark: MusicXmlDirectionMark,
      target: MusicXmlDirectionTargetContext,
    ) => void;
    onOctaveShiftDirection?: (
      mark: MusicXmlDirectionMark,
      target: MusicXmlDirectionTargetContext,
    ) => void;
    onRehearsal?: (mark: MusicXmlDirectionMark) => void;
  },
) {
  marks.forEach((mark) => {
    const contexts = [...eventsByMeasure.entries()]
      .filter(([key]) => key.startsWith(`${mark.staffId}:${measureIndex}:`))
      .flatMap(([key, measureEvents]) => {
        const [, , voiceIndexText] = key.split(':');
        const voiceIndex = Number(voiceIndexText);

        return measureEvents.map((event) => ({
          event,
          measureIndex,
          staffId: mark.staffId,
          voiceIndex: Number.isInteger(voiceIndex) ? voiceIndex : 0,
        }));
      });
    const target = findDirectionTargetEvent(contexts, mark.beat);

    if (mark.rehearsal) {
      handlers?.onRehearsal?.(mark);
    }

    if (!target) {
      return;
    }

    if (mark.dynamic) {
      target.event.dynamic = mark.dynamic;
    }

    if (mark.pedal) {
      target.event.pedal = mergePedalMark(target.event.pedal, mark.pedal);
      if (mark.pedalLine !== undefined) {
        target.event.pedalLine = mark.pedalLine;
      }
    }

    if (mark.hairpin) {
      target.event.hairpin = mark.hairpin;
    }

    if (mark.words) {
      target.event.chordSymbol = target.event.chordSymbol
        ? `${target.event.chordSymbol} ${mark.words}`
        : mark.words;
      target.event.annotationPlacements = {
        ...(target.event.annotationPlacements ?? {}),
        chordSymbol: 'above',
      };
    }

    if (mark.wedge) {
      handlers?.onHairpinDirection?.(mark, target);
    }

    if (mark.octaveShift) {
      handlers?.onOctaveShiftDirection?.(mark, target);
    }
  });
}

export function analyzeMusicXml(
  xml: string,
  fileName = 'Imported MusicXML Score',
): MusicXmlImportAnalysis {
  const document = parseMusicXmlDocument(xml);
  const partElements = [...document.querySelectorAll('part')];
  const firstPart = partElements[0] ?? null;
  const staffCount = Math.max(
    getMusicXmlPartStaffCount(firstPart),
    partElements.length > 1 ? 2 : 1,
  );
  const staffNoteCounts: Partial<Record<StaffId, number>> = {};

  [...document.querySelectorAll('note')].forEach((note) => {
    if (!note.querySelector('pitch')) {
      return;
    }

    const staffId = parseMusicXmlStaffId(note, staffCount > 1 ? 'treble' : 'treble');
    staffNoteCounts[staffId] = (staffNoteCounts[staffId] ?? 0) + 1;
  });

  return {
    backupCount: document.querySelectorAll('backup').length,
    directionCount: document.querySelectorAll('direction').length,
    dynamicCount: document.querySelectorAll('dynamics').length,
    fileName,
    hairpinCount: document.querySelectorAll('wedge').length,
    lyricCount: document.querySelectorAll('lyric').length,
    measureCount: firstPart?.querySelectorAll(':scope > measure').length ??
      document.querySelectorAll('measure').length,
    noteCount: document.querySelectorAll('note').length,
    partCount: partElements.length,
    pedalCount: document.querySelectorAll('pedal').length,
    restCount: document.querySelectorAll('rest').length,
    staffCount,
    staffNoteCounts,
    voiceCount: document.querySelectorAll('voice').length,
  };
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
  const warnings: string[] = [];
  const document = parseMusicXmlDocument(xml);
  const title = getMusicXmlScoreTitle(document);
  const composer = getMusicXmlComposer(document);
  const firstMeasure = document.querySelector('part measure');
  const beats = Number(getTextContent(firstMeasure ?? document, 'time beats') || 4);
  const beatType = Number(getTextContent(firstMeasure ?? document, 'time beat-type') || 4);
  const timeSignature = {
    beatUnit: Number.isFinite(beatType) ? beatType : 4,
    beats: Number.isFinite(beats) ? beats : 4,
  };
  const key = getMusicXmlKey(
    (firstMeasure ?? document).querySelector('key fifths')?.textContent?.trim() ?? null,
  );
  const tempo = getMusicXmlTempo(document);
  const partElements = [...document.querySelectorAll('part')];
  const firstPart = partElements[0] ?? null;
  const firstPartStaffCount = getMusicXmlPartStaffCount(firstPart);
  const scoreType = firstPartStaffCount > 1 || partElements.length > 1
    ? 'grand'
    : 'treble';
  const measureCount = Math.max(
    4,
    ...(firstPartStaffCount > 1
      ? [firstPart?.querySelectorAll(':scope > measure').length ?? 0]
      : partElements.slice(0, 2).map((part) =>
          part.querySelectorAll(':scope > measure').length,
        )),
  );
  const importedMeasureLayouts = getMusicXmlImportedMeasureLayouts(firstPart);
  const importedCredits = getMusicXmlCreditLayouts(document);
  const importedLayout = importedMeasureLayouts.length > 0 ||
    importedCredits.length > 0
    ? {
        ...(importedCredits.length > 0 ? { credits: importedCredits } : {}),
        measureLayouts: importedMeasureLayouts,
        source: 'musicxml' as const,
      }
    : undefined;
  const baseScore = createEmptyScore(scoreType, {
    composer,
    measureCount,
    tempo,
    timeSignature,
    title,
  });
  const scoreWithKey = setMeasureKeySignature(baseScore, 0, key);
  const eventsByMeasure = new Map<string, ScoreEvent[]>();
  const clefChangesByMeasure = new Map<string, ClefChange[]>();
  const eventById = new Map<string, ScoreEvent>();
  const pendingSlurByKey = new Map<string, { eventId: string }>();
  const pendingTieByPitch = new Map<string, MusicXmlConnectionSource>();
  const pendingHairpinByKey = new Map<
    string,
    {
      hairpin: HairpinMark;
      placement?: AnnotationPlacementSide;
      sourceEventId: string;
      start: ScorePosition;
    }
  >();
  const pendingOttavaByKey = new Map<
    string,
    {
      kind: OttavaKind;
      placement?: AnnotationPlacementSide;
      sourceEventId: string;
      start: ScorePosition;
    }
  >();
  const importedMarks: NotationMark[] = [];
  const sectionMarkersByMeasure = new Map<number, string>();
  const voiceIndexesByStaff = new Map<StaffId, Map<string, number>>();
  const activeClefByStaff = new Map<StaffId, Clef>([
    ['bass', 'bass'],
    ['treble', 'treble'],
  ]);
  let eventCounter = 1;

  function getMusicXmlVoiceIndex(staffId: StaffId, note: Element) {
    const voiceLabel = getMusicXmlVoiceLabel(note);
    const indexesByLabel = voiceIndexesByStaff.get(staffId) ?? new Map<string, number>();

    if (!voiceIndexesByStaff.has(staffId)) {
      voiceIndexesByStaff.set(staffId, indexesByLabel);
    }

    if (!indexesByLabel.has(voiceLabel)) {
      indexesByLabel.set(voiceLabel, indexesByLabel.size);
    }

    return indexesByLabel.get(voiceLabel) ?? 0;
  }

  function getMeasureVoiceKey(
    staffId: StaffId,
    measureIndex: number,
    voiceIndex: number,
  ) {
    return `${staffId}:${measureIndex}:${voiceIndex}`;
  }

  function getMeasureEvents(
    staffId: StaffId,
    measureIndex: number,
    voiceIndex: number,
  ) {
    const key = getMeasureVoiceKey(staffId, measureIndex, voiceIndex);
    const events = eventsByMeasure.get(key) ?? [];

    eventsByMeasure.set(key, events);
    return events;
  }

  function registerEvent(event: ScoreEvent) {
    eventById.set(event.id, event);
  }

  function getDirectionTargetStartPosition(
    target: MusicXmlDirectionTargetContext,
  ): ScorePosition {
    return {
      beat: target.event.beat,
      measureIndex: target.measureIndex,
      staffId: target.staffId,
      voiceIndex: target.voiceIndex,
    };
  }

  function getDirectionTargetEndPosition(
    target: MusicXmlDirectionTargetContext,
  ): ScorePosition {
    return {
      beat: target.event.beat + getEventDurationBeats(target.event),
      measureIndex: target.measureIndex,
      staffId: target.staffId,
      voiceIndex: target.voiceIndex,
    };
  }

  function applyImportedHairpinDirection(
    mark: MusicXmlDirectionMark,
    target: MusicXmlDirectionTargetContext,
  ) {
    if (!mark.wedge) {
      return;
    }

    const key = `${mark.staffId}:${mark.wedge.number}`;

    if (mark.wedge.type === 'crescendo' || mark.wedge.type === 'diminuendo') {
      if (!mark.wedge.hairpin) {
        return;
      }

      pendingHairpinByKey.set(key, {
        hairpin: mark.wedge.hairpin,
        placement: mark.wedge.placement ?? 'below',
        sourceEventId: target.event.id,
        start: getDirectionTargetStartPosition(target),
      });
      return;
    }

    const source = pendingHairpinByKey.get(key);

    if (!source || source.sourceEventId === target.event.id) {
      pendingHairpinByKey.delete(key);
      return;
    }

    importedMarks.push({
      end: getDirectionTargetEndPosition(target),
      hairpin: source.hairpin,
      id: `xml-hairpin-${source.sourceEventId}-${target.event.id}-${mark.wedge.number}`,
      kind: 'hairpin',
      placement: source.placement,
      scope: 'range',
      sourceEventId: source.sourceEventId,
      start: source.start,
      targetEventId: target.event.id,
    } satisfies RangeNotationMark);
    pendingHairpinByKey.delete(key);
  }

  function applyImportedOctaveShiftDirection(
    mark: MusicXmlDirectionMark,
    target: MusicXmlDirectionTargetContext,
  ) {
    if (!mark.octaveShift) {
      return;
    }

    const key = `${mark.staffId}:${mark.octaveShift.number}`;

    if (mark.octaveShift.type === 'up' || mark.octaveShift.type === 'down') {
      if (!mark.octaveShift.kind) {
        return;
      }

      pendingOttavaByKey.set(key, {
        kind: mark.octaveShift.kind,
        placement:
          mark.octaveShift.placement ??
          (mark.octaveShift.kind.endsWith('b') ? 'below' : 'above'),
        sourceEventId: target.event.id,
        start: getDirectionTargetStartPosition(target),
      });
      return;
    }

    const source = pendingOttavaByKey.get(key);

    if (!source || source.sourceEventId === target.event.id) {
      pendingOttavaByKey.delete(key);
      return;
    }

    importedMarks.push({
      end: getDirectionTargetEndPosition(target),
      id: `xml-ottava-${source.sourceEventId}-${target.event.id}-${mark.octaveShift.number}`,
      kind: 'ottava',
      ottava: source.kind,
      placement: source.placement,
      scope: 'range',
      sourceEventId: source.sourceEventId,
      start: source.start,
      targetEventId: target.event.id,
    } satisfies RangeNotationMark);
    pendingOttavaByKey.delete(key);
  }

  function addClefChange(
    staffId: StaffId,
    measureIndex: number,
    beat: number,
    clef: Clef,
    clefIndex: number,
  ) {
    if (activeClefByStaff.get(staffId) === clef) {
      return;
    }

    activeClefByStaff.set(staffId, clef);
    const key = `${staffId}:${measureIndex}`;
    const changes = clefChangesByMeasure.get(key) ?? [];

    changes.push({
      beat,
      clef,
      id: `xml-clef-${staffId}-${measureIndex + 1}-${beat.toFixed(4)}-${clefIndex}-${clef}`,
    });
    clefChangesByMeasure.set(key, changes);
  }

  function applyMusicXmlAttributeClefChanges(
    attributes: Element,
    measureIndex: number,
    cursorUnits: number,
    divisions: number,
    fallbackStaffId: StaffId,
  ) {
    getDirectChildren(attributes, 'clef').forEach((clefElement, clefIndex) => {
      const nextClef = parseMusicXmlClef(clefElement);

      if (!nextClef) {
        return;
      }

      const staffId = parseMusicXmlClefStaffId(clefElement, fallbackStaffId);
      const beat = cursorUnits / ABC_UNITS_PER_QUARTER;

      addClefChange(staffId, measureIndex, beat, nextClef, clefIndex);
    });
  }

  function applyMusicXmlNoteConnections({
    event,
    marks,
    pitch,
    pitchIndex,
    staffId,
    voiceIndex,
  }: {
    event: ScoreEvent;
    marks: MusicXmlNoteMarks;
    pitch: Pitch;
    pitchIndex: number;
    staffId: StaffId;
    voiceIndex: number;
  }) {
    const pitchConnectionKey = getMusicXmlPitchConnectionKey(
      staffId,
      voiceIndex,
      pitch,
    );

    if (marks.ties.includes('stop')) {
      const source = pendingTieByPitch.get(pitchConnectionKey);
      const sourceEvent = source ? eventById.get(source.eventId) : null;

      if (source && sourceEvent && sourceEvent.id !== event.id) {
        appendTieMark(sourceEvent, {
          pitchIndex: source.pitchIndex,
          targetEventId: event.id,
          targetPitchIndex: pitchIndex,
        });
      }
      pendingTieByPitch.delete(pitchConnectionKey);
    }

    if (marks.ties.includes('start')) {
      pendingTieByPitch.set(pitchConnectionKey, {
        eventId: event.id,
        pitchIndex,
      });
    }

    marks.slurs.forEach((slur) => {
      const slurKey = `${staffId}:${voiceIndex}:${slur.id}`;

      if (slur.type === 'stop') {
        const source = pendingSlurByKey.get(slurKey);
        const sourceEvent = source ? eventById.get(source.eventId) : null;

        if (source && sourceEvent && sourceEvent.id !== event.id) {
          appendSlurMark(sourceEvent, {
            id: `xml-slur-${source.eventId}-${event.id}-${slur.id}`,
            targetEventId: event.id,
          });
        }
        pendingSlurByKey.delete(slurKey);
        return;
      }

      pendingSlurByKey.set(slurKey, { eventId: event.id });
    });
  }

  function applyMusicXmlNoteMarks({
    event,
    note,
    pitch,
    pitchIndex,
    staffId,
    voiceIndex,
  }: {
    event: ScoreEvent;
    note: Element;
    pitch: Pitch | null;
    pitchIndex: number;
    staffId: StaffId;
    voiceIndex: number;
  }) {
    const marks = getMusicXmlNoteMarks(note);

    mergeMusicXmlMarksIntoEvent(event, marks);

    if (!pitch) {
      return;
    }

    applyMusicXmlNoteConnections({
      event,
      marks,
      pitch,
      pitchIndex,
      staffId,
      voiceIndex,
    });
  }

  function getImportedMeasureVoices(
    staffId: StaffId,
    measureIndex: number,
    existingVoices: Score['parts'][number]['staves'][number]['measures'][number]['voices'],
  ) {
    const voiceEntries = [...eventsByMeasure.entries()]
      .flatMap(([key, events]) => {
        const [keyStaffId, keyMeasureIndex, keyVoiceIndex] = key.split(':');

        return keyStaffId === staffId && Number(keyMeasureIndex) === measureIndex
          ? [
              {
                events,
                voiceIndex: Number(keyVoiceIndex),
              },
            ]
          : [];
      })
      .filter(({ voiceIndex }) => Number.isInteger(voiceIndex) && voiceIndex >= 0)
      .sort((first, second) => first.voiceIndex - second.voiceIndex);
    const maxVoiceIndex = Math.max(0, ...voiceEntries.map(({ voiceIndex }) => voiceIndex));
    const eventsByVoiceIndex = new Map(
      voiceEntries.map(({ events, voiceIndex }) => [voiceIndex, events]),
    );

    return Array.from({ length: maxVoiceIndex + 1 }, (_, voiceIndex) => ({
      ...(existingVoices[voiceIndex] ??
        createEmptyVoice(staffId, measureIndex, voiceIndex)),
      events: [...(eventsByVoiceIndex.get(voiceIndex) ?? [])].sort(
        (first, second) => first.beat - second.beat,
      ),
    }));
  }

  function parsePart(
    part: Element | undefined,
    forcedStaffId: StaffId | null,
  ) {
    if (!part) {
      return;
    }

    let divisions = 1;

    [...part.querySelectorAll(':scope > measure')].forEach((measure, measureIndex) => {
      let cursorUnits = 0;
      const directionMarks: MusicXmlDirectionMark[] = [];
      const lastEventByStaff = new Map<string, ScoreEvent>();
      const pendingGraceNotesByStaff = new Map<string, GraceNoteAttachment[]>();
      const tupletStatesByStaff = new Map<string, MusicXmlTupletState>();

      [...measure.children].forEach((child) => {
        if (child.localName === 'attributes') {
          const nextDivisions = Number(getTextContent(child, 'divisions'));

          if (Number.isFinite(nextDivisions) && nextDivisions > 0) {
            divisions = nextDivisions;
          }
          applyMusicXmlAttributeClefChanges(
            child,
            measureIndex,
            cursorUnits,
            divisions,
            forcedStaffId ?? 'treble',
          );
          return;
        }

        if (child.localName === 'backup') {
          cursorUnits = Math.max(
            0,
            cursorUnits - getMusicXmlDurationUnits(child, divisions, warnings),
          );
          return;
        }

        if (child.localName === 'forward') {
          cursorUnits += getMusicXmlDurationUnits(child, divisions, warnings);
          return;
        }

        if (child.localName === 'direction') {
          const direction = parseMusicXmlDirection(
            child,
            cursorUnits,
            divisions,
            forcedStaffId ?? 'bass',
          );

          if (direction) {
            directionMarks.push(direction);
          }
          return;
        }

        if (child.localName !== 'note') {
          return;
        }

        const isChord = Boolean(getDirectChild(child, 'chord'));
        const isGrace = isMusicXmlGraceNote(child);
        const isRest = Boolean(getDirectChild(child, 'rest'));
        const pitch = parseMusicXmlPitch(child);
        const staffId = forcedStaffId ??
          parseMusicXmlStaffId(child, scoreType === 'grand' ? 'treble' : 'treble');
        const voiceIndex = getMusicXmlVoiceIndex(staffId, child);
        const voiceKey = `${staffId}:${voiceIndex}`;
        const events = getMeasureEvents(staffId, measureIndex, voiceIndex);
        const lyric = getMusicXmlLyric(child);

        if (isGrace) {
          if (!pitch) {
            return;
          }

          const pendingGraceNotes = pendingGraceNotesByStaff.get(voiceKey) ?? [];

          if (isChord && pendingGraceNotes.length > 0) {
            pendingGraceNotes[pendingGraceNotes.length - 1]?.pitches.push(pitch);
          } else {
            pendingGraceNotes.push(createMusicXmlGraceNote(child, pitch));
          }
          pendingGraceNotesByStaff.set(voiceKey, pendingGraceNotes);
          return;
        }

        const durationUnits = getMusicXmlDurationUnits(child, divisions, warnings);
        const duration = getMusicXmlEventDuration(child, durationUnits, warnings);

        if (isChord && pitch) {
          const previousEvent = lastEventByStaff.get(voiceKey);
          const previousIndex = previousEvent
            ? events.findIndex((event) => event.id === previousEvent.id)
            : -1;

          if (previousEvent && previousIndex >= 0) {
            const nextEvent = appendPitchToMusicXmlEvent(previousEvent, pitch);
            const pitchIndex = Math.max(0, getEventPitches(nextEvent).length - 1);

            if (lyric && !nextEvent.lyric) {
              nextEvent.lyric = lyric;
            }
            events[previousIndex] = nextEvent;
            registerEvent(nextEvent);
            applyMusicXmlNoteMarks({
              event: nextEvent,
              note: child,
              pitch,
              pitchIndex,
              staffId,
              voiceIndex,
            });
            lastEventByStaff.set(voiceKey, nextEvent);
          }
          return;
        }

        const tuplet = getMusicXmlTupletInfo({
          eventCounter,
          measureIndex,
          note: child,
          staffId,
          stateKey: voiceKey,
          states: tupletStatesByStaff,
        });

        const event = createMusicXmlEvent({
          beat: cursorUnits / ABC_UNITS_PER_QUARTER,
          duration,
          eventCounter,
          graceNotes: pendingGraceNotesByStaff.get(voiceKey),
          isRest,
          lyric,
          pitch,
          tuplet,
        });

        eventCounter += 1;
        events.push(event);
        registerEvent(event);
        pendingGraceNotesByStaff.delete(voiceKey);
        applyMusicXmlNoteMarks({
          event,
          note: child,
          pitch,
          pitchIndex: 0,
          staffId,
          voiceIndex,
        });

        if (event.kind !== 'rest') {
          lastEventByStaff.set(voiceKey, event);
        }

        cursorUnits += durationUnits;
      });

      applyMusicXmlDirectionMarks(eventsByMeasure, measureIndex, directionMarks, {
        onHairpinDirection: applyImportedHairpinDirection,
        onOctaveShiftDirection: applyImportedOctaveShiftDirection,
        onRehearsal: (mark) => {
          if (mark.rehearsal) {
            sectionMarkersByMeasure.set(measureIndex, mark.rehearsal);
          }
        },
      });
    });
  }

  if (firstPartStaffCount > 1) {
    parsePart(firstPart ?? undefined, null);
  } else {
    parsePart(partElements[0], 'treble');
    parsePart(partElements[1], 'bass');
  }

  return {
    score: {
      ...scoreWithKey,
      importedLayout,
      marks: importedMarks.length > 0
        ? [...(scoreWithKey.marks ?? []), ...importedMarks]
        : scoreWithKey.marks,
      parts: scoreWithKey.parts.map((part) => ({
        ...part,
        staves: part.staves.map((staff) => ({
          ...staff,
          measures: staff.measures.map((measure) => ({
            ...measure,
            ...(clefChangesByMeasure.get(`${staff.id}:${measure.index}`)?.length
              ? {
                  clefChanges: clefChangesByMeasure.get(
                    `${staff.id}:${measure.index}`,
                  ),
                }
              : {}),
            ...(staff.id === 'treble' && sectionMarkersByMeasure.has(measure.index)
              ? {
                  sectionMarker: sectionMarkersByMeasure.get(measure.index),
                }
              : {}),
            voices: getImportedMeasureVoices(
              staff.id,
              measure.index,
              measure.voices,
            ),
          })),
        })),
      })),
    },
    warnings,
  };
}

function readUtf8(view: DataView, offset: number, length: number) {
  return new TextDecoder().decode(
    new Uint8Array(view.buffer, view.byteOffset + offset, length),
  );
}

async function inflateZipEntry(data: Uint8Array, compressionMethod: number) {
  if (compressionMethod === 0) {
    return data;
  }

  if (compressionMethod !== 8) {
    throw new Error(`Unsupported MXL compression method ${compressionMethod}`);
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('MXL import requires browser decompression support');
  }

  const entryBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(entryBuffer).set(data);
  const stream = new Blob([entryBuffer]).stream().pipeThrough(
    new DecompressionStream('deflate-raw'),
  );
  const buffer = await new Response(stream).arrayBuffer();

  return new Uint8Array(buffer);
}

async function readZipTextEntry(
  view: DataView,
  entry: {
    compressedSize: number;
    compressionMethod: number;
    localHeaderOffset: number;
  },
) {
  const localHeaderOffset = entry.localHeaderOffset;

  if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
    throw new Error('Invalid MXL local file header');
  }

  const localNameLength = view.getUint16(localHeaderOffset + 26, true);
  const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
  const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
  const compressedData = new Uint8Array(
    view.buffer,
    view.byteOffset + dataOffset,
    entry.compressedSize,
  );
  const data = await inflateZipEntry(compressedData, entry.compressionMethod);

  return new TextDecoder().decode(data);
}

function readMxlCentralDirectory(arrayBuffer: ArrayBuffer) {
  const view = new DataView(arrayBuffer);
  let endOfCentralDirectoryOffset = -1;

  for (
    let offset = Math.max(0, view.byteLength - 22);
    offset >= Math.max(0, view.byteLength - 65557);
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOfCentralDirectoryOffset = offset;
      break;
    }
  }

  if (endOfCentralDirectoryOffset < 0) {
    throw new Error('Invalid MXL zip directory');
  }

  const entryCount = view.getUint16(endOfCentralDirectoryOffset + 10, true);
  let offset = view.getUint32(endOfCentralDirectoryOffset + 16, true);
  const entries = new Map<
    string,
    {
      compressedSize: number;
      compressionMethod: number;
      localHeaderOffset: number;
    }
  >();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Invalid MXL central directory');
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileName = readUtf8(view, offset + 46, fileNameLength);

    entries.set(fileName, {
      compressedSize,
      compressionMethod,
      localHeaderOffset,
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return { entries, view };
}

export async function extractMusicXmlFromMxl(arrayBuffer: ArrayBuffer) {
  const entries = unzipSync(new Uint8Array(arrayBuffer));
  const decoder = new TextDecoder();
  const containerEntry = entries['META-INF/container.xml'];
  let rootPath = Object.keys(entries).find((name) =>
    /\.musicxml$|\.xml$/i.test(name) && !name.endsWith('container.xml'),
  );

  if (containerEntry) {
    const containerXml = decoder.decode(containerEntry);
    const containerDocument = parseMusicXmlDocument(containerXml);
    const containerRootPath = containerDocument
      .querySelector('rootfile[full-path]')
      ?.getAttribute('full-path');

    if (containerRootPath) {
      rootPath = containerRootPath;
    }
  }

  if (!rootPath) {
    throw new Error('MXL root MusicXML file not found');
  }

  const rootEntry = entries[rootPath];

  if (!rootEntry) {
    throw new Error(`MXL root file "${rootPath}" not found`);
  }

  return decoder.decode(rootEntry);
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

function getMidiNoteKey(note: MidiNoteEvent) {
  return `${note.trackIndex}:${note.channel}:${note.startTicks}:${note.midiNote}`;
}

function detectMidiGraceNoteCandidates({
  measureUnits,
  notes,
  ppq,
  trackStaffByIndex,
}: {
  measureUnits: number;
  notes: readonly MidiNoteEvent[];
  ppq: number;
  trackStaffByIndex: Map<number, StaffId> | null;
}) {
  const maxGraceDurationTicks = Math.max(1, ppq / 8);
  const maxGraceGapTicks = Math.max(1, ppq / 10);
  const candidates: MidiGraceNoteCandidate[] = [];

  (['treble', 'bass'] as const).forEach((staffId) => {
    const staffNotes = notes
      .filter((note) => getStaffIdForNote(note, trackStaffByIndex) === staffId)
      .sort(
        (first, second) =>
          first.startTicks - second.startTicks ||
          first.midiNote - second.midiNote,
      );

    staffNotes.forEach((note, index) => {
      if (note.durationTicks > maxGraceDurationTicks) {
        return;
      }

      const targetNote = staffNotes
        .slice(index + 1, index + 5)
        .find((candidate) => {
          const gapTicks =
            candidate.startTicks - (note.startTicks + note.durationTicks);

          return (
            gapTicks >= 0 &&
            gapTicks <= maxGraceGapTicks &&
            candidate.durationTicks > note.durationTicks * 1.5
          );
        });

      if (!targetNote) {
        return;
      }

      const absoluteUnits = Math.round(
        (targetNote.startTicks / ppq) * ABC_UNITS_PER_QUARTER,
      );
      const targetMeasureIndex = Math.floor(absoluteUnits / measureUnits);
      const targetBeat =
        (absoluteUnits - targetMeasureIndex * measureUnits) /
        ABC_UNITS_PER_QUARTER;

      candidates.push({
        graceNote: createGraceNoteAttachment({
          displayDuration: 'sixteenth',
          id: `midi-grace-${getMidiNoteKey(note)}`,
          kind: 'acciaccatura',
          pitches: [midiNoteToPitch(note.midiNote)],
          slash: true,
          slurToMain: true,
        }),
        sourceKey: getMidiNoteKey(note),
        staffId,
        targetBeat,
        targetMeasureIndex,
      });
    });
  });

  return candidates;
}

function applyMidiGraceNoteCandidates(
  score: Score,
  candidates: readonly MidiGraceNoteCandidate[],
) {
  if (candidates.length === 0) {
    return score;
  }

  const candidatesByTarget = new Map<string, MidiGraceNoteCandidate[]>();

  candidates.forEach((candidate) => {
    const key = `${candidate.staffId}:${candidate.targetMeasureIndex}`;
    const targetCandidates = candidatesByTarget.get(key) ?? [];

    targetCandidates.push(candidate);
    candidatesByTarget.set(key, targetCandidates);
  });

  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => ({
        ...staff,
        measures: staff.measures.map((measure) => {
          const measureCandidates =
            candidatesByTarget.get(`${staff.id}:${measure.index}`) ?? [];

          if (measureCandidates.length === 0) {
            return measure;
          }

          return {
            ...measure,
            voices: measure.voices.map((voice) => ({
              ...voice,
              events: voice.events.map((event) => {
                if (event.kind === 'rest') {
                  return event;
                }

                const attachedCandidates = measureCandidates.filter(
                  (candidate) => Math.abs(candidate.targetBeat - event.beat) <= 0.08,
                );

                if (attachedCandidates.length === 0) {
                  return event;
                }

                return {
                  ...event,
                  graceNotes: normalizeGraceNotes(
                    [
                      ...(normalizeGraceNotes(event.graceNotes, event.id) ?? []),
                      ...attachedCandidates.map((candidate) => candidate.graceNote),
                    ],
                    event.id,
                  ),
                };
              }),
            })),
          };
        }),
      })),
    })),
  };
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
  const midiGraceCandidates = detectMidiGraceNoteCandidates({
    measureUnits,
    notes,
    ppq,
    trackStaffByIndex,
  });
  const midiGraceSourceKeys = new Set(
    midiGraceCandidates.map((candidate) => candidate.sourceKey),
  );
  const trebleNotes = notes.filter(
    (note) =>
      !midiGraceSourceKeys.has(getMidiNoteKey(note)) &&
      getStaffIdForNote(note, trackStaffByIndex) === 'treble',
  );
  const bassNotes = notes.filter(
    (note) =>
      !midiGraceSourceKeys.has(getMidiNoteKey(note)) &&
      getStaffIdForNote(note, trackStaffByIndex) === 'bass',
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
    score: applyMidiGraceNoteCandidates(result.score, midiGraceCandidates),
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
      midiGraceCandidates.length > 0
        ? `MIDI import inferred ${midiGraceCandidates.length} grace note${
            midiGraceCandidates.length === 1 ? '' : 's'
          } from very short pickup notes`
        : null,
      ...result.warnings,
    ].filter(Boolean) as string[],
  };
}
