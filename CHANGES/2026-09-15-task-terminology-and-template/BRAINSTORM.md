# Brainstorm

**Status: provisional — not an implementation decision**

## Problem

1. Terminology is split: user-facing language is drifting toward "task" (README, code's `type: task`, `Tasks/` folder, `RookKanbanBoardPlugin`, "New … task" modal), but the agent skill (`.agents/skills/using-rook-todos/SKILL.md`) still says "todo" throughout, lives in a `using-rook-todos` directory, and references `ToDos/` and `type: todo`. The developer wants everything to say "task".
2. New-task content is hardcoded in `createTask()` (`src/main.tsx` ~line 327-352): a fixed YAML block plus a fixed default body (`- Define the outcome.\n- Add the next concrete step.`). The developer wants a `_task_template.md` file in the tasks folder to take over when present, while guaranteeing the properties the board needs still get set, allowing extra user properties, and allowing a custom starting body.

## Investigation

Inspected `src/main.tsx` (single-file plugin), `README.md`, `manifest.json`, `package.json`, and `.agents/skills/using-rook-todos/SKILL.md`.

Current behavior:
- `getTasks()` reads all `.md` files under the tasks folder except basenames starting with `_` — so `_task_template.md` is already excluded from the board. Good.
- `createTask()` builds frontmatter inline: `type: task`, `status`, `board_order` (top-of-column), `created`, `touched`, `source_issue:` (empty), `tags`, `status_history: ["<today> | created -> <status>"]`. Body defaults to the two checklist lines unless the user typed a description in the modal.
- `moveTask()` rewrites `type: task` and updates `status`/`board_order`/`touched`/`status_history` on drag — so `type`, `status`, `board_order`, `touched`, `status_history` are the load-bearing keys. `created`, `source_issue`, `tags` are read but tolerated when missing.
- `normalizeStatusValue()` maps legacy `todo` status → `backlog`; `getTasksFolder()` falls back to `ToDos/` when configured folder is `Tasks` and `ToDos/` exists. Both marked THIS IS FOR BACKWARDS COMPATIBILITY.
- Skill doc's remaining "todo" surface: directory name `using-rook-todos`, skill `name: obsidian-todo-board`, title `# Obsidian Todo Board`, ~30 prose/code mentions, `type: todo`, `ToDos/` paths, `created -> todo` history example.
- No tests, no CI in the repo. Validation = `tsc`/build + manual Obsidian smoke test.

## Options and questions

### A. Terminology rename ("todo" → "task")

Straightforward find-and-replace across the skill doc, plus renaming the skill directory `using-rook-todos` → `using-rook-tasks` and skill `name:` `obsidian-todo-board` → `obsidian-task-board`. No code identifiers need to change (code already says task). Question: also rename the global `~/.pi/agent/skills/obsidian-todo-board` copy, or leave that as a separate shared skill? Recommend updating the worktree/repo copy; ask before touching global skills.

Back-compat already handled in code (`ToDos/` fallback, `todo`→`backlog` mapping) — keep those shims, just mark them per the lifecycle's compatibility-surface step.

### B. `_task_template.md` support

Recommended design:

1. **Location/name:** `<tasksFolder>/_task_template.md`, same constant-style naming as the existing `_`-prefix exclusion (no new ignore logic needed — `getTasks()` already skips `_`-prefixed basenames).
2. **Format:** a normal markdown note — optional YAML frontmatter + body. Users edit it like any other note.
3. **Merge semantics (the key decision):** which wins on conflict, and what is guaranteed?
   - **Recommended: template is the base, plugin values are authoritative for load-bearing keys.** On create: parse template frontmatter → overlay computed `type: task`, `status` (from the column's `+` button), `board_order` (top of column), `created`, `touched` (today), `status_history` (`created -> <status>` entry — prepend or replace? recommend prepend-if-template-has-history, else set). Preserve all other template keys verbatim (user's custom properties survive). `tags:` union template tags with modal tags. `source_issue`: keep template's value if present, else empty.
   - Body: if modal description non-empty it wins; else template body if non-empty; else current hardcoded default as final fallback (keeps today's behavior when no template exists).
   - If no template file exists (or it fails to parse): exact current behavior. Zero regression risk.
4. **Placeholder substitution?** Minimal `{{title}}`, `{{date}}`, `{{status}}` replacement in template body/frontmatter values would be genuinely useful (e.g. `# {{title}}` heading, `created: {{date}}`). Recommend including only if cheap via string replace after merge — needs developer call since it expands scope slightly. Default proposal: implement `{{title}}` / `{{date}}` / `{{status}}`, document them.
5. **Failure modes:** template missing → fallback (normal case). Template with invalid YAML → fall back to built-in default + `Notice('Task template has invalid frontmatter — used defaults')`. Template is a directory or unreadable → same fallback. Never block creation.
6. **Skill doc update:** document `_task_template.md` — what keys the plugin guarantees, that extra keys pass through, body fallback chain, and that the file itself never appears on the board.

Open questions for the developer:
- Confirm merge semantics (plugin-wins on the 5 load-bearing keys, template-wins elsewhere)?
- Include `{{title}}`/`{{date}}`/`{{status}}` placeholders, or ship without substitution first?
- Default template: ship a `_task_template.md` example in the repo/README, or purely document the convention? (Recommend documenting + showing example in README; do NOT auto-create it in user vaults — surprising file creation is bad.)
- Also update the global skill copy at `~/.pi/agent/skills/obsidian-todo-board`?

## Decisions (confirmed by developer 2026-09-15 — "Go for it")

- Template must work with **no YAML section**: whole file is treated as body.
- Creating a task with no content uses whatever is in the template.
- The create-task dialog's description box is **pre-filled with the template body** when a template exists (no placeholders).
- Ship **without** `{{...}}` placeholder substitution for now.
- **Hold the todo→task rename** to keep this change small.
- Add a template **example in the README and the skill doc**.
- No test infra exists; set up vitest and use TDD for the new code only (no retroactive tests for existing code): red tests → implementation → green.

## Direction

Preferred (pending developer confirmation): rename skill dir + contents to task terminology; implement `_task_template.md` as base-with-plugin-overlay per B3, body fallback modal → template → builtin default, invalid-template fallback with Notice; document in README + skill doc. No test infra to add (repo has none); validate with `npm run build` + manual vault smoke test.
