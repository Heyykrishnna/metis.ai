# metis.ai

Terms used to describe evidence-grounded analytical work.

## Language

**Workspace**: The ownership and access scope for connections, analyses, evidence, and reviewed definitions.

**Connection**: A workspace-owned reference to an approved analytical database and its access policy.

**Schema snapshot**: A versioned observation of allowed database structures, constraints, and bounded profiles.

**Analysis run**: One bounded attempt to answer a question under explicit definitions, permissions, and evidence checks. A clarification continues through a linked run while preserving the prior record.

**Analytical plan**: The explicit sources, joins, filters, grain, aggregations, null rules, and checks used to answer a question.

**Output grain**: The entity or combination of dimensions represented by one result row.

**Evidence bundle**: The observable sources, executed SQL, results, assumptions, exclusions, and checks supporting a run's outcome.

**Abstention**: A deliberate non-answer because available evidence cannot support a reliable conclusion.

**Policy block**: A non-answer caused by a permission or query-policy restriction.
