# Worth It UGC Calculator Engine v2 — Architecture and Implementation Specification

**Status:** Draft specification; implementation has not started  
**Branch:** `feat/ugc-calculator-engine-v2-20261113`  
**Starting point:** PR #198 head `8b05b496756f34dee2b3129829b1a42971317659`  
**Depends on:** PR #198 (AI Blueprint Import), which itself is based on PR #194  
**Rollout rule:** No merge, Production deployment, Supabase Production migration, or Production configuration change is authorized by this document.

## 1. Objective

Expand Worth It's user-generated Calculator Creator so people can build a much wider range of useful calculators through either Manual Builder or AI-assisted creation.

The goal is not to promise mathematically unlimited models or unlimited execution. The goal is to support a very broad range of subjects and calculation patterns through a declarative, versioned calculator format and a shared, deterministic engine, with resource budgets that keep public calculators safe, predictable, and affordable to evaluate.

Examples of calculator families that should become practical over time include:

- Household, personal finance, business, pricing, break-even, budgeting, savings, debt and investment-planning models.
- Energy, solar, heating, water, materials, renovation, environmental and resource calculators.
- Vehicle, travel, logistics, route-cost, fuel and fleet calculators.
- Technology, infrastructure, cloud, API, storage, token and usage-cost estimators.
- Scientific, statistical, engineering, education, health/fitness and laboratory calculators where the equations and assumptions are explicitly supplied or reliably defined.
- Date, duration, schedule, age, deadline and recurring-period calculators.
- Multi-item, multi-stage, multi-option, weighted, tiered and scenario-based models.

A topic is not supported merely because the AI can write a convincing description. Every output must be backed by valid inputs, explicit assumptions, supported formula operations, unit semantics and testable results.

## 2. Non-negotiable safety and correctness rules

1. **No arbitrary user code.** No JavaScript, Python, SQL, WebAssembly, scripts, callbacks, event handlers, dynamic imports, eval, Function constructors, shell commands or executable user-supplied plugins.
2. **Declarative definitions only.** Users and AI provide data structures, typed inputs, formulas from a restricted grammar, bounded lookup data, assumptions and presentation metadata.
3. **One formula language.** Manual Builder, AI-generated definitions, Blueprint Import, browser previews, save validation, publish validation and server-side evaluation must use the same versioned language contract.
4. **Independent server enforcement.** Browser validation is for usability, not a security boundary. The API/database must independently validate schema shape, keys, references, limits and safe formula syntax. Server-side evaluation must never trust a browser-provided result.
5. **Deterministic evaluation.** A calculator with the same definition, engine version, inputs and scenario must produce the same numeric result. No network calls, current market data, random values or ambient machine state during evaluation.
6. **Explicit conversions.** No implicit FX, physical-unit, timezone, tax, tariff, calendar or business-rule conversion. Conversion must be an explicit, visible input or a documented engine operation with deterministic semantics.
7. **No silent assumptions.** Unknown prices, rates, dates, scientific coefficients and business rules must remain editable inputs or be clearly identified assumptions. AI must not invent real-world values.
8. **Backward compatibility.** Existing saved calculator definitions continue to evaluate as their original schema/engine version. New releases must not silently reinterpret old formulas or rewrite existing saved calculators.
9. **Bounded resource use.** Formula length, AST size/depth, evaluation operations, result count, collection size, rows, scenarios, lookup tables, payload size and total evaluation work must have measured limits.
10. **Fail closed.** Unsupported schema versions, functions, units, data types, malformed formulas, invalid references and budget overruns produce clear errors; never partial execution with an ambiguous result.

## 3. Current baseline confirmed in PR #198 source

The following is the source-level baseline found on the starting commit. It is not a claim that the Production UGC schema is installed.

### 3.1 Manual Builder

The browser-side Manual Builder engine in `ugc-calculators.js` currently has:

