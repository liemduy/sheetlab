import { getEventDurationBeats } from './eventDuration';
import { getEventDots } from './events';
import {
  getGraceNoteDisplayDuration,
  getGraceNotePlayback,
  getGraceNoteSlash,
  normalizeGraceNotes,
} from './graceNotes';
import type {
  Accidental,
  DurationValue,
  GraceNoteAttachment,
  Pitch,
  Score,
  ScoreEvent,
  Staff,
} from './types';

const MUSICXML_DIVISIONS = 24;

const MUSICXML_DURATION_TYPE: Record<DurationValue, string> = {
  eighth: 'eighth',
  half: 'half',
  quarter: 'quarter',
  sixtyFourth: '64th',
  sixteenth: '16th',
  thirtySecond: '32nd',
  whole: 'whole',
};

const MUSICXML_ACCIDENTAL: Record<Accidental, string> = {
  flat: 'flat',
  natural: 'natural',
  sharp: 'sharp',
};

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getDownloadBaseName(score: Score) {
  return (
    score.title
      .trim()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'sheetlab-score'
  );
}

function indent(lines: readonly string[], level = 1) {
  const prefix = '  '.repeat(level);

  return lines.map((line) => `${prefix}${line}`);
}

function durationToDivisions(event: ScoreEvent) {
  return Math.max(
    1,
    Math.round(getEventDurationBeats(event) * MUSICXML_DIVISIONS),
  );
}

function pitchToXml(pitch: Pitch) {
  const alter = pitch.accidental === 'sharp'
    ? 1
    : pitch.accidental === 'flat'
      ? -1
      : 0;
  const lines = [
    '<pitch>',
    ...indent([
      `<step>${pitch.step}</step>`,
      alter !== 0 ? `<alter>${alter}</alter>` : '',
      `<octave>${pitch.octave}</octave>`,
    ].filter(Boolean), 1),
    '</pitch>',
  ];

  return lines;
}

function accidentalToXml(accidental: Accidental | undefined) {
  return accidental ? [`<accidental>${MUSICXML_ACCIDENTAL[accidental]}</accidental>`] : [];
}

function dotsToXml(dots: number) {
  return Array.from({ length: dots }, () => '<dot/>');
}

function gracePlaybackAttributes(graceNote: GraceNoteAttachment) {
  const playback = getGraceNotePlayback(graceNote);
  const attributes = [`slash="${getGraceNoteSlash(graceNote) ? 'yes' : 'no'}"`];

  if (playback.stealTimeFrom === 'main' && playback.durationRatio !== undefined) {
    attributes.push(
      `steal-time-following="${Math.round(playback.durationRatio * 100)}"`,
    );
  }

  if (
    playback.stealTimeFrom === 'previous' &&
    playback.durationRatio !== undefined
  ) {
    attributes.push(
      `steal-time-previous="${Math.round(playback.durationRatio * 100)}"`,
    );
  }

  return attributes.join(' ');
}

function graceNoteToXml(
  graceNote: GraceNoteAttachment,
  {
    isChordContinuation,
    shouldStopSlurOnMain,
    staffNumber,
    voiceNumber,
  }: {
    isChordContinuation: boolean;
    shouldStopSlurOnMain: boolean;
    staffNumber: number;
    voiceNumber: number;
  },
) {
  const duration = getGraceNoteDisplayDuration(graceNote);
  const pitch = graceNote.pitches[0];

  if (!pitch) {
    return [];
  }

  return [
    '<note>',
    ...indent([
      `<grace ${gracePlaybackAttributes(graceNote)}/>`,
      isChordContinuation ? '<chord/>' : '',
      ...pitchToXml(pitch),
      ...accidentalToXml(pitch.accidental),
      `<voice>${voiceNumber}</voice>`,
      `<type>${MUSICXML_DURATION_TYPE[duration]}</type>`,
      `<staff>${staffNumber}</staff>`,
      shouldStopSlurOnMain
        ? '<notations><slur type="start" number="1"/></notations>'
        : '',
    ].filter(Boolean), 1),
    '</note>',
  ];
}

function eventPitches(event: ScoreEvent) {
  if (event.kind === 'note') {
    return [event.pitch];
  }

  if (event.kind === 'chord') {
    return event.pitches;
  }

  return [];
}

function eventNoteToXml({
  event,
  isChordContinuation,
  pitch,
  shouldStopGraceSlur,
  staffNumber,
  voiceNumber,
}: {
  event: ScoreEvent;
  isChordContinuation: boolean;
  pitch?: Pitch;
  shouldStopGraceSlur: boolean;
  staffNumber: number;
  voiceNumber: number;
}) {
  const dots = getEventDots(event);
  const pitchLines = pitch ? pitchToXml(pitch) : [];
  const accidentalLines = pitch ? accidentalToXml(pitch.accidental) : [];

  return [
    '<note>',
    ...indent([
      isChordContinuation ? '<chord/>' : '',
      event.kind === 'rest' || !pitch ? '<rest/>' : '',
      ...pitchLines,
      ...accidentalLines,
      `<duration>${durationToDivisions(event)}</duration>`,
      `<voice>${voiceNumber}</voice>`,
      `<type>${MUSICXML_DURATION_TYPE[event.duration]}</type>`,
      ...dotsToXml(dots),
      `<staff>${staffNumber}</staff>`,
      shouldStopGraceSlur
        ? '<notations><slur type="stop" number="1"/></notations>'
        : '',
    ].filter(Boolean), 1),
    '</note>',
  ];
}

