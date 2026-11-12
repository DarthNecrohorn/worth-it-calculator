# AI Blueprint Import — provider-neutral repair contract

**Status:** Draft implementation contract  
**Branch:** feat/ai-blueprint-import-20261112

## Purpose

Allow a member to use an external AI assistant to design a calculator for any supported subject, then import its result as an editable local Manual Builder draft.

The feature is provider-neutral. Worth It does not call ChatGPT, Gemini, Claude, DeepSeek, Groq or another model during blueprint import. The user chooses an external assistant, supplies the calculator requirements, copies the Worth It output contract and pastes the returned blueprint into Manual Builder.

## What “any prompt” means

The calculator request can be about any supported subject or use case. It can be short, detailed, technical or written in ordinary language. The copied instructions define one canonical output format; they do not prescribe a calculator topic.

This does not mean every arbitrary response or every natural-language request can be reconstructed perfectly. The importer can repair structural omissions and mathematically provable inconsistencies. It cannot infer an unstated business rule, invent a missing scientific equation, perform an unprovided currency conversion or turn executable code into a safe formula.

## Canonical blueprint version 1

The external assistant is asked to return one object with these root properties:

    {
      "blueprintVersion": 1,
      "title": "Calculator title",
      "description": "Explain what it measures and its main assumptions.",
      "category": "other",
      "subcategories": [],
      "assumptions": [],
      "spec": {
        "inputs": [],
        "groups": [],
        "results": [],
        "scenarios": []
      }
    }

Allowed root, spec, input, group, field, result and scenario properties are allowlisted by `ugc-blueprint-import.js`. Provider-specific executable fields, prototype-sensitive keys, unsupported properties, malformed JSON and invalid formulas are not executed or silently accepted.

## Import and repair pipeline

1. **Response extraction** accepts raw JSON, one JSON code block, or one unambiguous object surrounded by ordinary explanation. Multiple candidate objects and non-JSON code fences are rejected rather than guessed.
2. **Structural preparation** fills missing descriptive metadata, input labels and keys, sensible numeric defaults/ranges/steps, group fields, scenario maps and other schema details when a deterministic fallback exists. Common field aliases such as `formula`, `variableKey`, `defaultValue` and `resultUnit` are normalised to the canonical names.
3. **Key repair** generates unique lowercase keys and rewrites unambiguous formula references when a key is renamed. Dynamic group-field references are updated as qualified group/field pairs.
4. **Formula repair** normalises common mathematical symbols and function-name casing, reorders results when their dependencies form a clear acyclic chain, and adds a zero-denominator guard only when the denominator can actually reach zero based on its declared range or expression.
5. **Unit repair** analyses the formula's dimensional result and corrects a mismatched result display to the matching unit or currency when the formula makes that result unambiguous.
6. **Final validation** passes the prepared blueprint through the same Manual Builder formula, unit, dependency, boundary and scenario validator used for manually created calculators.
7. **Draft import** populates the editable Advanced Formula Builder. The member must review and test the result; Save and Publish remain separate, explicit actions.

## Original request coverage check

The import panel may also receive the exact calculator request that the member gave to the external AI. This text is optional and is used only in the browser for a lightweight keyword coverage check.

The checker compares distinctive request terms with the calculator title, description, assumptions, input labels/keys, group labels/fields, result labels/formulas/explanations and scenario labels. It uses a small, explicit synonym map for common terms. When meaningful request terms are not found, it adds a review note to the editable draft.

This is a heuristic warning, not natural-language understanding. It can miss synonyms, miss a mathematical feature expressed only in a formula, or flag a term that is represented differently. It never invents a formula, deletes a requested feature, blocks import, or declares the calculator fully complete. The original request is not copied into the calculator definition, sent to an AI provider, submitted to the server or saved as part of the calculator.

## What can be repaired automatically

Examples include:
- A missing label or variable key can be derived from an existing descriptive label.
- A missing numeric minimum, maximum, default or step can be completed with a bounded, step-aligned fallback.
- An optional dynamic group with a zero-valued placeholder can be changed to the Manual Builder's required one-row minimum.
- A result that is marked as currency but mathematically evaluates to `EUR/month` can be corrected to a unit result with `EUR/month`.
- A formula such as `data_size / transfer_hours` can have its unit corrected to `GB/hour` when the input units explicitly establish those dimensions.
- A result chain can be reordered only when all dependencies are identifiable and the dependency graph has a valid topological order.
- A variable denominator is guarded only when its range or expression can include zero.

If an entire result or formula is missing, the importer may create a clearly noted temporary passthrough result using the first available input. This is a placeholder, not a guessed calculation; the notice tells the member to replace it before publishing.

## What remains strict

The importer must not invent formulas or business rules. It keeps rejecting:
- Unknown or unsafe properties, prototype-sensitive keys and arbitrary scripts.
- Duplicate dropdown values or labels where the intended choice cannot be determined.
- A zero-row group whose non-zero default would make a placeholder change the calculation.
- Invalid or unsupported formula syntax that cannot be normalised without changing its meaning.
- Incompatible currencies, missing conversion rates, incompatible addition/subtraction and ambiguous dimensional calculations.
- Dependency cycles or result references that cannot be resolved.
- Values or payloads that exceed hard safety and size limits.

Any temporary placeholder or compatibility change is listed in import notes. A successful import means the blueprint passed the shared validator; it is not proof that a temporary placeholder or the original calculator design is suitable for publication.

## Units and formulas

The Manual Builder uses dimensional algebra. Common units and rates are recognised, including currency-per-time and physical compound units. Simple explicit products and quotients such as `GB/hour`, `EUR/month` or `kWh/day` can be analysed.

Unknown unit atoms remain distinct dimensions. For example, an unknown `GB` token is not assumed to be equivalent to `MB`, bytes or any other unit. Combining it with an explicit time unit can produce a checkable unit such as `GB/hour`, but it does not perform scale conversion. There is no implicit currency exchange, unit conversion, or conversion between days, weeks, months and years.

The formula language remains a restricted data-only expression grammar. It does not execute JavaScript, Python, arbitrary functions, network access, callbacks or dynamic imports.

## Safety and privacy

- Import is local-only and does not send the pasted blueprint to an AI service.
- No AI API request, CALC charge, AI daily quota use, automatic save or publish occurs during import.
- Payload size, nesting depth, node count and supported item counts are bounded.
- Prototype-sensitive properties are rejected before normalisation.
- Unknown properties are rejected rather than silently discarded.
- Imported text is parsed as data and rendered through existing safe UI paths.
- Failed imports preserve the current unsaved draft.
- Save/Publish continue to use the existing server-side validation and account rules.

## Verification strategy

Tests cover provider response styles, structural omissions, common field aliases, key rewriting, range/step completion, optional group placeholders, scenario bounds, formula dependency ordering, zero-denominator guards, custom compound units, rate-result display repair, malformed or unsupported data, and preservation of existing draft/save/publish behaviour.

PR #198 remains Draft until automated tests, Preview testing and manual verification with varied providers and calculator topics are complete. A successful test with one provider does not establish universal correctness for every AI response.
