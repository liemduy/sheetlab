import { describe, expect, it } from 'vitest';

import {
  analyzeMidiFile,
  analyzeMusicXml,
  importScoreFromMidi,
  importScoreFromMusicXml,
} from './externalScoreImport';
import { countScoreEvents } from './editing';
import { getScoreRhythmIssues } from './rhythm';

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

  it('imports MusicXML piano staves, backup cursor, lyrics, pedal, and dynamics', () => {
    const xml = `
      <score-partwise version="3.1">
        <work><work-title>Piano XML</work-title></work>
        <identification><creator type="composer">Tester</creator></identification>
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>1</divisions>
              <key><fifths>0</fifths></key>
              <time><beats>4</beats><beat-type>4</beat-type></time>
              <staves>2</staves>
            </attributes>
            <direction>
              <direction-type><dynamics><mf/></dynamics></direction-type>
              <staff>1</staff>
            </direction>
            <direction>
              <direction-type><wedge type="crescendo"/></direction-type>
              <staff>1</staff>
            </direction>
            <note>
              <pitch><step>C</step><octave>5</octave></pitch>
              <duration>1</duration>
              <voice>1</voice>
              <type>quarter</type>
              <staff>1</staff>
              <lyric><syllabic>single</syllabic><text>Xin</text></lyric>
            </note>
            <backup><duration>1</duration></backup>
            <direction>
              <direction-type><pedal type="start" line="no"/></direction-type>
              <staff>2</staff>
            </direction>
            <note>
              <pitch><step>C</step><octave>3</octave></pitch>
              <duration>1</duration>
              <voice>5</voice>
              <type>quarter</type>
              <staff>2</staff>
            </note>
            <direction>
              <direction-type><pedal type="stop" line="no"/></direction-type>
              <staff>2</staff>
            </direction>
          </measure>
        </part>
      </score-partwise>
    `;
    const analysis = analyzeMusicXml(xml, 'piano.musicxml');
    const result = importScoreFromMusicXml(xml);
    const trebleEvents = getStaffEvents(result, 'treble');
    const bassEvents = getStaffEvents(result, 'bass');

    expect(analysis.measureCount).toBe(1);
    expect(analysis.staffCount).toBe(2);
    expect(analysis.backupCount).toBe(1);
    expect(analysis.hairpinCount).toBe(1);
    expect(result.score.type).toBe('grand');
    expect(result.score.title).toBe('Piano XML');
    expect(result.score.composer).toBe('Tester');
    expect(trebleEvents.some((event) => event.kind !== 'rest')).toBe(true);
    expect(bassEvents.some((event) => event.kind !== 'rest')).toBe(true);
    expect(trebleEvents.some((event) => event.lyric === 'Xin')).toBe(true);
    expect(trebleEvents.some((event) => event.dynamic === 'mf')).toBe(true);
    expect(trebleEvents.some((event) => event.hairpin === 'crescendo')).toBe(true);
    expect(bassEvents.some((event) => event.pedal)).toBe(true);
    expect(bassEvents.filter((event) => event.pedal).map((event) => event.pedalLine))
      .toEqual([false]);
  });

  it('imports MusicXML grace notes as attachments without rhythm overlap', () => {
    const result = importScoreFromMusicXml(`
      <score-partwise version="3.1">
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>4</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
            </attributes>
            <note>
              <grace slash="yes"/>
              <pitch><step>D</step><octave>4</octave></pitch>
              <voice>1</voice>
              <type>16th</type>
              <staff>1</staff>
              <notations><slur type="start" number="1"/></notations>
            </note>
            <note>
              <pitch><step>E</step><octave>4</octave></pitch>
              <duration>4</duration>
              <voice>1</voice>
              <type>quarter</type>
              <staff>1</staff>
              <lyric><text>main</text></lyric>
            </note>
          </measure>
        </part>
      </score-partwise>
    `);
    const trebleEvents = getStaffEvents(result, 'treble');
    const mainEvent = trebleEvents.find((event) => event.kind === 'note');

    expect(result.warnings).not.toContain(
      'Skipped a MusicXML duration with invalid value',
    );
    expect(mainEvent).toMatchObject({
      beat: 0,
      duration: 'quarter',
      graceNotes: [
        {
          displayDuration: 'sixteenth',
          kind: 'acciaccatura',
          playback: {
            fixedMs: 65,
            stealTimeFrom: 'none',
            timing: 'beforeBeat',
          },
          pitches: [{ octave: 4, step: 'D' }],
          slash: true,
          slurToMain: true,
        },
      ],
      lyric: 'main',
    });
    expect(getScoreRhythmIssues(result.score)).toEqual([]);
  });

  it('imports MusicXML tuplets using notated duration and time modification', () => {
    const result = importScoreFromMusicXml(`
      <score-partwise version="3.1">
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>12</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
            </attributes>
            <note>
              <pitch><step>G</step><octave>4</octave></pitch>
              <duration>12</duration>
              <type>quarter</type>
            </note>
            <note>
              <rest/>
              <duration>6</duration>
              <type>eighth</type>
            </note>
            <note>
              <pitch><step>B</step><octave>3</octave></pitch>
              <duration>6</duration>
              <type>eighth</type>
            </note>
            <note>
              <pitch><step>A</step><octave>3</octave></pitch>
              <duration>8</duration>
              <type>quarter</type>
              <time-modification>
                <actual-notes>3</actual-notes>
                <normal-notes>2</normal-notes>
              </time-modification>
              <notations><tuplet type="start"/></notations>
            </note>
            <note>
              <pitch><step>B</step><octave>3</octave></pitch>
              <duration>12</duration>
              <type>quarter</type>
              <dot/>
              <time-modification>
                <actual-notes>3</actual-notes>
                <normal-notes>2</normal-notes>
              </time-modification>
            </note>
            <note>
              <pitch><step>C</step><octave>4</octave></pitch>
              <duration>4</duration>
              <type>eighth</type>
              <time-modification>
                <actual-notes>3</actual-notes>
                <normal-notes>2</normal-notes>
              </time-modification>
              <notations><tuplet type="stop"/></notations>
            </note>
          </measure>
        </part>
      </score-partwise>
    `);
    const trebleEvents = getStaffEvents(result, 'treble');
    const tupletEvents = trebleEvents.filter((event) => event.tuplet);

    expect(tupletEvents.map((event) => event.duration)).toEqual([
      'quarter',
      'quarter',
      'eighth',
    ]);
    expect(tupletEvents.map((event) => event.dots ?? 0)).toEqual([0, 1, 0]);
    expect(tupletEvents.map((event) => event.tuplet?.index)).toEqual([0, 1, 2]);
    expect(new Set(tupletEvents.map((event) => event.tuplet?.id)).size).toBe(1);
    expect(tupletEvents.map((event) => Number(event.beat.toFixed(4)))).toEqual([
      2,
      2.6667,
      3.6667,
    ]);
    expect(getScoreRhythmIssues(result.score)).toEqual([]);
  });

  it('imports MusicXML double-dotted durations without rhythm overlap', () => {
    const result = importScoreFromMusicXml(`
      <score-partwise version="3.1">
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>16</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
            </attributes>
            <note>
              <pitch><step>C</step><octave>4</octave></pitch>
              <duration>28</duration>
              <type>quarter</type>
              <dot/>
              <dot/>
            </note>
            <note>
              <rest/>
              <duration>7</duration>
              <type>16th</type>
              <dot/>
              <dot/>
            </note>
            <note>
              <pitch><step>E</step><octave>4</octave></pitch>
              <duration>1</duration>
              <type>64th</type>
            </note>
            <note>
              <pitch><step>D</step><octave>4</octave></pitch>
              <duration>16</duration>
              <type>quarter</type>
            </note>
          </measure>
        </part>
      </score-partwise>
    `);
    const trebleEvents = getStaffEvents(result, 'treble');

    expect(result.warnings).toEqual([]);
    expect(trebleEvents.map((event) => event.beat)).toEqual([
      0,
      1.75,
      2.1875,
      2.25,
    ]);
    expect(trebleEvents.map((event) => event.duration)).toEqual([
      'quarter',
      'sixteenth',
      'sixtyFourth',
      'quarter',
    ]);
    expect(trebleEvents.map((event) => event.dots ?? 0)).toEqual([2, 2, 0, 0]);
    expect(getScoreRhythmIssues(result.score)).toEqual([]);
  });

  it('imports MusicXML voices, connections, articulations, arpeggios, and clef changes', () => {
    const result = importScoreFromMusicXml(`
      <score-partwise version="3.1">
        <work><work-title>Voice XML</work-title></work>
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>1</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
              <staves>2</staves>
            </attributes>
            <note>
              <pitch><step>C</step><octave>5</octave></pitch>
              <duration>2</duration>
              <voice>1</voice>
              <type>half</type>
              <staff>1</staff>
              <tie type="start"/>
              <notations>
                <tied type="start"/>
                <slur type="start" number="1"/>
                <arpeggiate/>
                <fermata/>
                <articulations>
                  <accent/>
                  <staccato/>
                </articulations>
              </notations>
            </note>
            <backup><duration>2</duration></backup>
            <note>
              <pitch><step>E</step><octave>4</octave></pitch>
              <duration>1</duration>
              <voice>2</voice>
              <type>quarter</type>
              <staff>1</staff>
            </note>
          </measure>
          <measure number="2">
            <attributes>
              <clef number="1"><sign>F</sign><line>4</line></clef>
            </attributes>
            <note>
              <pitch><step>C</step><octave>5</octave></pitch>
              <duration>2</duration>
              <voice>1</voice>
              <type>half</type>
              <staff>1</staff>
              <tie type="stop"/>
              <notations>
                <tied type="stop"/>
                <slur type="stop" number="1"/>
              </notations>
            </note>
          </measure>
        </part>
      </score-partwise>
    `);
    const trebleMeasures = result.score.parts[0]?.staves.find(
      (staff) => staff.id === 'treble',
    )?.measures;
    const firstVoiceEvent = trebleMeasures?.[0]?.voices[0]?.events[0];
    const secondVoiceEvent = trebleMeasures?.[0]?.voices[1]?.events[0];
    const tieTarget = trebleMeasures?.[1]?.voices[0]?.events[0];

    expect(trebleMeasures?.[0]?.voices).toHaveLength(2);
    expect(firstVoiceEvent).toMatchObject({
      arpeggio: true,
      articulations: ['accent', 'staccato'],
      fermata: true,
      kind: 'note',
    });
    expect(secondVoiceEvent).toMatchObject({
      beat: 0,
      kind: 'note',
      pitch: { octave: 4, step: 'E' },
    });
    expect(firstVoiceEvent?.ties).toEqual([
      {
        pitchIndex: 0,
        targetEventId: tieTarget?.id,
        targetPitchIndex: 0,
      },
    ]);
    expect(firstVoiceEvent?.slurs?.[0]).toMatchObject({
      targetEventId: tieTarget?.id,
    });
    expect(trebleMeasures?.[1]?.clefChanges).toEqual([
      expect.objectContaining({
        beat: 0,
        clef: 'bass',
      }),
    ]);
    expect(getScoreRhythmIssues(result.score)).toEqual([]);
  });

  it('preserves MusicXML octave-shifted clefs and explicit beam groups', () => {
    const result = importScoreFromMusicXml(`
      <score-partwise version="3.1">
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>8</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
              <staves>2</staves>
              <clef number="2">
                <sign>G</sign>
                <line>2</line>
                <clef-octave-change>1</clef-octave-change>
              </clef>
            </attributes>
            <note>
              <pitch><step>B</step><octave>6</octave></pitch>
              <duration>1</duration>
              <voice>1</voice>
              <type>32nd</type>
              <staff>2</staff>
              <beam number="1">begin</beam>
            </note>
            <note>
              <pitch><step>A</step><octave>6</octave></pitch>
              <duration>1</duration>
              <voice>1</voice>
              <type>32nd</type>
              <staff>2</staff>
              <beam number="1">continue</beam>
            </note>
            <note>
              <pitch><step>G</step><octave>6</octave></pitch>
              <duration>1</duration>
              <voice>1</voice>
              <type>32nd</type>
              <staff>2</staff>
              <beam number="1">end</beam>
            </note>
            <note>
              <pitch><step>F</step><octave>6</octave></pitch>
              <duration>1</duration>
              <voice>1</voice>
              <type>32nd</type>
              <staff>2</staff>
            </note>
          </measure>
        </part>
      </score-partwise>
    `);
    const bassMeasure = result.score.parts[0]?.staves.find(
      (staff) => staff.id === 'bass',
    )?.measures[0];
    const events = bassMeasure?.voices[0]?.events ?? [];
    const explicitBeamGroupIds = events
      .slice(0, 3)
      .map((event) => event.beamGroupId);

    expect(bassMeasure?.clefChanges?.[0]).toMatchObject({
      beat: 0,
      clef: 'treble',
      octaveShift: 1,
    });
    expect(new Set(explicitBeamGroupIds).size).toBe(1);
    expect(explicitBeamGroupIds.every(Boolean)).toBe(true);
    expect(events[3]?.beamGroupId).toBeUndefined();
  });

  it('imports MusicXML engraving layout and range directions', () => {
    const result = importScoreFromMusicXml(`
      <score-partwise version="3.1">
        <work><work-title>Engraved XML</work-title></work>
        <credit page="1">
          <credit-type>title</credit-type>
          <credit-words font-family="Courier New" font-size="24" font-weight="bold">Engraved XML</credit-words>
        </credit>
        <credit page="1">
          <credit-type>composer</credit-type>
          <credit-words font-family="Courier New" font-size="12">Composer: Tester</credit-words>
          <credit-words>Arranger: SheetLab</credit-words>
        </credit>
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1" width="320">
            <print>
              <system-layout><top-system-distance>72</top-system-distance></system-layout>
              <staff-layout number="2"><staff-distance>76</staff-distance></staff-layout>
            </print>
            <attributes>
              <divisions>1</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
              <staves>2</staves>
            </attributes>
            <direction placement="above">
              <direction-type><rehearsal>A</rehearsal></direction-type>
              <staff>1</staff>
            </direction>
            <direction placement="above">
              <direction-type><words font-style="italic">rit.</words></direction-type>
              <staff>1</staff>
            </direction>
            <direction placement="above">
              <direction-type><octave-shift type="up" size="8" number="1"/></direction-type>
              <staff>1</staff>
            </direction>
            <direction placement="below">
              <direction-type><wedge type="crescendo" number="1"/></direction-type>
              <staff>1</staff>
            </direction>
            <note>
              <pitch><step>C</step><octave>5</octave></pitch>
              <duration>1</duration>
              <voice>1</voice>
              <type>quarter</type>
              <staff>1</staff>
            </note>
          </measure>
          <measure number="2" width="160">
            <print new-system="yes"><system-layout><system-distance>100</system-distance></system-layout></print>
            <direction placement="below">
              <direction-type><wedge type="stop" number="1"/></direction-type>
              <staff>1</staff>
            </direction>
            <note>
              <pitch><step>D</step><octave>5</octave></pitch>
              <duration>1</duration>
              <voice>1</voice>
              <type>quarter</type>
              <staff>1</staff>
            </note>
            <direction placement="above">
              <direction-type><octave-shift type="stop" size="8" number="1"/></direction-type>
              <staff>1</staff>
            </direction>
          </measure>
        </part>
      </score-partwise>
    `);
    const trebleMeasures = result.score.parts[0]?.staves.find(
      (staff) => staff.id === 'treble',
    )?.measures;
    const firstEvent = trebleMeasures?.[0]?.voices[0]?.events[0];
    const marks = result.score.marks ?? [];

    expect(result.score.importedLayout?.measureLayouts).toEqual([
      expect.objectContaining({
        measureIndex: 0,
        staffDistance: 76,
        topSystemDistance: 72,
        xmlWidth: 320,
      }),
      expect.objectContaining({
        measureIndex: 1,
        systemBreakBefore: true,
        systemDistance: 100,
        xmlWidth: 160,
      }),
    ]);
    expect(result.score.importedLayout?.credits).toEqual([
      expect.objectContaining({
        fontFamily: 'Courier New',
        fontSize: 24,
        fontWeight: 'bold',
        lines: ['Engraved XML'],
        page: 1,
        type: 'title',
      }),
      expect.objectContaining({
        fontFamily: 'Courier New',
        fontSize: 12,
        lines: ['Composer: Tester', 'Arranger: SheetLab'],
        page: 1,
        type: 'composer',
      }),
    ]);
    expect(trebleMeasures?.[0]?.sectionMarker).toBe('A');
    expect(firstEvent).toMatchObject({
      chordSymbol: 'rit.',
      hairpin: 'crescendo',
    });
    expect(
      marks.find((mark) => mark.scope === 'range' && mark.kind === 'ottava'),
    ).toMatchObject({
      ottava: '8va',
      sourceEventId: firstEvent?.id,
    });
    expect(
      marks.find((mark) => mark.scope === 'range' && mark.kind === 'hairpin'),
    ).toMatchObject({
      hairpin: 'crescendo',
      sourceEventId: firstEvent?.id,
    });
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
