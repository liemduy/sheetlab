import {
  importScoreFromAbc,
  type AbcImportResult,
} from './abcNotation';

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
  durationTicks: number;
  midiNote: number;
  startTicks: number;
  trackIndex: number;
}

interface MidiTempoEvent {
  tempo: number;
  ticks: number;
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
  const notes: MidiNoteEvent[] = [];
  const tempos: MidiTempoEvent[] = [];
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

      state.offset += length;
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      state.offset += readVarLength(view, state);
      continue;
    }

    const eventType = status & 0xf0;
    const dataByteCount = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
    const firstDataByte = view.getUint8(state.offset);
    const secondDataByte = dataByteCount > 1 ? view.getUint8(state.offset + 1) : 0;

    state.offset += dataByteCount;

    if (eventType === 0x90 && secondDataByte > 0) {
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
          durationTicks: ticks - activeNote.startTicks,
          midiNote: firstDataByte,
          startTicks: activeNote.startTicks,
          trackIndex,
        });
      }
    }
  }

  return { notes, tempos };
}

function parseMidiFile(arrayBuffer: ArrayBuffer) {
  const view = new DataView(arrayBuffer);

  if (readAscii(view, 0, 4) !== 'MThd') {
    throw new Error('Invalid MIDI header');
  }

  const headerLength = view.getUint32(4);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  const ppq = division & 0x8000 ? 480 : division;
  const notes: MidiNoteEvent[] = [];
  const tempos: MidiTempoEvent[] = [];
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

    notes.push(...track.notes);
    tempos.push(...track.tempos);
    offset += 8 + trackLength;
  }

  return {
    notes,
    ppq: ppq || 480,
    tempo: tempos.sort((first, second) => first.ticks - second.ticks)[0]?.tempo ?? 120,
  };
}

function buildMidiStaffLine({
  id,
  measureCount,
  notes,
  ppq,
}: {
  id: string;
  measureCount: number;
  notes: readonly MidiNoteEvent[];
  ppq: number;
}) {
  const measureTokens = Array.from({ length: measureCount }, () => [] as AbcToken[]);
  const groupedNotes = new Map<string, MidiNoteEvent[]>();

  notes.forEach((note) => {
    const startUnits = Math.round((note.startTicks / ppq) * ABC_UNITS_PER_QUARTER);
    const durationUnits = getClosestAbcUnits(note.durationTicks / ppq);
    const key = `${startUnits}:${durationUnits}`;
    const group = groupedNotes.get(key) ?? [];

    group.push(note);
    groupedNotes.set(key, group);
  });

  [...groupedNotes.entries()]
    .map(([key, group]) => {
      const [startUnits, durationUnits] = key.split(':').map(Number);

      return { durationUnits, group, startUnits };
    })
    .sort((first, second) => first.startUnits - second.startUnits)
    .forEach(({ durationUnits, group, startUnits }) => {
      const measureIndex = Math.floor(startUnits / 32);
      const measureStartUnits = measureIndex * 32;
      const measure = measureTokens[measureIndex];

      if (!measure) {
        return;
      }

      const usedUnits = measure.reduce((sum, token) => sum + token.units, 0);
      const gapUnits = startUnits - measureStartUnits - usedUnits;

      if (gapUnits > 0) {
        measure.push({
          isRest: true,
          pitches: [],
          units: getClosestAbcUnits(gapUnits / ABC_UNITS_PER_QUARTER),
        });
      }

      measure.push({
        isRest: false,
        pitches: group
          .map((note) => encodeMidiPitch(note.midiNote))
          .sort(),
        units: durationUnits,
      });
    });

  return `[V:${id}] ${measureTokens
    .map((tokens) =>
      tokens.length > 0 ? tokens.map(encodeAbcToken).join(' ') : 'z32',
    )
    .join(' | ')} |`;
}

export function importScoreFromMidi(
  arrayBuffer: ArrayBuffer,
  fileName = 'Imported MIDI Score',
): AbcImportResult {
  const { notes, ppq, tempo } = parseMidiFile(arrayBuffer);

  if (notes.length === 0) {
    throw new Error('No MIDI notes found');
  }

  const lastTick = Math.max(
    ...notes.map((note) => note.startTicks + note.durationTicks),
  );
  const measureCount = Math.max(1, Math.ceil(lastTick / ppq / 4));
  const trebleNotes = notes.filter((note) => note.midiNote >= 60);
  const bassNotes = notes.filter((note) => note.midiNote < 60);
  const abc = [
    'X:1',
    `T:${sanitizeAbcField(fileName.replace(/\.(mid|midi)$/i, ''), 'Imported MIDI Score')}`,
    'M:4/4',
    'L:1/32',
    `Q:1/4=${tempo}`,
    '%%score (T B)',
    'V:T clef=treble name="Right hand"',
    'V:B clef=bass name="Left hand"',
    'K:C',
    buildMidiStaffLine({
      id: 'T',
      measureCount,
      notes: trebleNotes,
      ppq,
    }),
    buildMidiStaffLine({
      id: 'B',
      measureCount,
      notes: bassNotes,
      ppq,
    }),
  ].join('\n');
  const result = importScoreFromAbc(abc);

  return {
    score: result.score,
    warnings: [
      'MIDI import quantizes to 4/4 and splits hands at middle C',
      ...result.warnings,
    ],
  };
}
