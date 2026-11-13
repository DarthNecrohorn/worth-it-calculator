# Calculator Engine v2 — Typed schema foundation

**Status:** Typed schema and formula foundation plus experimental V2 authoring/import/generation for local drafts. Persisted calculators and public execution remain V1-only.
**Implementation branch:** `feat/ugc-calculator-engine-v2-typed-foundation-20261113`
**Base:** PR #194 head after the shared v1 engine and server-side AI Creator unification.
**Rollout:** Draft-only. No merge, Production deployment, Supabase Production migration or Production configuration change is included.

## 1. Compatibility contract

- A stored calculator with neither `schemaVersion` nor `engineVersion` is treated as legacy schema 1 / engine 1.
- A legacy `version: 1` field continues to resolve to schema 1 / engine 1.
- Explicit `schemaVersion: 1, engineVersion: 1` continues to use the existing v1 validator.
- V2 requires the exact pair `schemaVersion: 2, engineVersion: 2`. Partial declarations, non-integer versions, unknown versions and mixed pairs fail closed.
- The shared engine module's `apiVersion` remains 1. It describes the JavaScript module interface, not the saved calculator schema or formula language.
- The v1 parser, evaluator, formula meanings, unit rules and validation path are not modified by this foundation.

## 2. V2 definition envelope

A v2 definition is a declarative object with the following fields:

```json
{
  "schemaVersion": 2,
  "engineVersion": 2,
  "inputs": [],
  "groups": [],
  "results": [],
  "scenarios": []
}
```

Limits remain conservative: 24 fixed inputs, 4 dynamic groups, 6 fields per group, 1–20 rows per group, 20 results, 3 scenarios, 500 characters per formula and 32,000 serialized characters for a definition. These are not increased by this work.

## 3. Typed values

Every v2 input and dynamic-group field declares an explicit `type`.

### Number

Fixed input:

```json
{"key":"amount","label":"Amount","type":"number","min":0,"max":1000,"default":25,"step":1,"unit":"EUR","control":"number"}
```

Dynamic-group field uses the same numeric bounds, default, step and unit, but does not declare a UI control. Numeric select inputs use 2–12 unique numeric choices and the default must be one of them.

### Boolean

Fixed input:

```json
{"key":"include_tax","label":"Include tax","type":"boolean","default":true,"control":"toggle"}
```

The only accepted runtime values are JSON booleans `true` and `false`. Strings such as `"true"` and numeric values 0/1 are not silently coerced.

### Enum

Fixed input:

```json
{
  "key":"billing_cycle",
  "label":"Billing cycle",
  "type":"enum",
  "default":"monthly",
  "control":"select",
  "choices":[
    {"label":"Monthly","value":"monthly"},
    {"label":"Annual","value":"annual"}
  ]
}
```

Enum values are non-empty strings up to 64 characters. Choice labels and values must be unique, and the default must match one of the choices. The enum is not implicitly a number or an ordinal.

### Date

Fixed input:

```json
{"key":"start_date","label":"Start date","type":"date","default":"2026-11-13","control":"date","minDate":"2026-01-01","maxDate":"2027-12-31"}
```

Dates use strict calendar-only `YYYY-MM-DD` strings. Invalid dates such as `2026-02-30` are rejected. Optional `minDate` and `maxDate` use the same format. Dates do not imply a timezone, local midnight instant or elapsed duration.

## 4. Dynamic groups and scenarios

Dynamic-group fields support the same four explicit types: `number`, `boolean`, `enum` and `date`. Row values are validated against the field definition; unknown row keys, invalid primitive types, invalid enum choices, invalid dates and out-of-range row counts are rejected.

Scenarios can override fixed inputs using values of the declared primitive type. Numeric overrides are still checked against numeric bounds and steps; boolean, enum and date overrides must match their exact type and allowed values.

The shared engine exposes deterministic helpers for:
- Resolving legacy and explicit schema/engine versions.
- Validating a versioned definition.
- Normalizing one typed value.
- Building typed default input values and default dynamic-group rows.
- Normalizing submitted typed dynamic-group rows.

## 5. V2 formula semantics implemented in this foundation

V2 has a separate restricted formula parser, static type checker and evaluator. The v1 parser and evaluator are unchanged.

### Boolean logic and conditions

