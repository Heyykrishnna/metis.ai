import React from "react";

interface FormattedMarkdownProps {
  content: string;
  className?: string;
}

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push(
        <code key={key++} className="markdown-inline-code">
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const boldItalicMatch = remaining.match(/^(\*\*\*|___)(.+?)\1/);
    if (boldItalicMatch) {
      nodes.push(
        <strong key={key++}>
          <em>{parseInline(boldItalicMatch[2])}</em>
        </strong>,
      );
      remaining = remaining.slice(boldItalicMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      nodes.push(<strong key={key++}>{parseInline(boldMatch[2])}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^(\*|_)([^*_]+?)\1/);
    if (italicMatch) {
      nodes.push(<em key={key++}>{parseInline(italicMatch[2])}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      nodes.push(
        <a
          key={key++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="markdown-link"
        >
          {linkMatch[1]}
        </a>,
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/[`*_\[]/);
    if (nextSpecial === -1) {
      nodes.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      nodes.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      nodes.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return nodes;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutEnds = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEnds.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = parseTableRow(line);
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s+/g, "")))
  );
}

function getCellAlignment(
  separatorCell: string,
): "left" | "center" | "right" | undefined {
  const clean = separatorCell.trim();
  const left = clean.startsWith(":");
  const right = clean.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return undefined;
}

export function FormattedMarkdown({
  content,
  className = "",
}: FormattedMarkdownProps) {
  if (!content) return null;

  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let i = 0;
  let elementKey = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Code block: ``` ... ```
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++;
      elements.push(
        <div key={elementKey++} className="markdown-code-container">
          <pre>
            <code data-language={lang || undefined}>
              {codeLines.join("\n")}
            </code>
          </pre>
        </div>,
      );
      continue;
    }

    // Horizontal rule: ---, ***, ___
    if (/^(?:---|\*\*\*|___)$/.test(trimmed)) {
      elements.push(<hr key={elementKey++} className="markdown-divider" />);
      i++;
      continue;
    }

    // Headings: #, ##, ###, ####
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!;
      if (level === 1) {
        elements.push(
          <h2 key={elementKey++} className="markdown-h1">
            {parseInline(text)}
          </h2>,
        );
      } else if (level === 2) {
        elements.push(
          <h3 key={elementKey++} className="markdown-h2">
            {parseInline(text)}
          </h3>,
        );
      } else if (level === 3) {
        elements.push(
          <h4 key={elementKey++} className="markdown-h3">
            {parseInline(text)}
          </h4>,
        );
      } else {
        elements.push(
          <h5 key={elementKey++} className="markdown-h4">
            {parseInline(text)}
          </h5>,
        );
      }
      i++;
      continue;
    }

    // Blockquote: > text
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith(">")) {
        quoteLines.push(lines[i]!.trim().replace(/^>\s?/, ""));
        i++;
      }
      elements.push(
        <blockquote key={elementKey++} className="markdown-blockquote">
          {quoteLines.map((qLine, qIdx) => (
            <p key={qIdx} className="markdown-p">
              {parseInline(qLine)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Table: starts with | and next line is separator | --- |
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1]!)
    ) {
      const headers = parseTableRow(line);
      const separatorRow = parseTableRow(lines[i + 1]!);
      const alignments = separatorRow.map(getCellAlignment);
      i += 2;

      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().includes("|")) {
        const rowLine = lines[i]!.trim();
        if (rowLine.length === 0 || isTableSeparator(rowLine)) {
          i++;
          continue;
        }
        bodyRows.push(parseTableRow(rowLine));
        i++;
      }

      elements.push(
        <div key={elementKey++} className="markdown-table-wrapper">
          <div className="markdown-table-scroll">
            <table className="markdown-table">
              <thead>
                <tr>
                  {headers.map((th, thIdx) => (
                    <th
                      key={thIdx}
                      style={{ textAlign: alignments[thIdx] ?? "left" }}
                    >
                      {parseInline(th)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {headers.map((_, colIdx) => (
                      <td
                        key={colIdx}
                        style={{ textAlign: alignments[colIdx] ?? "left" }}
                      >
                        {parseInline(row[colIdx] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>,
      );
      continue;
    }

    // Unordered or ordered list items
    if (/^(?:[-*•]|\d+\.)\s+/.test(trimmed)) {
      const isOrdered = /^\d+\.\s+/.test(trimmed);
      const listItems: string[] = [];

      while (i < lines.length) {
        const currentTrim = lines[i]!.trim();
        const match = isOrdered
          ? currentTrim.match(/^\d+\.\s+(.+)$/)
          : currentTrim.match(/^(?:[-*•])\s+(.+)$/);

        if (!match) break;
        listItems.push(match[1]!);
        i++;
      }

      if (isOrdered) {
        elements.push(
          <ol key={elementKey++} className="markdown-ol">
            {listItems.map((item, itemIdx) => (
              <li key={itemIdx} className="markdown-li">
                {parseInline(item)}
              </li>
            ))}
          </ol>,
        );
      } else {
        elements.push(
          <ul key={elementKey++} className="markdown-ul">
            {listItems.map((item, itemIdx) => (
              <li key={itemIdx} className="markdown-li">
                {parseInline(item)}
              </li>
            ))}
          </ul>,
        );
      }
      continue;
    }

    // Normal paragraph
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim().length > 0 &&
      !lines[i]!.trim().startsWith("#") &&
      !lines[i]!.trim().startsWith("```") &&
      !/^(?:---|\*\*\*|___)$/.test(lines[i]!.trim()) &&
      !lines[i]!.trim().startsWith(">") &&
      !/^(?:[-*•]|\d+\.)\s+/.test(lines[i]!.trim()) &&
      !(
        lines[i]!.trim().includes("|") &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1]!)
      )
    ) {
      paragraphLines.push(lines[i]!);
      i++;
    }

    if (paragraphLines.length > 0) {
      elements.push(
        <p key={elementKey++} className="markdown-p">
          {paragraphLines.map((pLine, pIdx) => (
            <React.Fragment key={pIdx}>
              {pIdx > 0 && <br />}
              {parseInline(pLine)}
            </React.Fragment>
          ))}
        </p>,
      );
    }
  }

  return (
    <div className={`markdown-content ${className}`.trim()}>{elements}</div>
  );
}
