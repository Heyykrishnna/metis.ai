"use client";

import { useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { workspaceSpring } from "@/lib/motion";
import { MAX_FILES, MAX_FILE_SIZE } from "@/lib/local-files";
import { Icon } from "../icon";
import { Orb } from "./orb";
import "./file-dropzone.css";

export function FileDropzone({
  onFiles,
  busy,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const descriptionId = useId();
  const reduced = useReducedMotion();
  const transition = reduced ? { duration: 0 } : workspaceSpring;
  const spread = !reduced && (dragging || hovered);
  return (
    <div
      className={`file-dropzone ${dragging ? "dragging" : ""}`}
      data-slot="file-dropzone"
      role="region"
      aria-label="File upload"
      aria-busy={busy}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        if (!busy) setDragging(true);
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
      <motion.button
        className="dropzone-trigger"
        type="button"
        disabled={busy}
        aria-label={busy ? "Saving workspace files" : "Choose files"}
        aria-describedby={descriptionId}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => input.current?.click()}
        initial={false}
        animate={{ backgroundColor: dragging ? "#edf3e8" : "#f8faf6" }}
        transition={transition}
      >
        <span className="dropzone-art" aria-hidden="true">
          {busy ? (
            <Orb />
          ) : (
            <>
              <motion.span
                className="dropzone-paper"
                animate={{ rotate: spread ? -20 : -9, x: spread ? -18 : -9 }}
                transition={transition}
              />
              <motion.span
                className="dropzone-paper"
                animate={{ rotate: spread ? 20 : 9, x: spread ? 18 : 9 }}
                transition={transition}
              />
              <motion.span
                className="dropzone-paper dropzone-paper-front"
                animate={{ y: spread ? -4 : 0, scale: spread ? 1.03 : 1 }}
                transition={transition}
              >
                <span />
                <span />
                <Icon name="up" size={18} />
              </motion.span>
            </>
          )}
        </span>
        <strong>
          {busy
            ? "Saving your files"
            : dragging
              ? "Drop to add your files"
              : "Add files to your workspace"}
        </strong>
        <span id={descriptionId}>
          {busy
            ? "Reading, validating, and saving your data."
            : "Drag and drop here, or choose from your device."}
        </span>
        <span className="dropzone-browse">
          {busy ? "Syncing with your workspace…" : "Choose files"}
          <Icon name={busy ? "clock" : "plus"} size={14} />
        </span>
        <span className="file-note">
          CSV, JSON, TXT, MD · Up to {MAX_FILE_SIZE / (1024 * 1024)} MB each ·{" "}
          {MAX_FILES} files
        </span>
      </motion.button>
      {busy && (
        <span className="sr-only" role="status">
          Saving files and syncing your workspace. Please wait.
        </span>
      )}
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
