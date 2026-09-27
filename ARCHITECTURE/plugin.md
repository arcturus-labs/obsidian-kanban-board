# Plugin

**Purpose:** Obsidian integration and Markdown task operations.

**Code:** `RookKanbanBoardPlugin` in `src/main.tsx`.

**Technology:** TypeScript + Obsidian Plugin API; vault Markdown is the task store, with no separate database.

## Responsibilities

- Plugin lifecycle; view, command, ribbon, settings registration.
- Task-folder and status configuration.
- Task discovery, status/order normalization, frontmatter persistence.
- Vault/metadata change notifications.

## Important API

- `onload()` → load configuration; register UI entry points and change listeners.
- `getTasks()` → `TaskItem[]` projection from configured folder; missing order may be written during discovery.
- `createTask(input)` → create a Markdown task using optional folder template.
- `moveTask(file, destination)` → persist order; on status change also update history and `touched`.
- `deleteTask(file)` → delete backing note.

## Data schemas

- **Task note:** filename/basename is title; YAML fields include `status`, `board_order`, `created`, `touched`, `source_issue`, `tags`, `status_history`. Plugin writes `type: task`; discovery is folder-based.
- **Plugin settings:** `tasksFolder`; fallback `statuses` list.
- **Column config:** plugin-local JSON `{ "statuses": string[] }`.
- **`TaskItem`:** in-memory subset of note path/title and selected status/order/date/issue/tag/history fields.

## Type hierarchy

- `RookKanbanBoardPlugin extends Plugin` (Obsidian).

## Boundaries

- Obsidian `vault`, `metadataCache`, `fileManager.processFrontMatter` provide storage and change APIs.
- Template parsing/serialization: [Task templates](./task-templates.md).
- Board presentation: [Board](./board.md).
