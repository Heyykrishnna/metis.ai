"use client";

import { useSyncExternalStore } from "react";
import {
  readQuestions,
  serializeQuestions,
  type Question,
} from "@/lib/workspace";

const key = "metis.questions.v1";
const empty: Question[] = [];
let current: Question[] = empty;
let initialized = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (initialized) return;
  initialized = true;
  try {
    current = readQuestions(
      serializeQuestions(readQuestions(localStorage.getItem(key) ?? "[]")),
    );
  } catch {
    current = [];
  }
}

function changedInAnotherTab(event: StorageEvent) {
  if (event.key !== key && event.key !== null) return;
  const restored = readQuestions(event.newValue ?? "[]");
  current = restored.map((question) => {
    const cached = current.find(
      (item) => item.id === question.id && item.runId === question.runId,
    );
    return cached ? { ...cached, ...question } : question;
  });
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", changedInAnotherTab);
  listeners.add(listener);
  hydrate();
  return () => {
    listeners.delete(listener);
    if (!listeners.size)
      window.removeEventListener("storage", changedInAnotherTab);
  };
}

function snapshot() {
  return current;
}
function serverSnapshot() {
  return empty;
}

function updateQuestions(update: (questions: Question[]) => Question[]) {
  hydrate();
  current = update(current).slice(0, 100);
  let saved = true;
  try {
    localStorage.setItem(key, serializeQuestions(current));
  } catch {
    saved = false;
  }
  for (const listener of listeners) listener();
  return saved;
}

export function useQuestions() {
  const questions = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { questions, updateQuestions };
}
