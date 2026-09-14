import { App, Modal, Notice, Platform, Setting, TFile } from "obsidian";
import type { NoteInput, NoteRecord, ProjectFolder, Settings } from "./types";
import type VaultOrganizerPlugin from "./main";
import { csv, safeName } from "./utils";

function prepare(modal: Modal, className: string): void {
  modal.modalEl.addClass(className);
  modal.contentEl.addClass("vault-organizer-modal-content");
  window.requestAnimationFrame(() => { modal.contentEl.scrollTop = 0; });
}

export class CaptureModal extends Modal {
  private values: NoteInput;
  constructor(app: App, private plugin: VaultOrganizerPlugin, private kind: "quick-note" | "project") { super(app); this.values = { title: "", body: "", tags: [], topic: "", status: plugin.settings.projects.defaultStatus, storageMode: plugin.settings.quickNotes.defaultStorageMode, manualFolder: "", createdAt: new Date() }; }
  onOpen(): void {
    prepare(this, "vault-organizer-capture");
    const root = this.contentEl; root.createEl("div", { text: this.kind === "project" ? "PROJECT WORKSPACE" : "QUICK CAPTURE", cls: "vault-organizer-eyebrow" }); root.createEl("h2", { text: this.kind === "project" ? "Create a project" : "Capture a quick note" }); root.createEl("p", { text: this.kind === "project" ? "Start a focused project with its own folder and hub note." : "Capture a thought into the right place without leaving your workflow.", cls: "vault-organizer-muted" });
    this.text(root, "Title", "A clear title", "title");
    if (this.kind === "quick-note") this.quickFields(root); else new Setting(root).setName("Status").addDropdown(dropdown => { this.plugin.settings.projects.statuses.forEach(status => dropdown.addOption(status, status)); dropdown.setValue(this.values.status).onChange(value => { this.values.status = value; }); });
    new Setting(root).setName("Details").setDesc(this.kind === "project" ? "What outcome should this project produce?" : "Capture the thought before it gets away.").addTextArea(area => { area.setPlaceholder("Write here…").setValue(this.values.body).onChange(value => { this.values.body = value; }); area.inputEl.rows = 8; });
    new Setting(root).setName("Additional tags").setDesc("Separate tags with commas.").addText(input => input.setPlaceholder("reference, favorite").onChange(value => { this.values.tags = csv(value); }));
    new Setting(root).addButton(button => button.setButtonText("Cancel").onClick(() => this.close())).addButton(button => button.setButtonText(this.kind === "project" ? "Create project" : "Save quick note").setCta().onClick(() => void this.submit()));
    if (!Platform.isMobile) root.querySelector<HTMLInputElement>("input")?.focus();
  }
  onClose(): void { this.contentEl.empty(); }
  private text(root: HTMLElement, name: string, placeholder: string, key: "title"): void { new Setting(root).setName(name).addText(input => input.setPlaceholder(placeholder).onChange(value => { this.values[key] = value.trim(); })); }
  private quickFields(root: HTMLElement): void { new Setting(root).setName("Store by").setDesc("Choose how this note is organized.").addDropdown(dropdown => dropdown.addOptions({ date: "Date", topic: "Topic", manual: "Manual folder", flat: "Root folder" }).setValue(this.values.storageMode).onChange(value => { this.values.storageMode = value as NoteInput["storageMode"]; })); new Setting(root).setName("Topic (optional)").addText(input => input.setPlaceholder(this.plugin.settings.quickNotes.topics.join(", ") || "Ideas").onChange(value => { this.values.topic = value.trim(); })); new Setting(root).setName("Manual folder (optional)").setDesc("Relative to the Quick Notes root.").addText(input => input.setPlaceholder("Ideas/Research").onChange(value => { this.values.manualFolder = value.trim(); })); }
  private async submit(): Promise<void> { if (!this.values.title) { new Notice("Add a title before saving."); return; } try { await this.plugin.createNote(this.kind, this.values); this.close(); } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); } }
}

