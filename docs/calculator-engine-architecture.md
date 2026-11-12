# Worth It Calculator Engine — Architecture Specification

**Status:** Proposal / architecture baseline  
**Date:** 2026-11-12  
**Scope:** Manual Builder and AI Creator for community calculators  
**Implementation status:** Documentation only; no runtime code or database changes in this phase.

## 1. Product goal

Build a calculator-authoring environment with the creative breadth of a general-purpose studio, but specialized exclusively for calculators.

The system should make it practical to create tens of thousands of distinct calculator designs and leave room for hundreds of thousands or millions of published calculator definitions. This is a product and data-model goal, not a promise that every possible calculation is supported on day one or that execution capacity is unlimited.

The platform must not depend on a fixed catalogue of calculator templates. Variety should come from composing reusable, typed building blocks.

## 2. Non-negotiable security rule

Users must never be able to submit or execute arbitrary code.

Prohibited in calculator definitions:
- JavaScript, TypeScript, Python, WebAssembly, shell commands, SQL, HTML event handlers, or other executable scripts.
- eval-like execution, dynamic imports, user-defined source code, custom plugins, or arbitrary network requests.
- User-authored loops, recursion, callbacks, or access to browser, server, filesystem, environment, database, or secrets.

This applies equally to Manual Builder, AI Creator, imported definitions, edits, previews, and published calculators. AI is not a privileged execution path.

## 3. One shared engine

Manual Builder and AI Creator must produce the same versioned declarative calculator document and use the same validation and evaluation engine.

Conceptual flow:

1. Authoring UI or AI produces a declarative document.
2. Schema validation checks structure and supported component types.
3. Formula parser converts each formula into a restricted abstract syntax tree (AST).
4. Type and unit analysis checks formula compatibility.
5. Dependency analysis builds a directed acyclic graph (DAG) and rejects cycles.
6. Resource analysis checks complexity and configured quotas.
7. The evaluator runs the validated AST with bounded inputs.
8. Results are formatted by a presentation layer; presentation never executes formulas.

The server must independently validate and evaluate authoritative operations. Client-side validation is for responsiveness, not trust.

## 4. Declarative calculator document

Use a versioned JSON document, not executable source. The exact schema should be finalized before implementation. Its conceptual sections are:

- `schemaVersion`: document format version.
- `metadata`: title, description, category, locale, attribution and author-facing information.
- `inputs`: typed user inputs and constraints.
- `collections`: repeatable rows, tables and bounded lists.
- `variables`: named intermediate values.
- `formulas`: declarative expression trees or formula strings parsed by the restricted grammar.
- `conditions`: typed boolean expressions and conditional branches.
- `scenarios`: named input sets for comparisons.
- `outputs`: numeric, formatted, tabular and chart-ready results.
- `layout`: supported presentation components and ordering.
- `assumptions`: explanatory notes, units, source references and limitations.

Unknown fields, component types, operators and functions must be rejected unless the document version explicitly supports them. Never silently execute or interpret unknown content.

## 5. Authoring building blocks

### Inputs
Plan for:
- Number and decimal
- Integer
- Slider / range
- Toggle / checkbox
- Single-select and multi-select
- Date and time
- Duration
- Text where it is used as a label, category or lookup key rather than executable content
- Structured records with explicitly typed fields

Every input has explicit defaults, required/optional status, bounds, precision, allowed choices, unit and validation rules.

### Collections and tables
Support repeatable rows, nested-but-bounded records, named fields, row add/remove, table calculations and aggregation. Limits should be configurable by trust tier and resource budget, not scattered hard-coded constants.

### Formula and variable system
Support named intermediate variables, references to earlier calculated values, reusable typed expressions, and dependency graphs. Cycles are rejected. Evaluation order is derived from dependencies, not from arbitrary execution order.

### Conditions
Support typed comparisons, boolean composition, conditional result selection, thresholds, ranges, and piecewise formulas. Conditions must be expressions in the restricted language, not user-defined control-flow scripts.

### Scenarios
Support multiple named scenarios and side-by-side comparisons. Scenario count and aggregate evaluation work must be bounded by quotas.

