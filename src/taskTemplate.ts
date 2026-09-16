import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** Basename of the optional per-folder template. The leading `_` keeps it off the board. */
export const TASK_TEMPLATE_FILENAME = '_task_template.md';

/** Starting body used when neither the create dialog nor the template provides one. */
export const DEFAULT_TASK_BODY = '- Define the outcome.\n- Add the next concrete step.';

export type ParsedTaskTemplate = {
  frontmatter: Record<string, unknown>;
  body: string;
};

export type TaskTemplateOverlay = {
  /** Normalized status of the column the task is created in. */
  status: string;
  /** Board order placing the task at the top of its column. */
  order: number;
  /** Creation date in YYYY-MM-DD format. */
  today: string;
  /** Tags entered in the create dialog. */
  modalTags: string[];
};

export type BuildTaskContentInput = TaskTemplateOverlay & {
  modalDescription?: string;
};

/** Frontmatter keys the plugin manages. Everything else passes through verbatim. */
const MANAGED_FRONTMATTER_KEYS = new Set([
  'type',
  'status',
  'board_order',
  'created',
  'touched',
  'source_issue',
  'tags',
  'status_history'
]);

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;

/**
 * Split raw template text into frontmatter and body.
 * A file with no YAML section is valid: the whole file is the body.
 * @throws when the YAML section exists but is invalid or not a mapping.
 */
export function parseTaskTemplate(raw: string): ParsedTaskTemplate {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { frontmatter: {}, body: raw.trim() };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch (error) {
    throw new Error(`Invalid YAML frontmatter in task template: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Task template frontmatter must be a mapping');
  }

  return { frontmatter: parsed as Record<string, unknown>, body: raw.slice(match[0].length).trim() };
}

/**
 * Merge template frontmatter with plugin-computed values.
 * The template is the base; the plugin is authoritative on managed keys.
 * Custom template keys pass through untouched. Tags are unioned.
 */
export function mergeTemplateFrontmatter(
  template: ParsedTaskTemplate | null,
  overlay: TaskTemplateOverlay
): Record<string, unknown> {
  const source = template?.frontmatter ?? {};
  const merged: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (!MANAGED_FRONTMATTER_KEYS.has(key)) {
      merged[key] = value;
    }
  }

  merged.type = 'task';
  merged.status = overlay.status;
  merged.board_order = overlay.order;
  merged.created = overlay.today;
  merged.touched = overlay.today;
  merged.source_issue = source.source_issue ?? null;
  merged.tags = Array.from(new Set([...normalizeStringList(source.tags), ...overlay.modalTags]));
  merged.status_history = [
    ...normalizeStringList(source.status_history),
    `${overlay.today} | created -> ${overlay.status}`
  ];

  return merged;
}

/** Modal description wins; then the template body; then the builtin default. */
export function resolveTaskBody(modalDescription: string | undefined, templateBody: string): string {
  if (modalDescription?.trim()) return modalDescription.trim();
  if (templateBody.trim()) return templateBody;
  return DEFAULT_TASK_BODY;
}

/** Build the full markdown file content for a new task. */
export function buildTaskFileContent(template: ParsedTaskTemplate | null, input: BuildTaskContentInput): string {
  const merged = mergeTemplateFrontmatter(template, input);
  const body = resolveTaskBody(input.modalDescription, template?.body ?? '');
  const tags = merged.tags as string[];
  const history = merged.status_history as string[];

  const lines = [
    '---',
    `type: ${merged.type}`,
    `status: ${merged.status}`,
    `board_order: ${merged.board_order}`,
    `created: ${merged.created}`,
    `touched: ${merged.touched}`,
    merged.source_issue == null ? 'source_issue:' : `source_issue: ${stringifyYaml(merged.source_issue).trim()}`
  ];

  if (!tags.length) {
    lines.push('tags: []');
  } else {
    lines.push('tags:');
    for (const tag of tags) lines.push(`  - ${tag}`);
  }

  lines.push('status_history:');
  for (const entry of history) lines.push(`  - ${JSON.stringify(entry)}`);

  const customEntries = Object.entries(template?.frontmatter ?? {}).filter(([key]) => !MANAGED_FRONTMATTER_KEYS.has(key));
  if (customEntries.length) {
    lines.push(stringifyYaml(Object.fromEntries(customEntries)).trimEnd());
  }

  lines.push('---', '', body);
  return `${lines.join('\n')}\n`;
}

function normalizeStringList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .filter((entry) => entry != null)
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof input === 'string' && input.trim()) return [input.trim()];
  return [];
}
