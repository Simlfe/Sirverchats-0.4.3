# Agent Directives & Project Rules

## Knowledge Base & Sources of Truth
Before making modifications to the codebase, always consult the relevant project knowledge files if present:

- `THEME_GUIDE.md`: Styling architecture, colors, theme tokens (Dark & Light modes), and component migration status. Always consult before making UI/theme changes.
- `PROJECT_CONTEXT.md`: Overall app architecture, core services, and structural setup.
- `DATABASE.md`: PocketBase schema, database structure, and collection relations.
- `FEATURES.md`: App features, business logic specifications, and functional scope.
- `CHANGELOG.md`: Record of recent changes and updates.

## Core Rules
1. **Source of Truth**: Treat `THEME_GUIDE.md` as the primary authority for styling, theme tokens (Avocado Green `#7BAE37`, light/dark mode), and component styling rules.
2. **Maintenance**: Update `THEME_GUIDE.md` and `CHANGELOG.md` whenever theme changes or major feature additions are completed.
3. **Backend Integrity**: Keep all backend APIs, PocketBase schema, routing, realtime logic, and business logic intact when refactoring or restyling.
