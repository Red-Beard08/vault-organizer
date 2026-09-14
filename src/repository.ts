import { App, TFile, TFolder } from "obsidian";
import type { DashboardData, NoteInput, NoteRecord, ProjectFolder, RootSetting, Settings } from "./types";
import { csv, dateParts, inside, Kind, normalizePath, safeName, yamlString } from "./utils";

export class VaultRepository {
  constructor(private app: App, private settings: Settings) {}

  updateSettings(settings: Settings): void { this.settings = settings; }

  getRecords(): NoteRecord[] {
    return this.app.vault.getMarkdownFiles().map(file => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
      const owner = fm?.vault_organizer as Record<string, unknown> | undefined;
      const kind = owner?.kind === "quick-note" || owner?.kind === "project" ? owner.kind : undefined;
      const legacy = fm?.type === "quick-note" || fm?.type === "project" ? fm.type : undefined;
      const tags = Array.isArray(fm?.tags) ? fm.tags.filter((tag): tag is string => typeof tag === "string") : typeof fm?.tags === "string" ? csv(fm.tags) : [];
      return { path: file.path, modified: file.stat.mtime, tags, title: typeof fm?.title === "string" ? fm.title : file.basename, ownership: kind ? { schema: Number(owner?.schema) || 1, kind, storageMode: typeof owner?.storage_mode === "string" ? owner.storage_mode as NoteInput["storageMode"] : undefined } : undefined, legacyType: legacy };
    });
  }

  getProjectFolders(): ProjectFolder[] {
    const root = normalizePath(this.settings.projects.root.path);
    const prefix = root ? `${root}/` : "";
    const folders = new Map<string, ProjectFolder>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(prefix)) continue;
      const parts = file.path.slice(prefix.length).split("/");
      if (parts.length < 2 || !parts[0]) continue;
      const name = parts[0];
      const existing = folders.get(name) ?? { name, hub: file.path, files: 0, modified: 0 };
      existing.files += 1; existing.modified = Math.max(existing.modified, file.stat.mtime);
      if (file.parent?.path === `${prefix}${name}` && file.path.split("/").length <= existing.hub.split("/").length) existing.hub = file.path;
      folders.set(name, existing);
    }
    return [...folders.values()].sort((a, b) => b.modified - a.modified);
  }

  dashboard(): DashboardData {
    const records = this.getRecords();
    const quickRoot = this.settings.quickNotes.root;
    const projectRoot = this.settings.projects.root;
    const scoped = (root: RootSetting) => records.filter(record => root.confirmed && inside(record.path, root.path));
    const quick = scoped(quickRoot); const projects = scoped(projectRoot);
    const summary = (items: NoteRecord) => items;
    const recent = (items: NoteRecord[]) => [...items].sort((a, b) => b.modified - a.modified).slice(0, 10);
    const tags = [...this.settings.quickNotes.tags, ...this.settings.projects.tags].map(tag => tag.toLocaleLowerCase());
    const relatedByTag = [...new Set(tags)].map(tag => ({ tag, files: records.filter(record => record.tags.some(item => item.toLocaleLowerCase() === tag)) })).filter(item => item.files.length);
    return { quickNotes: { totalFiles: quick.length, ownedFiles: quick.filter(item => item.ownership?.kind === "quick-note").length, recentFiles: recent(quick) }, projects: { totalFiles: projects.length, ownedFiles: projects.filter(item => item.ownership?.kind === "project").length, recentFiles: recent(projects) }, relatedByTag };
  }

  async ensureFolder(path: string): Promise<void> {
    let current = "";
    for (const segment of normalizePath(path).split("/")) {
      if (!segment) continue;
      current = current ? `${current}/${segment}` : segment;
      const item = this.app.vault.getAbstractFileByPath(current);
      if (item instanceof TFolder) continue;
      if (item) throw new Error(`A file is blocking the folder ${current}.`);
      await this.app.vault.createFolder(current);
    }
  }

  async createNote(kind: Kind, input: NoteInput): Promise<TFile> {
    const config = kind === "quick-note" ? this.settings.quickNotes : this.settings.projects;
    const destination = kind === "project" ? `${config.root.path}/${safeName(input.title, "New project")}` : this.quickDestination(input);
    if (!inside(destination, config.root.path)) throw new Error("The destination is outside the confirmed workflow root.");
    await this.ensureFolder(destination);
    const path = await this.availablePath(`${destination}/${safeName(input.title, kind === "project" ? "New project" : "Quick note")}.md`);
    const content = this.render(kind, input, config.tags);
    return this.app.vault.create(path, content);
  }

  private quickDestination(input: NoteInput): string {
    const root = this.settings.quickNotes.root.path;
    if (input.storageMode === "date") return normalizePath(`${root}/${dateParts(input.createdAt, this.settings.quickNotes.dateHierarchy).join("/")}`);
    if (input.storageMode === "topic") { if (!input.topic.trim()) throw new Error("Choose or enter a topic."); return normalizePath(`${root}/${safeName(input.topic, "Topic")}`); }
    if (input.storageMode === "manual") { if (!input.manualFolder.trim() || input.manualFolder.split(/[\\/]/).some(part => part === "..")) throw new Error("Choose a folder inside the Quick Notes root."); return normalizePath(`${root}/${input.manualFolder}`); }
    return normalizePath(root);
  }

  private render(kind: Kind, input: NoteInput, defaults: string[]): string {
    const tags = [...new Set([...defaults, ...input.tags])];
    const owner = kind === "quick-note" ? `  storage_mode: ${yamlString(input.storageMode)}` : "";
    const status = kind === "project" ? `status: ${yamlString(input.status)}\n` : "";
    return `---\ntype: ${kind}\ntitle: ${yamlString(input.title)}\ncreated: ${input.createdAt.toISOString()}\nvault_organizer:\n  schema: 1\n  kind: ${yamlString(kind)}\n${owner}${status}tags:\n${tags.map(tag => `  - ${yamlString(tag)}`).join("\n")}\n---\n\n# ${input.title}\n\n${input.body.trim()}\n`;
  }

  private async availablePath(path: string): Promise<string> { if (!this.app.vault.getAbstractFileByPath(path)) return path; const base = path.slice(0, -3); let n = 2; while (this.app.vault.getAbstractFileByPath(`${base} (${n}).md`)) n++; return `${base} (${n}).md`; }
}