- A restricted recursive expression parser and AST evaluator.
- Arithmetic operators, powers, unary signs, parentheses, numeric constants, `pi` and `e`.
- Functions: `min`, `max`, `abs`, `round`, `floor`, `ceil`, `sqrt`, `pow`, `clamp`, `avg`, `sum`, `count`, `mod`, `trunc`, `sign`, `hypot`, `log`, `ln`, `exp`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `if`, `gt`, `gte`, `lt`, `lte`, `eq`, `neq`, `and`, `or`, and `not`.
- Chained result variables; later result rows can reference earlier results.
- Dimensional unit analysis for supported dimensions and compound units.
- Bounded dynamic groups with row-wise aggregation, including expressions inside `sum()` for fields from one group.
- Number, slider, numeric dropdown and on/off toggle controls.
- Result display modes for number, currency, percent and unit.
- What-if scenarios with overrides for fixed numeric inputs.

Current limits enforced in the Manual Builder validator include 24 fixed inputs, 20 results, 4 dynamic groups, 6 fields per group, 20 rows per group and 3 scenarios. Formula text is currently capped at 500 characters.

### 3.2 AI Creator API

The server AI creator in `functions/api/ugc-maker.js` currently has a separate, simpler arithmetic parser and normalizer. The provider output shape supports 1–12 numeric inputs and 1–6 results; its parser has a smaller function allowlist and does not implement the Manual Builder's dynamic-group, result-chain and dimensional-unit capabilities.

This is a key architectural gap: AI-created and manually-created calculators are not authored and validated against one complete shared engine contract.

### 3.3 Persistence and database validation

The current composable-builder SQL migration validates the v1-style numeric schema, current controls, formula tokens, bounded dynamic groups and scenarios. The database validator is an important independent gate, but it is not a replacement for the complete semantic formula/unit validator.

The current UGC schema migration is part of the PR stack and is covered by disposable PostgreSQL CI tests. The UGC/community migration is not approved for Production by this project plan. No Production database action is included.

## 4. Target architecture

The target is one engine with thin adapters, not separate calculators for AI and Manual Builder.

```text
Manual Builder UI ─────┐
                       │
AI Creator output ─────┼──> Canonical Calculator Definition
                       │              │
Blueprint Import ──────┘              ▼
                              Schema/version adapter
                                      │
                                      ▼
                              Shared Calculator Engine
                         ┌────────────┼─────────────┐
                         │            │             │
                      Parser      Type system   Unit system
                         │            │             │
                         └────────────┼─────────────┘
                                      ▼
                              Static validator
                                      │
                                      ▼
                             Bounded evaluator
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
                  Browser preview          Server validation/
                                           evaluation on save,
                                           publish and run
```

The diagram is logical, not a requirement that the same browser bundle be imported unchanged into every server runtime. The shared engine must be a pure, environment-neutral module with deterministic interfaces. UI, API and database code become adapters around its canonical contract.

### Required engine modules

1. **Definition and schema adapter** — accepts an explicit schema version and normalizes only documented, deterministic aliases/defaults.
2. **Lexer/parser** — parses the restricted expression language into a typed AST. No source string is executed by the JavaScript runtime.
3. **Function registry** — one explicit registry defines each function's name, arity, accepted argument types, return type, unit behavior, cost and error behavior.
4. **Type checker** — prevents invalid combinations such as adding text to a date, multiplying booleans, or comparing incompatible types.
5. **Unit and dimension engine** — checks dimensional compatibility and only applies conversions where explicitly declared.
6. **Dependency graph** — resolves result dependencies, detects cycles and produces a deterministic evaluation order.
7. **Static validator** — validates the complete definition before evaluation.
8. **Resource budget manager** — counts parsing and execution work and rejects definitions/inputs that exceed their budget.
9. **Evaluator** — evaluates a validated AST using bounded operations and finite-number checks.
10. **Output formatter contract** — converts results to display values without changing their underlying numeric or typed values.
11. **Compatibility adapters** — maps existing v1 definitions to their original semantics; maps new v2 definitions to the expanded model.

## 5. Versioning and compatibility

### 5.1 Keep v1 stable

- Existing definitions without an explicit engine version are treated as legacy v1 according to the current documented behavior.
- Do not change the meaning of an existing v1 function or operator.
- Do not silently add new v1 formula syntax that could change how an older saved expression parses.
- Existing saved v1 calculator JSON stays intact unless a user explicitly edits and saves it through a reviewed migration path.
- Existing published calculator regression fixtures must continue to produce the same results.