### Outputs
Support scalar results, percentages, currencies, units, differences, ratios, rankings, tables and chart-ready series. Charts are presentation of computed data, not a code execution surface.

## 6. Formula language

The formula language should be deliberately small, explicit, documented and versioned. It must parse to an AST; never evaluate a formula string as host-language code.

The existing implementation already provides a starting subset: arithmetic, exponentiation, constants, a restricted set of mathematical/statistical functions, conditionals, comparisons, boolean operations, dynamic-group aggregation, and some unit analysis.

The future function registry should be grouped and expanded only after tests exist:

- Arithmetic: add, subtract, multiply, divide, power, remainder, absolute value, rounding, floor, ceiling, clamp.
- Statistics: sum, average, min, max, count, median, percentiles, variance and standard deviation.
- Logic: if, comparisons, and, or, not, all, any.
- Numeric/scientific: square root, logarithms, exponentials, trigonometry and selected safe functions.
- Date/time: date differences, durations, calendar-aware periods and age-like calculations, with explicit timezone semantics.
- Finance: compound growth, present/future value, payment schedules, amortization, interest and margin calculations, with clearly documented assumptions.
- Unit helpers: safe conversion between explicitly supported units.
- Collection helpers: bounded sum, average, min, max, count, filter-by-condition and other declarative aggregations.

Not every function belongs in the first release. Each function needs:
1. a grammar/signature definition;
2. input/output type rules;
3. unit rules;
4. domain and error behavior;
5. deterministic implementation;
6. complexity estimate;
7. unit, boundary, fuzz and regression tests;
8. documentation and examples.

No function may perform arbitrary I/O or invoke user code.

## 7. Type and unit system

Use explicit types and dimensional analysis. Distinguish at least:
- number, integer, boolean, text, date/time, duration and collection;
- currency codes as distinct dimensions;
- length, area, volume, mass, time, energy, power, temperature and count;
- derived dimensions such as currency per energy or distance per time.

Addition/comparison requires compatible dimensions, except for well-defined literal constants. Multiplication/division combines dimensions. Conversion requires a registered conversion rule.

Currency conversion must never silently use an assumed rate. If supported, it must use an explicit rate input or a separately governed, timestamped data source with provenance and stale-data behavior. Temperature conversions need offset-aware rules rather than treating temperature as an ordinary multiplicative unit.

## 8. Deterministic and bounded execution

The engine must have explicit budgets for:
- document size and nesting depth;
- AST node count and formula length;
- number of inputs, outputs, formulas and dependencies;
- collection rows and nested collection depth;
- number of scenario evaluations;
- total evaluator operations / fuel;
- wall-clock and memory ceilings at the server boundary;
- output size and chart point count.

Initial numeric quotas must be selected from benchmarks and threat modelling, not guessed here. Quotas should be centralized, versioned and observable. When a budget is exceeded, return a clear validation or execution-limit error; never hang, silently truncate critical calculations, or fall back to arbitrary execution.

Use bounded collection operators instead of user-authored loops. Avoid unbounded recursion entirely.

## 9. Security and abuse resistance

- Allowlist every AST node, operator, function and UI component.
- Reject unknown keys and malformed documents.
- Enforce quotas on both client and server.
- Treat all labels, descriptions, text and metadata as untrusted display content; render as text and sanitize any explicitly supported rich text.
- No user-defined HTML, CSS, URLs that trigger fetches, embeds, or remote scripts.
- No access from the evaluator to Supabase clients, Cloudflare bindings, secrets, request objects or global runtime objects.
- Rate-limit create, validate, preview, save and publish endpoints.
- Cache only by canonical validated document/version and relevant inputs; do not mix users' private data.
- Log structured error codes and resource measurements without storing sensitive input values unnecessarily.
- Add abuse tests for oversized documents, deeply nested expressions, huge collections, expensive scenario combinations, invalid numbers, division by zero, NaN/infinity and dependency cycles.

## 10. Compatibility and versioning

Published calculator documents must carry a schema version and a formula-engine compatibility version.

