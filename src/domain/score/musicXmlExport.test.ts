import { describe, expect, it } from 'vitest';
import { placeScoreEvent, tryUpdateScoreEvent } from './editing';
import { createEmptyScore } from './factories';
import { importScoreFromMusicXml } from './externalScoreImport';
import { exportScoreToMusicXml } from './musicXmlExport';

describe('musicXmlExport', () => {
  it('exports grace notes with slash, slur, and playback policy', () => {
    const scoreWithNote = placeScoreEvent(createEmptyScore('treble'), {
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      eventId: 'xml-grace-main',
      measureIndex: 0,
      pitch: { step: 'E', octave: 4 },
      staffId: 'treble',
    });
    const score = tryUpdateScoreEvent(scoreWithNote, 'xml-grace-main', {
      graceNotes: [
        {
          displayDuration: 'sixteenth',
          kind: 'acciaccatura',
          playback: {
            fixedMs: 65,
            stealTimeFrom: 'none',
            timing: 'beforeBeat',
          },
          pitches: [{ step: 'D', octave: 4 }],
          slash: true,
          slurToMain: true,
        },
      ],
    }).score;

    const xml = exportScoreToMusicXml(score);
    const roundTrip = importScoreFromMusicXml(xml);
    const importedEvent = roundTrip.score.parts[0]?.staves[0]?.measures[0]
      ?.voices[0]?.events.find((event) => event.kind === 'note');

    expect(xml).toContain('<grace slash="yes"/>');
    expect(xml).toContain('<slur type="start" number="1"/>');
    expect(xml).toContain('<slur type="stop" number="1"/>');
    expect(importedEvent).toMatchObject({
      graceNotes: [
        {
          displayDuration: 'sixteenth',
          kind: 'acciaccatura',
          pitches: [{ step: 'D', octave: 4 }],
          slash: true,
          slurToMain: true,
        },
      ],
    });
  });
});
