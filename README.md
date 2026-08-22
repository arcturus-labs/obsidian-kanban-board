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

## Development

```bash
npm install
npm run dev     # watch mode for development
npm run build   # production build
```

## License

MIT