export class ProjectDetailModal extends Modal {
  constructor(app: App, private plugin: VaultOrganizerPlugin, private project: ProjectFolder) { super(app); }
  async onOpen(): Promise<void> { prepare(this, "vault-organizer-project-modal"); const root = this.contentEl; root.createEl("div", { text: "PROJECT FOLDER", cls: "vault-organizer-eyebrow" }); root.createEl("h2", { text: this.project.name }); root.createEl("p", { text: `${this.project.files} Markdown file${this.project.files === 1 ? "" : "s"} in this project folder.`, cls: "vault-organizer-muted" }); const actions = root.createDiv({ cls: "vault-organizer-actions" }); const add = actions.createEl("button", { text: "Add new note", cls: "mod-cta" }); add.onclick = () => void this.plugin.addProjectNote(this.project); const open = actions.createEl("button", { text: "Open project hub" }); open.onclick = () => void this.plugin.openFile(this.project.hub); root.createEl("h3", { text: "Project files" }); const list = root.createDiv({ cls: "vault-organizer-project-files" }); const folder = this.project.hub.split("/").slice(0, -1).join("/"); const files = this.plugin.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(`${folder}/`)).sort((a, b) => b.stat.mtime - a.stat.mtime); if (!files.length) list.createEl("p", { text: "No Markdown files are inside this project folder yet.", cls: "vault-organizer-muted" }); for (const file of files) { const row = list.createDiv({ cls: "vault-organizer-file-row" }); row.createDiv({ text: file.basename }); const button = row.createEl("button", { text: "Open" }); button.onclick = () => void this.plugin.openFile(file.path); } }
  onClose(): void { this.contentEl.empty(); }
}

export class ProjectNoteModal extends Modal {
  private title = ""; private body = "";
  constructor(app: App, private plugin: VaultOrganizerPlugin, private folder: string) { super(app); }
  onOpen(): void { prepare(this, "vault-organizer-project-note-modal"); const root = this.contentEl; root.createEl("div", { text: "PROJECT NOTE", cls: "vault-organizer-eyebrow" }); root.createEl("h2", { text: "Add new note" }); root.createEl("p", { text: `This note will be saved inside ${this.folder}.`, cls: "vault-organizer-muted" }); new Setting(root).setName("Title").addText(input => input.setPlaceholder("Meeting notes").onChange(value => { this.title = value.trim(); })); new Setting(root).setName("Note").addTextArea(input => { input.setPlaceholder("Write the note…"); input.inputEl.rows = 9; input.onChange(value => { this.body = value; }); }); new Setting(root).addButton(button => button.setButtonText("Cancel").onClick(() => this.close())).addButton(button => button.setButtonText("Add note").setCta().onClick(() => void this.save())); }
  onClose(): void { this.contentEl.empty(); }
  private async save(): Promise<void> { if (!this.title) { new Notice("Add a title first."); return; } const base = `${this.folder}/${safeName(this.title, "Project note")}.md`; let path = base; let suffix = 2; while (this.plugin.app.vault.getAbstractFileByPath(path)) path = `${base.slice(0, -3)} (${suffix++}).md`; try { await this.plugin.app.vault.create(path, `# ${this.title}\n\n${this.body.trim()}\n`); new Notice(`Added note to ${this.folder}.`); this.close(); } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); } }
}

