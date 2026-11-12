# AI Blueprint Import — Universal compatibility contract

**Status:** Draft implementation contract  
**Branch:** feat/ai-blueprint-import-20261112

## Purpose

Allow a member to use any external AI assistant to design a calculator for any supported subject, then import its result as an editable local Manual Builder draft.

The feature is provider-neutral: it does not call ChatGPT, Gemini, Claude, DeepSeek, Groq or another model. The user chooses the external assistant, supplies the calculator requirements in natural language, copies the Worth It output contract, and asks the assistant to return one canonical blueprint.

## What “any prompt” means

The calculator request can be about any domain or use case. It can be short, detailed, technical, or written in ordinary language. The copied instructions must not impose a preset calculator topic or inject requirements from an unrelated example.

The output format is intentionally standardised. An arbitrary natural-language request can be adapted to the canonical blueprint, but an arbitrary JSON schema or request for executable code is not automatically compatible. Requests that exceed the current formula language or available units must be simplified transparently or reported as limitations, not executed.

## Canonical blueprint version 1

    {
      "blueprintVersion": 1,
      "title": "Calculator title",
      "description": "Explain what it measures and its main assumptions in at least 24 characters.",
      "category": "other",
      "subcategories": [],
      "assumptions": [],
      "spec": {
        "inputs": [
          {
            "key": "base_value",
            "label": "Base value",
            "min": 0,
            "max": 1000000,
            "default": 30,
            "step": 1,
            "unit": ""
          }
        ],
        "groups": [],
        "results": [
          {
            "key": "calculated_value",
            "label": "Calculated value",
            "expression": "base_amount",
            "format": "number",
            "explanation": "Explain the result in plain language."
          }
        ],
        "scenarios": []
      }
    }

Root keys, supported properties, limits and formula grammar are allowlisted in ugc-blueprint-import.js. Unknown fields, script-like fields, prototype-sensitive keys, unsupported formula functions and invalid values are rejected.

## Compatibility approach

1. The prompt states the same canonical schema for every AI provider and every calculator topic.
2. The parser accepts raw JSON, one outer JSON fence, or one unambiguous JSON object/code block surrounded by ordinary AI explanation.
3. It repairs only narrowly defined copy/paste artifacts that do not change the intended data.
4. It rejects ambiguous multiple JSON objects instead of guessing.
5. The normalized candidate goes through the existing validateMakerSpec formula, unit, dependency, range, step and scenario checks.
6. The imported document enters the existing editable Advanced Formula Builder. Save and Publish remain explicit user actions.

## Units and formulas

The generated prompt must explain dimensional algebra with generic examples, never calculator-specific unit instructions. It must distinguish currency totals from rates such as EUR/day and EUR/month; prevent incompatible addition; require unitless multipliers where appropriate; and state that the engine does not perform currency exchange or implicit unit-scale conversion.

The prompt should prefer the units understood by the current Manual Builder. Unrecognised custom unit strings are opaque and must not be treated as decomposable compound units. Formula support is limited to the allowlisted expression grammar and existing aggregate functions for dynamic groups.

## Safety and privacy

- No eval, Function, script execution, dynamic imports, callbacks or external network access.
- Imported text is parsed as data and rendered through existing safe UI paths.
- Payload size, nesting depth, node count and supported item counts are bounded.
- Unknown root/spec/input/group/result/scenario properties are rejected.
- Prototype-sensitive keys are rejected.
- Failed imports preserve the current draft.
- Import never calls an AI endpoint, consumes AI quota, charges CALC, saves, or publishes.
- Existing server-side validation remains authoritative on Save/Publish.

## Verification strategy

Test:
- Multiple external response styles: raw JSON, one JSON code block with surrounding prose, copied line breaks, and common escaped multiplication artifacts.
- Ambiguous or invalid output: malformed JSON, multiple objects, multiple code blocks, unsupported languages, unknown fields, duplicate keys and prototype-sensitive keys.
- Different domains: money, cars, home, technology and other categories.
- Formula features: chained result dependencies, dynamic groups, guarded division, percentages, currency results, rate units, and unitless multipliers.
- Boundary behavior: input minimum/maximum values, step alignment, scenario values, zero denominators and dynamic-group defaults.
- Security and non-regression: no scripts, no network requests, no draft mutation on failure, and no change to the normal Manual Builder save/publish flow.

A successful schema import is not proof that every possible natural-language request or every AI-generated formula is correct. PR #198 remains Draft until automated tests, Preview testing and manual validation of varied examples are complete.
