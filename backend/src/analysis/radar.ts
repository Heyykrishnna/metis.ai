import { randomUUID } from "node:crypto";
import type {
  DirtyRadarReport,
  RadarAnomalySchema,
} from "../contracts/features.js";
import type { Static } from "typebox";

type RadarAnomaly = Static<typeof RadarAnomalySchema>;

const anomalyReviews = new Map<
  string,
  "unreviewed" | "accepted" | "rejected"
>();

export function scanDirtyRadar(
  runId: string,
  rows: readonly Record<string, unknown>[],
  columns: readonly string[],
  sourceObject = "analytics_dirty.entity_period",
): DirtyRadarReport {
  const anomalies: RadarAnomaly[] = [];

  const sentinelMatches = new Map<
    string,
    { field: string; val: string; count: number }
  >();
  const ambiguousDates = new Map<string, { field: string; count: number }>();
  const grainTracker = new Set<string>();
  let duplicateCount = 0;

  for (const row of rows) {
    for (const col of columns) {
      const val = row[col];
      if (typeof val === "string") {
        const lower = val.trim().toLowerCase();
        if (
          lower === "n/a" ||
          lower === "unknown" ||
          lower === "-" ||
          lower === "" ||
          lower === "null"
        ) {
          const key = `${col}:${lower}`;
          const current = sentinelMatches.get(key) ?? {
            field: col,
            val,
            count: 0,
          };
          current.count++;
          sentinelMatches.set(key, current);
        }

        if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
          const parts = val.split("/");
          const p1 = Number(parts[0]);
          const p2 = Number(parts[1]);
          if (
            Number.isInteger(p1) &&
            Number.isInteger(p2) &&
            p1 >= 1 &&
            p1 <= 12 &&
            p2 >= 1 &&
            p2 <= 12
          ) {
            const key = `${col}:ambiguous_date`;
            const current = ambiguousDates.get(key) ?? { field: col, count: 0 };
            current.count++;
            ambiguousDates.set(key, current);
          }
        }
      }
    }

    const grainKey = `${row.school_id ?? ""}-${row.year ?? row.period ?? ""}`;
    if (grainKey !== "-") {
      if (grainTracker.has(grainKey)) {
        duplicateCount++;
      } else {
        grainTracker.add(grainKey);
      }
    }
  }

  for (const [, s] of sentinelMatches.entries()) {
    const id = `anomaly-sentinel-${sourceObject}-${s.field}`;
    const reviewState = anomalyReviews.get(id) ?? "unreviewed";
    anomalies.push({
      id,
      ruleId: "radar-sentinel-values",
      sourceObject,
      field: s.field,
      observedPattern: `Unreviewed sentinel value "${s.val}"`,
      sampleCount: s.count,
      samplingMethod: "deterministic_scan",
      estimatedPrevalence:
        rows.length > 0 ? Math.min(1, s.count / rows.length) : 0,
      proposedMapping:
        "Map sentinel string to NULL and apply explicit null exclusion policy",
      reviewState,
    });
  }

  for (const [, d] of ambiguousDates.entries()) {
    const id = `anomaly-date-${sourceObject}-${d.field}`;
    const reviewState = anomalyReviews.get(id) ?? "unreviewed";
    anomalies.push({
      id,
      ruleId: "radar-ambiguous-dates",
      sourceObject,
      field: d.field,
      observedPattern: `Ambiguous calendar format (day and month <= 12)`,
      sampleCount: d.count,
      samplingMethod: "deterministic_scan",
      estimatedPrevalence:
        rows.length > 0 ? Math.min(1, d.count / rows.length) : 0,
      proposedMapping:
        "Clarify date format with user (DD/MM/YYYY vs MM/DD/YYYY)",
      reviewState,
    });
  }

  if (duplicateCount > 0) {
    const id = `anomaly-duplicate-${sourceObject}-grain`;
    const reviewState = anomalyReviews.get(id) ?? "unreviewed";
    anomalies.push({
      id,
      ruleId: "radar-duplicate-grain",
      sourceObject,
      field: "grain",
      observedPattern: `${duplicateCount} duplicate entity-period observations detected`,
      sampleCount: duplicateCount,
      samplingMethod: "deterministic_scan",
      estimatedPrevalence:
        rows.length > 0 ? Math.min(1, duplicateCount / rows.length) : 0,
      proposedMapping:
        "Deduplicate by latest observation timestamp before aggregation",
      reviewState,
    });
  }

  if (anomalies.length === 0) {
    const fallbackId = `anomaly-clean-${randomUUID()}`;
    anomalies.push({
      id: fallbackId,
      ruleId: "radar-clean-scan",
      sourceObject,
      field: "dataset",
      observedPattern: "No dirty values detected in verified sample",
      sampleCount: 0,
      samplingMethod: "deterministic_scan",
      estimatedPrevalence: 0,
      proposedMapping: "No transformation required",
      reviewState: "accepted",
    });
  }

  return {
    runId,
    anomalies,
    totalScannedRows: rows.length,
    generatedAt: new Date().toISOString(),
  };
}

export function updateAnomalyReview(
  anomalyId: string,
  reviewState: "accepted" | "rejected",
): void {
  anomalyReviews.set(anomalyId, reviewState);
}
