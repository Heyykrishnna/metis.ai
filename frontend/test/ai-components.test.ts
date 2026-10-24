import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileDropzone } from "../src/components/ui/file-dropzone";
import { ThinkingPanel } from "../src/components/ui/thinking-panel";
import { AIInput } from "../src/components/ui/ai-input";
import type { Question } from "../src/lib/workspace";

const question: Question = {
  id: "question-1",
  text: "How many rows are there?",
  mode: "Ask your data",
  source: "records.csv",
  fileId: "file-1",
  createdAt: 1,
  saved: false,
};

function renderComposer(syncing: boolean) {
  return renderToStaticMarkup(
    createElement(AIInput, {
      value: "How many rows are there?",
      onChange: () => undefined,
      onSubmit: () => undefined,
      onAttach: () => undefined,
      onSelectSource: () => undefined,
      source: "records.csv",
      sourceCount: 1,
      mode: "Ask your data",
      onModeChange: () => undefined,
      syncing,
    }),
  );
}

describe("source synchronization", () => {
  it("places the searching orb in the source selector and waits before submitting", () => {
    const html = renderComposer(true);
    expect(html).toContain("Syncing workspace…");
    expect(html).toContain('data-state="searching"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*aria-label="Submit question"/,
    );
  });

  it("restores the selected source when synchronization finishes", () => {
    const html = renderComposer(false);
    expect(html).toContain("records.csv");
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain("Syncing workspace…");
    expect(html).not.toContain('data-state="searching"');
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });
});

describe("file upload states", () => {
  it("offers a native multi-file chooser with supported formats", () => {
    const html = renderToStaticMarkup(
      createElement(FileDropzone, { busy: false, onFiles: () => undefined }),
    );
    expect(html).toContain('aria-label="Choose files"');
    expect(html).toContain('accept=".csv,.json,.txt,.md"');
    expect(html).toContain('multiple=""');
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });

  it("prevents repeat uploads and shows searching activity while saving", () => {
    const html = renderToStaticMarkup(
      createElement(FileDropzone, { busy: true, onFiles: () => undefined }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(html).toContain('data-state="searching"');
    expect(html).toContain(
      "Saving files and syncing your workspace. Please wait.",
    );
    expect(html).not.toContain("100%");
  });
});

describe("thinking panel states", () => {
  it("opens with real pending activity and the searching orb", () => {
    const html = renderToStaticMarkup(
      createElement(ThinkingPanel, {
        question: { ...question, status: "planning" },
      }),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-state="searching"');
    expect(html).toContain("Planning the analysis");
    expect(html).not.toContain("Draft analysis question");
    expect(html).not.toContain("Evidence available");
  });

  it("collapses completed activity with an accessible disclosure control", () => {
    const html = renderToStaticMarkup(
      createElement(ThinkingPanel, {
        question: { ...question, status: "answered" },
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-controls=");
    expect(html).toContain('inert=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('data-state="searching"');
  });

  it("shows interrupted runs without a successful completion indicator", () => {
    const html = renderToStaticMarkup(
      createElement(ThinkingPanel, {
        question: { ...question, status: "execution_failed" },
      }),
    );
    expect(html).toContain("Analysis interrupted");
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('data-state="searching"');
  });

  it("escapes untrusted source names", () => {
    const html = renderToStaticMarkup(
      createElement(ThinkingPanel, {
        question: {
          ...question,
          source: '<img src=x onerror="alert(1)">',
          status: "planning",
        },
      }),
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});
