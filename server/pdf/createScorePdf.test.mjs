// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { placeScoreEvent } from '../../src/domain/score/editing';
import { createEmptyScore } from '../../src/domain/score/factories';
import { createScorePdf } from './createScorePdf.mjs';

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
});