export class FileDetailModal extends Modal {
  constructor(app: App, private plugin: VaultOrganizerPlugin, private file: TFile) { super(app); }
  async onOpen(): Promise<void> { prepare(this, "vault-organizer-file-modal"); const root = this.contentEl; root.createEl("div", { text: "NOTE DETAILS", cls: "vault-organizer-eyebrow" }); root.createEl("h2", { text: this.file.basename }); root.createEl("p", { text: this.file.path, cls: "vault-organizer-muted" }); const actions = root.createDiv({ cls: "vault-organizer-actions" }); const open = actions.createEl("button", { text: "Open note", cls: "mod-cta" }); open.onclick = () => void this.plugin.openFile(this.file.path); const edit = actions.createEl("button", { text: "Edit managed fields" }); edit.onclick = () => void this.plugin.editFile(this.file); const text = await this.plugin.app.vault.cachedRead(this.file); const preview = text.replace(/^---[\s\S]*?---/m, "").replace(/^# .+$/m, "").trim(); if (preview) root.createDiv({ cls: "vault-organizer-preview", text: preview.slice(0, 1200) }); }
  onClose(): void { this.contentEl.empty(); }
}

export class ManagedEditModal extends Modal {
  private title: string; private tags: string[]; private status: string; private readonly kind: "quick-note" | "project";
  constructor(app: App, private plugin: VaultOrganizerPlugin, private file: TFile, private record: NoteRecord) { super(app); this.title = record.title; this.tags = record.tags; this.status = plugin.settings.projects.defaultStatus; this.kind = record.ownership?.kind ?? record.legacyType ?? "quick-note"; }
  onOpen(): void { prepare(this, "vault-organizer-edit-modal"); const root = this.contentEl; root.createEl("div", { text: "MANAGED NOTE", cls: "vault-organizer-eyebrow" }); root.createEl("h2", { text: "Edit managed fields" }); root.createEl("p", { text: "Your note body stays unchanged. Update only the fields Vault Organizer manages.", cls: "vault-organizer-muted" }); new Setting(root).setName("Title").addText(input => input.setValue(this.title).onChange(value => { this.title = value.trim(); })); if (this.kind === "project") new Setting(root).setName("Status").addDropdown(dropdown => { this.plugin.settings.projects.statuses.forEach(status => dropdown.addOption(status, status)); dropdown.setValue(this.status).onChange(value => { this.status = value; }); }); new Setting(root).setName("Tags").addText(input => input.setValue(this.tags.join(", ")).onChange(value => { this.tags = csv(value); })); new Setting(root).addButton(button => button.setButtonText("Cancel").onClick(() => this.close())).addButton(button => button.setButtonText("Save managed fields").setCta().onClick(() => void this.save())); }
  onClose(): void { this.contentEl.empty(); }
  private async save(): Promise<void> { if (!this.title) { new Notice("A title is required."); return; } try { await this.plugin.saveManagedFields(this.file, this.kind, this.title, this.tags, this.status); this.close(); } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); } }
}

export class MaintenanceModal extends Modal {
  constructor(app: App, private plugin: VaultOrganizerPlugin) { super(app); }
  onOpen(): void { prepare(this, "vault-organizer-maintenance-modal"); const root = this.contentEl; root.createEl("div", { text: "SETTINGS / MAINTENANCE", cls: "vault-organizer-eyebrow" }); root.createEl("h2", { text: "Review maintenance" }); root.createEl("p", { text: "Migration and repair tools are intentionally kept here so the main dashboard stays focused.", cls: "vault-organizer-muted" }); root.createEl("h3", { text: "Configured roots" }); root.createEl("p", { text: `Quick Notes: ${this.plugin.settings.quickNotes.root.path || "Not configured"}` }); root.createEl("p", { text: `Projects: ${this.plugin.settings.projects.root.path || "Not configured"}` }); const actions = root.createDiv({ cls: "vault-organizer-actions" }); const repair = actions.createEl("button", { text: "Repair configured trees", cls: "mod-cta" }); repair.onclick = () => void this.plugin.repairTrees(); const settings = actions.createEl("button", { text: "Open plugin settings" }); settings.onclick = () => this.plugin.openSettings(); const close = actions.createEl("button", { text: "Close" }); close.onclick = () => this.close(); }
  onClose(): void { this.contentEl.empty(); }
}
