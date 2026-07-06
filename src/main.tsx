import { App, ItemView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, normalizePath, parseYaml } from 'obsidian';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';

const VIEW_TYPE_ROOK_TODOS = 'rook-todos-board-view';
const DEFAULT_STATUSES = ['todo', 'in_progress', 'done'] as const;

type TodoStatus = (typeof DEFAULT_STATUSES)[number] | string;

type TodoItem = {
  file: TFile;
  title: string;
  status: TodoStatus;
  order?: number;
  created?: string;
  touched?: string;
  sourceIssue?: string;
  tags: string[];
  statusHistory: string[];
};

type DropLocation = {
  status: string;
  previousPath?: string;
  nextPath?: string;
};

type PluginSettings = {
  todosFolder: string;
  statuses?: string[];
};

type StatusConfig = {
  statuses: string[];
};

type CreateTodoInput = {
  title: string;
  description?: string;
  tags?: string[];
  status?: string;
};

type TodoDraft = {
  title: string;
  description: string;
  tags: string;
  status: string;
};

const DEFAULT_SETTINGS: PluginSettings = {
  todosFolder: 'ToDos',
  statuses: [...DEFAULT_STATUSES]
};

const STATUS_CONFIG_FILE = 'status-config.json';
const DEFAULT_ORDER_STEP = 1000;

