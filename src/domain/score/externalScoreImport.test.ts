import { describe, expect, it } from 'vitest';

import {
  analyzeMidiFile,
  importScoreFromMidi,
  importScoreFromMusicXml,
} from './externalScoreImport';
import { countScoreEvents } from './editing';

function bytes(...values: number[]) {
  return new Uint8Array(values);
}

function trackChunk(trackData: Uint8Array) {
  const trackHeader = bytes(
    0x4d, 0x54, 0x72, 0x6b,
    (trackData.length >> 24) & 0xff,
    (trackData.length >> 16) & 0xff,
    (trackData.length >> 8) & 0xff,
    trackData.length & 0xff,
  );
  const chunk = new Uint8Array(trackHeader.length + trackData.length);

  chunk.set(trackHeader, 0);
  chunk.set(trackData, trackHeader.length);

  return chunk;
}

function midiFile(format: number, tracks: Uint8Array[]) {
  const header = bytes(
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, format,
    0x00, tracks.length,
    0x01, 0xe0,
  );
  const trackChunks = tracks.map(trackChunk);
  const midi = new Uint8Array(
    header.length +
      trackChunks.reduce((sum, track) => sum + track.length, 0),
  );
  let offset = header.length;

  midi.set(header, 0);
  trackChunks.forEach((track) => {
    midi.set(track, offset);
    offset += track.length;
  });

  return midi;
}

function getStaffEvents(result: ReturnType<typeof importScoreFromMidi>, staffId: string) {
  return result.score.parts[0]?.staves
    .find((staff) => staff.id === staffId)
    ?.measures.flatMap((measure) =>
      measure.voices.flatMap((voice) => voice.events),
    ) ?? [];
}

describe('externalScoreImport', () => {
  it('imports a basic MusicXML part through the score model', () => {
    const result = importScoreFromMusicXml(`
      <score-partwise version="3.1">
        <work><work-title>XML Tune</work-title></work>
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>1</divisions>
              <key><fifths>0</fifths></key>
              <time><beats>4</beats><beat-type>4</beat-type></time>
            </attributes>
            <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
            <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
          </measure>
        </part>
      </score-partwise>
    `);

    expect(result.score.title).toBe('XML Tune');
    expect(countScoreEvents(result.score)).toBeGreaterThanOrEqual(2);
  });

  it('imports a minimal MIDI note track', () => {
    const header = bytes(
      0x4d, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00,
      0x00, 0x01,
      0x01, 0xe0,
    );
    const trackData = bytes(
      0x00, 0x90, 0x3c, 0x40,
      0x83, 0x60, 0x80, 0x3c, 0x40,
      0x00, 0xff, 0x2f, 0x00,
    );
    const trackHeader = bytes(
      0x4d, 0x54, 0x72, 0x6b,
      0x00, 0x00, 0x00, trackData.length,
    );
    const midi = new Uint8Array(header.length + trackHeader.length + trackData.length);

    midi.set(header, 0);
    midi.set(trackHeader, header.length);
    midi.set(trackData, header.length + trackHeader.length);

    const result = importScoreFromMidi(midi.buffer, 'tiny.mid');

    expect(result.score.title).toBe('tiny');
    expect(countScoreEvents(result.score)).toBeGreaterThanOrEqual(1);
  });

  it('analyzes and imports two-track MIDI with sustain pedal marks', () => {
    const rightHandTrack = bytes(
      0x00, 0xff, 0x51, 0x03, 0x0a, 0xc2, 0xda,
      0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
      0x00, 0xff, 0x59, 0x02, 0x00, 0x00,
      0x00, 0x90, 0x48, 0x40,
      0x83, 0x60, 0x80, 0x48, 0x40,
      0x00, 0xff, 0x2f, 0x00,
    );
    const leftHandTrack = bytes(
      0x00, 0xb0, 0x40, 0x7f,
      0x00, 0x90, 0x30, 0x40,
      0x83, 0x60, 0x80, 0x30, 0x40,
      0x00, 0xb0, 0x40, 0x00,
      0x00, 0xff, 0x2f, 0x00,
    );
    const midi = midiFile(1, [rightHandTrack, leftHandTrack]);
    const analysis = analyzeMidiFile(midi.buffer, 'piano.mid');
    const result = importScoreFromMidi(midi.buffer, 'piano.mid');
    const trebleEvents = getStaffEvents(result, 'treble');
    const bassEvents = getStaffEvents(result, 'bass');

    expect(analysis.noteCount).toBe(2);
    expect(analysis.pedalEventCount).toBe(2);
    expect(analysis.splitMode).toBe('track');
    expect(analysis.tempo).toBe(85);
    expect(result.warnings).toContain(
      'MIDI import split hands by detected note tracks',
    );
    expect(result.warnings.some((warning) => warning.includes('sustain pedal'))).toBe(true);
    expect(trebleEvents.some((event) => event.kind !== 'rest')).toBe(true);
    expect(bassEvents.some((event) => event.pedal)).toBe(true);
  });
});
