import type { Kind } from "./utils";

export interface RootSetting { path: string; confirmed: boolean; }
export interface Settings { settingsVersion: number; openCreatedNote: boolean; quickNotes: { root: RootSetting; defaultStorageMode: "date" | "topic" | "manual" | "flat"; dateHierarchy: "year" | "year-month" | "year-month-day"; topics: string[]; tags: string[] }; projects: { root: RootSetting; tags: string[]; statuses: string[]; defaultStatus: string }; }
export interface NoteInput { title: string; body: string; tags: string[]; topic: string; status: string; storageMode: "date" | "topic" | "manual" | "flat"; manualFolder: string; createdAt: Date; }
export interface Ownership { schema: number; kind: Kind; storageMode?: NoteInput["storageMode"]; }
export interface NoteRecord { path: string; modified: number; tags: string[]; title: string; ownership?: Ownership; legacyType?: Kind; }
export interface ProjectFolder { name: string; hub: string; files: number; modified: number; }
export interface DashboardData { quickNotes: { totalFiles: number; ownedFiles: number; recentFiles: NoteRecord[] }; projects: { totalFiles: number; ownedFiles: number; recentFiles: NoteRecord[] }; relatedByTag: Array<{ tag: string; files: NoteRecord[] }>; }

export const DEFAULT_SETTINGS: Settings = { settingsVersion: 3, openCreatedNote: true, quickNotes: { root: { path: "Notes/Quick Notes", confirmed: false }, defaultStorageMode: "topic", dateHierarchy: "year-month", topics: [], tags: [] }, projects: { root: { path: "Notes/Projects", confirmed: false }, tags: [], statuses: ["Active", "Paused", "Someday"], defaultStatus: "Active" } };
