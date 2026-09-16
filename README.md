# Obsidian Kanban Board

A React-based kanban board Obsidian plugin for managing task notes stored as markdown files in a folder.

![Obsidian](https://img.shields.io/badge/Obsidian-1.6.0%2B-7C3AED)

## Features

- **Kanban board** with drag-and-drop between status columns
- **Configurable statuses** — add, remove, and reorder columns
- **Tag filtering** and full-text search across tasks
- **Visual drag-and-drop** with drop indicators
- **Quick create** via modal overlay
- **Task metadata** stored as YAML frontmatter (status, board_order, tags, created, touched)

## Installation

### From this repo

```bash
cd /path/to/your/vault/.obsidian/plugins
git clone https://github.com/rookkeeper/obsidian-kanban-board.git
cd obsidian-kanban-board
npm install
npm run build
```

Then enable the plugin in Obsidian's Community Plugins settings.

### Manual

Download the latest release and extract into `<vault>/.obsidian/plugins/obsidian-kanban-board/`.

## Usage

1. Click the kanban ribbon icon or run the "Open Rook Kanban Board" command
2. Ensure you have markdown files in your `Tasks/` folder (configurable in settings)
3. Each task file should have YAML frontmatter with at minimum:

```yaml
---
type: task
status: backlog
---
```

4. Drag cards between columns to update status
5. Use the `+` button on each column to create new tasks

## Task template

To customize what new tasks look like, create a `_task_template.md` file in your tasks folder. It is a normal markdown note with optional YAML frontmatter plus a body, and it never appears on the board itself. The create dialog's description box is pre-filled with the template body, and creating a task with no description uses the template body as-is. A template with no YAML section is valid — the whole file becomes the starting body.

Example `_task_template.md`:

```markdown
---
priority: medium
tags:
  - triage
---

## Outcome

## Next step
```

When a task is created, your template is the base and the plugin fills in what the board needs:

- **Plugin-managed (always set by the plugin):** `type`, `status` (the column you created in), `board_order` (top of the column), `created`, `touched`, `status_history` (your template's history is kept and a `created -> <status>` entry is appended).
- **Merged:** `tags` combine the template's tags with any tags typed in the create dialog; `source_issue` keeps your template's value when present.
- **Passed through untouched:** any other frontmatter keys (like `priority` above).
- **Body:** the description typed in the dialog wins; otherwise the template body; otherwise a small builtin default.

If the template file is missing, creation works exactly as before. If its YAML is invalid, the plugin notifies you and falls back to defaults so creation never fails.

## Development

```bash
npm install
npm run dev     # watch mode for development
npm run build   # production build
```

## License

MIT
