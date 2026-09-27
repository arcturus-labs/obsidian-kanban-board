# Project task system

The official task board for this repository is Markdown cards under `TASKS/KANBAN/`. Active planning and execution artifacts live under `TASKS/WIP/<task-id-and-name>/`; completed outcomes live under `TASKS/COMPLETE/`. Keep root `BACKLOG.md` for lightweight quick capture.

## Card conventions

- Each Markdown card is a task, so the folder defines membership; do not require a `type` property for discovery.
- Use the plugin's status values: `triage`, `backlog`, `in_progress`, `retrospective`, `done`, and `blocked`. `demo_vault/.obsidian/plugins/obsidian-kanban-board/status-config.json` configures these columns for local QA.
- Include `status`, `board_order`, `created`, `touched`, and `status_history` frontmatter. Use optional `tags` and `source_issue` when useful. Preserve unrelated metadata.
- Use status `blocked` and state the reason and needed decision/prerequisite in the card body. The current board does not yet provide native dependency/subtask fields or comments; record these visibly in Markdown until implemented.
- Keep desired outcome, observable acceptance criteria, and an actionable checklist in each selected task. Record substantial planning Q&A in the task's WIP `brainstorm.md`.
- Keep the official card in `KANBAN/` when complete and link its WIP/COMPLETE outcome artifacts from the card.

## Factory workflow

1. Review the board and root `BACKLOG.md` when choosing work.
2. Resolve user-level scope/architecture questions and ensure the card is ready and unblocked before dispatch.
3. Maintain WIP `task.md` as the ordered checklist; workers update the task record and visible progress in the shared checkout.
4. Implement one end-to-end vertical product slice at a time, using TDD where practical.
5. Run tests/build and independently QA the running plugin using `demo_vault/`.
6. Record validation and outcome, update the card, and move completed WIP artifacts under `TASKS/COMPLETE/`.

The local card skill is `.agents/skills/obsidian-kanban-board/SKILL.md`. It describes safe Markdown card operations; this file defines this repository's task folders and conventions.
