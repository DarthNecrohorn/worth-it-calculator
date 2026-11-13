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

## 5. Formula boundary in this foundation

This is deliberately a typed-schema foundation, not yet the complete typed formula engine.

- Numeric inputs and numeric dynamic-group fields can be used by the existing numeric formula grammar and unit analyser.
- Boolean, enum and date values are validated and preserved as typed data but are not yet formula operands.
- A formula that attempts to use a boolean, enum or date as a number is rejected. No implicit boolean-to-0/1, enum-to-index, date-to-timestamp or timezone conversion is performed.
- Date functions, enum comparisons, boolean type-aware conditionals, typed aggregates and typed result formatting require a later formula/type-checker phase.
- The current Manual Builder UI, AI Creator output schema, Blueprint Import, save/publish routes and database persistence remain on v1. This branch does not expose v2 definitions to members or publish them.

This boundary prevents a partially typed model from being accepted by a numeric evaluator that does not yet understand its semantics.

## 6. Security and rollout

V2 validation rejects unsupported version pairs, unexpected object properties, invalid keys, duplicate keys, malformed typed values, unsafe field shapes and invalid numeric formulas. No executable expressions, callbacks, scripts, URLs, HTML, external lookups or user code are introduced.

The new helpers are tested in the shared JavaScript engine. Before v2 can be used for persisted/community calculators, follow-up work must add matching independent server and database validation, wire schema-aware save/publish/run paths, and add disposable PostgreSQL migration tests. None of those Production actions is part of this branch.