- `if(condition, whenTrue, whenFalse)` requires a boolean condition. Both branches must return the same supported type; numeric branches must also have compatible units.
- `and(...)`, `or(...)` and `not(condition)` accept only boolean expressions and short-circuit during evaluation.
- `eq(a,b)` and `neq(a,b)` support values of the same scalar type. Enum values may be compared with a quoted string literal only when that literal is one of the enum's declared choices.
- `gt`, `gte`, `lt` and `lte` accept compatible numeric values or calendar dates. Numeric thresholds may use dimensionless numeric literals as constants, but incompatible dimensional inputs are rejected.

Example:

```
if(and(include_tax, eq(plan, "pro")), base_cost * tax_rate / 100, 0)
```

### Calendar-date functions

Dates are timezone-free calendar dates in `YYYY-MM-DD` form. Calendar operations do not interpret dates as timestamps or assume that a day is an elapsed 86,400-second duration.

- `date_diff_days(startDate, endDate)` returns the signed calendar-day difference `endDate - startDate`.
- `add_days(date, wholeDays)` adds a signed integer number of calendar days. A numeric input may declare unit `day` or `days`; a numeric literal is also allowed.
- `add_months(date, wholeMonths)` adds a signed integer number of calendar months. Month-end rollover clamps to the final valid day of the target month (for example, 31 January + 1 month becomes 28 February, or 29 February in a leap year). A numeric input may declare unit `month` or `months`; a numeric literal is also allowed.
- `days_in_month(date)` returns the number of calendar days in that date's month.
- `calendar_year(date)` and `calendar_month(date)` return the calendar year and month number.
- `weekday(date)` returns the ISO weekday number: Monday = 1 through Sunday = 7.

Offsets must be whole numbers. Dates outside the supported year range 0001–9999 are rejected.

### Typed dynamic-group expressions

- `sum(group.numericField)` continues to aggregate one numeric field from one group.
- `sum_if(numericExpression, booleanPredicate)` sums a numeric expression only for rows where the predicate is true.
- `count_if(booleanPredicate)` counts rows where the predicate is true.
- All field references used by one aggregate must belong to exactly one dynamic group. A `sum_if` value and its predicate must refer to the same group.
- Group predicates may combine boolean fields, enum comparisons and date comparisons, but arbitrary row callbacks, formulas stored in rows and cross-group row joins are not supported.

Example:

```
sum_if(expenses.amount, and(expenses.taxable, eq(expenses.kind, "fixed")))
```

### Result boundary and rollout

Result rows still produce finite numeric values and use the existing number, currency, percent or unit formats. Boolean, enum and date expressions can be used as intermediate values, comparisons and conditions, but direct boolean/date/enum result display is not part of this implementation.

Manual Builder, Blueprint Import and AI Creator now support experimental typed V2 local drafts. Saved calculator editing, save/publish routes, database persistence and the public calculator runtime remain V1-only. V2 definitions are not exposed as member calculators and cannot be saved or published.

## 6. Security and rollout

V2 validation rejects unsupported version pairs, unexpected object properties, invalid keys, duplicate keys, malformed typed values, unsafe field shapes and invalid numeric formulas. No executable expressions, callbacks, scripts, URLs, HTML, external lookups or user code are introduced.

The shared browser engine, version-aware server validation adapter and independent private PostgreSQL V2 validator are now implemented and tested. Before V2 can be used for persisted/community calculators, the remaining work is schema-aware save/publish, owner-edit and member-run/public-runtime integration, followed by end-to-end security and compatibility testing. The V2 SQL is exercised only in disposable CI PostgreSQL; no Production action is part of this branch.


## 7. Server validation and persistence boundary

The server now has a version-aware adapter around the shared engine. V1 definitions continue to use the exact shared V1 validator. V2 definitions additionally normalize typed input/group defaults and run the deterministic V2 evaluator once against those defaults, so default-value runtime failures (including calendar overflow) are caught server-side.

The server validator is used by AI Creator V2 generation before a draft is returned. Manual Builder and Blueprint Import also validate V2 locally through the shared browser engine. Public calculator execution and Supabase save/publish RPCs remain V1-only.

The additive SQL version-gate migration preserves the previous V1 PL/pgSQL validator under a private internal name and routes the existing validator name through a strict version check. Legacy V1, explicit schema 1 / engine 1, and legacy `version: 1` definitions remain accepted by the old validator without changing its implementation. Partial, mixed, unknown and V2 version declarations fail closed. Direct execution of the renamed raw V1 implementation and the new internal wrapper is revoked from API roles.

