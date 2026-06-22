import { StaveNote, Tuplet } from 'vexflow';
import type {
  Score,
  ScoreEvent,
  Staff,
  StemDirection,
} from '../../domain/score/types';
import { getActiveClefState } from '../../domain/score/clefChanges';
import { getEffectiveStemDirection } from '../../domain/score/stemDirection';

export function createVexFlowTuplets(
  events: ScoreEvent[],
  notes: StaveNote[],
  score: Score,
  staff: Staff,
  measureIndex: number,
  hasMultipleVoices: boolean,
  voiceIndex: number,
) {
  const groups = new Map<
    string,
    {
      actualNotes: number;
      direction: StemDirection | null;
      normalNotes: number;
      notesByIndex: Map<number, StaveNote>;
    }
  >();

  events.forEach((event, eventIndex) => {
    if (!event.tuplet) {
      return;
    }

    const note = notes[eventIndex];

    if (!note) {
      return;
    }

    const group = groups.get(event.tuplet.id) ?? {
      actualNotes: event.tuplet.actualNotes,
      direction: (() => {
        const activeClefState = getActiveClefState(
          score,
          staff.id,
          measureIndex,
          event.beat,
        );

        return getEffectiveStemDirection({
          clef: activeClefState.clef,
          clefOctaveShift: activeClefState.octaveShift,
          event,
          hasMultipleVoices,
          voiceIndex,
        });
      })(),
      normalNotes: event.tuplet.normalNotes,
      notesByIndex: new Map<number, StaveNote>(),
    };

    group.notesByIndex.set(event.tuplet.index, note);
    groups.set(event.tuplet.id, group);
  });

  return [...groups.entries()].flatMap(([tupletId, group]) => {
    const tupletNotes = [...group.notesByIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, note]) => note);

    if (tupletNotes.length < 2) {
      return [];
    }

    const tuplet = new Tuplet(tupletNotes, {
      bracketed: true,
      location:
        group.direction === 'down'
          ? Tuplet.LOCATION_BOTTOM
          : Tuplet.LOCATION_TOP,
      notesOccupied: group.normalNotes,
      numNotes: group.actualNotes,
      ratioed: false,
    });

    return [{ id: tupletId, tuplet }];
  });
}
