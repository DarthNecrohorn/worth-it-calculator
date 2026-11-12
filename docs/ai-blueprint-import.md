# AI Blueprint Import — Implementation Plan

**Status:** Design and implementation contract  
**Date:** 2026-11-12  
**Target base:** Draft PR #194 head `03770f09732564df720d9b07575d606228fb3855`  
**Branch:** `feat/ai-blueprint-import-20261112`

## 1. Purpose

Let a member use any external AI assistant to design a Worth It calculator, copy the resulting JSON blueprint, paste it into the Manual Builder, and have the existing Builder populate an editable local draft.

The import path is a convenience layer over the current Manual Builder. It is not a second calculator engine and does not execute AI-produced code.

## 2. User flow

1. Open **Manual Builder**.
2. Expand **AI Blueprint Import**.
3. Copy the Worth It blueprint prompt/instructions.
4. Ask an external AI assistant to create the requested calculator and return one JSON blueprint.
5. Paste the JSON into the import field and choose **Import blueprint**.
6. The browser parses the JSON, normalizes only documented aliases/optional fields, rejects unsupported properties, and validates the candidate against the same Manual Builder schema and formula/unit checks.
7. If valid, the existing Advanced Formula Builder is populated with the title, description, category, inputs, dynamic groups, scenarios, formulas and result presentation.
8. The user reviews and edits the draft, opens **Try calculator**, and tests it locally.
9. Save draft or Publish remain separate, explicit actions. Import never saves, publishes, charges CALC, calls the AI API, or consumes an AI-generation allowance.

## 3. Canonical blueprint format

Version 1 uses the existing UGC calculator document shape rather than inventing a parallel runtime schema:

```json
{
  "blueprintVersion": 1,
  "title": "Household Expense Calculator",
  "description": "Calculate a purchase total and analyse its additional expenses.",
  "category": "home",
  "subcategories": ["household-budget"],
  "spec": {
    "inputs": [
      {
        "key": "base_cost",
        "label": "Base cost",
        "min": 0,
        "max": 1000000,
        "default": 30,
        "step": 1,
        "unit": "EUR"
      }
    ],
    "groups": [],
    "results": [
      {
        "key": "final_total",
        "label": "Final total",
        "expression": "base_cost",
        "format": "currency",
        "currency": "EUR",
        "explanation": "The final calculated amount."
      }
    ],
    "scenarios": []
  },
  "assumptions": [
    "All monetary inputs use EUR."
  ]
}
```

The example is illustrative. The importer must not silently convert units, infer exchange rates, or treat an omitted unit as a currency.

### Supported fields

- Root: `blueprintVersion`, `title`, `description`, `category`, `subcategories`, `spec`, `assumptions`.
- `spec.inputs`: the exact supported Manual Builder input properties.
- `spec.groups`: bounded dynamic groups and their typed fields.
- `spec.results`: the exact supported result properties, including formula expression, format, currency/unit and explanation.
- `spec.scenarios`: only the scenario structure already supported by the current Builder.
- Text-only `assumptions` are explanatory notes; they never become formulas or executable instructions.

Unknown keys, unsupported component types, arbitrary markup, URLs, script-like fields and unrecognized formula functions must be rejected, not ignored or executed.

## 4. Formula and security contract

- Every formula is a string in the existing restricted formula grammar.
- The existing parser converts expressions to its allowlisted AST; no `eval`, `Function`, dynamic import, scripting runtime or generated JavaScript is permitted.
- Import uses the existing `validateMakerSpec`, formula dependency/unit checks and local preview path.
- Client validation provides immediate feedback only. Existing server-side save/publish validation remains authoritative.
- The AI Blueprint Import path must not create a privileged bypass around server validation.
- Enforce a small paste-size ceiling, JSON nesting/depth and object/array count limits before rendering.
- Never use `innerHTML` with imported text. Existing text-node/textarea rendering must be retained.
- Reject prototype-sensitive keys such as `__proto__`, `prototype` and `constructor`.
- Currency mismatches and incompatible physical dimensions remain validation errors. No automatic conversion.

## 5. UX and failure behavior

- The import panel is inside Manual Builder, not the AI Maker.
- Include a copyable external-AI prompt that tells the external assistant to return only the documented JSON blueprint and never executable code.
- The paste area must accept plain JSON, with an optional single ```json fenced block if the parser strips only the outer fence safely.
- Show clear parse errors separately from schema/formula/unit errors.
- On failure, preserve the current draft and all current form values.
- On success, replace the current unsaved local draft only after the complete candidate passes validation; ask for confirmation if the current draft has been edited.
- Set the authoring mode to Advanced Formula Builder and render through the existing preview/editor.
- Keep the normal local test, Save draft and Publish controls unchanged.
- Imported drafts remain unsaved until the user explicitly saves.

## 6. Compatibility

- Version 1 maps to the existing current UGC spec.
- Existing AI-generated calculators, Manual Builder templates and saved calculator documents are unchanged.
- No database schema or migration is required for import.
- No changes to Production configuration, secrets, Supabase schema or Cloudflare bindings are part of this feature.
- PR #194 remains Draft and unmerged. This branch is based on its current tested head so it can be reviewed independently and later proposed as a separate PR targeting the PR #194 branch, not Production's `main`.

## 7. Implementation sequence

1. Add a pure blueprint parser/normalizer with strict allowlists and defensive limits.
2. Add focused unit tests for valid import, fenced JSON, malformed JSON, unsupported keys, prototype keys, oversized/deep payloads, formula rejection, currency mismatch and preservation of the existing draft on failure.
3. Add the Manual Builder import panel and prompt-copy action.
4. Connect successful validation to the existing `state.aiDraft` / `renderMakerPreview` path; mark the source as manual and clear any AI operation ID.
5. Verify imported content can be locally previewed and edited, while Save/Publish remain explicit and unchanged.
6. Run targeted tests, full CI and a Cloudflare Preview. Manually inspect desktop/mobile UI before considering the feature complete.

## 8. Acceptance criteria

- A supported blueprint populates the Advanced Formula Builder correctly.
- Invalid JSON or schema does not mutate the current draft.
- Unsupported or malicious fields are rejected.
- Formulas are parsed and evaluated only by the existing restricted engine.
- Currency and unit mismatches are caught.
- No AI provider request, CALC charge, save or publish occurs during import.
- Local testing works and all imported fields remain editable.
- Existing AI Maker, Manual Builder, save/publish and calculator regressions remain green.
- No Production changes; PR #194 remains Draft and unmerged.
