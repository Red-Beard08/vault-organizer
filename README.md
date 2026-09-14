# Vault Organizer

Vault Organizer provides a responsive Obsidian dashboard for quick notes and project folders. It keeps the existing Markdown-first model and uses confirmed vault-relative roots.

## Dashboard

The dashboard keeps Quick note, New project, Settings, metrics, search, recent notes, and project workspaces visible. Project folders open into a focused detail view where notes can be added directly to that project. On desktop the dashboard uses a wide two-column workspace; on narrow panes it collapses to one column and wraps actions.

Migration, repair, and configuration controls are deliberately hidden from the primary dashboard until **Settings** is opened. The Settings panel provides access to plugin settings and a separate maintenance review.

## Compatibility

The plugin ID and settings structure remain `vault-organizer` version 3. Existing managed notes, roots, and `vault_organizer` metadata remain readable. No vault files are moved automatically by this UI refresh.
