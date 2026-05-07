// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { placeScoreEvent } from '../../src/domain/score/editing';
import { createEmptyScore } from '../../src/domain/score/factories';
import { createScorePdf, createScorePdfLayout } from './createScorePdf.mjs';

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

  it.each([
    {
      expectedLedgerLines: 3,
      pitch: { step: 'F', octave: 3 },
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
