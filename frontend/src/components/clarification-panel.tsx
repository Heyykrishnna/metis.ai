"use client";

import { useId } from "react";
import type { LocalDocument } from "@/lib/local-files";
import type { Question } from "@/lib/workspace";
import { Icon } from "./icon";

export function ClarificationPanel({
  question,
  document,
  value,
  onChange,
  onSubmit,
  busy,
}: {
  question: Question;
  document?: LocalDocument;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const id = useId();
  const answer = question.result?.answer;
  const reason =
    answer && answer.status !== "answered"
      ? answer.reason
      : "Which field and calculation would you like to use?";
  const remaining = Math.max(
    0,
    4000 - question.text.length - "\nClarification: ".length,
  );
  return (
    <section
      className="clarification-panel"
      aria-labelledby={`${id}-title`}
      aria-busy={busy}
    >
      <div className="clarification-heading">
        <span className="soft-icon amber">
          <Icon name="help" size={17} />
        </span>
        <div>
          <span className="eyebrow">ONE DETAIL TO CONFIRM</span>
          <h2 id={`${id}-title`}>Let’s make the question precise</h2>
        </div>
        <span className="status-chip amber">Needs your input</span>
      </div>
      <p className="clarification-question">{reason}</p>
      <p className="clarification-hint">
        {answer && answer.status !== "answered"
          ? answer.nextAction
          : "Add the missing detail to continue with the same source."}
      </p>
      {document?.columns.length ? (
        <div className="clarification-fields">
          <span>Available fields</span>
          <div>
            {document.columns.slice(0, 12).map((field) => (
              <button
                type="button"
                key={field}
                disabled={busy || field.length > remaining}
                onClick={() => onChange(field)}
              >
                {field}
              </button>
            ))}
          </div>
          {document.columns.length > 12 && (
            <small>
              {document.columns.length - 12} more fields are listed in the
              Schema tab.
            </small>
          )}
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim() && !busy) onSubmit();
        }}
      >
        <label htmlFor={`${id}-reply`}>Your clarification</label>
        <textarea
          id={`${id}-reply`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={remaining}
          disabled={busy || !remaining}
          rows={3}
          placeholder="For example: use the Salary column, grouped by Department."
          aria-describedby={`${id}-hint`}
        />
        <div className="clarification-footer">
          <span id={`${id}-hint`}>
            {remaining
              ? "Your original question and source stay attached."
              : "This question has reached the length limit. Refine it to a shorter question."}
          </span>
          <button
            type="submit"
            className="button button-dark"
            disabled={busy || !value.trim() || value.length > remaining}
          >
            {busy ? "Checking your clarification…" : "Continue analysis"}
            <Icon name={busy ? "clock" : "arrow"} size={14} />
          </button>
        </div>
      </form>
    </section>
  );
}
