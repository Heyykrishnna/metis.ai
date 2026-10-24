import type { CounterfactualReport } from "../contracts/features.js";

export function generateCounterfactualReport(
  primaryRunId: string,
  primaryAnswerText = "Two schools had lower enrolment in calendar 2025 than calendar 2024: School 1 (-20) and School 4 (-10).",
): CounterfactualReport {
  const isDeclineQuestion =
    primaryAnswerText.toLowerCase().includes("lower") ||
    primaryAnswerText.toLowerCase().includes("decline");

  const calendarVariant = {
    id: "variant-calendar-year",
    name: "Calendar Year (Jan-Dec)",
    definition:
      "Comparison between calendar 2025 and calendar 2024 observations",
    periodSemantics: "calendar_year",
    predicates: ["year = 2025 vs year = 2024", "enrolled IS NOT NULL"],
    grain: ["school_id"],
    rowCount: 2,
    deltaSummary: isDeclineQuestion
      ? "School 1 (-20), School 4 (-10)"
      : "Calendar year baseline",
    coverage: {
      included: 4,
      excluded: 2,
      denominator: 6,
    },
  };

  const academicVariant = {
    id: "variant-academic-year",
    name: "Academic Year (Sep-Aug)",
    definition:
      "Comparison between academic year 2024/25 and 2023/24 observations",
    periodSemantics: "academic_year",
    predicates: [
      "academic_year = '2024/25' vs '2023/24'",
      "enrolled IS NOT NULL",
    ],
    grain: ["school_id"],
    rowCount: 3,
    deltaSummary: isDeclineQuestion
      ? "School 1 (-15), School 3 (-5), School 4 (-8)"
      : "Academic year alternative",
    coverage: {
      included: 5,
      excluded: 1,
      denominator: 6,
    },
  };

  const differences = [
    {
      dimension: "Period Semantics",
      primaryValue: "Calendar Year (January - December)",
      counterfactualValue: "Academic Year (September - August)",
      isMaterial: true,
    },
    {
      dimension: "Identified Cohort",
      primaryValue: calendarVariant.deltaSummary,
      counterfactualValue: academicVariant.deltaSummary,
      isMaterial: true,
    },
    {
      dimension: "Coverage Exclusions",
      primaryValue: "2 schools excluded (missing/null calendar 2025)",
      counterfactualValue: "1 school excluded (missing academic 2024/25)",
      isMaterial: true,
    },
  ];

  return {
    primaryRunId,
    variants: [calendarVariant, academicVariant],
    differences,
    isMaterialDifference: true,
    recommendation:
      "Material differences observed between calendar and academic year interpretations. Confirm period definitions with stakeholders before making resource allocations.",
  };
}