export default class RookTodosBoardPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  statuses: string[] = [...DEFAULT_STATUSES];

  async onload() {
    await this.loadSettings();
    await this.loadStatuses();

    this.registerView(VIEW_TYPE_ROOK_TODOS, (leaf) => new RookTodosBoardView(leaf, this));

    this.addCommand({
      id: 'open-rook-todos-board',
      name: 'Open Rook Todos Board',
      callback: () => this.activateView()
    });

    this.addRibbonIcon('kanban-square', 'Open Rook Todos Board', async () => {
      await this.activateView();
    });

    this.addSettingTab(new RookTodosSettingTab(this.app, this));
    this.registerEvent(this.app.metadataCache.on('changed', () => this.refreshViews()));
    this.registerEvent(this.app.vault.on('create', () => this.refreshViews()));
    this.registerEvent(this.app.vault.on('modify', () => this.refreshViews()));
    this.registerEvent(this.app.vault.on('delete', () => this.refreshViews()));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_ROOK_TODOS);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshViews();
  }

  getStatusConfigPath() {
    return normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/${STATUS_CONFIG_FILE}`);
  }

  async loadStatuses() {
    const adapter = this.app.vault.adapter;
    const path = this.getStatusConfigPath();

    if (await adapter.exists(path)) {
      try {
        const parsed = JSON.parse(await adapter.read(path)) as Partial<StatusConfig>;
        const statuses = dedupeStatuses(parsed.statuses ?? []);
        if (statuses.length) {
          this.statuses = statuses;
          return;
        }
      } catch (error) {
        console.error('Failed to read status config', error);
      }
    }

    this.statuses = dedupeStatuses(this.settings.statuses ?? DEFAULT_STATUSES);
    await this.saveStatuses(this.statuses, false);
  }

  async saveStatuses(statuses: string[], shouldRefresh = true) {
    this.statuses = dedupeStatuses(statuses);
    const adapter = this.app.vault.adapter;
    const path = this.getStatusConfigPath();
    await adapter.write(path, `${JSON.stringify({ statuses: this.statuses }, null, 2)}\n`);
    if (shouldRefresh) this.refreshViews();
  }

  async ensureStatusExists(status: string, placement: 'left' | 'right' = 'left') {
    const normalized = normalizeStatusValue(status);
    if (!normalized || this.statuses.includes(normalized)) return false;

    const nextStatuses = placement === 'left' ? [normalized, ...this.statuses] : [...this.statuses, normalized];
    await this.saveStatuses(nextStatuses);
    return true;
  }

  async removeStatus(status: string) {
    if (!this.statuses.includes(status)) return;
    await this.saveStatuses(this.statuses.filter((value) => value !== status));
    new Notice(`Removed ${humanizeStatus(status)} column`);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_ROOK_TODOS)[0];

    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_ROOK_TODOS, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  refreshViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ROOK_TODOS).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof RookTodosBoardView) {
        view.renderBoard();
      }
    });
  }

  async getTodoFrontmatter(file: TFile): Promise<Record<string, unknown>> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (cache?.frontmatter) return cache.frontmatter as Record<string, unknown>;

    const content = await this.app.vault.cachedRead(file);
    const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match) return {};

    try {
      const parsed = parseYaml(match[1]);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  async getTodos(normalizeBoardOrder = true): Promise<TodoItem[]> {
    const folderPrefix = `${this.settings.todosFolder.replace(/\/$/, '')}/`;
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(folderPrefix) && !file.basename.startsWith('_'));

    const todos = await Promise.all(
      files.map(async (file) => {
        const frontmatter = await this.getTodoFrontmatter(file);

        return {
          file,
          title: file.basename,
          status: normalizeStatusValue(String(frontmatter.status ?? this.statuses[0] ?? 'todo')),
          order: normalizeOrder(frontmatter.board_order),
          created: frontmatter.created ? String(frontmatter.created) : undefined,
          touched: frontmatter.touched ? String(frontmatter.touched) : formatDate(file.stat.mtime),
          sourceIssue: frontmatter.source_issue ? String(frontmatter.source_issue) : undefined,
          tags: buildImplicitTags(file, normalizeTags(frontmatter.tags)),
          statusHistory: normalizeHistory(frontmatter.status_history)
        } satisfies TodoItem;
      })
    );

    const discoveredStatuses = Array.from(new Set(todos.map((todo) => todo.status)));
    const unknownStatuses = discoveredStatuses.filter((status) => !this.statuses.includes(status));

    if (unknownStatuses.length) {
      await this.saveStatuses([...unknownStatuses, ...this.statuses], false);
    }

    if (normalizeBoardOrder) {
      const statusesMissingOrder = Array.from(new Set(todos.filter((todo) => todo.order == null).map((todo) => todo.status)));
      if (statusesMissingOrder.length) {
        for (const status of statusesMissingOrder) {
          const items = todos.filter((todo) => todo.status === status).sort(compareTodos);
          await this.rebalanceStatus(status, items);
        }
        return this.getTodos(false);
      }
    }

    return todos.sort(compareTodos);
  }

  async moveTodo(file: TFile, destination: DropLocation) {
    const normalizedNextStatus = normalizeStatusValue(destination.status);
    await this.ensureStatusExists(normalizedNextStatus, 'left');

    const todos = await this.getTodos();
    const currentTodo = todos.find((todo) => todo.file.path === file.path);
    if (!currentTodo) return;

    const targetColumn = todos
      .filter((todo) => todo.status === normalizedNextStatus && todo.file.path !== file.path)
      .sort(compareTodos);

    const previousTodo = destination.previousPath ? targetColumn.find((todo) => todo.file.path === destination.previousPath) : undefined;
    const nextTodo = destination.nextPath ? targetColumn.find((todo) => todo.file.path === destination.nextPath) : undefined;

    const currentStatus = normalizeStatusValue(currentTodo.status);
    const currentColumn = todos.filter((todo) => todo.status === currentStatus).sort(compareTodos);
    const currentIndex = currentColumn.findIndex((todo) => todo.file.path === file.path);
    const currentPreviousPath = currentColumn[currentIndex - 1]?.file.path;
    const currentNextPath = currentColumn[currentIndex + 1]?.file.path;

    const insertIndex = nextTodo
      ? targetColumn.findIndex((todo) => todo.file.path === nextTodo.file.path)
      : previousTodo
        ? targetColumn.findIndex((todo) => todo.file.path === previousTodo.file.path) + 1
        : targetColumn.length;

    if (
      currentStatus === normalizedNextStatus &&
      destination.previousPath === currentPreviousPath &&
      destination.nextPath === currentNextPath
    ) {
      return;
    }

    if (currentStatus === normalizedNextStatus && insertIndex === currentIndex) {
      return;
    }

    let nextOrder = getInsertedOrder(previousTodo?.order, nextTodo?.order);
    if (nextOrder == null) {
      await this.rebalanceStatus(normalizedNextStatus, targetColumn);
      const reloadedTodos = await this.getTodos();
      const reloadedTargetColumn = reloadedTodos
        .filter((todo) => todo.status === normalizedNextStatus && todo.file.path !== file.path)
        .sort(compareTodos);
      const reloadedPreviousTodo = destination.previousPath
        ? reloadedTargetColumn.find((todo) => todo.file.path === destination.previousPath)
        : undefined;
      const reloadedNextTodo = destination.nextPath
        ? reloadedTargetColumn.find((todo) => todo.file.path === destination.nextPath)
        : undefined;
      nextOrder = getInsertedOrder(reloadedPreviousTodo?.order, reloadedNextTodo?.order) ?? DEFAULT_ORDER_STEP;
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.type = 'todo';
      frontmatter.board_order = nextOrder;
      const existingStatus = normalizeStatusValue(String(frontmatter.status ?? 'triage'));

      if (existingStatus !== normalizedNextStatus) {
        const history = normalizeHistory(frontmatter.status_history);
        history.push(`${todayString()} | ${existingStatus} -> ${normalizedNextStatus}`);
        frontmatter.status = normalizedNextStatus;
        frontmatter.status_history = history;
        frontmatter.touched = todayString();
      }
    });

    if (currentStatus === normalizedNextStatus) {
      new Notice(`Reordered ${file.basename}`);
    } else {
      new Notice(`Moved ${file.basename} to ${humanizeStatus(normalizedNextStatus)}`);
    }
    this.refreshViews();
  }

  async rebalanceStatus(status: string, items?: TodoItem[]) {
    const columnItems = (items ?? (await this.getTodos()).filter((todo) => todo.status === status)).sort(compareTodos);
    await Promise.all(
      columnItems.map((todo, index) =>
        this.app.fileManager.processFrontMatter(todo.file, (frontmatter) => {
          frontmatter.board_order = (index + 1) * DEFAULT_ORDER_STEP;
        })
      )
    );
  }

  async createTodo(input: CreateTodoInput) {
    const title = input.title.trim();
    if (!title) return;

    const status = normalizeStatusValue(input.status ?? this.statuses[0] ?? 'todo');
    await this.ensureStatusExists(status, 'left');

    const safeTitle = sanitizeFileName(title);
    const folder = this.settings.todosFolder.replace(/\/$/, '');
    const path = `${folder}/${safeTitle}.md`;

    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`Todo already exists: ${safeTitle}`);
      return;
    }

    const order = await this.getNextOrderForStatus(status);
    const today = todayString();
    const tags = normalizeCreateTags(input.tags);
    const body = input.description?.trim() ? input.description.trim() : '- Define the outcome.\n- Add the next concrete step.';
    const tagsSection = tags.length ? `tags:\n${tags.map((tag) => `  - ${tag}`).join('\n')}` : 'tags: []';
    const content = `---\ntype: todo\nstatus: ${status}\nboard_order: ${order}\ncreated: ${today}\ntouched: ${today}\nsource_issue:\n${tagsSection}\nstatus_history:\n  - \"${today} | created -> ${status}\"\n---\n\n${body}\n`;

    await this.app.vault.create(path, content);
    new Notice(`Created ${safeTitle}`);
    this.refreshViews();
  }

  async getNextOrderForStatus(status: string) {
    const items = (await this.getTodos()).filter((todo) => todo.status === status).sort(compareTodos);
    const lastOrder = items[items.length - 1]?.order;
    return lastOrder != null ? lastOrder + DEFAULT_ORDER_STEP : DEFAULT_ORDER_STEP;
  }

  async deleteTodo(file: TFile) {
    await this.app.vault.delete(file);
    new Notice(`Deleted ${file.basename}`);
    this.refreshViews();
  }
}

