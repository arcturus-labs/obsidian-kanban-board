# Kanban Board demo vault

This vault is a local, disposable environment for running and independently QA-ing the plugin. The plugin's `main.js`, `manifest.json`, and `styles.css` are symlinked to this repository, so rebuilding the repo updates what the vault loads. Vault-specific plugin settings and sample notes stay inside `demo_vault/`.

## Open and run

1. From the repository root, run `npm install` if needed, then `npm run build`.
2. Open this `demo_vault/` directory as an Obsidian vault.
3. Enable **Obsidian Kanban Board** in Community Plugins if it is not already enabled.
4. Open the board with the ribbon icon or the “Open Rook Kanban Board” command.
5. Use the sample card in `TASKS/KANBAN/` to verify board rendering and task interactions; inspect its Markdown frontmatter after moving/reordering it.

If Obsidian does not follow the development symlinks on a given setup, copy the three plugin entry files from the repo root into `.obsidian/plugins/obsidian-kanban-board/` after each build.
