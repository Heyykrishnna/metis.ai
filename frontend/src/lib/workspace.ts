export type Question = {
  id: string;
  text: string;
  mode: string;
  source: string;
  createdAt: number;
  saved: boolean;
};

export const templates = [
  {
    title: "Find the bigger picture",
    description: "Turn a broad question into a clear starting point.",
    question: "What are the most important trends in this dataset?",
    icon: "chart",
    color: "peach",
    category: "Discover",
  },
  {
    title: "Get to know your data",
    description: "Explore the structure behind the numbers.",
    question:
      "Help me understand the tables, columns, and relationships in my data.",
    icon: "layers",
    color: "lavender",
    category: "Explore",
  },
  {
    title: "Trust, then verify",
    description: "Look closer before drawing a conclusion.",
    question:
      "Check this dataset for missing values, duplicates, and unusual patterns.",
    icon: "shield",
    color: "mint",
    category: "Verify",
  },
  {
    title: "Compare two periods",
    description: "Understand what changed, and by how much.",
    question:
      "Compare performance this month with last month, using the same metric and complete periods.",
    icon: "clock",
    color: "blue",
    category: "Discover",
  },
  {
    title: "Define a better metric",
    description: "Make the meaning behind a metric explicit.",
    question:
      "Help me define a metric with a clear grain, denominator, filters, and time window.",
    icon: "table",
    color: "peach",
    category: "Verify",
  },
  {
    title: "Find your next question",
    description: "Discover useful questions for an unfamiliar dataset.",
    question:
      "What useful questions can I answer with this data? Explain which columns each question needs.",
    icon: "sparkles",
    color: "lavender",
    category: "Explore",
  },
] as const;

export function readQuestions(serialized: string): Question[] {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is Question =>
          typeof item === "object" &&
          item !== null &&
          typeof item.id === "string" &&
          typeof item.text === "string" &&
          item.text.length <= 4000 &&
          typeof item.mode === "string" &&
          typeof item.source === "string" &&
          typeof item.createdAt === "number" &&
          Number.isFinite(item.createdAt) &&
          item.createdAt >= 0 &&
          item.createdAt <= 8640000000000000 &&
          typeof item.saved === "boolean",
      )
      .slice(0, 100);
  } catch {
    return [];
  }
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
