import { App, ItemView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, normalizePath, parseYaml } from 'obsidian';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  TASK_TEMPLATE_FILENAME,
  buildTaskFileContent,
  parseTaskTemplate,
  type ParsedTaskTemplate
} from './taskTemplate';

const VIEW_TYPE_ROOK_KANBAN = 'rook-kanban-board-view';
const DEFAULT_STATUSES = ['backlog', 'in_progress', 'done'] as const;

type TaskStatus = (typeof DEFAULT_STATUSES)[number] | string;

type TaskItem = {
  file: TFile;
  title: string;
  status: TaskStatus;
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
  tasksFolder: string;
  statuses?: string[];
};

type StatusConfig = {
  statuses: string[];
};

type CreateTaskInput = {
  title: string;
  description?: string;
  tags?: string[];
  status?: string;
};

type TaskDraft = {
  title: string;
  description: string;
  tags: string;
  status: string;
};

const DEFAULT_SETTINGS: PluginSettings = {
  tasksFolder: 'Tasks',
  statuses: [...DEFAULT_STATUSES]
};

const STATUS_CONFIG_FILE = 'status-config.json';
const DEFAULT_ORDER_STEP = 1000;

export default class RookKanbanBoardPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  statuses: string[] = [...DEFAULT_STATUSES];

  async onload() {
    await this.loadSettings();
    await this.loadStatuses();

    this.registerView(VIEW_TYPE_ROOK_KANBAN, (leaf) => new RookKanbanBoardView(leaf, this));

    this.addCommand({
      id: 'open-rook-tasks-board',
      name: 'Open Rook Kanban Board',
      callback: () => this.activateView()
    });

    this.addRibbonIcon('kanban-square', 'Open Rook Kanban Board', async () => {
      await this.activateView();
    });

    this.addSettingTab(new RookTasksSettingTab(this.app, this));
    this.registerEvent(this.app.metadataCache.on('changed', () => this.refreshViews()));
    this.registerEvent(this.app.vault.on('create', () => this.refreshViews()));
    this.registerEvent(this.app.vault.on('modify', () => this.refreshViews()));
    this.registerEvent(this.app.vault.on('delete', () => this.refreshViews()));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_ROOK_KANBAN);
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
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_ROOK_KANBAN)[0];

    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_ROOK_KANBAN, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  refreshViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_ROOK_KANBAN).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof RookKanbanBoardView) {
        view.renderBoard();
      }
    });
  }

  getTasksFolder(): string {
    const configuredFolder = this.settings.tasksFolder.replace(/\/$/, '');
    if (this.app.vault.getAbstractFileByPath(configuredFolder)) return configuredFolder;

    // THIS IS FOR BACKWARDS COMPATIBILITY: keep existing vaults using the former default folder visible after the rename.
    if (configuredFolder === 'Tasks' && this.app.vault.getAbstractFileByPath('ToDos')) return 'ToDos';

    return configuredFolder;
  }

  async getTaskFrontmatter(file: TFile): Promise<Record<string, unknown>> {
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

  async getTasks(normalizeBoardOrder = true): Promise<TaskItem[]> {
    const folderPrefix = `${this.getTasksFolder().replace(/\/$/, '')}/`;
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(folderPrefix) && !file.basename.startsWith('_'));

    const tasks = await Promise.all(
      files.map(async (file) => {
        const frontmatter = await this.getTaskFrontmatter(file);

        return {
          file,
          title: file.basename,
          status: normalizeStatusValue(String(frontmatter.status ?? this.statuses[0] ?? 'backlog')),
          order: normalizeOrder(frontmatter.board_order),
          created: frontmatter.created ? String(frontmatter.created) : undefined,
          touched: frontmatter.touched ? String(frontmatter.touched) : formatDate(file.stat.mtime),
          sourceIssue: frontmatter.source_issue ? String(frontmatter.source_issue) : undefined,
          tags: buildImplicitTags(file, normalizeTags(frontmatter.tags)),
          statusHistory: normalizeHistory(frontmatter.status_history)
        } satisfies TaskItem;
      })
    );

    const discoveredStatuses = Array.from(new Set(tasks.map((task) => task.status)));
    const unknownStatuses = discoveredStatuses.filter((status) => !this.statuses.includes(status));

    if (unknownStatuses.length) {
      await this.saveStatuses([...unknownStatuses, ...this.statuses], false);
    }

    if (normalizeBoardOrder) {
      const statusesMissingOrder = Array.from(new Set(tasks.filter((task) => task.order == null).map((task) => task.status)));
      if (statusesMissingOrder.length) {
        for (const status of statusesMissingOrder) {
          const items = tasks.filter((task) => task.status === status).sort(compareTasks);
          await this.rebalanceStatus(status, items);
        }
        return this.getTasks(false);
      }
    }

    return tasks.sort(compareTasks);
  }

  async moveTask(file: TFile, destination: DropLocation) {
    const normalizedNextStatus = normalizeStatusValue(destination.status);
    await this.ensureStatusExists(normalizedNextStatus, 'left');

    const tasks = await this.getTasks();
    const currentTask = tasks.find((task) => task.file.path === file.path);
    if (!currentTask) return;

    const targetColumn = tasks
      .filter((task) => task.status === normalizedNextStatus && task.file.path !== file.path)
      .sort(compareTasks);

    const previousTask = destination.previousPath ? targetColumn.find((task) => task.file.path === destination.previousPath) : undefined;
    const nextTask = destination.nextPath ? targetColumn.find((task) => task.file.path === destination.nextPath) : undefined;

    const currentStatus = normalizeStatusValue(currentTask.status);
    const currentColumn = tasks.filter((task) => task.status === currentStatus).sort(compareTasks);
    const currentIndex = currentColumn.findIndex((task) => task.file.path === file.path);
    const currentPreviousPath = currentColumn[currentIndex - 1]?.file.path;
    const currentNextPath = currentColumn[currentIndex + 1]?.file.path;

    const insertIndex = nextTask
      ? targetColumn.findIndex((task) => task.file.path === nextTask.file.path)
      : previousTask
        ? targetColumn.findIndex((task) => task.file.path === previousTask.file.path) + 1
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

    let nextOrder = getInsertedOrder(previousTask?.order, nextTask?.order);
    if (nextOrder == null) {
      await this.rebalanceStatus(normalizedNextStatus, targetColumn);
      const reloadedTasks = await this.getTasks();
      const reloadedTargetColumn = reloadedTasks
        .filter((task) => task.status === normalizedNextStatus && task.file.path !== file.path)
        .sort(compareTasks);
      const reloadedPreviousTask = destination.previousPath
        ? reloadedTargetColumn.find((task) => task.file.path === destination.previousPath)
        : undefined;
      const reloadedNextTask = destination.nextPath
        ? reloadedTargetColumn.find((task) => task.file.path === destination.nextPath)
        : undefined;
      nextOrder = getInsertedOrder(reloadedPreviousTask?.order, reloadedNextTask?.order) ?? DEFAULT_ORDER_STEP;
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.type = 'task';
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

  async rebalanceStatus(status: string, items?: TaskItem[]) {
    const columnItems = (items ?? (await this.getTasks()).filter((task) => task.status === status)).sort(compareTasks);
    await Promise.all(
      columnItems.map((task, index) =>
        this.app.fileManager.processFrontMatter(task.file, (frontmatter) => {
          frontmatter.board_order = (index + 1) * DEFAULT_ORDER_STEP;
        })
      )
    );
  }

  async createTask(input: CreateTaskInput) {
    const title = input.title.trim();
    if (!title) return;

    const status = normalizeStatusValue(input.status ?? this.statuses[0] ?? 'backlog');
    await this.ensureStatusExists(status, 'left');

    const safeTitle = sanitizeFileName(title);
    const folder = this.getTasksFolder().replace(/\/$/, '');
    const path = `${folder}/${safeTitle}.md`;

    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`Task already exists: ${safeTitle}`);
      return;
    }

    const order = await this.getFirstOrderForStatus(status);
    const template = await this.readTaskTemplate();
    const content = buildTaskFileContent(template, {
      status,
      order,
      today: todayString(),
      modalTags: normalizeCreateTags(input.tags),
      modalDescription: input.description
    });

    await this.app.vault.create(path, content);
    new Notice(`Created ${safeTitle}`);
    this.refreshViews();
  }

  getTaskTemplatePath(): string {
    return `${this.getTasksFolder().replace(/\/$/, '')}/${TASK_TEMPLATE_FILENAME}`;
  }

  async readTaskTemplate(): Promise<ParsedTaskTemplate | null> {
    const path = this.getTaskTemplatePath();
    if (!this.app.vault.getAbstractFileByPath(path)) return null;

    try {
      return parseTaskTemplate(await this.app.vault.read({ path } as TFile));
    } catch {
      new Notice(`Task template ${TASK_TEMPLATE_FILENAME} has invalid frontmatter. Using defaults.`);
      return null;
    }
  }

  async getTaskTemplateBody(): Promise<string> {
    return (await this.readTaskTemplate())?.body ?? '';
  }

  async getFirstOrderForStatus(status: string) {
    const items = (await this.getTasks()).filter((task) => task.status === status).sort(compareTasks);
    const firstOrder = items[0]?.order;
    return firstOrder != null ? firstOrder - DEFAULT_ORDER_STEP : DEFAULT_ORDER_STEP;
  }

  async deleteTask(file: TFile) {
    await this.app.vault.delete(file);
    new Notice(`Deleted ${file.basename}`);
    this.refreshViews();
  }
}

