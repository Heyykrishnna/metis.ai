"use client";

import { useEffect, useState, type RefObject } from "react";
import { Icon } from "../icon";

export function PromptEditor({
  value,
  onChange,
  onSubmit,
  inputRef,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
}) {
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const selected = selection ? value.slice(selection.start, selection.end) : "";

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(220, Math.max(84, element.scrollHeight))}px`;
  }, [inputRef, value]);

  function editSelection(quote: boolean) {
    if (!selection || !selected.trim()) return;
    const next = quote
      ? `${value.slice(0, selection.start)}“${selected}”${value.slice(selection.end)}`
      : selected;
    if (next.length > 4000) return;
    onChange(next);
    setSelection(null);
    inputRef.current?.focus();
  }

  return (
    <div className="prompt-editor">
      {selected.trim() && (
        <div
          className="selection-toolbar"
          role="toolbar"
          aria-label="Edit selected question text"
        >
          <span>{selected.length} selected</span>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editSelection(false)}
          >
            Keep selection
          </button>
          <button
            type="button"
            disabled={value.length > 3998}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editSelection(true)}
          >
            Quote selection
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss selection tools"
            onClick={() => setSelection(null)}
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
      <textarea
        ref={inputRef}
        aria-label="Your analysis question"
        maxLength={4000}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setSelection(null);
        }}
        onSelect={(event) => {
          const element = event.currentTarget;
          setSelection(
            element.selectionStart === element.selectionEnd
              ? null
              : { start: element.selectionStart, end: element.selectionEnd },
          );
        }}
        placeholder={placeholder}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSelection(null);
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (value.trim()) onSubmit();
          }
        }}
      />
    </div>
  );
}
