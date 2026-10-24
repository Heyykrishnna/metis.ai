"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tokenizeSql } from "@/lib/sql-display";
import { Icon } from "../icon";

export function CodeBlock({
  code,
  filename = "analysis.sql",
}: {
  code: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokens = useMemo(() => tokenizeSql(code), [code]);
  const lineCount = code.split("\n").length;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setError("");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        "Copy is unavailable. Select the query text to copy it manually.",
      );
    }
  }

  return (
    <section className="code-block" aria-label="Executed SQL query">
      <div className="code-block-toolbar">
        <div>
          <Icon name="code" size={15} />
          <span>{filename}</span>
          <span className="code-language">SQL</span>
        </div>
        <div>
          <button
            type="button"
            aria-pressed={wrapped}
            onClick={() => setWrapped(!wrapped)}
          >
            Wrap lines
          </button>
          <button type="button" onClick={() => void copy()}>
            <Icon name={copied ? "check" : "copy"} size={14} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div
        className={`code-block-body ${wrapped ? "is-wrapped" : ""}`}
        tabIndex={0}
        aria-label="SQL source, scroll to read"
      >
        <pre className="code-line-numbers" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => index + 1).join(
            "\n",
          )}
        </pre>
        <pre className="code-source">
          <code>
            {tokens.map((token, index) => (
              <span className={`sql-token-${token.kind}`} key={index}>
                {token.text}
              </span>
            ))}
          </code>
        </pre>
      </div>
      <div className="code-block-footer">
        <span>
          <Icon name="shield" size={12} />
          Executed read-only query
        </span>
        <span>
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
      </div>
      <p className={error ? "code-copy-error" : "sr-only"} role="status">
        {error || (copied ? "SQL copied to clipboard" : "")}
      </p>
    </section>
  );
}
