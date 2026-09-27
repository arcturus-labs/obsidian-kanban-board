# Planning: Document current architecture

Task: [[TASKS/KANBAN/Document current architecture]]  
Status: agreed for discovery/documentation

## Goal and user value

Document how the existing Obsidian Kanban Board plugin is structured and how its main task workflows operate, so future feature work can be planned against a shared, accurate picture.

## Questions and answers

- **Question:** Is this task documenting current behavior or proposing a target redesign?
  - **Answer/decision:** Document the current architecture first. Do not propose or implement a redesign in this task.
- **Question:** Is a separate brainstorming session required before this reverse-engineering work?
  - **Answer/decision:** No. Inspect implementation/tests, distinguish facts from open questions, and bring the draft back for user review.
- **Question:** What implementation style should architecture guidance preserve?
  - **Answer/decision:** Thin vertical tracer-bullet slices, usually one user-visible product chunk through all relevant layers at a time; avoid building whole layers before validating a product slice.

## Scope

- Included: inspect code, tests, runtime/build entry points, and demo vault; map component responsibilities/boundaries and trace startup/task loading, task creation, and move/reorder persistence; document observed behavior and open questions in `ARCHITECTURE/`.
- Excluded: code changes, refactoring, new abstractions, or settling future product/architecture decisions without the user.

## Acceptance and QA

- Deliver source-backed current-state architecture documentation and a concise user-facing summary.
- Parent/user reviews the draft before it is treated as approved target architecture.
- No product UI changes are expected, so independent running-product UI QA is not required for this documentation task.
