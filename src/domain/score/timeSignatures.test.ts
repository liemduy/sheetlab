import { describe, expect, it } from 'vitest';
import {
  getMeasureBeats,
  getTimeSignatureId,
  parseTimeSignatureId,
} from './timeSignatures';

describe('time signatures', () => {
  it('maps supported signatures to internal quarter-note beat lengths', () => {
    expect(getMeasureBeats({ beats: 3, beatUnit: 4 })).toBe(3);
    expect(getMeasureBeats({ beats: 6, beatUnit: 8 })).toBe(3);
  });

  it('parses only supported time signature ids', () => {
    expect(parseTimeSignatureId('6/8')).toEqual({ beats: 6, beatUnit: 8 });
    expect(parseTimeSignatureId('7/16')).toBeNull();
    expect(getTimeSignatureId({ beats: 12, beatUnit: 8 })).toBe('12/8');
  });
});
