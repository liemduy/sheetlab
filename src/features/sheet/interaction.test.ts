import { describe, expect, it } from 'vitest';
import { placeScoreEvent } from '../../domain/score/editing';
import { createEmptyScore } from '../../domain/score/factories';
import {
  MEASURES_PER_SYSTEM,
  STAFF_LEFT,
  STAFF_GAP,
  STAFF_LINE_SPACING,
  getMeasureContentLeft,
  getScoreStaffGap,
  getScoreSystemGap,
  getStaffTop,
} from './layout';
import {
  formatPitch,
  mapPointToMusicPosition,
  mapStaffYToPitch,
} from './interaction';
import { getBeatX, getPitchY } from './notationGeometry';

describe('sheet interaction mapping', () => {
  it('maps a treble staff point to staff, measure, beat, and pitch', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(1, 1, score.timeSignature.beats),
        y: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      },
      score,
    );

    expect(result).toMatchObject({
      staffId: 'treble',
      staffIndex: 0,
      measureIndex: 1,
      beat: 1,
    });
    expect(result ? formatPitch(result.pitch) : null).toBe('E4');
  });

  it('maps bass staff points in a grand staff score', () => {
    const score = createEmptyScore('grand', { measureCount: 4 });
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(2, 2, score.timeSignature.beats),
        y: getPitchY({ step: 'D', octave: 3 }, 'bass', 1),
      },
      score,
    );

    expect(result).toMatchObject({
      staffId: 'bass',
      staffIndex: 1,
      measureIndex: 2,
      beat: 2,
    });
    expect(result ? formatPitch(result.pitch) : null).toBe('D3');
  });

  it('keeps a dead zone between grand-staff staves', () => {
    const score = createEmptyScore('grand', { measureCount: 4 });
    const staffGap = getScoreStaffGap(score);
    const systemGap = getScoreSystemGap(score);
    const trebleBottom = getStaffTop(0, staffGap, 0, systemGap) + STAFF_LINE_SPACING * 4;
    const bassTop = getStaffTop(1, staffGap, 0, systemGap);
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(0, 0, score.timeSignature.beats),
        y: (trebleBottom + bassTop) / 2,
      },
      score,
      {
        duration: 'eighth',
      },
    );

    expect(result).toBeNull();
  });

  it('still accepts intentional ledger hover near each grand-staff staff', () => {
    const score = createEmptyScore('grand', { measureCount: 4 });
    const staffGap = getScoreStaffGap(score);
    const systemGap = getScoreSystemGap(score);
    const trebleTop = getStaffTop(0, staffGap, 0, systemGap);
    const bassTop = getStaffTop(1, staffGap, 0, systemGap);
    const trebleResult = mapPointToMusicPosition(
      {
        x: getBeatX(0, 0, score.timeSignature.beats),
        y: trebleTop - 66,
      },
      score,
      {
        duration: 'eighth',
      },
    );
    const bassResult = mapPointToMusicPosition(
      {
        x: getBeatX(0, 0, score.timeSignature.beats),
        y: bassTop - 5,
      },
      score,
      {
        duration: 'eighth',
      },
    );

    expect(trebleResult).toMatchObject({
      staffId: 'treble',
    });
    expect(bassResult).toMatchObject({
      staffId: 'bass',
    });
  });

  it('keeps the preferred staff active through the grand-staff ledger overlap', () => {
    const score = createEmptyScore('grand', { measureCount: 4 });
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(0, 0, score.timeSignature.beats),
        y: getPitchY({ step: 'A', octave: 3 }, 'treble', 0),
      },
      score,
      {
        duration: 'eighth',
        preferredStaffId: 'treble',
      },
    );

    expect(result).toMatchObject({
      pitch: { step: 'A', octave: 3 },
      staffId: 'treble',
    });
  });

  it('switches away from the preferred staff inside another staff core', () => {
    const score = createEmptyScore('grand', { measureCount: 4 });
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(0, 0, score.timeSignature.beats),
        y: getPitchY({ step: 'D', octave: 3 }, 'bass', 1),
      },
      score,
      {
        duration: 'eighth',
        preferredStaffId: 'treble',
      },
    );

    expect(result).toMatchObject({
      pitch: { step: 'D', octave: 3 },
      staffId: 'bass',
    });
  });

  it('clamps pointer positions before the note content area to beat zero', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const result = mapPointToMusicPosition(
      {
        x: getMeasureContentLeft(0) - 24,
        y: getPitchY({ step: 'E', octave: 4 }, 'treble', 0),
      },
      score,
    );

    expect(result).toMatchObject({
      measureIndex: 0,
      beat: 0,
    });
  });

  it('maps pointer positions on the second system to later measure indexes', () => {
    const score = createEmptyScore('treble', { measureCount: 8 });
    const systemGap = getScoreSystemGap(score);
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(MEASURES_PER_SYSTEM, 0, score.timeSignature.beats),
        y: getPitchY(
          { step: 'B', octave: 4 },
          'treble',
          0,
          STAFF_GAP,
          MEASURES_PER_SYSTEM,
          systemGap,
        ),
      },
      score,
    );

    expect(result).toMatchObject({
      staffId: 'treble',
      staffIndex: 0,
      measureIndex: MEASURES_PER_SYSTEM,
      beat: 0,
    });
    expect(result ? formatPitch(result.pitch) : null).toBe('B4');
  });

  it('snaps pointer beats using the active input duration', () => {
    const score = createEmptyScore('treble', { measureCount: 4 });
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(0, 1.25, score.timeSignature.beats),
        y: getPitchY({ step: 'B', octave: 4 }, 'treble', 0),
      },
      score,
      {
        duration: 'sixteenth',
      },
    );
    const thirtySecondResult = mapPointToMusicPosition(
      {
        x: getBeatX(0, 1.125, score.timeSignature.beats),
        y: getPitchY({ step: 'B', octave: 4 }, 'treble', 0),
      },
      score,
      {
        duration: 'thirtySecond',
      },
    );

    expect(result).toMatchObject({
      beat: 1.25,
      measureIndex: 0,
      staffId: 'treble',
    });
    expect(thirtySecondResult).toMatchObject({
      beat: 1.125,
      measureIndex: 0,
      staffId: 'treble',
    });
  });

  it('maps points through dynamically widened measure widths', () => {
    const score = placeScoreEvent(
      createEmptyScore('treble', { measureCount: 4 }),
      {
        eventId: 'eighth-note-1',
        staffId: 'treble',
        measureIndex: 0,
        beat: 0,
        duration: 'eighth',
        entryMode: 'note',
        pitch: { step: 'E', octave: 4 },
      },
    );
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(1, 0, score.timeSignature.beats, score),
        y: getPitchY({ step: 'B', octave: 4 }, 'treble', 0),
      },
      score,
    );

    expect(result).toMatchObject({
      beat: 0,
      measureIndex: 1,
      staffId: 'treble',
    });
  });

  it('returns null outside the editable staff area', () => {
    const score = createEmptyScore('treble');

    expect(mapPointToMusicPosition({ x: 20, y: getPitchY({ step: 'E', octave: 4 }, 'treble', 0) }, score)).toBeNull();
    expect(mapPointToMusicPosition({ x: STAFF_LEFT, y: 20 }, score)).toBeNull();
  });

  it.each([
    {
      pitch: { step: 'F' as const, octave: 3 },
      scoreType: 'treble' as const,
      staffId: 'treble',
      staffIndex: 0,
    },
    {
      pitch: { step: 'E' as const, octave: 6 },
      scoreType: 'treble' as const,
      staffId: 'treble',
      staffIndex: 0,
    },
    {
      pitch: { step: 'A' as const, octave: 3 },
      scoreType: 'treble' as const,
      staffId: 'treble',
      staffIndex: 0,
    },
    {
      pitch: { step: 'C' as const, octave: 6 },
      scoreType: 'treble' as const,
      staffId: 'treble',
      staffIndex: 0,
    },
    {
      pitch: { step: 'G' as const, octave: 4 },
      scoreType: 'grand' as const,
      staffId: 'bass',
      staffIndex: 1,
    },
    {
      pitch: { step: 'A' as const, octave: 1 },
      scoreType: 'grand' as const,
      staffId: 'bass',
      staffIndex: 1,
    },
    {
      pitch: { step: 'E' as const, octave: 4 },
      scoreType: 'grand' as const,
      staffId: 'bass',
      staffIndex: 1,
    },
  ])('maps ledger stress pointer $pitch.step$pitch.octave on $staffId', ({
    pitch,
    scoreType,
    staffId,
    staffIndex,
  }) => {
    const score = createEmptyScore(scoreType, { measureCount: 4 });
    const staff = score.parts[0]?.staves[staffIndex];
    const result = mapPointToMusicPosition(
      {
        x: getBeatX(0, 0, score.timeSignature.beats),
        y: getPitchY(pitch, staff?.clef ?? 'treble', staffIndex),
      },
      score,
    );

    expect(result).toMatchObject({
      staffId,
      pitch,
    });
  });

  it('clamps treble pointer pitch to the readable ledger range', () => {
    expect(
      formatPitch(mapStaffYToPitch(getStaffTop(0) + 1000, 'treble', 0)),
    ).toBe('C3');
    expect(
      formatPitch(mapStaffYToPitch(getStaffTop(0) - 1000, 'treble', 0)),
    ).toBe('C7');
  });

  it('clamps bass pointer pitch to the readable ledger range', () => {
    expect(
      formatPitch(mapStaffYToPitch(getStaffTop(1) + 1000, 'bass', 1)),
    ).toBe('A0');
    expect(
      formatPitch(mapStaffYToPitch(getStaffTop(1) - 1000, 'bass', 1)),
    ).toBe('C5');
  });
});
