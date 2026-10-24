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
      <div className="file-art" aria-hidden="true">
        <span className="file-art-back" />
        <span className="file-art-front">
          <Icon name="file" size={28} />
        </span>
        <span className="file-art-plus">
          <Icon name="plus" size={14} />
        </span>
      </div>
      <h3>
        {busy
          ? "Reading your files…"
          : dragging
            ? "A good place to drop your data"
            : "A little context goes a long way"}
      </h3>
      <p>Drop your files here, or choose them below.</p>
      <button
        className="button"
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Icon name="upload" size={16} />
        {busy ? "Reading files…" : "Choose files"}
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
