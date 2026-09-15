// Test double for the Obsidian API, aliased as 'obsidian' in vitest.config.ts.
// Production code keeps importing 'obsidian'; only tests swap this module in.
import { parse } from 'yaml';

export class Notice {
  static messages: string[] = [];
  message: string;
  constructor(message: string) {
    this.message = message;
    Notice.messages.push(message);
  }
  static reset() {
    Notice.messages = [];
  }
}

export class TFile {
  path = '';
  basename = '';
  stat = { mtime: 0 };
  parent: { path: string } | null = null;
}

export class App {
  vault: any;
  workspace: any;
  metadataCache: any;
  fileManager: any;
}

export class Plugin {
  app: any;
  manifest: any;
  constructor(app?: any, manifest?: any) {
    this.app = app;
    this.manifest = manifest;
  }
  async loadData(): Promise<any> {
    return {};
  }
  async saveData(): Promise<void> {}
  registerView() {}
  addCommand() {}
  addRibbonIcon() {}
  addSettingTab() {}
  registerEvent(eventRef: unknown) {
    return eventRef;
  }
}

export class ItemView {
  app: any;
  contentEl: any;
  constructor(public leaf: any) {}
}

export class PluginSettingTab {
  containerEl: any;
  constructor(
    public app: any,
    public plugin: any
  ) {}
}

export class WorkspaceLeaf {}

export class Setting {
  constructor(public containerEl: any) {}
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addText() {
    return this;
  }
}

export function normalizePath(path: string): string {
  return path;
}

export function parseYaml(text: string): any {
  return parse(text);
}
