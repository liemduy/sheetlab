export type MidiConnectionStatus =
  | 'idle'
  | 'insecure'
  | 'unsupported'
  | 'requesting'
  | 'ready'
  | 'no-inputs'
  | 'permission-denied'
  | 'error';

export type ParsedMidiEvent =
  | {
      channel: number;
      midiNote: number;
      rawData: readonly number[];
      timestampMs: number;
      type: 'note-on' | 'note-off';
      velocity: number;
    }
  | {
      channel: number;
      controller: number;
      rawData: readonly number[];
      timestampMs: number;
      type: 'control-change';
      value: number;
    };

export interface MidiInputDescriptor {
  id: string;
  manufacturer?: string;
  name: string;
  state?: string;
}

export interface SheetLabMIDIMessageEvent {
  data: ArrayLike<number>;
  timeStamp?: number;
}

export interface SheetLabMIDIInput {
  id: string;
  manufacturer?: string;
  name?: string;
  onmidimessage: ((event: SheetLabMIDIMessageEvent) => void) | null;
  state?: string;
}

export interface SheetLabMIDIAccess {
  inputs: {
    forEach(callback: (input: SheetLabMIDIInput) => void): void;
  };
  onstatechange: (() => void) | null;
}

export interface NavigatorWithMidi {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<SheetLabMIDIAccess>;
}

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

function normalizeData(data: ArrayLike<number>) {
  return Array.from({ length: data.length }, (_, index) => data[index] ?? 0);
}

export function getMidiConnectionStatusLabel(status: MidiConnectionStatus) {
  switch (status) {
    case 'idle':
      return 'MIDI not connected';
    case 'insecure':
      return 'MIDI requires a secure browser context';
    case 'unsupported':
      return 'Web MIDI is not supported in this browser';
    case 'requesting':
      return 'Requesting MIDI access';
    case 'ready':
      return 'MIDI input ready';
    case 'no-inputs':
      return 'No MIDI input detected';
    case 'permission-denied':
      return 'MIDI permission denied';
    case 'error':
      return 'MIDI connection error';
  }
}

export function getMidiInputLabel(input: MidiInputDescriptor) {
  return [input.manufacturer, input.name].filter(Boolean).join(' / ') || input.id;
}

export function getMidiSupportStatus({
  isSecureContext,
  navigatorLike,
}: {
  isSecureContext: boolean;
  navigatorLike: NavigatorWithMidi;
}): MidiConnectionStatus {
  if (!isSecureContext) {
    return 'insecure';
  }

  return typeof navigatorLike.requestMIDIAccess === 'function'
    ? 'idle'
    : 'unsupported';
}

export function parseMidiMessage(
  event: SheetLabMIDIMessageEvent,
): ParsedMidiEvent | null {
  const [statusByte = 0, data1 = 0, data2 = 0] = normalizeData(event.data);
  const command = statusByte & 0xf0;
  const channel = (statusByte & 0x0f) + 1;
  const timestampMs =
    typeof event.timeStamp === 'number' ? event.timeStamp : performance.now();
  const rawData = normalizeData(event.data);

  if (command === 0x90 && data2 > 0) {
    return {
      channel,
      midiNote: data1,
      rawData,
      timestampMs,
      type: 'note-on',
      velocity: data2,
    };
  }

  if (command === 0x80 || (command === 0x90 && data2 === 0)) {
    return {
      channel,
      midiNote: data1,
      rawData,
      timestampMs,
      type: 'note-off',
      velocity: data2,
    };
  }

  if (command === 0xb0) {
    return {
      channel,
      controller: data1,
      rawData,
      timestampMs,
      type: 'control-change',
      value: data2,
    };
  }

  return null;
}

export function formatMidiNote(midiNote: number) {
  const noteName = NOTE_NAMES[((midiNote % 12) + 12) % 12];
  const octave = Math.floor(midiNote / 12) - 1;

  return `${noteName}${octave}`;
}

export function isSustainPedalEvent(
  event: ParsedMidiEvent,
): event is ParsedMidiEvent & {
  controller: number;
  type: 'control-change';
  value: number;
} {
  return (
    event.type === 'control-change' &&
    event.controller === 64
  );
}
