import {
  Accidental as VexFlowAccidental,
  Articulation as VexFlowArticulation,
  Dot,
  ModifierPosition,
  StaveNote,
} from 'vexflow';
import type {
  ArticulationKind,
  Clef,
  ScoreEvent,
  StemDirection,
  Staff,
} from '../../domain/score/types';
import { getDurationBeats } from '../../domain/score/durations';
import {
  getEventDots,
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import { clampPitchToClefRange } from '../../domain/score/pitchRange';
import {
  accidentalToVexFlow,
  durationToVexFlowDuration,
  pitchToVexFlowKey,
  splitBeatsIntoDurations,
} from './vexflowAdapter';

const REST_KEY_BY_CLEF = {
  bass: 'd/3',
  treble: 'b/4',
} satisfies Record<Staff['clef'], string>;

const VEXFLOW_ARTICULATION_BY_KIND = {
  accent: 'a>',
  breath: 'a,',
  caesura: 'a//',
  marcato: 'a^',
  staccato: 'a.',
  staccatissimo: 'av',
  tenuto: 'a-',
} satisfies Record<ArticulationKind, string>;

const ARTICULATION_RENDER_ORDER: ArticulationKind[] = [
  'caesura',
  'breath',
  'staccato',
  'staccatissimo',
  'tenuto',
  'accent',
  'marcato',
];

const VEXFLOW_FERMATA_GLYPHS = new Set([
  String.fromCodePoint(0xe4c0),
  String.fromCodePoint(0xe4c1),
]);

export function getVexFlowEventClasses(event: ScoreEvent) {
  return isGeneratedRestEvent(event)
    ? 'vf-score-event vf-generated-rest'
    : 'vf-score-event vf-user-event';
}

export function isVexFlowFermataArticulation(
  modifier: unknown,
): modifier is VexFlowArticulation {
  return (
    modifier instanceof VexFlowArticulation &&
    VEXFLOW_FERMATA_GLYPHS.has(modifier.getText())
  );
}

export function createVexFlowNote(
  event: ScoreEvent,
  staff: Staff,
  options: {
    clef?: Clef;
    modifierDirection?: StemDirection | null;
    stemDirection?: number;
  } = {},
) {
  const eventDots = getEventDots(event);
  const clef = options.clef ?? staff.clef;
  const { modifierDirection, stemDirection } = options;
  const eventPitches = getEventPitches(event).map((pitch) =>
    clampPitchToClefRange(pitch, clef),
  );
  const staveNote =
    event.kind === 'rest'
      ? new StaveNote({
          clef,
          dots: eventDots || undefined,
          duration: durationToVexFlowDuration(event.duration, true),
          keys: [REST_KEY_BY_CLEF[clef]],
          stemDirection,
        })
      : new StaveNote({
          clef,
          dots: eventDots || undefined,
          duration: durationToVexFlowDuration(event.duration),
          keys: eventPitches.map(pitchToVexFlowKey),
          stemDirection,
        });

  staveNote.addClass(getVexFlowEventClasses(event));
  staveNote.setAttribute('data-event-id', event.id);
  staveNote.setAttribute('data-duration', event.duration);

  if (event.kind !== 'rest') {
    eventPitches.forEach((pitch, pitchIndex) => {
      if (pitch.accidental) {
        staveNote.addModifier(
          new VexFlowAccidental(accidentalToVexFlow(pitch.accidental)),
          pitchIndex,
        );
      }
    });

    ARTICULATION_RENDER_ORDER.filter((articulation) =>
      event.articulations?.includes(articulation),
    ).forEach((articulation) => {
      const vexFlowArticulation = new VexFlowArticulation(
        VEXFLOW_ARTICULATION_BY_KIND[articulation],
      ).setPosition(
        modifierDirection === 'down'
          ? ModifierPosition.BELOW
          : ModifierPosition.ABOVE,
      );

      staveNote.addModifier(vexFlowArticulation, 0);
    });

    if (event.fermata) {
      const vexFlowFermata = new VexFlowArticulation('a@').setPosition(
        modifierDirection === 'down'
          ? ModifierPosition.BELOW
          : ModifierPosition.ABOVE,
      );

      vexFlowFermata.setAttribute('data-event-id', event.id);
      vexFlowFermata.setAttribute('data-testid', 'rendered-fermata');
      staveNote.addModifier(vexFlowFermata, 0);
    }
  }

  if (eventDots > 0) {
    for (let dotIndex = 0; dotIndex < eventDots; dotIndex += 1) {
      Dot.buildAndAttach([staveNote], { all: true });
    }
  }

  return staveNote;
}

export function createEmptyMeasureDisplayRests(
  staffId: Staff['id'],
  measureIndex: number,
  beatsPerMeasure: number,
): ScoreEvent[] {
  let cursorBeat = 0;

  return splitBeatsIntoDurations(beatsPerMeasure).map((duration) => {
    const event: ScoreEvent = {
      beat: cursorBeat,
      duration,
      id: `rest-${staffId}-m${measureIndex + 1}-display-${cursorBeat}-${duration}`,
      kind: 'rest',
    };
    cursorBeat += getDurationBeats(duration);

    return event;
  });
}
