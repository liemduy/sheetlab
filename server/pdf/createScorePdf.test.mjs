// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { trySetClefChange } from '../../src/domain/score/clefChanges';
import { placeScoreEvent } from '../../src/domain/score/editing';
import { createEmptyScore } from '../../src/domain/score/factories';
import {
  stressPianoHardeningFixture,
} from '../../src/domain/score/fixtures';
import { extremeScoreFixtureCatalog } from '../../src/domain/score/fixtureCatalog';
import { getScoreMusicIssues } from '../../src/domain/score/musicIssues';
import { createScorePdf, createScorePdfLayout } from './createScorePdf.mjs';

function getAllScoreEvents(score) {
  return score.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.measures.flatMap((measure) =>
        measure.voices.flatMap((voice) => voice.events),
      ),
    ),
  );
}

describe('createScorePdf', () => {
  it('returns a real PDF buffer for a score', async () => {
    const score = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'pdf-note',
      staffId: 'bass',
      measureIndex: 0,
      beat: 0,
      duration: 'whole',
      entryMode: 'note',
      pitch: { step: 'C', octave: 3 },
    });
    const pdf = await createScorePdf(score);

    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('exports chord columns as one PDF event with multiple pitches', async () => {
    const score = createEmptyScore('grand', { measureCount: 1 });
    const chord = {
      id: 'pdf-c-major',
      kind: 'chord',
      beat: 0,
      duration: 'quarter',
      pitches: [
        { step: 'C', octave: 4 },
        { step: 'E', octave: 4 },
        { step: 'G', octave: 4 },
      ],
    };

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push(chord);

    const layout = createScorePdfLayout(score);
    const pdf = await createScorePdf(score);

    expect(layout.events[0]?.event).toMatchObject(chord);
    expect(layout.events[0]?.bounds.maxY).toBeGreaterThan(
      layout.events[0]?.bounds.minY ?? 0,
    );
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });

  it('lays a default 16-measure piano score across multiple systems instead of squeezing one row', () => {
    const score = placeScoreEvent(createEmptyScore('grand'), {
      eventId: 'system-two-note',
      staffId: 'treble',
      measureIndex: 5,
      beat: 0,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'C', octave: 5 },
    });
    const layout = createScorePdfLayout(score);
    const trebleStaves = layout.staves.filter((staff) => staff.id === 'treble');
    const systemTwoNote = layout.events.find(
      (event) => event.event.id === 'system-two-note',
    );

    expect(new Set(trebleStaves.map((staff) => staff.systemIndex)).size).toBe(4);
    expect(trebleStaves[1]?.top).toBeGreaterThan(trebleStaves[0]?.top ?? 0);
    expect(systemTwoNote?.systemIndex).toBe(1);
    expect(systemTwoNote?.x).toBeLessThan(layout.layout.staffRight);
    expect(layout.layout.staffLeft).toBe(34);
  });

  it('keeps PDF layout practical without truncating valid ledger lines', () => {
    const score = createEmptyScore('grand', { measureCount: 1 });

    score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.push({
      id: 'pdf-legacy-underflow',
      kind: 'note',
      beat: 0,
      duration: 'quarter',
      pitch: { step: 'C', octave: 0 },
    });

    const layout = createScorePdfLayout(score);
    const event = layout.events.find(
      (candidate) => candidate.event.id === 'pdf-legacy-underflow',
    );

    expect(layout.layout.staffGap).toBeLessThan(210);
    expect(event?.ledgerYs).toHaveLength(4);
    expect(event?.bounds.maxY).toBeLessThanOrEqual(layout.pageSize[1] - 24);
  });

  it('uses active clef changes when laying out PDF note pitch positions', () => {
    const clefResult = trySetClefChange(
      createEmptyScore('grand', { measureCount: 1 }),
      'bass',
      0,
      1,
      'treble',
    );
    const score = placeScoreEvent(clefResult.score, {
      eventId: 'pdf-after-clef-change',
      staffId: 'bass',
      measureIndex: 0,
      beat: 1,
      duration: 'quarter',
      entryMode: 'note',
      pitch: { step: 'D', octave: 5 },
    });
    const layout = createScorePdfLayout(score);
    const event = layout.events.find(
      (candidate) => candidate.event.id === 'pdf-after-clef-change',
    );

    expect(event?.clef).toBe('treble');
    expect(event?.y).toBeCloseTo((event?.staffTop ?? 0) + 8);
  });

  it('uses a clef change at the beginning of a PDF system as the displayed staff clef', () => {
    const score = trySetClefChange(
      createEmptyScore('grand', { measureCount: 1 }),
      'bass',
      0,
      0,
      'treble',
    ).score;
    const layout = createScorePdfLayout(score);
    const bassStaff = layout.staves.find((staff) => staff.id === 'bass');

    expect(bassStaff?.clef).toBe('treble');
  });

  it('keeps the hardening piano fixture event parity in legacy PDF layout', async () => {
    const expectedEvents = getAllScoreEvents(stressPianoHardeningFixture);
    const layout = createScorePdfLayout(stressPianoHardeningFixture);
    const layoutIds = new Set(layout.events.map((event) => event.event.id));
    const pdf = await createScorePdf(stressPianoHardeningFixture);

    expect(layout.events).toHaveLength(expectedEvents.length);
    [
      'stress-voice2-m0-e5',
      'stress-cross-source',
      'stress-cross-target',
      'stress-high-ledger',
      'stress-low-ledger',
      'stress-final-chord',
      'stress-b-final',
    ].forEach((eventId) => expect(layoutIds.has(eventId)).toBe(true));
    expect(
      layout.events.find((event) => event.event.id === 'stress-voice2-m0-e5')
        ?.voiceIndex,
    ).toBe(1);
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it.each(extremeScoreFixtureCatalog)(
    'exports the extreme fixture $label through the legacy PDF layout',
    async (fixture) => {
      const score = fixture.score;
      const expectedEvents = getAllScoreEvents(score);
      const layout = createScorePdfLayout(score);
      const layoutIds = new Set(layout.events.map((event) => event.event.id));
      const pdf = await createScorePdf(score);

      expect(getScoreMusicIssues(score)).toEqual([]);
      expect(expectedEvents).toHaveLength(fixture.expectedEventCount);
      expect(layout.events).toHaveLength(expectedEvents.length);
      expectedEvents.forEach((event) => {
        expect(layoutIds.has(event.id)).toBe(true);
      });
      expect(layout.staves.length).toBeGreaterThan(0);
      expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1000);
    },
  );

  it.each([
    {
      expectedLedgerLines: 3,
      pitch: { step: 'F', octave: 3 },
      scoreType: 'treble',
      staffId: 'treble',
    },
    {
      expectedLedgerLines: 4,
      pitch: { step: 'C', octave: 3 },
      scoreType: 'treble',
      staffId: 'treble',
    },
    {
      expectedLedgerLines: 2,
      pitch: { step: 'A', octave: 3 },
      scoreType: 'treble',
      staffId: 'treble',
    },
    {
      expectedLedgerLines: 1,
      pitch: { step: 'C', octave: 4 },
      scoreType: 'treble',
      staffId: 'treble',
    },
    {
      expectedLedgerLines: 1,
      pitch: { step: 'A', octave: 5 },
      scoreType: 'treble',
      staffId: 'treble',
    },
    {
      expectedLedgerLines: 3,
      pitch: { step: 'E', octave: 6 },
      scoreType: 'treble',
      staffId: 'treble',
    },
    {
      expectedLedgerLines: 2,
      pitch: { step: 'C', octave: 6 },
      scoreType: 'treble',
      staffId: 'treble',
    },
    {
      expectedLedgerLines: 5,
      pitch: { step: 'C', octave: 1 },
      scoreType: 'grand',
      staffId: 'bass',
    },
    {
      expectedLedgerLines: 3,
      pitch: { step: 'A', octave: 1 },
      scoreType: 'grand',
      staffId: 'bass',
    },
    {
      expectedLedgerLines: 2,
      pitch: { step: 'C', octave: 2 },
      scoreType: 'grand',
      staffId: 'bass',
    },
    {
      expectedLedgerLines: 1,
      pitch: { step: 'C', octave: 4 },
      scoreType: 'grand',
      staffId: 'bass',
    },
    {
      expectedLedgerLines: 3,
      pitch: { step: 'G', octave: 4 },
      scoreType: 'grand',
      staffId: 'bass',
    },
    {
      expectedLedgerLines: 2,
      pitch: { step: 'E', octave: 4 },
      scoreType: 'grand',
      staffId: 'bass',
    },
  ])(
    'keeps PDF ledger stress note $pitch.step$pitch.octave on $staffId inside the page',
    ({ expectedLedgerLines, pitch, scoreType, staffId }) => {
      const score = placeScoreEvent(createEmptyScore(scoreType), {
        eventId: 'pdf-ledger-stress',
        staffId,
        measureIndex: 0,
        beat: 0,
        duration: 'quarter',
        entryMode: 'note',
        pitch,
      });
      const layout = createScorePdfLayout(score);
      const event = layout.events.find(
        (candidate) => candidate.event.id === 'pdf-ledger-stress',
      );

      expect(event?.ledgerYs).toHaveLength(expectedLedgerLines);
      expect(event?.bounds.minX).toBeGreaterThanOrEqual(24);
      expect(event?.bounds.maxX).toBeLessThanOrEqual(layout.pageSize[0] - 24);
      expect(event?.bounds.minY).toBeGreaterThanOrEqual(24);
      expect(event?.bounds.maxY).toBeLessThanOrEqual(layout.pageSize[1] - 24);
    },
  );
});
