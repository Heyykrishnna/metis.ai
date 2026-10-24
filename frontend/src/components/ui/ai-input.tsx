"use client";

import { useRef } from "react";
import { PromptEditor } from "./prompt-editor";
import { Icon, type IconName } from "../icon";

const modes: { label: string; icon: IconName }[] = [
  { label: "Ask your data", icon: "sparkles" },
  { label: "Explore schema", icon: "table" },
  { label: "Verify a claim", icon: "shield" },
];

export function AIInput({
  value,
  onChange,
  onSubmit,
  onAttach,
  source,
  mode,
  onModeChange,
  sourceCount,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAttach: () => void;
  source: string;
  mode: string;
  onModeChange: (mode: string) => void;
  sourceCount: number;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="composer-shell">
      <div className="composer-modes" aria-label="Analysis mode">
        {modes.map(({ label, icon }) => (
          <button
            type="button"
            key={label}
            className={mode === label ? "mode-button selected" : "mode-button"}
            aria-pressed={mode === label}
            onClick={() => {
              onModeChange(label);
              input.current?.focus();
            }}
          >
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </div>
      <form
        className="prompt-input"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="prompt-text">
          <PromptEditor
            inputRef={input}
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder={
              mode === "Verify a claim"
                ? "What would you like to double-check?"
                : mode === "Explore schema"
                  ? "Which fields would you like to explore?"
                  : "Ask a question about your data…"
            }
          />
        </div>
        <div className="prompt-toolbar">
          <div className="prompt-tools">
            <button
              className="icon-button attach"
              type="button"
              aria-label="Attach a file"
              onClick={onAttach}
            >
              <Icon name="plus" />
            </button>
            <button
              type="button"
              className="source-selector"
              onClick={onAttach}
            >
              <Icon name="database" size={15} />
              <span>{source}</span>
              <Icon name="down" size={13} />
            </button>
          </div>
          <div className="prompt-tools">
            <span className="input-shortcut" aria-hidden="true">
              ↵ Ask <span>⇧↵ New line</span>
            </span>
            <span
              className="local-model"
              title="NVIDIA Nemotron 3.5 Lightning plans supported file questions; values are calculated from stored records."
            >
              <span className="model-indicator" /> Nemotron 3.5{" "}
              <span className="model-local">NVIDIA</span>
            </span>
            <button
              type="submit"
              className="send-button"
              disabled={!value.trim()}
              aria-label="Submit question"
            >
              <Icon name="up" size={17} />
            </button>
          </div>
        </div>
      </form>
      <div className="composer-caption">
        <span>
          <Icon name="shield" size={12} /> Read-only by design. Evidence with
          every answer.
        </span>
        <span>
          {sourceCount
            ? `${sourceCount} stored ${sourceCount === 1 ? "file" : "files"} available`
            : "Your data stays yours"}
        </span>
      </div>
    </div>
  );
}
