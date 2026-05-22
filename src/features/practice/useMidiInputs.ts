import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type MidiConnectionStatus,
  type MidiInputDescriptor,
  type NavigatorWithMidi,
  type ParsedMidiEvent,
  type SheetLabMIDIAccess,
  type SheetLabMIDIInput,
  getMidiSupportStatus,
  isSustainPedalEvent,
  parseMidiMessage,
} from './midiAccess';

const RECENT_EVENT_LIMIT = 16;

function getNavigatorWithMidi(): NavigatorWithMidi {
  return navigator as NavigatorWithMidi;
}

function getAccessInputs(access: SheetLabMIDIAccess): SheetLabMIDIInput[] {
  const inputs: SheetLabMIDIInput[] = [];

  access.inputs.forEach((input) => inputs.push(input));
  return inputs;
}

function toInputDescriptor(input: SheetLabMIDIInput): MidiInputDescriptor {
  return {
    id: input.id,
    manufacturer: input.manufacturer,
    name: input.name ?? 'MIDI input',
    state: input.state,
  };
}

export function useMidiInputs(
  onMidiEvent?: (event: ParsedMidiEvent) => void,
) {
  const onMidiEventRef = useRef(onMidiEvent);
  const accessRef = useRef<SheetLabMIDIAccess | null>(null);
  const connectedInputRef = useRef<SheetLabMIDIInput | null>(null);
  const [status, setStatus] = useState<MidiConnectionStatus>(() =>
    getMidiSupportStatus({
      isSecureContext: window.isSecureContext,
      navigatorLike: getNavigatorWithMidi(),
    }),
  );
  const [inputs, setInputs] = useState<MidiInputDescriptor[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [activeMidiNotes, setActiveMidiNotes] = useState<number[]>([]);
  const [recentEvents, setRecentEvents] = useState<ParsedMidiEvent[]>([]);
  const [sustainPedalDown, setSustainPedalDown] = useState(false);

  useEffect(() => {
    onMidiEventRef.current = onMidiEvent;
  }, [onMidiEvent]);

  const refreshInputs = useCallback((access = accessRef.current) => {
    if (!access) {
      return;
    }

    const nextInputs = getAccessInputs(access).map(toInputDescriptor);

    setInputs(nextInputs);
    setSelectedInputId((currentInputId) => {
      if (currentInputId && nextInputs.some((input) => input.id === currentInputId)) {
        return currentInputId;
      }

      return nextInputs[0]?.id ?? null;
    });
    setStatus(nextInputs.length > 0 ? 'ready' : 'no-inputs');
  }, []);

  const connect = useCallback(async () => {
    const navigatorWithMidi = getNavigatorWithMidi();
    const supportStatus = getMidiSupportStatus({
      isSecureContext: window.isSecureContext,
      navigatorLike: navigatorWithMidi,
    });

    if (supportStatus !== 'idle') {
      setStatus(supportStatus);
      return;
    }

    try {
      setStatus('requesting');
      const access = await navigatorWithMidi.requestMIDIAccess?.({ sysex: false });

      if (!access) {
        setStatus('unsupported');
        return;
      }

      accessRef.current = access;
      access.onstatechange = () => refreshInputs(access);
      refreshInputs(access);
    } catch (error) {
      const name =
        error && typeof error === 'object' && 'name' in error
          ? String((error as { name?: unknown }).name)
          : '';

      setStatus(name === 'NotAllowedError' ? 'permission-denied' : 'error');
    }
  }, [refreshInputs]);

  useEffect(() => {
    const access = accessRef.current;

    if (!access || !selectedInputId) {
      return;
    }

    const selectedInput = getAccessInputs(access).find(
      (input) => input.id === selectedInputId,
    );

    if (!selectedInput) {
      return;
    }

    if (connectedInputRef.current && connectedInputRef.current !== selectedInput) {
      connectedInputRef.current.onmidimessage = null;
    }

    connectedInputRef.current = selectedInput;
    selectedInput.onmidimessage = (message) => {
      const parsedEvent = parseMidiMessage(message);

      if (!parsedEvent) {
        return;
      }

      setRecentEvents((currentEvents) =>
        [parsedEvent, ...currentEvents].slice(0, RECENT_EVENT_LIMIT),
      );

      if (parsedEvent.type === 'note-on') {
        setActiveMidiNotes((currentNotes) =>
          currentNotes.includes(parsedEvent.midiNote)
            ? currentNotes
            : [...currentNotes, parsedEvent.midiNote].sort((a, b) => a - b),
        );
      } else if (parsedEvent.type === 'note-off') {
        setActiveMidiNotes((currentNotes) =>
          currentNotes.filter((note) => note !== parsedEvent.midiNote),
        );
      } else if (isSustainPedalEvent(parsedEvent)) {
        setSustainPedalDown(parsedEvent.value >= 64);
      }

      onMidiEventRef.current?.(parsedEvent);
    };

    return () => {
      selectedInput.onmidimessage = null;
    };
  }, [selectedInputId]);

  const selectedInput = useMemo(
    () => inputs.find((input) => input.id === selectedInputId) ?? null,
    [inputs, selectedInputId],
  );

  return {
    activeMidiNotes,
    connect,
    inputs,
    recentEvents,
    selectedInput,
    selectedInputId,
    setSelectedInputId,
    status,
    sustainPedalDown,
  };
}