### 5.2 Introduce v2 explicitly

New definitions should declare both the definition/schema version and formula-engine version, for example:

```json
{
  "schemaVersion": 2,
  "engineVersion": 2,
  "title": "Example calculator",
  "description": "A typed example definition.",
  "category": "other",
  "spec": {
    "inputs": [],
    "groups": [],
    "results": [],
    "scenarios": []
  }
}
```

This is an illustrative contract only. The final schema must be reviewed against existing saved JSON, current API normalization, database functions and the AI Blueprint Import contract before implementation.

### 5.3 Migration policy

- Read v1 and v2; write the version the user is editing.
- No bulk rewrite of stored definitions as part of the initial engine extraction.
- Any v1-to-v2 conversion must be explicit, deterministic, reviewable and covered by round-trip tests.
- If a v2 feature cannot be represented in v1, it must remain v2; never discard it silently.
- Database validation must branch on the declared version and reject unknown versions.

## 6. Expanded data model

The present engine is numeric-first. V2 should add well-defined types while keeping formulas numeric-safe.

### 6.1 Input types to introduce

| Type | Purpose | Formula behavior |
|---|---|---|
| `number` | Existing quantities, rates, percentages and amounts | Arithmetic subject to units |
| `boolean` | Explicit yes/no options | Boolean conditions; explicit conversion only |
| `enum` | Named options, plans, methods, scenarios and categories | Equality/membership and explicit numeric mapping; never implicitly treated as a number |
| `date` | Calendar dates | Date functions only; explicit timezone/calendar rules |
| `time` | Local clock time | Time functions with explicit day-boundary policy |
| `datetime` | Instant or local date-time with an explicit timezone/offset policy | Date/time functions; no implicit local timezone |
| `text` | Short user-entered labels or bounded parameters | Display/filter/equality only; never arithmetic |
| `duration` | Explicit elapsed time quantity | Unit-aware time arithmetic |
| `collection` | Repeated typed rows | Bounded aggregation and filtering |
| `lookup` | Small declarative mapping table | Deterministic exact/range lookup, no external request |

The initial implementation should prioritize number, boolean, enum, date and typed collection support. Text, local time, timezone-aware datetime and richer lookups should follow only after their validation and formatting rules are specified and tested.

### 6.2 Input control is separate from data type

The UI control must not determine semantic type by itself. For example, a dropdown can select a string enum, a numeric rate, a boolean option or a date mode; the schema must state its underlying type and allowed values. This avoids the current ambiguity where dropdown options are forced into numeric values.

### 6.3 Typed dynamic groups

Dynamic groups should support rows made of bounded typed fields, not only numeric fields. The type of every field is explicit. Aggregation must verify the field/operation types and units before a calculator can be saved.

Examples:
- A product list with name (text), quantity (number), unit price (currency rate), discount (percent) and taxable (boolean).
- A trip list with destination label, kilometres, travel days and per-day cost.
- A project task list with start date, end date, effort hours and hourly rate.
- A utility tariff table with bounded numeric tiers and rates.

No user-supplied row may define a formula, function or script. Rows are data only.

## 7. Formula language expansion

### 7.1 Preserve and centralize the existing registry

All current Manual Builder functions must be represented in one registry with tests for:
- Valid arity.
- Input and output types.
- Unit propagation.
- Boundary behavior and finite results.
- Estimated operation cost.
- Error messages.

AI Creator and Blueprint Import must use the exact same registry. There must not be one list in a prompt, another in a browser parser and a third in a server parser.

### 7.2 Candidate additions

Add new functions in reviewed groups, not all at once:

**Statistical and aggregation**
- `median`, `product`, `variance`, `stdev`, `percentile`, `weighted_avg`.
- Filtered aggregates such as `sum_if`, `count_if`, `avg_if`, `min_if`, `max_if`, with a declarative predicate AST.
- Explicit empty-collection behavior for every aggregate.

**Financial**
- `present_value`, `future_value`, `payment`, `annuity`, `depreciation_straight_line`.
- Document compounding period, payment timing, rate basis, rounding and sign conventions.
- No built-in live rates, tax law, market data or legal advice.