class RookKanbanBoardView extends ItemView {
  plugin: RookKanbanBoardPlugin;
  root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: RookKanbanBoardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_ROOK_KANBAN;
  }

  getDisplayText() {
    return 'Rook Kanban Board';
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

function BoardApp({ plugin }: { plugin: RookKanbanBoardPlugin }) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('all');
  const [dropTarget, setDropTarget] = useState<DropLocation | null>(null);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const items = await plugin.getTasks();
      if (!cancelled) setTasks(items);
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

  const allTags = useMemo(() => Array.from(new Set(tasks.flatMap((task) => task.tags))).sort(), [tasks]);

  const filtered = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesTag = tag === 'all' || task.tags.includes(tag);
      const haystack = [task.title, task.sourceIssue ?? '', task.status, task.tags.join(' '), task.statusHistory.join(' ')]
        .join(' ')
        .toLowerCase();
      const matchesQuery = !lowerQuery || haystack.includes(lowerQuery);
      return matchesTag && matchesQuery;
    });
  }, [tasks, tag, query]);

  const byStatus = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    plugin.statuses.forEach((status) => map.set(status, []));

    filtered.forEach((task) => {
      const key = map.has(task.status) ? task.status : plugin.statuses[0] ?? task.status;
      const bucket = map.get(key) ?? [];
      bucket.push(task);
      bucket.sort(compareTasks);
      map.set(key, bucket);
    });

    return map;
  }, [filtered, plugin.statuses]);

  const openCreateOverlay = (status: string) => {
    setDraft({ title: '', description: '', tags: '', status });
    void plugin.getTaskTemplateBody().then((body) => {
      if (!body) return;
      setDraft((current) => (current && !current.description ? { ...current, description: body } : current));
    });
  };

  const closeCreateOverlay = () => {
    if (isCreating) return;
    setDraft(null);
  };

  const submitCreateOverlay = async () => {
    if (!draft) return;
    setIsCreating(true);
    try {
      await plugin.createTask({
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
          placeholder="Search tasks, tags, issue numbers, history…"
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
                    await plugin.moveTask(file, location);
                  }
                }}
              >
                {items.length === 0 ? <div className="rook-board-empty">No cards</div> : null}
                {items.map((task, index) => {
                  const previousItem = items[index - 1];
                  const nextItem = items[index + 1];
                  const isDropBefore =
                    dropTarget?.status === status &&
                    dropTarget.nextPath === task.file.path &&
                    dropTarget.previousPath === previousItem?.file.path;
                  const isDropAfter =
                    dropTarget?.status === status &&
                    dropTarget.previousPath === task.file.path &&
                    dropTarget.nextPath === nextItem?.file.path;
                  const isDragging = draggedPath === task.file.path;

                  return (
                    <div
                      key={task.file.path}
                      data-path={task.file.path}
                      className={`rook-board-card-wrap ${isDropBefore ? 'is-drop-before' : ''} ${isDropAfter ? 'is-drop-after' : ''}`}
                    >
                      <div
                        className={`rook-board-card ${isDragging ? 'is-dragging-source' : ''}`}
                        draggable
                        onDragStart={(event) => {
                          setDraggedPath(task.file.path);
                          event.dataTransfer.setData('text/plain', task.file.path);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDraggedPath(null);
                          setDropTarget(null);
                        }}
                        onDoubleClick={() => void plugin.app.workspace.getLeaf(true).openFile(task.file)}
                      >
                        <button
                          className="clickable-icon rook-board-card-delete"
                          aria-label={`Delete ${task.title}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void plugin.deleteTask(task.file);
                          }}
                        >
                          ×
                        </button>
                        <div className="rook-board-card-title">{task.title}</div>
                        <div className="rook-board-meta rook-board-meta-top">
                          {task.sourceIssue ? <span className="rook-board-meta-pill">Issue #{task.sourceIssue}</span> : null}
                          <span className="rook-board-meta-pill">Created {task.created ?? '—'}</span>
                          <span className="rook-board-meta-pill">Touched {task.touched ?? '—'}</span>
                        </div>
                        <div className="rook-board-tags">
                          {task.tags.map((value) => (
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
            <div className="rook-board-modal-title">New {humanizeStatus(draft.status)} task</div>
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

class RookTasksSettingTab extends PluginSettingTab {
  plugin: RookKanbanBoardPlugin;

  constructor(app: App, plugin: RookKanbanBoardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Tasks folder')
      .setDesc('Folder scanned for markdown task notes.')
      .addText((text) =>
        text.setPlaceholder('Tasks').setValue(this.plugin.settings.tasksFolder).onChange(async (value) => {
          this.plugin.settings.tasksFolder = value.trim() || 'Tasks';
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
  const normalized = status.trim().toLowerCase().replace(/\s+/g, '_');

  // THIS IS FOR BACKWARDS COMPATIBILITY: display and store the former default status as backlog.
  return normalized === 'todo' ? 'backlog' : normalized;
}

function normalizeOrder(input: unknown): number | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim()) {
    const value = Number(input);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function compareTasks(a: TaskItem, b: TaskItem): number {
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
