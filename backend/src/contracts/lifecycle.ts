import type { RunStatus } from "./analysis.js";

const transitions: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["parsing"],
  parsing: ["retrieving", "needs_clarification", "abstained"],
  retrieving: ["grounding", "abstained"],
  grounding: ["planning", "abstained"],
  planning: ["generating", "needs_clarification", "abstained"],
  generating: ["authorizing", "abstained"],
  authorizing: ["estimating", "generating", "blocked_by_policy"],
  estimating: ["executing", "generating", "blocked_by_policy"],
  executing: ["verifying", "generating"],
  verifying: ["challenging", "answered", "generating", "abstained"],
  challenging: ["answered", "needs_clarification", "generating", "abstained"],
  answered: [],
  needs_clarification: [],
  abstained: [],
  blocked_by_policy: [],
  execution_failed: [],
  timed_out: [],
  cancelled: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  if (transitions[from].length === 0) return false;
  return (
    ["cancelled", "timed_out", "execution_failed"].includes(to) ||
    transitions[from].includes(to)
  );
}
