import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type VaultOrganizerPlugin from "./main";
import type { Settings } from "./types";
import { csv, normalizePath } from "./utils";

export class VaultOrganizerSettingTab extends PluginSettingTab {
  private draft?: Settings;
  constructor(app: App, private plugin: VaultOrganizerPlugin) { super(app, plugin); }
  display(): void {
    const root = this.containerEl; root.empty(); const draft = this.draft ?? structuredClone(this.plugin.settings); this.draft = draft;
    root.createEl("h1", { text: "Vault Organizer" }); root.createEl("p", { text: "Configure storage and workflows. Changes are saved together; no files move automatically." });
    new Setting(root).setName("Open created notes").setDesc("Open a note after creating it.").addToggle(toggle => toggle.setValue(draft.openCreatedNote).onChange(value => { draft.openCreatedNote = value; }));
    this.section(root, "Quick Notes"); this.rootSetting(root, "Quick Notes root", draft.quickNotes.root.path, draft.quickNotes.root.confirmed, value => { draft.quickNotes.root.path = normalizePath(value); }); this.dropdown(root, "Default storage", draft.quickNotes.defaultStorageMode, { date: "By date", topic: "By topic", manual: "Manual folder", flat: "Root folder" }, value => { draft.quickNotes.defaultStorageMode = value as Settings["quickNotes"]["defaultStorageMode"]; }); this.dropdown(root, "Date hierarchy", draft.quickNotes.dateHierarchy, { year: "Year", "year-month": "Year / month", "year-month-day": "Year / month / day" }, value => { draft.quickNotes.dateHierarchy = value as Settings["quickNotes"]["dateHierarchy"]; }); this.csvSetting(root, "Saved topics", draft.quickNotes.topics, value => { draft.quickNotes.topics = csv(value); }); this.csvSetting(root, "Default tags", draft.quickNotes.tags, value => { draft.quickNotes.tags = csv(value); });
    this.section(root, "Projects"); this.rootSetting(root, "Projects root", draft.projects.root.path, draft.projects.root.confirmed, value => { draft.projects.root.path = normalizePath(value); }); this.csvSetting(root, "Default tags", draft.projects.tags, value => { draft.projects.tags = csv(value); }); this.csvSetting(root, "Statuses", draft.projects.statuses, value => { draft.projects.statuses = csv(value); if (!draft.projects.statuses.length) draft.projects.statuses = ["Active"]; if (!draft.projects.statuses.includes(draft.projects.defaultStatus)) draft.projects.defaultStatus = draft.projects.statuses[0]; }); this.dropdown(root, "Default status", draft.projects.defaultStatus, statusOptions(draft.projects.statuses), value => { draft.projects.defaultStatus = value; });
    this.section(root, "Maintenance"); root.createEl("p", { text: "Migration and repair are explicit actions and never run from this settings page automatically.", cls: "vault-organizer-muted" }); new Setting(root).addButton(button => button.setButtonText("Review migration & repair").onClick(() => this.plugin.reviewMaintenance())).addButton(button => button.setButtonText("Save settings").setCta().onClick(() => void this.save(draft)));
  }
  private section(root: HTMLElement, title: string): void { root.createEl("h2", { text: title, cls: "vault-organizer-settings-heading" }); }
  private rootSetting(root: HTMLElement, name: string, value: string, confirmed: boolean, onValue: (value: string) => void): void { new Setting(root).setName(name).setDesc(confirmed ? `Confirmed: ${value}` : "Not confirmed; creation is disabled until confirmed.").addText(input => input.setValue(value).setPlaceholder("Notes/Projects").onChange(onValue)).addButton(button => button.setButtonText("Confirm root").setCta().onClick(() => { void this.plugin.confirmRoot(name.startsWith("Quick") ? "quick-note" : "project", value); })); }
  private dropdown(root: HTMLElement, name: string, value: string, options: Record<string, string>, onValue: (value: string) => void): void { new Setting(root).setName(name).addDropdown(dropdown => dropdown.addOptions(options).setValue(value).onChange(onValue)); }
  private csvSetting(root: HTMLElement, name: string, values: string[], onValue: (value: string) => void): void { new Setting(root).setName(name).addText(input => input.setValue(values.join(", ")).onChange(onValue)); }
  private async save(draft: Settings): Promise<void> { try { await this.plugin.saveEditableSettings(draft); this.draft = structuredClone(this.plugin.settings); new Notice("Vault Organizer settings saved."); this.display(); } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); } }
}

function statusOptions(statuses: string[]): Record<string, string> { const result: Record<string, string> = {}; for (const status of statuses) result[status] = status; return result; }
