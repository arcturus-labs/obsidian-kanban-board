# Task templates

**Purpose:** Parse `_task_template.md` and generate Markdown for a new task.

**Code:** `src/taskTemplate.ts`.

**Technology:** TypeScript with the `yaml` library for frontmatter parsing/serialization; pure transformations, no Obsidian API dependency.

## Important API and data

- `parseTaskTemplate(raw)` → `{ frontmatter, body }`; accepts plain Markdown without YAML.
- `buildTaskFileContent(template, input)` → complete task note; template custom fields pass through, plugin-managed fields override.
- Template schema: optional YAML mapping + Markdown body.

## Generation rules

- Body: non-empty dialog description → template body → built-in default.
- Tags: union of template and dialog tags.
- Managed fields: `type`, `status`, `board_order`, dates, `source_issue`, `tags`, `status_history`.
- Invalid YAML: plugin notifies and falls back to defaults.

## Boundary

- Pure parsing/merge/serialization; file reads and creation belong to [Plugin](./plugin.md).
