import { Notice, Plugin, TFile } from "obsidian";
import { registerDashboardModule, registerDashboardWidget } from "./dashboard-bridge";
import { VaultOrganizerDashboard, VIEW_TYPE } from "./dashboard";
import { CaptureModal, FileDetailModal, ManagedEditModal, MaintenanceModal, ProjectDetailModal, ProjectListModal, ProjectNoteModal, RecordListModal } from "./modals";
import { VaultRepository } from "./repository";
import { VaultOrganizerSettingTab } from "./settings";
import { DEFAULT_SETTINGS, NoteInput, NoteRecord, ProjectFolder, Settings } from "./types";
import { inside, Kind, normalizePath, safeName } from "./utils";

export default class VaultOrganizerPlugin extends Plugin {
  settings: Settings = structuredClone(DEFAULT_SETTINGS);
  repository!: VaultRepository;
  async onload(): Promise<void> {
    await this.loadSettings(); this.repository = new VaultRepository(this.app, this.settings);
    this.registerView(VIEW_TYPE, leaf => new VaultOrganizerDashboard(leaf, this));
    this.addRibbonIcon("layout-dashboard", "Open Vault Organizer", () => void this.openDashboard());
    this.addSettingTab(new VaultOrganizerSettingTab(this.app, this));
    this.addCommand({ id: "open-dashboard", name: "Open dashboard", callback: () => void this.openDashboard() });
    this.addCommand({ id: "capture-quick-note", name: "Capture a quick note", callback: () => this.openCapture("quick-note") });
    this.addCommand({ id: "create-project", name: "Create a project", callback: () => this.openCapture("project") });
    this.addCommand({ id: "adopt-current-as-quick-note", name: "Adopt current note as a quick note", callback: () => this.openCurrent("quick-note") });
    this.addCommand({ id: "adopt-current-as-project", name: "Adopt current note as a project", callback: () => this.openCurrent("project") });
    this.addCommand({ id: "edit-current-managed-note", name: "Edit current managed note", callback: () => this.openCurrent() });
    this.addCommand({ id: "repair-configured-trees", name: "Repair configured file trees", callback: () => void this.repairTrees() });
    this.registerEvent(this.app.vault.on("create", () => this.refreshViews())); this.registerEvent(this.app.vault.on("delete", () => this.refreshViews())); this.registerEvent(this.app.vault.on("rename", () => this.refreshViews())); this.registerEvent(this.app.vault.on("modify", () => this.refreshViews()));
    await this.repairTrees(false);
  }
  onunload(): void { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }
  async loadSettings(): Promise<void> { const saved = await this.loadData() as Partial<Settings> | null; this.settings = this.normalize(saved); }
  private normalize(saved: Partial<Settings> | null): Settings { const base = structuredClone(DEFAULT_SETTINGS); if (!saved || saved.settingsVersion !== 3) return base; return { settingsVersion: 3, openCreatedNote: saved.openCreatedNote ?? true, quickNotes: { ...base.quickNotes, ...(saved.quickNotes ?? {}), root: { ...base.quickNotes.root, ...(saved.quickNotes?.root ?? {}) }, topics: saved.quickNotes?.topics ?? [], tags: saved.quickNotes?.tags ?? [] }, projects: { ...base.projects, ...(saved.projects ?? {}), root: { ...base.projects.root, ...(saved.projects?.root ?? {}) }, tags: saved.projects?.tags ?? [], statuses: saved.projects?.statuses?.length ? saved.projects.statuses : base.projects.statuses, defaultStatus: saved.projects?.defaultStatus ?? base.projects.defaultStatus } }; }
  async saveSettings(): Promise<void> { await this.saveData(this.settings); this.repository?.updateSettings(this.settings); this.refreshViews(); }
  async saveEditableSettings(settings: Settings): Promise<void> { this.settings = settings; await this.saveSettings(); await this.repairTrees(false); }
  private refreshViews(): void { for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view instanceof VaultOrganizerDashboard) void leaf.view.render(); }
  async openDashboard(): Promise<void> { let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]; if (!leaf) { leaf = this.app.workspace.getLeaf("tab"); await leaf.setViewState({ type: VIEW_TYPE, active: true }); } this.app.workspace.revealLeaf(leaf); }
  openSettings(): void { const setting = (this.app as typeof this.app & { setting?: { open(): void; openTabById(id: string): void } }).setting; if (!setting) { new Notice("Open Obsidian Settings, then choose Vault Organizer."); return; } setting.open(); setting.openTabById(this.manifest.id); }
  openCapture(kind: Kind): void { const root = kind === "quick-note" ? this.settings.quickNotes.root : this.settings.projects.root; if (!root.confirmed) { new Notice(`Confirm the ${kind === "quick-note" ? "Quick Notes" : "Projects"} root in Vault Organizer settings first.`); this.openSettings(); return; } new CaptureModal(this.app, this, kind).open(); }
  async createNote(kind: Kind, input: NoteInput): Promise<void> { const root = kind === "quick-note" ? this.settings.quickNotes.root : this.settings.projects.root; if (!root.confirmed) throw new Error("Confirm the workflow root in settings first."); const file = await this.repository.createNote(kind, input); new Notice(`Created ${file.path}`); if (this.settings.openCreatedNote) await this.openFile(file.path); }
  openRecord(record: NoteRecord, kind: Kind): void { const file = this.app.vault.getAbstractFileByPath(record.path); if (!(file instanceof TFile)) return; if (kind === "project") void this.openProject({ name: file.parent?.name ?? file.basename, hub: file.path, files: 1, modified: file.stat.mtime }); else new FileDetailModal(this.app, this, file).open(); }
  openProject(project: ProjectFolder): void { new ProjectDetailModal(this.app, this, project).open(); }
  openQuickFiles(): void { const root = this.settings.quickNotes.root; const records = this.repository.getRecords().filter(record => root.confirmed && inside(record.path, root.path)); new RecordListModal(this.app, this, "Quick-note files", records).open(); }
  openProjects(): void { new ProjectListModal(this.app, this, this.repository.getProjectFolders()).open(); }
  addProjectNote(project: ProjectFolder): void { new ProjectNoteModal(this.app, this, project.hub.split("/").slice(0, -1).join("/")).open(); }
  editFile(file: TFile): void { const record = this.repository.getRecords().find(item => item.path === file.path); if (!record) { new Notice("This note is not managed by Vault Organizer yet."); return; } new ManagedEditModal(this.app, this, file, record).open(); }
  openCurrent(kind?: Kind): void { const file = this.app.workspace.getActiveFile(); if (!file) { new Notice("Open a Markdown note first."); return; } const record = this.repository.getRecords().find(item => item.path === file.path); if (!kind && !record?.ownership) { new Notice("This note is not managed by Vault Organizer yet."); return; } this.editFile(file); }
  async saveManagedFields(file: TFile, kind: Kind, title: string, tags: string[], status: string): Promise<void> { await this.repository.updateManagedFields(file, kind, title, tags, status); new Notice("Managed fields saved."); this.refreshViews(); }
  async openFile(path: string): Promise<void> { const file = this.app.vault.getAbstractFileByPath(normalizePath(path)); if (!(file instanceof TFile)) { new Notice("That note could not be found."); return; } await this.app.workspace.getLeaf(false).openFile(file); }
  async confirmRoot(kind: Kind, path: string): Promise<void> { const root = kind === "quick-note" ? this.settings.quickNotes.root : this.settings.projects.root; root.path = normalizePath(path); root.confirmed = Boolean(root.path); await this.saveSettings(); new Notice(`${kind === "quick-note" ? "Quick Notes" : "Projects"} root saved.`); }
  async repairTrees(showNotice = true): Promise<void> { try { for (const root of [this.settings.quickNotes.root, this.settings.projects.root]) if (root.confirmed) await this.repository.ensureFolder(root.path); if (showNotice) new Notice("Configured file trees are healthy."); } catch (error) { new Notice(`Could not repair file trees: ${error instanceof Error ? error.message : String(error)}`); } }
  reviewMaintenance(): void { new MaintenanceModal(this.app, this).open(); }
}
// Red-Beard Dashboard integration: launcher module and independent summary widget.
const rbDisposals = new WeakMap<object, () => void>();
const rbOnload = VaultOrganizerPlugin.prototype.onload;
VaultOrganizerPlugin.prototype.onload = async function(this: VaultOrganizerPlugin) {
  await rbOnload.call(this);
  const disposals = [
    registerDashboardModule(this.app, { id: "vault-organizer", name: "Vault Organizer", command: "vault-organizer:open-dashboard", icon: "layout-dashboard", description: "Projects and managed vault files.", order: 20 }),
    registerDashboardWidget(this.app, { id: "vault-organizer/overview", name: "Vault Organizer", description: "Projects and managed vault files.", icon: "layout-dashboard", defaultLayout: { w: 4, mobileW: 12, h: 2, order: 40 }, mobile: "responsive", render: (_ctx, container) => {
      container.createEl("p", { text: "Projects and managed vault files." });
      const button = container.createEl("button", { text: "Open Vault Organizer" });
      button.onclick = () => void this.openDashboard();
    } })
  ];
  rbDisposals.set(this, () => disposals.forEach(dispose => dispose()));
};
const rbOnunload = VaultOrganizerPlugin.prototype.onunload;
VaultOrganizerPlugin.prototype.onunload = function(this: VaultOrganizerPlugin) {
  rbDisposals.get(this)?.();
 return rbOnunload ? rbOnunload.call(this) : undefined;
};