**Date and time**
- `date_diff_days`, `add_days`, `add_months`, `days_in_month`, `calendar_year`, `calendar_month`, `weekday`.
- Define leap-year behavior, month-end rollover, inclusive/exclusive intervals, locale independence and timezone handling.
- Date-only calculations should use calendar arithmetic, not assume every day is 86,400 seconds.

**Engineering and scientific**
- Safe deterministic functions for common engineering/statistical patterns where domain semantics and unit propagation can be proven.
- Unit-aware conversion only through explicit conversion functions or user-provided coefficients.
- Domain-specific functions require independent regression cases and documented ranges/assumptions.

**Collection and lookup**
- Typed row filters, counts and aggregates.
- Bounded lookup tables, explicit exact-match or range-match rules, duplicate-key policy and deterministic fallback behavior.
- No arbitrary callbacks or user-defined predicate code.

### 7.3 Advanced logic

Add a declarative expression tree for conditional branches and typed comparisons. Existing `if`, comparison and boolean functions remain available. Avoid introducing a general-purpose programming language, loops, recursion, function declarations or user-defined functions.

## 8. Unit and conversion system

- Keep dimensional analysis; expand it with explicit canonical unit metadata rather than accumulating fragile string aliases.
- Represent dimensions, scale factors and offset units separately. Temperature conversions require offsets; they cannot be handled as simple multiplicative factors.
- Support compound units through parsed unit expressions with bounded exponent complexity.
- Distinguish dimension compatibility from display symbol preference.
- Never convert currencies automatically. FX requires explicit rate inputs and a clearly named rate source/date if the rate is not user-provided.
- Never infer that calendar months equal four weeks or 30 days without an explicit model choice.
- Make input and output units visible to users and include conversions in explanations.

## 9. Scenarios and model composition

The current three numeric-only what-if scenarios should evolve into reusable typed scenarios.

Potential additions:
- More scenario profiles subject to a total evaluation-work budget.
- Scenarios that override typed fixed inputs and, where explicitly supported, bounded group rows.
- Named comparison sets and scenario-specific assumptions.
- Shared base assumptions with clearly visible overrides.
- Formula dependency graphs with topological ordering and cycle detection.
- Reusable named intermediate values, while retaining a flat canonical serialization at first.
- Explicit multi-period projections and period-based results.

Do not support arbitrary recursive sub-calculators in the first version of this work. If composition is later added, use a bounded acyclic graph with explicit inputs/outputs and strong depth/operation budgets.

## 10. Output model and user experience

A result should eventually be able to declare:
- Numeric value, unit, currency or percentage.
- Date, time, duration, boolean or enum output.
- Plain-language explanation and assumptions.
- Optional structured rows for a small comparison table.
- Optional chart-ready series with bounded point counts.
- Precision and rounding policy separate from internal calculation precision.

The renderer must treat all labels, explanations and text as untrusted plain text. It must not accept HTML, SVG, URLs, CSS, scripts or event handlers from calculator definitions.

The creator should offer clear sections:
1. Inputs and typed controls.
2. Dynamic collections / tables.
3. Formula and dependency editor.
4. Units and conversion assumptions.
5. Results and explanations.
6. Scenarios and comparisons.
7. Test values, boundaries and validation.
8. Review summary before saving/publishing.

A simple creator path must remain available. Advanced features should not make an ordinary cost calculator harder to build.

## 11. Resource budgets and scalability

Increasing flexibility must not make public calculators an unbounded CPU or memory workload.

### 11.1 Budget dimensions

The engine must enforce independent limits for:
- Definition JSON byte size.
- Number of inputs, results, groups, fields, scenarios and lookup rows.
- Formula source length.
- AST node count and AST depth.
- Maximum function argument count.
- Maximum nested group/filter depth.
- Maximum rows per submitted collection.
- Total rows across all groups.
- Evaluation operation count.
- Total work across all results and scenarios.
- Intermediate numeric magnitude and finite-number checks.
- Output series/table cell count.
- Wall-clock guard as a final defense only, not the primary correctness mechanism.

### 11.2 How to set numeric caps

