# Repository guidance

## Product and architecture

- Read `PRODUCT/README.md` for the product goal and invariants, and `ARCHITECTURE/README.md` for the current implementation map.
- Follow the local `.agents/skills/obsidian-kanban-board/SKILL.md` when operating on task cards. The official project task board is `TASKS/KANBAN/`; working artifacts go under `TASKS/WIP/` and completed artifacts under `TASKS/COMPLETE/`.
- `BACKLOG.md` is quick capture, not the official task board. Promote an item to an official card when it is selected for planning or implementation.
- Task Markdown is the source of truth. Preserve unrelated frontmatter and keep visible task status, rationale/blockers, checklists, and outcome links current.

## Engineering practices

- Prefer TDD where practical, and use thin vertical tracer-bullet slices: implement one user-visible product chunk through all relevant layers before broadening scope. Do not build whole lower/service/API layers before validating an end-to-end slice. Change this only when dependencies or the user require it.
- Confirm substantial product, scope, and architecture choices with the user before implementation. Break work into bounded tasks with observable acceptance criteria.
- Keep tests and task checklists in sync. Add useful, appropriately scoped logs that help diagnose failures; never log secrets.
- Use a Git branch/worktree for isolated implementation when coordinating concurrent work or when the change warrants it. Keep task state and planning artifacts visible from the main checkout.

## Structure

- `src/`: TypeScript/React plugin implementation and tests.
- `TASKS/KANBAN/`: official task cards; `TASKS/WIP/`: active planning and outcomes in progress; `TASKS/COMPLETE/`: completed artifacts.
- `PRODUCT/`, `ARCHITECTURE/`: product invariants and implementation/design documentation.
- `demo_vault/`: local Obsidian demo vault and representative QA environment. Its plugin entry files link to this repository's build outputs; keep its vault-specific settings and sample notes inside the vault.
- `.agents/skills/software-factory/`: reusable factory workflow. `.agents/skills/obsidian-kanban-board/`: task-card operating instructions.

## Commands

- Build: `npm run build`
- Tests: `npm test`
- Watch build: `npm run dev`

## Harness and delegation

- Pi is the coordinating harness. The user has authorized use of Pi subagents for this project. Follow the installed `pi-subagents` skill for delegation and lifecycle details.
- Limit concurrency to three work items. Do not spawn subworkers unless the user explicitly approves them for the work at hand.
- The orchestrator retains user communication, planning, arbitration, and final acceptance. Give workers bounded briefs and isolated write scopes; keep task state and progress visible in the shared checkout. Never rely on a worker transcript as the only record.
- Use async/background workers by default where appropriate; inspect their completion and results. Do not claim restart recovery, steering, or other harness capabilities without testing them.

## Product QA — required

- Unit/integration tests and a successful build are not, by themselves, product QA.
- Use `demo_vault/` to exercise the plugin in Obsidian. Build the repo, open `demo_vault` as a vault, enable **Obsidian Kanban Board** if needed, then open the board via the ribbon or command. The vault includes sample task notes and a configured task folder.
- For UI or task workflow changes, independently exercise representative interactions in the running plugin and verify the Markdown/frontmatter result on disk. Capture the app window for visual changes when practical.
- If Obsidian cannot be launched or a relevant interaction cannot be independently verified, report that limitation; do not present tests as a substitute.
