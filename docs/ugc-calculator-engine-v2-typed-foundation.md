# Calculator Engine v2 — Typed schema foundation

**Status:** Initial schema and typed-value foundation; not yet wired to public calculator creation or execution.
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

Manual Builder UI, AI Creator generation schema, Blueprint Import, save/publish routes and database persistence remain v1-only. This branch does not expose v2 definitions to members or publish them. Matching independent server/database validation and schema-aware persistence must be implemented before any V2 definition can be saved or published.

## 6. Security and rollout

V2 validation rejects unsupported version pairs, unexpected object properties, invalid keys, duplicate keys, malformed typed values, unsafe field shapes and invalid numeric formulas. No executable expressions, callbacks, scripts, URLs, HTML, external lookups or user code are introduced.

The new helpers are tested in the shared JavaScript engine. Before v2 can be used for persisted/community calculators, follow-up work must add matching independent server and database validation, wire schema-aware save/publish/run paths, and add disposable PostgreSQL migration tests. None of those Production actions is part of this branch.


## 7. Server validation and persistence boundary

The server now has a version-aware adapter around the shared engine. V1 definitions continue to use the exact shared V1 validator. V2 definitions additionally normalize typed input/group defaults and run the deterministic V2 evaluator once against those defaults, so default-value runtime failures (including calendar overflow) are caught server-side.

This is a validation foundation only. The current AI Creator still emits V1 definitions, and the Manual Builder, Blueprint Import and public calculator execution routes are not V2-aware. The Supabase save/publish RPCs still persist V1 only.

The additive SQL version-gate migration preserves the previous V1 PL/pgSQL validator under a private internal name and routes the existing validator name through a strict version check. Legacy V1, explicit schema 1 / engine 1, and legacy `version: 1` definitions remain accepted by the old validator without changing its implementation. Partial, mixed, unknown and V2 version declarations fail closed. Direct execution of the renamed raw V1 implementation and the new internal wrapper is revoked from API roles.

The SQL migration is added to disposable PostgreSQL CI and is run twice to check idempotence, followed by a smoke fixture that verifies V1 compatibility, V2/invalid-version rejection, and private-function privileges. It is a repository migration only: it has **not** been applied to Supabase Production. V2 persistence remains intentionally disabled until the independent V2 database validator and complete UI/Blueprint/save/publish/run adapters are ready.


## 8. Independent PostgreSQL V2 validator

A separate private PostgreSQL validator checks V2 definitions without trusting the browser or the JavaScript engine. It validates exact schema/engine versions, closed JSON object shapes, typed number/boolean/enum/date inputs, typed dynamic-group fields, scenarios, result metadata and formula references.

The database formula parser accepts only the V2 declarative grammar. It enforces the operator/function allowlist, valid argument counts, bounded formula length/token count/nesting, declared input and prior-result references, typed arithmetic and boolean logic, enum choice matching, calendar date operations, same-group collection aggregates, numeric result types and basic dimensional-unit compatibility. Formula source is never executed as SQL, JavaScript or another language.

The validator is installed under the private schema with execution revoked from public, anon, authenticated and service_role. It is exercised directly only in disposable PostgreSQL CI. The existing save/publish version gate continues to reject V2; the new validator does not activate V2 persistence or member-facing routes.

The database validator intentionally uses conservative unit compatibility for V2. It recognizes the common currency, time, distance, area, volume, mass, energy, power, data, count and common rate units used by the existing calculator contract; unknown units are treated as opaque dimensions and must match exactly. This is stricter than the full browser unit registry in some edge cases and must be reconciled before persistence is enabled.


## 9. Shared unit registry parity

The PostgreSQL V2 validator now uses the same explicit aliases and dimensional vectors as the shared JavaScript engine for currencies, percentages-per-time, time, distance, area, volume, mass, data, energy, power, token/count, common rates and compound products/quotients. Unknown atoms remain opaque dimensions rather than being guessed or silently converted.

The SQL parser also carries unit display symbols through formula references and unit algebra. The special derived-energy rule is shared: `kW × hour = kWh` and `W × hour = Wh`. The browser registry now explicitly recognizes `Wh`, so an energy formula can be checked against an explicit Wh result unit consistently.

Disposable PostgreSQL CI checks a shared list of expected vectors and validates formulas for derived energy, data-per-time, distance-per-time and opaque-unit-per-time. This still validates units only; it does not enable V2 persistence.
