import { describe, expect, it } from 'vitest';

import {
  importScoreFromMidi,
  importScoreFromMusicXml,
} from './externalScoreImport';
import { countScoreEvents } from './editing';

function bytes(...values: number[]) {
  return new Uint8Array(values);
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
});
