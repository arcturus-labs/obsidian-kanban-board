---
name: obsidian-todo-board
description: "Use for working with todo-card notes in an Obsidian vault that are presented by a board-style plugin UI. Covers searching, opening, creating, updating, moving, reordering, and deleting todo notes by operating on the underlying markdown files and properties."
---

# Obsidian Todo Board

This skill targets the Arcturus Labs Obsidian Kanban Board https://github.com/arcturus-labs/obsidian-kanban-board application.

Use this skill when the user is working with a todo board in Obsidian where each card is backed by a markdown note.

The human usually interacts through the Obsidian board UI, while the agent can interact by opening notes, searching notes, and editing the underlying markdown/frontmatter.

## What todos are

Each todo card is a markdown note, usually stored in a dedicated folder such as `ToDos/`.

A todo note commonly has frontmatter like:
- `type: todo`
- `status:` — the board column
- `board_order:` — vertical ordering within a column
- `created:` — creation date
- `touched:` — last meaningful update date
- `source_issue:` — optional external issue reference
- `tags:` — list of tags
- `status_history:` — list of status transitions

The note body is the human-readable description of the task.

## What the plugin UI manages

The board plugin presents these notes as cards and columns.

The plugin may manage fields like:
- `created`
- `touched`
- `status_history`
- `board_order`

In particular:
- moving a card to another column usually means changing `status`
- reordering a card within a column usually means changing `board_order`
- some plugin actions may automatically update `touched` and append to `status_history`

So when the agent edits todo notes directly, preserve these fields and only change what is needed.

## Board ordering

Within a given status column, cards are ordered by `board_order` ascending.

Typical behavior:
- smaller `board_order` means higher in the column
- larger `board_order` means lower in the column
- if the user says "put this at the top of in progress," assign a `board_order` smaller than the first card in that column
- if the user says "put this at the bottom," assign a `board_order` larger than the last card in that column
- if the user says "put this in position 5," inspect the current sorted cards in that column and assign a value between positions 4 and 5

A common numbering scheme is spaced values such as:
- `1000`
- `2000`
- `3000`

This leaves room to insert cards in between by choosing midpoint values.