function scoreEventToXml({
  event,
  staffNumber,
  voiceNumber,
}: {
  event: ScoreEvent;
  staffNumber: number;
  voiceNumber: number;
}) {
  const lines: string[] = [];
  const normalizedGraceNotes = normalizeGraceNotes(event.graceNotes, event.id) ?? [];
  const shouldStopGraceSlur = normalizedGraceNotes.some(
    (graceNote) => graceNote.slurToMain ?? true,
  );

  normalizedGraceNotes.forEach((graceNote) => {
    graceNote.pitches.forEach((pitch, pitchIndex) => {
      lines.push(
        ...graceNoteToXml(
          {
            ...graceNote,
            pitches: [pitch],
          },
          {
            isChordContinuation: pitchIndex > 0,
            shouldStopSlurOnMain: shouldStopGraceSlur && pitchIndex === 0,
            staffNumber,
            voiceNumber,
          },
        ),
      );
    });
  });

  const pitches = eventPitches(event);

  if (pitches.length === 0) {
    lines.push(
      ...eventNoteToXml({
        event,
        isChordContinuation: false,
        shouldStopGraceSlur,
        staffNumber,
        voiceNumber,
      }),
    );
    return lines;
  }

  pitches.forEach((pitch, pitchIndex) => {
    lines.push(
      ...eventNoteToXml({
        event,
        isChordContinuation: pitchIndex > 0,
        pitch,
        shouldStopGraceSlur: shouldStopGraceSlur && pitchIndex === 0,
        staffNumber,
        voiceNumber,
      }),
    );
  });

  return lines;
}

function staffNumberForStaff(staff: Staff) {
  return staff.id === 'bass' ? 2 : 1;
}

function clefXml(staff: Staff) {
  return staff.clef === 'bass'
    ? ['<clef number="2">', '  <sign>F</sign>', '  <line>4</line>', '</clef>']
    : ['<clef number="1">', '  <sign>G</sign>', '  <line>2</line>', '</clef>'];
}

function measureAttributesXml(score: Score) {
  const staves = score.type === 'grand' ? 2 : 1;

  return [
    '<attributes>',
    ...indent([
      `<divisions>${MUSICXML_DIVISIONS}</divisions>`,
      '<key><fifths>0</fifths></key>',
      '<time>',
      `  <beats>${score.timeSignature.beats}</beats>`,
      `  <beat-type>${score.timeSignature.beatUnit}</beat-type>`,
      '</time>',
      staves > 1 ? `<staves>${staves}</staves>` : '',
      ...score.parts[0].staves.flatMap(clefXml),
    ].filter(Boolean), 1),
    '</attributes>',
  ];
}

function measureToXml(score: Score, measureIndex: number) {
  const measureLines: string[] = [`<measure number="${measureIndex + 1}">`];
  const measureUnits = score.timeSignature.beats * MUSICXML_DIVISIONS;

  if (measureIndex === 0) {
    measureLines.push(...indent(measureAttributesXml(score), 1));
    measureLines.push(
      ...indent([
        '<direction placement="above">',
        '  <direction-type>',
        `    <metronome><beat-unit>quarter</beat-unit><per-minute>${score.tempo}</per-minute></metronome>`,
        '  </direction-type>',
        `  <sound tempo="${score.tempo}"/>`,
        '</direction>',
      ], 1),
    );
  }

  score.parts[0].staves.forEach((staff, staffIndex) => {
    const measure = staff.measures[measureIndex];

    if (!measure) {
      return;
    }

    if (staffIndex > 0) {
      measureLines.push(
        ...indent([
          '<backup>',
          `  <duration>${measureUnits}</duration>`,
          '</backup>',
        ], 1),
      );
    }

    measure.voices.forEach((voice, voiceIndex) => {
      [...voice.events]
        .sort((first, second) => first.beat - second.beat)
        .forEach((event) => {
          measureLines.push(
            ...indent(
              scoreEventToXml({
                event,
                staffNumber: staffNumberForStaff(staff),
                voiceNumber: voiceIndex + 1,
              }),
              1,
            ),
          );
        });
    });
  });

  measureLines.push('</measure>');
  return measureLines;
}

export function exportScoreToMusicXml(score: Score) {
  const part = score.parts[0];
  const measureCount = Math.max(
    0,
    ...part.staves.map((staff) => staff.measures.length),
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="3.1">',
    ...indent([
      `<work><work-title>${escapeXml(score.title)}</work-title></work>`,
      score.composer
        ? `<identification><creator type="composer">${escapeXml(score.composer)}</creator></identification>`
        : '',
      '<part-list>',
      `  <score-part id="${part.id}"><part-name>${escapeXml(part.name)}</part-name></score-part>`,
      '</part-list>',
      `<part id="${part.id}">`,
      ...Array.from({ length: measureCount }, (_, measureIndex) =>
        measureToXml(score, measureIndex),
      ).flat().map((line) => `  ${line}`),
      '</part>',
    ].filter(Boolean), 1),
    '</score-partwise>',
    '',
  ].join('\n');
}

export function getMusicXmlFileName(score: Score) {
  return `${getDownloadBaseName(score)}.musicxml`;
}

export function createMusicXmlBlob(score: Score) {
  return new Blob([exportScoreToMusicXml(score)], {
    type: 'application/vnd.recordare.musicxml+xml',
  });
}