The SQL migration is added to disposable PostgreSQL CI and is run twice to check idempotence, followed by a smoke fixture that verifies V1 compatibility, V2/invalid-version rejection, and private-function privileges. The separate V2 validator is also run in disposable PostgreSQL tests. These are repository migrations only: they have **not** been applied to Supabase Production. Local Manual Builder, Blueprint Import and AI Creator V2 draft paths are implemented, but V2 persistence remains intentionally disabled until schema-aware save/publish, owner-edit and member-run/public-runtime paths are complete.


## 8. Independent PostgreSQL V2 validator

A separate private PostgreSQL validator checks V2 definitions without trusting the browser or the JavaScript engine. It validates exact schema/engine versions, closed JSON object shapes, typed number/boolean/enum/date inputs, typed dynamic-group fields, scenarios, result metadata and formula references.

The database formula parser accepts only the V2 declarative grammar. It enforces the operator/function allowlist, valid argument counts, bounded formula length/token count/nesting, declared input and prior-result references, typed arithmetic and boolean logic, enum choice matching, calendar date operations, same-group collection aggregates, numeric result types and basic dimensional-unit compatibility. Formula source is never executed as SQL, JavaScript or another language.

The validator is installed under the private schema with execution revoked from public, anon, authenticated and service_role. It is exercised directly only in disposable PostgreSQL CI. The existing save/publish version gate continues to reject V2; the new validator does not activate V2 persistence or member-facing routes.

The database validator uses a conservative, parity-tested unit registry aligned with the shared JavaScript V2 engine for the supported currency, time, distance, area, volume, mass, energy, power, data, count and common rate units. Unknown units remain opaque dimensions and must match exactly. No cross-scale conversion such as GB to MB is inferred. Shared expected-vector and derived-formula tests run in both JavaScript and disposable PostgreSQL.


## 9. Shared unit registry parity

The PostgreSQL V2 validator now uses the same explicit aliases and dimensional vectors as the shared JavaScript engine for currencies, percentages-per-time, time, distance, area, volume, mass, data, energy, power, token/count, common rates and compound products/quotients. Unknown atoms remain opaque dimensions rather than being guessed or silently converted.

The SQL parser also carries unit display symbols through formula references and unit algebra. The special derived-energy rule is shared: `kW × hour = kWh` and `W × hour = Wh`. The browser registry now explicitly recognizes `Wh`, so an energy formula can be checked against an explicit Wh result unit consistently.

Disposable PostgreSQL CI checks a shared list of expected vectors and validates formulas for derived energy, data-per-time, distance-per-time and opaque-unit-per-time. This still validates units only; it does not enable V2 persistence.


## 10. Manual Builder typed V2 authoring (local-only)

The Manual Builder now offers an explicit schema selector for new, unsaved manual drafts. V1 remains the default and continues to use the existing editor, validation, local test panel and save/publish path unchanged.

Selecting **Version 2 · typed draft (experimental)** converts compatible V1 numeric inputs and groups into V2 definitions. Existing numeric dropdowns remain numeric choices; old on/off controls become strict boolean values. Formulas and scenario values are preserved for review, then validated by the shared V2 checker. A conversion that exposes a boolean/formula incompatibility remains editable but must be corrected before the local validation passes.

The V2 editor supports:
- Fixed inputs of type number, boolean, enum and date, including ranges, units, declared enum options and calendar-date bounds.
- Dynamic groups containing typed number, boolean, enum and date fields.
- Up to three what-if scenarios with typed overrides for fixed inputs.
- Numeric result rows using the existing number, currency, percent and unit display formats.
- The shared V2 type checker and evaluator for a local, interactive test panel, including typed dynamic rows and scenario comparisons.

V2 testing is local to the browser. It sends no AI request, consumes no CALC, writes no data to Supabase and does not publish anything. Both Save and Publish are disabled in V2, and the save handler independently rejects a V2 draft before it can call the save RPC. Saved calculator editing remains V1-only. This section describes the Manual Builder slice only. The later Blueprint Import and AI Creator integrations are documented in Sections 11–13; none of them enables V2 persistence, changes the public calculator runtime or applies a Production database migration.


## 11. Blueprint Import typed V2

