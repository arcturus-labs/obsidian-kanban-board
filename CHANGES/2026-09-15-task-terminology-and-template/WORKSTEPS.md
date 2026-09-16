# Development lifecycle worksteps

> As you work through the development lifecycle, make sure that you check the boxes in the following list as you finish with each item. If you've chosen to go an unusual path like skipping, and I don't hear then make an explicit note to the side of each bullet explaining the departure and the rationale.

- [x] Orient to the project
- [x] Create the change directory and lifecycle record
- [x] Brainstorm to work, or bypass because the work is simple or obvious; do not mark complete until the developer confirms the direction — confirmed 2026-09-15 ("Go for it" + template specs)
- [x] Record the agreed decision and TODO after the explicit decision gate
- [x] Prepare the implementation workspace after the planning commit — worktree `../_worktrees/feature/task-template` on branch `feature/task-template`
- [x] Implement and test — 29 tests green, build clean
- [x] Mark compatibility surfaces — purely additive; no shims touched. Existing `ToDos/`-fallback and `todo`→`backlog` shims unchanged. Missing/unparseable template falls back to prior behavior (no new retained surface to mark).
- [x] Maintain product and architecture documentation — README "Task template" section + skill-doc "Create a card" section (repo has no PRODUCT//AS-BUILT-ARCHITECTURE/ dirs)
- [x] Run final validation — `npm test` 29/29, `npm run build` clean, `tsc` shows only the pre-existing `node` types error also present on main
- [x] Synchronize with main before submitting
- [x] Open and validate the PR — #1 merged as 42a3ccc (no CI on repo; tests/build green, merge state clean)
- [x] Merge with approval — explicit developer approval, merge commit
- [x] Record outcomes and clean up