Do not raise limits by guesswork. First:
1. Add instrumentation in local tests/benchmarks for AST node counts and evaluator operation counts.
2. Build representative fixtures: simple cost, household budget, multi-group product list, solar/energy model, cloud infrastructure estimate, statistical model, date planner and a deliberately heavy adversarial model.
3. Measure worst-case evaluation across every result, scenario and allowed group row count.
4. Choose conservative caps with headroom for low-end mobile devices and Cloudflare Worker CPU.
5. Test that a definition just below the budget succeeds and one just above fails predictably.
6. Keep separate budgets for parsing/validation and for each calculation request.

Any example caps used during prototyping are provisional and must not become production constants until this process is complete.

### 11.3 Evaluation strategy

- Parse and validate definitions once per request or cache only immutable, version-keyed compiled representations.
- Never cache by calculator ID alone if the definition/version can change.
- Never trust a client-supplied AST or compiled function.
- Keep submitted values bounded and validate them against each typed input.
- Short-circuit bounded boolean logic where semantics permit.
- Avoid unbounded recursion and large array spreads.
- Bound aggregate work by row count × formula complexity × number of results × scenarios.
- Return an explicit budget error instead of silently truncating calculations.

## 12. AI Creator and Blueprint Import integration

AI must become a schema author, not a separate calculator runtime.

1. Give AI Creator the canonical v2 schema and function/type registry.
2. Generate definitions that include explicit schema/engine versions.
3. Validate AI output through the shared schema and formula engine before returning a preview.
4. Never trust a model's claim that a formula is valid; the engine proves syntax, types, units, dependencies, bounds and budgets.
5. Keep external Blueprint Import provider-neutral and local-only as currently designed; extend it with a v2 versioned contract and safe alias normalization.
6. Do not send local blueprint import text to an AI provider unless the user explicitly chooses an AI operation.
7. The original request coverage check remains a warning/heuristic, not a validation bypass.
8. AI cannot invent missing prices, exchange rates, scientific constants, current values or legal assumptions.
9. If a safe unsupported feature is not representable, show the exact limitation and do not silently replace it with a different calculation.

## 13. Persistence and server validation

- Define the v2 JSON schema and version-specific database validation before enabling v2 saves.
- Keep server validation independent of browser controls.
- Preserve current ownership, quota, visibility, moderation and publish gates.
- Ensure public calculators are validated again when published and when evaluated if stored data may have been created under older validation rules.
- Add version-specific database functions rather than weakening or removing v1 checks.
- The first implementation must not apply any migration to Production.
- Migration smoke tests must apply each migration twice and test both v1 and v2 definitions.
- Any future Production rollout requires a separate explicit review and go-ahead.

## 14. Implementation phases

### Phase 0 — Architecture baseline (this document)
- Record current v1 behavior, mismatches and security rules.
- Define the v2 contract, roadmap and compatibility guarantees.
- No runtime code changes.

### Phase 1 — Shared engine extraction (first code PR)
- Extract the existing Manual Builder parser, AST evaluator, unit analyser and validator into a pure, environment-neutral engine module.
- Do not change the accepted v1 syntax or result semantics during extraction.
- Keep the existing UI working through a thin adapter.
- Add a conformance harness that runs the same vectors in Node tests and browser/Cloudflare-compatible tests.
- Add differential tests proving old and extracted engine outputs/errors match on the regression corpus.
- Keep the AI API's current separate parser temporarily, but mark it as legacy and prevent it from expanding independently. The next phase replaces it.

### Phase 2 — Server unification
- Integrate the shared v1 engine into the AI API and server validation path.
- Remove duplicate formula logic only after parity tests cover create/refine/import/save/publish and all legacy fixtures.
- Verify no server-side code path trusts browser-calculated results.
- Run API tests and disposable PostgreSQL smoke tests.

### Phase 3 — V2 typed schema foundation
- Add schemaVersion/engineVersion adapters.
- Introduce typed values and typed validation, beginning with boolean, enum and date.
- Add typed dynamic group fields.
- Extend dimensional unit metadata and explicit conversion operations.
- Keep v1 intact.