- Existing saved calculators must continue to work through a legacy compatibility adapter.
- New engine releases must not silently change the meaning of old formulas.
- Migrations must be explicit, testable and reversible where possible.
- Keep golden test fixtures for existing Manual Builder calculators and AI-generated calculators.
- Do not change production data or migrate existing user documents as part of the architecture/specification phase.

## 11. AI Creator contract

AI may generate and revise only the declarative calculator document.

Required pipeline:
1. Convert the user's natural-language request into a structured draft.
2. Validate the draft against the exact same schema as Manual Builder.
3. Parse and type-check all formulas.
4. Test representative and boundary scenarios.
5. Explain assumptions, missing information and unsupported requirements.
6. Show a preview and validation report.
7. Save or publish only after the user's explicit action and normal server-side checks.

If the requested calculator needs unsupported capabilities, AI must explain the limitation and offer a safe supported design. It must not invent a new function or smuggle code into a text field.

## 12. Scale and performance strategy

The number of possible calculator definitions should not be artificially limited to a few hundred templates. The catalogue should be able to store and discover very large numbers of definitions through pagination, indexed metadata, search and category filters.

Execution capacity is a separate concern:
- Cache validated ASTs by immutable document version.
- Reuse parsed expressions and compiled dependency plans.
- Keep evaluation stateless and deterministic.
- Batch only where it reduces overhead without creating noisy-neighbor risks.
- Enforce per-user and global concurrency / compute budgets.
- Measure p50/p95/p99 latency, CPU time, memory, rejection rates and cache hit rate.
- Load-test progressively (hundreds, thousands, tens of thousands of concurrent evaluations) before increasing quotas.

A million stored calculator definitions is not the same as a million simultaneous calculations. Both storage/discovery and execution need separate capacity plans.

## 13. Phased delivery

### Phase 0 — Audit and specification
- Map current Manual Builder schema, parser, evaluator, AI generation, preview, save/publish and server validation.
- Inventory every current function, input type, unit, limit and validation path.
- Identify duplicated logic and any trust boundary where server validation is missing.
- Define compatibility fixtures and threat model.

### Phase 1 — Shared engine foundation
- Extract or formalize the declarative schema, parser, AST, type/unit checker and deterministic evaluator.
- Centralize function registry and resource budgets.
- Keep a compatibility adapter for existing saved calculators.
- No feature expansion until parity and regression tests pass.

### Phase 2 — Broader calculator building blocks
- Expand input types, collections, typed conditions, scenarios and output structures.
- Add function families incrementally with tests and docs.
- Add reusable formula components and table operations.

### Phase 3 — Studio-quality Manual Builder
- Visual formula/condition editor, dependency view, field/table designer and live validation.
- Clear errors that point to the exact input or formula.
- Test scenarios, boundary tests and preview without saving.

### Phase 4 — AI parity
- Make AI generate the same schema and use the same validator/evaluator.
- Add repair loops that respond only to structured validation errors.
- Verify Manual-to-AI and AI-to-Manual round trips.

### Phase 5 — Scale and ecosystem
- Catalogue indexing, search, caching, quotas, load testing and monitoring.
- Versioned templates/examples may help discovery but must not constrain what can be built.

## 14. Acceptance criteria

The architecture is ready for implementation only when:
- Manual and AI use one canonical versioned document format.
- No execution path evaluates user-provided source code.
- Every formula is parsed into an allowlisted AST.
- Server validation is authoritative for save and publish.
- Type, unit, dependency and resource checks are deterministic.
- Existing saved calculators pass compatibility fixtures.
- Limits are centralized and tested.
- Malicious/oversized input tests demonstrate safe rejection.
- Performance budgets are benchmarked and documented.
- A feature can be added to the shared engine without creating a separate AI-only or Manual-only capability.

## 15. Explicit non-goals

- Building a general-purpose programming IDE.
- Running user scripts, plugins, macros or arbitrary code.
- Allowing calculators to make arbitrary HTTP requests or query databases.
- Promising unlimited computation or unlimited simultaneous users.
- Replacing or merging PR #194 as part of this documentation work.
- Applying database migrations or changing Production in the specification phase.
