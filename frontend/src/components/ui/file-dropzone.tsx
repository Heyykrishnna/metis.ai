"use client";

import { useRef, useState } from "react";
import { Icon } from "../icon";

export function FileDropzone({
  onFiles,
  busy,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`file-dropzone ${dragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (
          !event.currentTarget.contains(
            event.relatedTarget instanceof Node ? event.relatedTarget : null,
          )
        )
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!busy) onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <span className="dropzone-icon" aria-hidden="true">
        <Icon name="upload" size={20} />
      </span>
      <h3>
        {busy
          ? "Saving your files…"
          : dragging
            ? "Drop files to add them"
            : "Add your data"}
      </h3>
      <p>Drop your files here, or choose them below.</p>
      <button
        className="button"
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Icon name="upload" size={16} />
        {busy ? "Saving files…" : "Choose files"}
      </button>
      <span className="file-note">
        CSV, JSON, TXT, MD · Up to 5 MB each · 10 files
      </span>
      <input
        ref={input}
        className="sr-only"
        type="file"
        aria-label="Choose workspace files"
        tabIndex={-1}
        accept=".csv,.json,.txt,.md"
        multiple
        disabled={busy}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </div>
  );
}