### Phase 4 — Formula/function expansion
- Add statistical, financial, date and typed collection functions in small reviewed batches.
- For each function, specify arity, types, units, boundary semantics, complexity cost and reference test cases.
- Add lookup tables and filtered aggregates after the type system is stable.

### Phase 5 — Builder and AI integration
- Add UI controls for the new types and outputs.
- Add formula help/autocomplete driven from the same function registry.
- Update AI Creator prompts and output schema from the registry.
- Update Blueprint Import for versioned v2 definitions.
- Keep the Quick Builder path simple and backward-compatible.

### Phase 6 — Stress, security and product verification
- Fuzz parser and schema input, including malformed Unicode, deep nesting, huge numeric literals and pathological formulas.
- Test prototype keys, unknown fields/functions, invalid units, cycles, divide-by-zero, overflow and non-finite values.
- Stress maximum supported rows, results and scenarios on desktop and mobile.
- Verify deterministic results across supported runtimes.
- Run full repository CI and disposable PostgreSQL migration tests.
- Deploy only to Cloudflare Preview; perform manual UI checks with representative v1 and v2 calculators.
- Do not merge or deploy to Production without separate approval.

## 15. Required acceptance criteria

The engine expansion is not ready to merge until all are true:

- Existing v1 fixtures calculate the same expected outputs as before extraction.
- AI Creator, Manual Builder and Blueprint Import all accept the same canonical formula/schema capabilities for the declared version.
- Every function has typed arity, unit behavior, error behavior and boundary tests.
- Every schema version has independent validation on the server and compatible browser validation.
- A malicious or malformed definition cannot execute arbitrary code or access external resources.
- All parser/evaluator/schema budgets are enforced server-side.
- A budget-overrun error is deterministic and does not hang or partially publish a result.
- Dynamic group and scenario work is included in the total operation budget.
- No automatic currency or physical-unit conversions occur.
- Date/time calculations document timezone, calendar and month-end rules.
- All current user-facing calculator features remain available.
- The test suite includes ordinary, complex, boundary and adversarial fixtures.
- The Preview passes manual testing on desktop and mobile.
- No Production database migration/configuration change is needed to test the implementation.

## 16. Immediate next task

Start with **Phase 1 only** in a separate implementation PR:

1. Create a pure shared engine module containing the current v1 parser, evaluator, unit analyser, formula result validation and spec validator.
2. Keep the current v1 public function signatures available through compatibility wrappers so the UI does not need a large simultaneous rewrite.
3. Add parity tests using the existing Manual Builder and Blueprint Import regression fixtures.
4. Do not expand numeric limits, add new function names, alter the AI output schema or modify SQL in this extraction PR.
5. Deploy the extraction to a Cloudflare Preview and verify existing calculators before proceeding to Phase 2.

This ordering gives the project a reliable foundation first. It prevents new features from multiplying the current browser/API/database differences.

---

## Appendix A — Current source references inspected

- `ugc-calculators.js`: `compileExpression`, `evaluate`, `unitDescriptor`, `analyseFormulaUnit`, `validateFormulaResultUnit`, `evaluateFormulaResults`, `validateMakerSpec`, Manual Builder input/group/scenario/result editors.
- `functions/api/ugc-maker.js`: AI-side `compileExpression`, `evaluate`, `normalizeDefinition`, provider instructions and output validation.
- `supabase/worth-it-ugc-composable-builder.sql`: `private.worth_it_validate_ugc_spec(jsonb)`.
- `tests/ugc-calculators.test.mjs` and `tests/ugc-blueprint-import.test.mjs`: current engine, import, dimensional and migration regression coverage.
- `.github/workflows/function-syntax-check.yml`: CI syntax, unit and disposable PostgreSQL migration smoke flow.

## Appendix B — Explicit non-goals

- No arbitrary JavaScript, Python or user scripts.
- No AI model executing code or accessing tools as part of calculator evaluation.
- No unbounded loops, recursion or user-defined functions.
- No automatic network lookups or live external data inside formulas.
- No automatic exchange rates, tariffs, taxes or scientific constants.
- No unlimited collection sizes or evaluation work.
- No database migration or Production rollout in the architecture/specification stage.