Blueprint Import now recognizes an explicit V2 envelope: `blueprintVersion: 2` with `spec.schemaVersion: 2` and `spec.engineVersion: 2`. Version 1 remains the default prompt format and continues through the existing Quick Fix and repair pipeline.

The V2 importer is intentionally strict and does not apply V1 numeric repairs. It preserves declared types and rejects malformed type definitions, ranges, dates, enum choices, duplicate keys, invalid typed scenario values, unknown properties and version mismatches. Formula/type/unit validation runs through the same Manual Builder V2 validator, including a default-value evaluation before a V2 import is treated as clean.

A formula or dimensional validation issue does not coerce or rewrite V2 values. The importer keeps a structurally valid V2 definition as an editable typed draft and reports the remaining checks in the editor, where the shared V2 validator runs again. The V1 path retains its existing adaptive fallback behaviour for unresolved imports.

The Blueprint Import panel now lets the user choose which prompt contract to copy: Version 1 or the experimental typed Version 2 contract. Import remains local-only. A V2 import cannot save or publish and does not call an AI service or Supabase.


## 12. AI Creator typed V2 generation

AI Creator now has an explicit schema selector for new calculator generation. Version 1 remains the default and uses the existing provider schema, V1 normalizer, repair path and saved-calculator compatibility. Existing saved-calculator AI refinement remains V1-only; requesting schema V2 during refinement is rejected before any AI reservation or provider call.

Version 2 generation uses the canonical Blueprint V2 envelope, a separate strict Groq JSON schema and the V2 contract prompt shared with Blueprint Import. Provider-specific scenario overrides are normalized into the canonical typed values map without converting numbers, booleans, enum strings or dates. Null placeholders used only by the strict provider schema are removed before strict import validation.

The server passes the V2 draft through the same Blueprint Import V2 normalizer and shared calculator engine server validator, including typed formula, unit and default-value evaluation. Invalid types, dates, choices, categories, formulas or units cause the AI operation to fail and follow the existing CALC/quota refund path. Successful V2 AI generation is charged using the normal AI generation price and daily allowance; editing and local testing do not make additional AI requests or CALC charges.

AI Creator displays the generated typed definition in the V2 editor and local test panel. The server returns schemaVersion 2 / engineVersion 2 only after validation succeeds. The existing client-side V2 gate continues to disable Save and Publish, and the save handler rejects V2 before any persistence RPC. AI refinement of saved calculators, V1 creation, Blueprint Import V1 and Manual Builder V1 remain unchanged. No Production Supabase schema or persistence capability is enabled.

Gemini receives the same explicit V2 Blueprint contract in JSON response mode; its output is still treated as untrusted and must pass the strict importer and server validator. If Gemini returns malformed or invalid output and Groq is configured, the existing single Groq fallback uses the strict V2 JSON schema and the same reserved operation.


## 13. AI Creator V2 integration verification

The AI Creator version selector defaults to V1 and is available only when creating a new calculator. The client sends the selected version explicitly and rejects a response whose returned schema version does not match the selection. Existing saved-calculator refinement remains V1-only and a V2 refinement request is rejected before reservation or provider work.

The integration regression tests cover:
- The separate strict Groq V2 JSON schema and provider-specific scenario normalization into canonical typed values.
- Gemini canonical V2 JSON output, including boolean, enum, date and scenario values, followed by the same strict Blueprint importer and server-side Engine V2 validation.
- Rejection of unsupported schema versions and V2 saved-calculator refinement before any CALC reservation or provider call.
- A generated V2 formula with a number/boolean type mismatch; the server rejects it and refunds the reserved AI operation instead of settling the CALC charge.
- The V2 client selector, selected/returned schema-version match, local typed editor/test-panel routing, and the Save/Publish gate.

Latest verification on commit `09a64a9abf3a4dcec6de78a52553358f05d217e6`:
- UGC calculator and badge suite: **113/113 passed**.
- Combined JavaScript contract/security suites: **522/522 passed**.
- JavaScript syntax, PostgreSQL grammar and migration delimiter checks: passed.
- Disposable PostgreSQL migrations and smoke tests: passed.
- Cloudflare Pages Preview deployment check: successful.
- CI: https://github.com/DarthNecrohorn/worth-it-calculator/actions/runs/43507557305

The CI tests do not replace a final manual browser review of the Preview. No merge, Production deployment, or Supabase Production migration is included.