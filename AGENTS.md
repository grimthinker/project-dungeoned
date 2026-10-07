# DUNGEONED — agent notes

Browser 3D dungeon editor + playable game. React 19 + TypeScript + Vite 8 + Three.js, custom ECS, Rapier3D (WASM) physics, `@xyflow/react` node editors for dialogue/quests.

## Commands

- `bun run dev` — Vite dev server (`dev.bat` is just a wrapper for this).
- `bun run build` — `tsc && vite build`. **This is the only typecheck.** There is no test suite, no lint, no CI test job. Verify changes with `bun run build`.
- `bun run format` / `bun run format:check` — Prettier over `src/**/*.{ts,tsx,css}` only. Root-level files (`bundle.ts`, `bundle.config.ts`, `vite.config.ts`) and all `.json` are **not** covered by either script or `.prettierignore`. **`format:check` currently fails on ~249 pre-existing files** — don't run a repo-wide `--write` to "fix" it, and don't treat it as a regression from your change. Format only the files you touch.
- `bun bundle.ts <domain>` — concatenates a curated slice of the codebase into `for_gemini/code_<domain>.txt` for out-of-band LLM workflows. Domains are declared in `bundle.config.ts`; add/update the glob list there when a task is scoped to a new area. `for_gemini/` is gitignored.

Deploy: any push to `main` runs `.github/workflows/deploy.yml` → `bun install --frozen-lockfile && bun run build` → `butler push dist grimthinker/dungeoned:html5`. Use Bun only (bun.lock is the lockfile); pushing to `main` publishes a build.

## Architecture

Two layers, do not blur them:

- **Imperative engine** (`src/GameApp.ts` and below). Owns `TimeManager` (fixed 1/60 accumulator loop), `GameSimulation` (owns `World` + every system + serializer), renderer, camera, editor controllers. Systems read/write plain component objects and never import React.
- **React shell** (`src/main.tsx` → `src/App.tsx`). A thin view layer over the engine. `App.tsx` is the single place where game modes and world transitions live.

`GameMode` (`src/config/gameConfig.ts`): `MENU → EDITOR ⇄ SIMULATION → GAME`. Mode transitions go through `goToMenu` / `goToEditor` / `goToSimulation` / `goToGame` in `App.tsx`, which manage `app.editorSnapshot` (serialize before leaving the editor, restore on return) and localStorage autosave. World is loaded lazily: `MENU` holds no world in memory; `goToEditor` loads from autosave or `initDefaultWorld()`. Edit mode transitions through these helpers — do not hand-roll `app.gameMode = …`.

### ECS

- `src/ecs/World.ts`: `Map<EntityId, EntityComponents>` plus a per-query result cache. Query with `world.getEntitiesWith('a', 'b')`; cache invalidation is keyed on component presence, so adding a component that a system depends on requires going through `world.addComponent`.
- Adding a new component means touching **three** places or it will silently vanish: the interface in `src/ecs/components/*.ts`, the `EntityComponents` map in `src/ecs/types.ts`, and — if it must survive save/load — `SERIALIZABLE_COMPONENT_KEYS` in the same file. Transient runtime state (input flags, attack phase timers) is deliberately excluded there; don't add it back.
- Numeric gameplay attributes are `StatValue<T>` (`{base, current, modifiers}`) with `createStat` / `evaluateStat` from `src/ecs/stats/StatEvaluator.ts`. Assigning a raw number to `health.max`, `movementStats.*`, etc. breaks modifier math. Angles are typed `Radians`.
- Systems run in an explicit order inside `GameSimulation.fixedUpdate`. Order is load-bearing (intent → movement → physics → sync → damage). Insert new systems deliberately; most need a matching `this.app.simulation.<name> = new X()` in the constructor.

### Physics coupling

Rapier is WASM; `App.tsx` blocks the whole app behind `initRapier()` before constructing `GameApp`. Bodies live behind `IPhysicsDriver` handles (`physicsBody.bodyHandle`), not raw Rapier objects.

