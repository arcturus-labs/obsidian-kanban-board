# Board

**Purpose:** Kanban presentation and task interactions.

**Code:** `RookKanbanBoardView`, `BoardApp` in `src/main.tsx`.

**Technology:** React mounted inside Obsidian's workspace view; browser drag/drop for card movement.

## Responsibilities

- Mount and render status columns/cards and task-creation overlay.
- Load task projections; filter by text/tags; group by status.
- Translate UI actions into plugin operations.

## Important interface

- `BoardApp({ plugin })` → board UI; reads task/status projections and calls plugin create/move/delete operations.
- Drag/drop provides file path and target neighbors to `moveTask`; double-click opens the Markdown note.

## Type hierarchy

- `RookKanbanBoardView extends ItemView` (Obsidian), owns React root lifecycle.
- Extension pattern: implement/subclass `ItemView`, then register the view with the plugin. `BoardApp` is a React function component, not a subclass.

## Boundary

- Transient UI state only: query, tag, drag target, task draft.
- Persistence/configuration: [Plugin](./plugin.md).
