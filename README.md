# Obsidian Todos Extension

A React-based kanban board Obsidian plugin for managing todo notes stored as markdown files in a folder.

![Obsidian](https://img.shields.io/badge/Obsidian-1.6.0%2B-7C3AED)

## Features

- **Kanban board** with drag-and-drop between status columns
- **Configurable statuses** — add, remove, and reorder columns
- **Tag filtering** and full-text search across todos
- **Visual drag-and-drop** with drop indicators
- **Quick create** via modal overlay
- **Todo metadata** stored as YAML frontmatter (status, board_order, tags, created, touched)

## Installation

### From this repo

```bash
cd /path/to/your/vault/.obsidian/plugins
git clone https://github.com/the-rooks-nest/obsidian-todos-extension.git
cd obsidian-todos-extension
npm install
npm run build
```

Then enable the plugin in Obsidian's Community Plugins settings.

### Manual

Download the latest release and extract into `<vault>/.obsidian/plugins/obsidian-todos-extension/`.

## Usage

1. Click the kanban ribbon icon or run the "Open Rook Todos Board" command
2. Ensure you have markdown files in your `ToDos/` folder (configurable in settings)
3. Each todo file should have YAML frontmatter with at minimum:

```yaml
---
type: todo
status: todo
---
```

4. Drag cards between columns to update status
5. Use the `+` button on each column to create new todos

## Development

```bash
npm install
npm run dev     # watch mode for development
npm run build   # production build
```

## License

MIT
