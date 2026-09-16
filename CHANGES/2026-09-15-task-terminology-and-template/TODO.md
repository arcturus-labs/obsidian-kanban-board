# Task template support

> Created after the developer explicitly agreed on the direction (2026-09-15). Records decisions, not hypotheses.

## Context

New-task content is hardcoded in `createTask()` (`src/main.tsx`): a fixed YAML block plus a fixed default body. We want a `_task_template.md` file in the tasks folder to take over when present — custom starting body (pre-filled into the create dialog) plus custom frontmatter keys — while the plugin keeps guaranteeing the properties the board needs. No test infrastructure exists yet; this change sets it up and builds the new code TDD.

## Decision details

- Template path: `<tasksFolder>/_task_template.md`. Already excluded from the board by the `_`-prefix filter in `getTasks()`; no ignore-logic change needed.
- Template format: a normal markdown note. **No-YAML templates are valid** — the whole file is treated as body.
- Merge rule — template is the base, plugin is authoritative on load-bearing keys (`type`, `status`, `board_order`, `created`, `touched`, `status_history`): template frontmatter keys pass through verbatim otherwise; `tags` = union of template + modal tags; `source_issue` = template's value when present.
- Body fallback chain: modal description → template body → builtin default. Empty creation uses the template body.
- Create dialog: description box is **pre-filled with the template body** when the dialog opens (loaded async; empty-string while loading).
- No `{{...}}` placeholder substitution in this change.
- Out of scope (explicit non-goals): the todo→task terminology rename; retroactive tests for existing code; auto-creating `_task_template.md` in user vaults.
- Docs: template example added to README and the agent skill doc.
- Back-compat surfaces touched: none (purely additive; missing/unparseable template falls back to today's behavior with a Notice on bad YAML).

## Work checklist

- [x] Set up vitest + test script (new infra, no tests for existing code)
- [x] Write RED tests for template parsing (YAML + body, no-YAML body, empty/missing)
- [x] Write RED tests for merge semantics (plugin-wins keys, custom passthrough, tags union, body fallback chain)
- [x] Implement template loading + merge in `src/` (extract pure helpers for testability)
- [x] Pre-fill create dialog description from template body
- [x] Verify RED→GREEN (tests fail before impl, pass after)
- [x] `npm run build` + typecheck clean
- [x] Document `_task_template.md` with example in README + skill doc
- [ ] Manual vault smoke test (template present/absent, dialog pre-fill, bad YAML notice)
- [ ] Commit planning record, implement on worktree/branch, PR, merge
