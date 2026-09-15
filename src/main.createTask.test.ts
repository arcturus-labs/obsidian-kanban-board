import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import RookKanbanBoardPlugin from './main';
import { DEFAULT_TASK_BODY, parseTaskTemplate } from './taskTemplate';

type VaultFile = { path: string; content: string };

function makeVault(initial: VaultFile[] = []) {
  const files = new Map(initial.map((file) => [file.path, file.content]));
  return {
    files,
    getAbstractFileByPath: vi.fn((path: string) => (files.has(path) ? { path } : null)),
    getMarkdownFiles: vi.fn(() => []),
    cachedRead: vi.fn(async () => ''),
    create: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
      return { path };
    }),
    delete: vi.fn(),
    read: vi.fn(async (file: { path: string }) => files.get(file.path) ?? ''),
    adapter: { exists: vi.fn(async () => false), read: vi.fn(async () => ''), write: vi.fn(async () => {}) },
  };
}

function makeMetadataCache() {
  return { getFileCache: vi.fn(() => null), on: vi.fn(() => ({})) };
}

function makeApp(vault: ReturnType<typeof makeVault>, metadataCache: ReturnType<typeof makeMetadataCache>) {
  return {
    app: {
      vault,
      metadataCache,
      workspace: { getLeavesOfType: vi.fn(() => []), getLeaf: vi.fn(), revealLeaf: vi.fn() },
      fileManager: { processFrontMatter: vi.fn() },
    },
    vault,
    metadataCache,
  };
}

function makePlugin(parts: ReturnType<typeof makeApp>) {
  const plugin = new RookKanbanBoardPlugin(parts.app as never, { id: 'obsidian-kanban-board' } as never);
  plugin.statuses = ['backlog', 'in_progress', 'done'];
  return plugin;
}

describe('template-aware createTask', () => {
  beforeEach(() => {
    Notice.reset();
    vi.clearAllMocks();
  });

  it('merges a YAML template with plugin-computed values', async () => {
    const parts = makeApp(makeVault([{ path: 'Tasks/_task_template.md', content: '---\npriority: high\n---\n\nTemplate body\n' }]), makeMetadataCache());
    const plugin = makePlugin(parts);
    await plugin.createTask({ title: 'My Task', status: 'backlog' });

    expect(parts.vault.create).toHaveBeenCalledOnce();
    const [path, content] = parts.vault.create.mock.calls[0] as [string, string];
    expect(path).toBe('Tasks/My Task.md');
    const parsed = parseTaskTemplate(content);
    expect(parsed.frontmatter).toMatchObject({ type: 'task', status: 'backlog', priority: 'high' });
    expect(parsed.frontmatter.board_order).toBeTypeOf('number');
    expect(parsed.body).toBe('Template body');
  });

  it('treats a template with no YAML as the body', async () => {
    const parts = makeApp(makeVault([{ path: 'Tasks/_task_template.md', content: 'Just body text\n' }]), makeMetadataCache());
    const plugin = makePlugin(parts);
    await plugin.createTask({ title: 'My Task', status: 'backlog' });

    const [, content] = parts.vault.create.mock.calls[0] as [string, string];
    const parsed = parseTaskTemplate(content);
    expect(parsed.frontmatter).toMatchObject({ type: 'task', status: 'backlog' });
    expect(parsed.body).toBe('Just body text');
  });

  it('prefers the modal description over the template body', async () => {
    const parts = makeApp(makeVault([{ path: 'Tasks/_task_template.md', content: 'Template body\n' }]), makeMetadataCache());
    const plugin = makePlugin(parts);
    await plugin.createTask({ title: 'My Task', status: 'backlog', description: 'Modal desc' });

    const [, content] = parts.vault.create.mock.calls[0] as [string, string];
    expect(parseTaskTemplate(content).body).toBe('Modal desc');
  });

  it('behaves exactly as before when no template exists', async () => {
    const parts = makeApp(makeVault([]), makeMetadataCache());
    const plugin = makePlugin(parts);
    await plugin.createTask({ title: 'My Task', status: 'backlog' });

    const [, content] = parts.vault.create.mock.calls[0] as [string, string];
    const parsed = parseTaskTemplate(content);
    expect(parsed.frontmatter).toMatchObject({ type: 'task', status: 'backlog', tags: [] });
    expect(parsed.body).toBe(DEFAULT_TASK_BODY);
  });

  it('falls back to defaults and notifies when the template YAML is invalid', async () => {
    const parts = makeApp(makeVault([{ path: 'Tasks/_task_template.md', content: '---\n: [unclosed\n---\nbody\n' }]), makeMetadataCache());
    const plugin = makePlugin(parts);
    await plugin.createTask({ title: 'My Task', status: 'backlog' });

    const [, content] = parts.vault.create.mock.calls[0] as [string, string];
    expect(parseTaskTemplate(content).body).toBe(DEFAULT_TASK_BODY);
    expect(Notice.messages.some((message) => /task template/i.test(message))).toBe(true);
  });

  it('looks up the template in the configured tasks folder', async () => {
    const parts = makeApp(makeVault([{ path: 'Work/_task_template.md', content: 'Work body\n' }]), makeMetadataCache());
    const plugin = makePlugin(parts);
    plugin.settings.tasksFolder = 'Work';
    await plugin.createTask({ title: 'My Task', status: 'backlog' });

    const [path, content] = parts.vault.create.mock.calls[0] as [string, string];
    expect(path).toBe('Work/My Task.md');
    expect(parseTaskTemplate(content).body).toBe('Work body');
    expect(parts.vault.read).toHaveBeenCalledWith({ path: 'Work/_task_template.md' });
  });
});

describe('template body for the create dialog', () => {
  it('loads the template body for pre-filling the description box', async () => {
    const parts = makeApp(makeVault([{ path: 'Tasks/_task_template.md', content: '---\npriority: high\n---\n\nTemplate body\n' }]), makeMetadataCache());
    const plugin = makePlugin(parts);
    await expect(plugin.getTaskTemplateBody()).resolves.toBe('Template body');
  });

  it('returns an empty string for dialog state when no template exists', async () => {
    const parts = makeApp(makeVault([]), makeMetadataCache());
    const plugin = makePlugin(parts);
    await expect(plugin.getTaskTemplateBody()).resolves.toBe('');
  });

  it('returns an empty string and notifies when the template YAML is invalid', async () => {
    const parts = makeApp(makeVault([{ path: 'Tasks/_task_template.md', content: '---\n: [unclosed\n---\nbody\n' }]), makeMetadataCache());
    const plugin = makePlugin(parts);
    await expect(plugin.getTaskTemplateBody()).resolves.toBe('');
    expect(Notice.messages.some((message) => /task template/i.test(message))).toBe(true);
  });
});
