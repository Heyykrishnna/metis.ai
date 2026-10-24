"use client";

import { useMemo, useSyncExternalStore } from "react";
import { readQuestions, type Question } from "@/lib/workspace";

const key = "metis.questions.v1";
const eventName = "metis-questions-change";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(eventName, listener);
  };
}

function snapshot() {
  try {
    return localStorage.getItem(key) ?? "[]";
  } catch {
    return "[]";
  }
}

export function useQuestions() {
  const serialized = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const questions = useMemo(() => readQuestions(serialized), [serialized]);
  function updateQuestions(update: (current: Question[]) => Question[]) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(update(readQuestions(snapshot())).slice(0, 100)),
      );
      window.dispatchEvent(new Event(eventName));
      return true;
    } catch {
      return false;
    }
  }
  return { questions, updateQuestions };
}
