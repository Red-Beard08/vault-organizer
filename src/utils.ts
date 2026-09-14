export type Kind = "quick-note" | "project";

export function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").split("/").map(part => part.trim()).filter(part => part && part !== "." && part !== "..").join("/");
}

export function inside(path: string, root: string): boolean {
  const file = normalizePath(path).toLowerCase();
  const folder = normalizePath(root).toLowerCase();
  return Boolean(folder) && (file === folder || file.startsWith(`${folder}/`));
}

export function safeName(value: string, fallback = "Untitled"): string {
  return value.normalize("NFKD").replace(/[\\/:*?"<>|#^\[\]]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 100) || fallback;
}

export function csv(value: string): string[] {
  const seen = new Set<string>();
  return value.split(/[\n,]/).map(item => item.trim().replace(/^#/, "")).filter(Boolean).filter(item => {
    const key = item.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function yamlString(value: string): string { return JSON.stringify(value); }

export function dateParts(date: Date, hierarchy: "year" | "year-month" | "year-month-day"): string[] {
  const year = String(date.getFullYear());
  if (hierarchy === "year") return [year];
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return hierarchy === "year-month" ? [year, month] : [year, month, String(date.getDate()).padStart(2, "0")];
}