class RookTodosBoardView extends ItemView {
  plugin: RookTodosBoardPlugin;
  root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: RookTodosBoardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_ROOK_TODOS;
  }

  getDisplayText() {
    return 'Rook Todos Board';
  }

  getIcon() {
    return 'kanban-square';
  }

  async onOpen() {
    this.contentEl.empty();
    const mount = this.contentEl.createDiv({ cls: 'rook-board-view' });
    this.root = createRoot(mount);
    this.renderBoard();
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }

  renderBoard() {
    if (!this.root) return;
    this.root.render(<BoardApp plugin={this.plugin} />);
  }
}

function BoardApp({ plugin }: { plugin: RookTodosBoardPlugin }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('all');
  const [dropTarget, setDropTarget] = useState<DropLocation | null>(null);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<TodoDraft | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const items = await plugin.getTodos();
      if (!cancelled) setTodos(items);
    };

    void load();

    const rerender = () => {
      void load();
    };

    const onCreate = plugin.app.vault.on('create', rerender);
    const onModify = plugin.app.vault.on('modify', rerender);
    const onDelete = plugin.app.vault.on('delete', rerender);
    const onChanged = plugin.app.metadataCache.on('changed', rerender);

    return () => {
      cancelled = true;
      plugin.app.vault.offref(onCreate);
      plugin.app.vault.offref(onModify);
      plugin.app.vault.offref(onDelete);
      plugin.app.metadataCache.offref(onChanged);
    };
  }, [plugin]);

  const allTags = useMemo(() => Array.from(new Set(todos.flatMap((todo) => todo.tags))).sort(), [todos]);

  const filtered = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return todos.filter((todo) => {
      const matchesTag = tag === 'all' || todo.tags.includes(tag);
      const haystack = [todo.title, todo.sourceIssue ?? '', todo.status, todo.tags.join(' '), todo.statusHistory.join(' ')]
        .join(' ')
        .toLowerCase();
      const matchesQuery = !lowerQuery || haystack.includes(lowerQuery);
      return matchesTag && matchesQuery;
    });
  }, [todos, tag, query]);

  const byStatus = useMemo(() => {
    const map = new Map<string, TodoItem[]>();
    plugin.statuses.forEach((status) => map.set(status, []));

    filtered.forEach((todo) => {
      const key = map.has(todo.status) ? todo.status : plugin.statuses[0] ?? todo.status;
      const bucket = map.get(key) ?? [];
      bucket.push(todo);
      bucket.sort(compareTodos);
      map.set(key, bucket);
    });

    return map;
  }, [filtered, plugin.statuses]);

  const openCreateOverlay = (status: string) => {
    setDraft({ title: '', description: '', tags: '', status });
  };

  const closeCreateOverlay = () => {
    if (isCreating) return;
    setDraft(null);
  };

  const submitCreateOverlay = async () => {
    if (!draft) return;
    setIsCreating(true);
    try {
      await plugin.createTodo({
        title: draft.title,
        description: draft.description,
        tags: draft.tags.split(',').map((value) => value.trim()).filter(Boolean),
        status: draft.status
      });
      setDraft(null);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <div className="rook-board-toolbar">
        <input
          className="rook-board-search"
          placeholder="Search todos, tags, issue numbers, history…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="dropdown rook-board-tag-filter" value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="all">All tags</option>
          {allTags.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <div className="rook-board-columns">
        {plugin.statuses.map((status) => {
          const items = byStatus.get(status) ?? [];
          return (
            <div
              key={status}
              className={`rook-board-column ${dropTarget?.status === status ? 'is-drop-target' : ''}`}
              onDragLeave={() => setDropTarget((current) => (current?.status === status ? null : current))}
            >
              <div className="rook-board-column-header">
                <div className="rook-board-column-title">{humanizeStatus(status)}</div>
                <div className="rook-board-column-actions">
                  <button
                    className="clickable-icon rook-board-column-add"
                    aria-label={`Add ${humanizeStatus(status)} card`}
                    onClick={() => openCreateOverlay(status)}
                  >
                    +
                  </button>
                  {items.length === 0 ? (
                    <button
                      className="clickable-icon rook-board-column-close"
                      aria-label={`Remove ${humanizeStatus(status)} column`}
                      onClick={() => void plugin.removeStatus(status)}
                    >
                      ×
                    </button>
                  ) : (
                    <div className="rook-board-column-count">{items.length}</div>
                  )}
                </div>
              </div>

              <div
                className="rook-board-column-body"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropTarget(getDropLocationFromColumn(event.currentTarget, status, event.clientY, draggedPath));
                }}
                onDrop={async (event) => {
                  event.preventDefault();
                  const location = getDropLocationFromColumn(event.currentTarget, status, event.clientY, draggedPath);
                  setDropTarget(null);
                  const path = event.dataTransfer.getData('text/plain');
                  const file = plugin.app.vault.getAbstractFileByPath(path);
                  if (file instanceof TFile) {
                    await plugin.moveTodo(file, location);
                  }
                }}
              >
                {items.length === 0 ? <div className="rook-board-empty">No cards</div> : null}
                {items.map((todo, index) => {
                  const previousItem = items[index - 1];
                  const nextItem = items[index + 1];
                  const isDropBefore =
                    dropTarget?.status === status &&
                    dropTarget.nextPath === todo.file.path &&
                    dropTarget.previousPath === previousItem?.file.path;
                  const isDropAfter =
                    dropTarget?.status === status &&
                    dropTarget.previousPath === todo.file.path &&
                    dropTarget.nextPath === nextItem?.file.path;
                  const isDragging = draggedPath === todo.file.path;

                  return (
                    <div
                      key={todo.file.path}
                      data-path={todo.file.path}
                      className={`rook-board-card-wrap ${isDropBefore ? 'is-drop-before' : ''} ${isDropAfter ? 'is-drop-after' : ''}`}
                    >
                      <div
                        className={`rook-board-card ${isDragging ? 'is-dragging-source' : ''}`}
                        draggable
                        onDragStart={(event) => {
                          setDraggedPath(todo.file.path);
                          event.dataTransfer.setData('text/plain', todo.file.path);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDraggedPath(null);
                          setDropTarget(null);
                        }}
                        onDoubleClick={() => void plugin.app.workspace.getLeaf(true).openFile(todo.file)}
                      >
                        <button
                          className="clickable-icon rook-board-card-delete"
                          aria-label={`Delete ${todo.title}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void plugin.deleteTodo(todo.file);
                          }}
                        >
                          ×
                        </button>
                        <div className="rook-board-card-title">{todo.title}</div>
                        <div className="rook-board-meta rook-board-meta-top">
                          {todo.sourceIssue ? <span className="rook-board-meta-pill">Issue #{todo.sourceIssue}</span> : null}
                          <span className="rook-board-meta-pill">Created {todo.created ?? '—'}</span>
                          <span className="rook-board-meta-pill">Touched {todo.touched ?? '—'}</span>
                        </div>
                        <div className="rook-board-tags">
                          {todo.tags.map((value) => (
                            <span className="rook-board-tag" key={value}>
                              {value}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {draft ? (
        <div className="rook-board-overlay" onClick={closeCreateOverlay}>
          <div className="rook-board-modal" onClick={(event) => event.stopPropagation()}>
            <div className="rook-board-modal-title">New {humanizeStatus(draft.status)} to-do</div>
            <label className="rook-board-field">
              <span>Title</span>
              <input
                className="rook-board-input"
                value={draft.title}
                onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                placeholder="What needs doing?"
              />
            </label>
            <label className="rook-board-field">
              <span>Description</span>
              <textarea
                className="rook-board-textarea"
                value={draft.description}
                onChange={(event) => setDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                placeholder="Add a few concrete notes"
              />
            </label>
            <label className="rook-board-field">
              <span>Tags</span>
              <input
                className="rook-board-input"
                value={draft.tags}
                onChange={(event) => setDraft((current) => (current ? { ...current, tags: event.target.value } : current))}
                placeholder="comma, separated, tags"
              />
            </label>
            <div className="rook-board-modal-actions">
              <button onClick={closeCreateOverlay} disabled={isCreating}>
                Cancel
              </button>
              <button className="mod-cta" onClick={() => void submitCreateOverlay()} disabled={isCreating || !draft.title.trim()}>
                {isCreating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

class RookTodosSettingTab extends PluginSettingTab {
  plugin: RookTodosBoardPlugin;

  constructor(app: App, plugin: RookTodosBoardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Todos folder')
      .setDesc('Folder scanned for markdown todo notes.')
      .addText((text) =>
        text.setPlaceholder('ToDos').setValue(this.plugin.settings.todosFolder).onChange(async (value) => {
          this.plugin.settings.todosFolder = value.trim() || 'ToDos';
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Statuses config file')
      .setDesc(`Column order is managed in ${this.plugin.getStatusConfigPath()}. Empty columns show × so you can remove them.`);
  }
}

function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String);
  if (typeof input === 'string' && input.trim()) return [input.trim()];
  return [];
}

function normalizeCreateTags(input: string[] | undefined): string[] {
  return Array.from(new Set((input ?? []).map((tag) => tag.trim()).filter(Boolean)));
}

function normalizeHistory(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const objectEntry = entry as Record<string, unknown>;
          const [key, value] = Object.entries(objectEntry)[0] ?? [];
          if (key && value != null) return `${key} | ${String(value)}`;
        }
        return String(entry);
      })
      .filter((entry) => entry.trim().length > 0);
  }
  if (typeof input === 'string' && input.trim()) return [input.trim()];
  return [];
}

function buildImplicitTags(file: TFile, tags: string[]): string[] {
  const folderTag = `path:${file.parent?.path ?? ''}`;
  return Array.from(new Set([...tags, folderTag])).filter(Boolean);
}

function normalizeStatusValue(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeOrder(input: unknown): number | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim()) {
    const value = Number(input);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function compareTodos(a: TodoItem, b: TodoItem): number {
  const left = a.order ?? Number.MAX_SAFE_INTEGER;
  const right = b.order ?? Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return a.title.localeCompare(b.title);
}

function getInsertedOrder(before?: number, after?: number): number | undefined {
  if (before != null && after != null) {
    if (after - before < 1) return undefined;
    return (before + after) / 2;
  }
  if (before != null) return before + DEFAULT_ORDER_STEP;
  if (after != null) return after - DEFAULT_ORDER_STEP;
  return DEFAULT_ORDER_STEP;
}

function getDropLocationFromColumn(columnBody: HTMLDivElement, status: string, clientY: number, draggedPath?: string | null): DropLocation {
  const wrappers = Array.from(columnBody.querySelectorAll<HTMLElement>('.rook-board-card-wrap[data-path]')).filter(
    (wrapper) => wrapper.dataset.path !== draggedPath
  );

  if (!wrappers.length) {
    return { status };
  }

  for (let index = 0; index < wrappers.length; index += 1) {
    const wrapper = wrappers[index];
    const rect = wrapper.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (clientY < midpoint) {
      return {
        status,
        previousPath: wrappers[index - 1]?.dataset.path,
        nextPath: wrapper.dataset.path
      };
    }
  }

  return {
    status,
    previousPath: wrappers[wrappers.length - 1]?.dataset.path
  };
}

function dedupeStatuses(statuses: readonly string[]): string[] {
  return Array.from(new Set(statuses.map((status) => normalizeStatusValue(String(status))).filter(Boolean)));
}

function humanizeStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|#\[\]]/g, '-').replace(/\s+/g, ' ').trim();
}
