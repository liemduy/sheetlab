import { useEffect, useMemo, useRef, useState } from 'react';

export interface CommandPaletteCommand {
  disabled?: boolean;
  group: string;
  id: string;
  label: string;
  run: () => void;
  shortcut?: string;
}

interface CommandPaletteProps {
  commands: CommandPaletteCommand[];
  onClose: () => void;
  open: boolean;
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function commandMatchesQuery(command: CommandPaletteCommand, query: string) {
  if (!query) {
    return true;
  }

  return `${command.group} ${command.label} ${command.shortcut ?? ''}`
    .toLowerCase()
    .includes(query);
}

export function CommandPalette({
  commands,
  onClose,
  open,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const filteredCommands = useMemo(() => {
    const searchText = normalizeSearchText(query);

    return commands.filter((command) =>
      commandMatchesQuery(command, searchText),
    );
  }, [commands, query]);
  const activeCommand = filteredCommands[activeIndex];

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery('');
    setActiveIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filteredCommands.length) {
      setActiveIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [activeIndex, filteredCommands.length]);

  if (!open) {
    return null;
  }

  function runCommand(command: CommandPaletteCommand | undefined) {
    if (!command || command.disabled) {
      return;
    }

    command.run();
    onClose();
  }

  return (
    <div
      className="command-palette-backdrop"
      data-testid="command-palette"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-label="Command palette"
        aria-modal="true"
        className="command-palette"
        role="dialog"
      >
        <input
          ref={inputRef}
          aria-label="Command search"
          className="command-palette-input"
          placeholder="Search command"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
              return;
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((current) =>
                filteredCommands.length === 0
                  ? 0
                  : Math.min(current + 1, filteredCommands.length - 1),
              );
              return;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) => Math.max(0, current - 1));
              return;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              runCommand(activeCommand);
            }
          }}
        />
        <div className="command-palette-list" role="listbox">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((command, index) => (
              <button
                key={command.id}
                type="button"
                aria-selected={index === activeIndex}
                className={`command-palette-option${
                  index === activeIndex ? ' is-active' : ''
                }`}
                disabled={command.disabled}
                role="option"
                onClick={() => runCommand(command)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="command-palette-option-main">
                  <span>{command.label}</span>
                  <span>{command.group}</span>
                </span>
                {command.shortcut ? (
                  <kbd>{command.shortcut}</kbd>
                ) : null}
              </button>
            ))
          ) : (
            <p className="command-palette-empty">No matching command</p>
          )}
        </div>
      </section>
    </div>
  );
}