If neighboring `board_order` values get too close to each other (e.g. you can't use an integer board_order) or missing values make the ordering ambiguous, renormalize the whole column by rewriting it to evenly spaced values again, such as `1000, 2000, 3000, ...`, preserving the current visible order.

## Preferred tools

Use Obsidian CLI for:
- opening a note
- broad text search
- simple property updates
- listing/searching files quickly inside a vault

Use direct file tools for:
- reading note content
- editing note body text
- carefully editing YAML frontmatter
- bulk updates across multiple todo notes
- changes where CLI support is awkward or lossy

## Core behaviors

### Open a card

Prefer Obsidian CLI, and open in a new tab by default:

```bash
obsidian vault="<Vault Name>" open file="Card Title" newtab
obsidian vault="<Vault Name>" open path="ToDos/Card Title.md" newtab
```

### Read a card

Use the built-in file read tool, not Obsidian CLI.

Typical approach:
- identify the exact note path
- read the markdown file directly

### Change a card's column

A column change is just a status change.

Obsidian CLI option:

```bash
obsidian vault="<Vault Name>" property:set name="status" value="in_progress" file="Card Title"
```

Direct-edit option:
- read the note
- change `status:` in frontmatter
- update `touched:` to the current date in `YYYY-MM-DD` format
- append a new `status_history` entry

`status_history` entries should look like:

```yaml
status_history:
  - "2026-06-27 | created -> todo"
  - "2026-06-27 | todo -> in_progress"
```

If changing the status of a card, always append an element to `status_history`.
If changing anything about a card (title, text, properties), update `touched`.

### Edit the card contents

For body/description edits, direct note editing is usually easier than Obsidian CLI.

Typical approach:
- read the note file
- preserve frontmatter
- edit only the markdown body section
- update `touched`

For body edits, direct file editing is easier and clearer than trying to express the change through CLI append/prepend commands.

### Delete a card

Delete the backing note when the user explicitly wants deletion.

Obsidian CLI option:

```bash
obsidian vault="<Vault Name>" delete file="Card Title"
```

Direct file deletion is also possible, but prefer vault-aware deletion when using Obsidian.

### Create a card

New cards can be based on an optional `_task_template.md` file in the tasks folder (a normal markdown note with optional frontmatter + body; it never appears on the board). The create dialog pre-fills its description box from the template body.

When creating a card's file content directly, follow the same merge rule the plugin uses — template as the base, plugin values authoritative on managed keys:

```markdown
---
type: task
status: <column status>
board_order: <below the current top card in that column>
created: <today YYYY-MM-DD>
touched: <today YYYY-MM-DD>
source_issue: <template value or empty>
tags: <union of template tags and requested tags>
status_history:
  - "<today> | created -> <column status>"
<other template keys passed through untouched>
---

<dialog description, else template body, else a short default>
```

A template with no YAML section is valid — the whole file is the body. If no template exists, use the managed keys above with a short default body.

## Search guidance

One of the most common agent tasks is: find the relevant set of todo cards, then operate on them.

### Broad text search

Search anywhere in matching notes:

```bash
obsidian vault="<Vault Name>" search query="matchmaking" path="ToDos" format=json
```

This is good for:
- title-like text
- description/body text
- tags written in frontmatter or body
- date strings that literally appear in the note

Important: Obsidian search returns matching note paths/titles, not the matching body snippets you usually want for content review. If the user wants to search for something in the content of a todo, use Obsidian search to narrow the candidate files, then follow up with `rg` on those files to show matching content lines.

Example strategy:

```bash
obsidian vault="<Vault Name>" search query="matchmaking" path="ToDos" format=json
# then run rg against the returned files to inspect matching lines
```

### Search with context

```bash
obsidian vault="<Vault Name>" search:context query="in_progress" path="ToDos" format=json
```

Useful when you want surrounding lines rather than only file paths.

### Search by property value using text search

Because frontmatter is plain text in the note, you can often search for exact property snippets:

```bash
obsidian vault="<Vault Name>" search query="status: todo" path="ToDos" format=json
obsidian vault="<Vault Name>" search query="source_issue: 123" path="ToDos" format=json
obsidian vault="<Vault Name>" search query="- obsidian" path="ToDos" format=json
```

### Read a property directly from a known file

```bash
obsidian vault="<Vault Name>" property:read name="status" file="Card Title"
obsidian vault="<Vault Name>" property:read name="touched" file="Card Title"
```

### Date searching caveat

Obsidian CLI search is text search, not a real query language for date comparisons.

So this works:

```bash
obsidian vault="<Vault Name>" search query="2026-06-27" path="ToDos" format=json
```

But this does **not** natively mean:
- `created > 2026-06-20`
- `touched < 2026-06-15`

For actual date comparisons, use a two-step approach:
1. list candidate notes in the todo folder
2. read the relevant property from each candidate with Obsidian CLI
3. compare the resulting dates in agent logic

Example property reads:

```bash
obsidian vault="<Vault Name>" property:read name="created" file="Card Title"
obsidian vault="<Vault Name>" property:read name="touched" file="Card Title"
```

Example strategy:
- get candidate files with `obsidian files folder="ToDos" ext=md`
- or use `obsidian search` to narrow the candidate set
- then use `property:read` on each file and compare the results programmatically

## Bulk operations

A good pattern for bulk work is:
1. search for the target cards
2. inspect or summarize the result set
3. confirm if ambiguity is high
4. update them with CLI property operations or direct file edits

A bash loop can work well for bulk status updates. For example, after getting matching paths from Obsidian search:

```bash
obsidian vault="<Vault Name>" search query="tag:meeting" path="ToDos" format=json \
| jq -r '.[]' \
| while read -r file; do
    obsidian vault="<Vault Name>" property:set path="$file" name="status" value="processed"
  done
```

Notes:
- Obsidian CLI `search` with `format=json` returns a JSON array of paths, so use `jq -r '.[]'`.
- `property:set` uses `name=` and `value=`.
- If changing the status this way, you still need to update `touched` and append `status_history`, so pure `property:set` is often not sufficient by itself.
- For status-changing bulk operations, direct file edits may be the safer way to preserve all related fields consistently.

Examples:
- move a batch to another column by changing `status`, `touched`, and `status_history`
- retag a batch by editing `tags`
- update note bodies directly when the user wants rewritten descriptions

## Cautions

- Preserve valid YAML frontmatter.
- Do not rewrite unrelated fields.
- Be careful not to clobber plugin-managed values like `board_order`.
- If changing the status of a card, make sure to append an element to the `status_history`.
- If changing anything about a card (title, text, properties) update the `touched` field.
- If using CLI property updates, verify whether additional fields like `touched` or `status_history` should also be updated.
- For body edits, direct file editing is easier and clearer than trying to express the change through CLI append/prepend commands.