After anything that changes collider structure (anatomy assembly, attachments, spawning, transforms from UI/gizmo), call `simulation.syncPhysicsStructures()` or set `simulation.markPhysicsStructureDirty()` — the paused path in `TimeManager.loop` only drains the dirty flag. Missing this is the usual cause of "the mesh moved but the body didn't".

## Conventions that differ from defaults

- **All tuning goes in `src/config/*Config.ts`** as a single exported SCREAMING_SNAKE object (`BALANCE_CONFIG`, `GAMEPLAY_CONFIG`, `AI_DEBUG_CONFIG`, …). The repo has a history of AI-introduced hardcoded literals in systems and `EntityAdapter.ts` being flagged and reverted; don't add more.
- **React never touches `World` in per-frame code.** Cross-layer traffic is via `EventBus` (`src/core/EventBus.ts` — add the event to `EventMap`, it is typed) and, for the in-game HUD, through the DTO port interface `IHudDataProvider` in `src/components/gameHud/hudPorts.ts`, implemented by `src/HudAdapter.ts`. The game HUD is deliberately ECS-free; keep it that way.
- **Editor undo/redo** is snapshot-based (`EntitySnapshotCommand`, full before/after serialize of the affected hierarchy). Two entry points:
  - Structural add/remove: `app.executeTransaction(desc, fn)` (`src/editor/EditorInteractionManager.ts`) — captures before/after around the mutation. Used by the Pie Menu and similar.
  - In-place field edits (all inspectors): call `app.captureBaseState()` *before* mutating, then `app.commitHistory(desc)` after. `Inspector.tsx` wraps this in a debounced `requestCommit` (`EDITOR_CONFIG.inspectorDebounceMs`) and passes it down as `onCommit`; prefer that over hand-rolling commits, otherwise every keystroke lands in the undo stack.
  - `commitHistory` is a no-op unless `gameMode === EDITOR`. Mutate values through `src/editor/EditorMutationsAPI.ts` so undo actually captures them.
- **New Inspector section** requires three edits: the panel under `src/components/inspector/`, its `export *` in `src/components/inspector/index.ts`, and a `renderSection(...)` call in `src/components/Inspector.tsx` (gated on the component existing and `mode === EDITOR` for write access).
- **i18n**: no hardcoded UI strings. Use `t('dotted.path')` from `src/locales`; a missing key silently renders the path. New keys must be added to **both** `src/locales/ru.ts` and `en.ts` (locale persisted in localStorage, `ru` default). Inspector section titles follow this.
- Code comments and `console` messages are written in Russian; match the surrounding file. Commit messages are English and short ("refactoring (game hud isolation)", "water optimization").
- `for_gemini/*.txt` task prompts are Russian and ask for a specific output format: per-file `было` / `стало` code blocks plus full text of new files. Honor that format when working from one of those prompts.
- Prettier: printWidth 100, single quotes, semicolons, LF, 2-space. `.vscode` formats TS on save; `tsconfig` has `noUnusedLocals`/`noUnusedParameters` off, so unused leftovers won't fail the build but should still be cleaned.

## Gotchas

- `src/assets/levels/demo.json` is ~5 MB and statically imported by `App.tsx` — it ships in the bundle. Editing it means a large diff and a slow dev reload.
- Autosave is versioned: `AUTOSAVE_STORAGE_KEY = 'game_world_autosave_v2'` with a hard `version !== 2` rejection. Bump the key and the version check together when the world schema changes.
- `src/locales/index.ts` contains a mojibake comment (pre-existing). Leave it alone rather than "fixing" the encoding.
- `bundle.config.ts` uses extglob (`!(ThreeSyncSystem|PhysicsSystem)*.ts`) in `gameplay_core`; Bun's `Glob` behavior here is the source of truth, not shell globbing.