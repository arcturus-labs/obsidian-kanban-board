import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_BODY,
  TASK_TEMPLATE_FILENAME,
  buildTaskFileContent,
  mergeTemplateFrontmatter,
  parseTaskTemplate,
  resolveTaskBody,
} from './taskTemplate';

describe('TASK_TEMPLATE_FILENAME', () => {
  it('lives alongside tasks and is excluded from the board by the underscore prefix', () => {
    expect(TASK_TEMPLATE_FILENAME).toBe('_task_template.md');
  });
});

describe('parseTaskTemplate', () => {
  it('splits frontmatter from body', () => {
    const raw = '---\ntype: task\nstatus: backlog\npriority: high\ntags:\n  - foo\n---\n\n# Hello\n\nworld\n';
    const parsed = parseTaskTemplate(raw);
    expect(parsed.frontmatter).toEqual({ type: 'task', status: 'backlog', priority: 'high', tags: ['foo'] });
    expect(parsed.body).toBe('# Hello\n\nworld');
  });

  it('treats a file with no YAML section as all body', () => {
    const parsed = parseTaskTemplate('just some text\n');
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe('just some text');
  });

  it('parses an empty file as empty frontmatter and empty body', () => {
    expect(parseTaskTemplate('')).toEqual({ frontmatter: {}, body: '' });
    expect(parseTaskTemplate('\n\n')).toEqual({ frontmatter: {}, body: '' });
  });

  it('parses frontmatter with no body as empty body', () => {
    const parsed = parseTaskTemplate('---\npriority: high\n---\n');
    expect(parsed.frontmatter).toEqual({ priority: 'high' });
    expect(parsed.body).toBe('');
  });

  it('throws on invalid YAML so the caller can fall back to defaults', () => {
    expect(() => parseTaskTemplate('---\n: [unclosed\n---\nbody\n')).toThrow();
  });

  it('throws when the frontmatter is not a mapping', () => {
    expect(() => parseTaskTemplate('---\njust a string\n---\nbody\n')).toThrow();
  });
});

describe('mergeTemplateFrontmatter', () => {
  const overlay = { status: 'backlog', order: 1000, today: '2026-09-15', modalTags: [] as string[] };

  it('lets plugin-computed values win on load-bearing keys', () => {
    const template = parseTaskTemplate(
      '---\ntype: todo\nstatus: done\nboard_order: 5\ncreated: 2000-01-01\ntouched: 2000-01-01\nstatus_history:\n  - old entry\n---\nbody\n'
    );
    expect(mergeTemplateFrontmatter(template, overlay)).toEqual({
      type: 'task',
      status: 'backlog',
      board_order: 1000,
      created: '2026-09-15',
      touched: '2026-09-15',
      source_issue: null,
      tags: [],
      status_history: ['old entry', '2026-09-15 | created -> backlog'],
    });
  });

  it('passes custom template properties through verbatim', () => {
    const template = parseTaskTemplate('---\npriority: high\nestimate: 3\n---\nbody\n');
    const merged = mergeTemplateFrontmatter(template, overlay);
    expect(merged.priority).toBe('high');
    expect(merged.estimate).toBe(3);
  });

  it('unions template tags with modal tags without duplicates', () => {
    const template = parseTaskTemplate('---\ntags:\n  - a\n  - b\n---\nbody\n');
    const merged = mergeTemplateFrontmatter(template, { ...overlay, modalTags: ['b', 'c'] });
    expect(merged.tags).toEqual(['a', 'b', 'c']);
  });

  it('supports string-style tags in the template', () => {
    const template = parseTaskTemplate('---\ntags: solo\n---\nbody\n');
    expect(mergeTemplateFrontmatter(template, overlay).tags).toEqual(['solo']);
  });

  it('keeps the template source_issue when present', () => {
    const template = parseTaskTemplate('---\nsource_issue: 123\n---\nbody\n');
    expect(mergeTemplateFrontmatter(template, overlay).source_issue).toBe(123);
  });

  it('treats a missing template as all defaults', () => {
    expect(mergeTemplateFrontmatter(null, overlay)).toEqual({
      type: 'task',
      status: 'backlog',
      board_order: 1000,
      created: '2026-09-15',
      touched: '2026-09-15',
      source_issue: null,
      tags: [],
      status_history: ['2026-09-15 | created -> backlog'],
    });
  });
});

describe('resolveTaskBody', () => {
  it('prefers the modal description when provided', () => {
    expect(resolveTaskBody('my desc', 'template body')).toBe('my desc');
  });

  it('falls back to the template body when the modal is empty', () => {
    expect(resolveTaskBody('   ', 'template body')).toBe('template body');
    expect(resolveTaskBody(undefined, 'template body')).toBe('template body');
  });

  it('falls back to the builtin default when both are empty', () => {
    expect(resolveTaskBody('', '')).toBe(DEFAULT_TASK_BODY);
    expect(resolveTaskBody(undefined, '')).toBe(DEFAULT_TASK_BODY);
  });
});

describe('buildTaskFileContent', () => {
  const overlay = { status: 'backlog', order: 1000, today: '2026-09-15', modalTags: [] as string[] };

  it('round-trips through the template parser with merged values', () => {
    const template = parseTaskTemplate('---\npriority: high\ntags:\n  - a\n---\n\nTemplate body\n');
    const content = buildTaskFileContent(template, { ...overlay, modalTags: ['b'], modalDescription: '' });
    const reparsed = parseTaskTemplate(content);
    expect(reparsed.frontmatter).toMatchObject({
      type: 'task',
      status: 'backlog',
      board_order: 1000,
      created: '2026-09-15',
      touched: '2026-09-15',
      priority: 'high',
      tags: ['a', 'b'],
    });
    expect(reparsed.frontmatter.status_history).toEqual(['2026-09-15 | created -> backlog']);
    expect(reparsed.body).toBe('Template body');
  });

  it('uses the modal description over the template body', () => {
    const template = parseTaskTemplate('# Template body\n');
    const content = buildTaskFileContent(template, { ...overlay, modalDescription: 'Modal desc' });
    expect(parseTaskTemplate(content).body).toBe('Modal desc');
  });

  it('renders an absent source_issue as an empty value for Obsidian', () => {
    const content = buildTaskFileContent(null, overlay);
    expect(content).toContain('\nsource_issue:\n');
    expect(content).not.toContain('source_issue: null');
  });

  it('builds a complete task file when there is no template at all', () => {
    const content = buildTaskFileContent(null, overlay);
    const reparsed = parseTaskTemplate(content);
    expect(reparsed.frontmatter).toMatchObject({ type: 'task', status: 'backlog', board_order: 1000 });
    expect(reparsed.body).toBe(DEFAULT_TASK_BODY);
  });
});
