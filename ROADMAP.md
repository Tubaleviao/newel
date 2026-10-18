# Newel Roadmap

Phases 1–14 are complete. This document tracks what comes next.

---

## Completed phases

| Phase | Description                                                             |
| ----- | ----------------------------------------------------------------------- |
| 1     | IR types, Builder DSL, `validate`, `inspect`                            |
| 1b    | Guard deduplication in normaliser                                       |
| 2     | Generator interface, DAG runner, `generate`, `check-drift`              |
| 2b    | IR snapshot writing in runner                                           |
| 3     | `generator-typescript` — TS interfaces + Zod schemas                    |
| 4     | `generator-openapi` — OpenAPI 3.x YAML                                  |
| 5     | `generator-sql` + safe incremental migrations                           |
| 6     | `generator-docs` + GDPR report                                          |
| 7     | `generator-jsonschema`, `generator-rdf`, `generator-owl`                |
| 8     | `diff` command, watch mode, DX polish                                   |
| 9     | Semantic patches against the IR                                         |
| 10    | `generator-ui` — React entity forms + action panels                     |
| 11a   | Entity `tags: string[]` — replaces closed `ConceptRole` enum; IR v3.0.0 |
| 11b   | Weighted spawn relations (`spawns?: SpawnSchema[]`)                     |
| 11c   | System-level rule blocks (`systems?` on `FabricSchema`)                 |
| 12    | `generator-bible` — per-entity Markdown pages + index                   |
| 13    | `generator-wiki` — player-facing VitePress-compatible Markdown wiki     |
| 14    | `generator-godot` — Godot 4.x `.tres` resources + GDScript enums        |

---

## Phase 11 — IR extensions for non-application domains

These are targeted additions to `@newel/core` required before game or simulation
generators can produce useful output. Phase 11a is a breaking IR change (ConceptRole/role
replaced by tags: string[]; IR version bumped to 3.0.0). Phases 11b and 11c are additive.

### 11a — Entity `tags` ✅ Done

Add a `tags: string[]` field to `EntitySchema` replacing the former closed `ConceptRole`
enum. Tags are open-ended and composable — an entity can carry multiple labels simultaneously
(`['creature', 'boss', 'undead']`). Generators inspect `entity.tags` to vary output for
domain-specific concepts.

```ts
// EntitySchema gains:
tags: string[]

// EntityInput:
tags?: string[]   // optional, defaults to []
```

`tags` is optional in `EntityInput`; the normaliser defaults to `[]` when omitted, so all
existing fabrics are unaffected.

The former `ConceptRole` closed enum (`'entity' | 'material' | 'item' | 'creature' | 'biome' | 'system'`)
was replaced because the closed set was too restrictive for diverse domains and tags are
composable in a way a single enum value is not.

**Breaking change:** IR version bumped `2.0.0 → 3.0.0`.

**Acceptance criteria:**

- `EntitySchema` has `tags: string[]` (required in IR, always an array)
- `EntityInput` has `tags?: string[]` (optional, defaults to `[]`)
- Normaliser validates each element is a string; tags default to `[]` when omitted
- `ConceptRole` type removed from `@newel/core` exports
- Existing tests still pass; new tests cover default, explicit tags, and validation errors
- Generators ignore `tags` where not relevant (no change to their output)

### 11b — Weighted spawn relations ✅ Done

Extend `RelationSchema` (or add a parallel `SpawnSchema`) to support
probability-weighted, conditional membership — the minimum needed for biome
definitions:

```ts
interface SpawnSchema {
  target: string
  weight: number // 0–1 relative probability
  conditions?: string[] // declarative strings, e.g. ['night', 'rain']
}
```

Add `spawns?: SpawnSchema[]` to `EntitySchema`.

**Acceptance criteria:**

- `EntitySchema` and `EntityInput` have `spawns?`
- Normaliser validates `weight` is in range
- Existing generators ignore the new field

### 11c — System-level rule blocks ✅ Done

Add a top-level `systems` map to `FabricSchema` for global simulation rules
(weather, magic, economy) that are not entity instances:

```ts
interface SystemSchema {
  name: string
  description: string
  rules: string[]
  parameters?: Record<string, FieldSchema>
}

// FabricSchema gains:
systems?: Record<string, SystemSchema>
```

**Acceptance criteria:**

- `FabricSchema` and `FabricInput` have `systems?`
- CLI `inspect` lists systems if present
- Existing generators and tests unaffected

---

## Phase 12 — `generator-bible` ✅ Done

A new package `packages/generator-bible` that renders a static HTML/Markdown
design bible from a fabric.

**What it generates:**

- One Markdown (or HTML) page per entity, grouped by `kind`
- Index page listing all concepts with cross-links
- Systems section from `FabricSchema.systems`
- State machine diagrams (Mermaid) for entities that have one

**Dependencies:** Phase 11a (needs `kind` to group entries meaningfully)

**Acceptance criteria:**

- `pnpm generate` in a project with `BibleGenerator` produces a `bible/`
  output folder
- Each entity page includes: description, fields table, behaviors list, state
  machine diagram if present
- Cross-references resolve (item links to its required materials)
- Output is readable without a build step (plain Markdown or self-contained HTML)

---

## Phase 13 — `generator-wiki` ✅ Done

A new package `packages/generator-wiki` that produces wiki-ready output
compatible with VitePress/Docusaurus.

**Difference from `generator-bible`:** The bible is an internal design document;
the wiki is player-facing public documentation. The same IR generates both, but
templates and tone differ.

**Dependencies:** Phase 12 (shares template infrastructure)

**Acceptance criteria:**

- Output is importable into a VitePress project without manual edits ✓
- Player-facing language: no internal field names exposed (primary keys, PII flags
  omitted; sections titled "Attributes", "Actions", "States", "Related") ✓
- Configurable via `WikiGeneratorOptions.hiddenSections` to suppress any section
  (`'fields'`, `'relations'`, `'stateMachine'`, `'behaviors'`) ✓
- 14 passing tests covering all criteria above ✓

---

## Phase 14 — `generator-godot` ✅ Done

A new package `packages/generator-godot` that emits Godot 4.x-compatible
resource files from the IR.

**What it generates:**

- `.tres` (Godot TextResource) files per entity, grouped under `godot/<tag-plural>/`
  (e.g. `godot/creatures/`, `godot/items/`, `godot/technologies/`)
- `.gd` enum files per entity that has enum-typed fields or a state machine:
  - State machine states are exposed as a `State` enum with `SCREAMING_SNAKE` constants
  - Enum fields each get their own named enum; the state-machine field is deduped
    automatically to avoid a duplicate `State` declaration
  - Numeric-only enum values (e.g. tier levels `'1'`…`'5'`) are prefixed to
    produce valid GDScript identifiers (`TIER_1`…`TIER_5`)
- `godot/autoload/GameData.gd` — a `Node` singleton with one typed `Dictionary`
  constant per tag group, each entry `preload()`-ing the entity's `.tres` file

**Dependencies:** Phase 11a (`tags` for grouping entities into output directories)

**Acceptance criteria:**

- Generated `.tres` files load in Godot 4.x without errors ✓
- State machine states appear as `State` enum constants in corresponding `.gd` files ✓
- `GameData.gd` exposes typed dictionaries keyed by entity name ✓
- Generator fails loudly if the IR version it was built against changes ✓
- 11 passing tests covering version guard, empty schema, `.tres` format, SM
  metadata, enum generation, GameData structure, and `@generated` header ✓

---

## Phase 15 — Localized output for user-facing generators

Newel itself is a developer tool and is exempt from the workspace i18n rule: the CLI,
`validate` messages and internal design output (`generator-docs`, `generator-bible`,
`generator-typescript`, `generator-openapi`) stay English-only.

The exception is generators whose output reaches end users. The fabric is where the
player-facing text of downstream apps comes from (Project Nihon's item, creature and
skill names, its wiki, generated forms). Without localizable text in the fabric, those
apps keep a separate translation file that drifts from it. This phase lets the fabric
carry translations and makes the user-facing generators emit them.

**When:** schedule it when Project Nihon starts its "Localized fabric content" item
(`../project-nihon/ROADMAP.md`, Deferred). Nihon's UI translation (its Phase 123) does
not depend on this.

**What to build:**

- `@newel/core` — the fabric may declare `locales: string[]` and a `defaultLocale`;
  user-facing text fields (`label`, `description`, enum value labels, action labels)
  accept a plain string (default locale) or a `Record<locale, string>`. Each text gets
  a stable translation key derived from its IR path (`item.iron_ingot.name`). IR minor
  version bump; fabrics without `locales` are unaffected.
- `validate` — warns on a missing translation for a declared locale, naming the IR
  path (error with `--strict-i18n`).
- `generator-godot` — emits a Godot CSV translation catalog (one column per locale);
  `.tres` resources store keys, and `GameData` helpers resolve them with `tr()`.
- `generator-wiki` — one wiki tree per locale (`<out>/<locale>/...`), default locale at
  the root path for backward compatibility.
- `generator-ui` — forms and action panels use keys and ship one JSON message catalog
  per locale.
- Other generators read the default-locale text only.

**Dependencies:** none.

**Acceptance criteria:**

- A fabric without `locales` produces byte-identical output to the previous version
  (existing snapshot tests pass unchanged).
- A fabric with `locales: ["en", "pt-BR"]` produces a Godot catalog whose key set equals
  the IR's text keys, a per-locale wiki tree and per-locale UI catalogs.
- `validate --strict-i18n` fails on a missing translation and names the IR path.
- Keys are stable: changing a text does not change its key; renaming the entity does,
  and `diff` reports it.
- Tests cover the localized output of each of the three generators; CI green.

---

## Phase 16 — Financial application support (Money Moon) ✅ Done

Gaps found when planning to move `../money-moon` (Brazilian tax estimator) to a
fabric-first workflow. Money Moon's domain rules: money is `bigint` centavos,
rates are `bigint` basis points, never floating point; months are `"YYYY-MM"`
strings; every tax rule carries a source, validity window and review status.
Calculation logic stays hand-written: behaviors declare the typed contract
(input/output), the domain code implements it.

All sub-phases are additive (IR minor bump), except where noted.

### 16a — `bigint` and `money` field types ✅ Done

Add `'bigint'` and `'money'` to `FieldType`. `money` is a `bigint` amount in the
currency's minor unit, with an optional currency code:

```ts
// FieldSchema gains:
currency?: string // ISO 4217, e.g. 'BRL'; only valid on 'money'
```

**Acceptance criteria:**

- `generator-typescript`: TS `bigint`, Zod `z.bigint()`
- `generator-sql`: `BIGINT`; `generator-prisma`: `BigInt`
- `generator-jsonschema` / `generator-openapi`: `type: string` with an integer
  pattern (JSON has no safe bigint), `x-newel-type: money` + currency
- `generator-docs`: shows currency and "minor units" in the fields table
- Validator rejects `currency` on non-`money` fields
- Every generator with an exhaustive `FieldType` switch handles both types (tests)

### 16b — String constraints (`pattern`) ✅ Done

Add `pattern?: string` (regex source) to `FieldSchema`, for values such as
`YearMonth` (`^\d{4}-(0[1-9]|1[0-2])$`) or CNAE codes.

**Acceptance criteria:**

- Zod `.regex()`, JSON Schema / OpenAPI `pattern`, SQL `CHECK (col ~ '...')`
- Validator rejects patterns that fail `new RegExp()` and `pattern` on
  non-string fields

### 16c — Entity seed records ✅ Done

Reference tables (tax brackets, municipal fees, rule metadata) are data, not
code. Add optional seed rows to entities:

```ts
// EntitySchema gains:
seeds?: Record<string, unknown>[]
```

**Acceptance criteria:**

- Validator checks each seed against the entity's fields (types, enum values,
  pattern, required fields, foreign keys resolve to other seeds)
- `generator-sql`: idempotent `INSERT ... ON CONFLICT DO NOTHING` in a seed file
- `generator-typescript`: typed `as const` arrays (bigint literals for
  `bigint`/`money`), so pure domain code can import rule tables without I/O
- `generator-docs`: renders seeds as a table per entity (rule catalog with
  source, validity and status columns)
- `check-drift` covers seed output

### 16d — `generator-drizzle` ✅ Done

A new package `packages/generator-drizzle` emitting Drizzle ORM `pgTable`
schema files (Postgres), so Deno/Fresh projects (`money-moon`, `kayozen`) keep
Drizzle as their query layer.

**Dependencies:** 16a (bigint/money columns), 16b (CHECK constraints)

**Acceptance criteria:**

- One `<entity>.ts` per entity plus an `index.ts` barrel
- Field types map to Drizzle column builders (`bigint({ mode: 'bigint' })` for
  `bigint`/`money`, `pgEnum` for enums, `uuid().defaultRandom()` for uuid PKs)
- Relations emit `relations()` helpers; foreign keys emit `.references()`
- Output configurable: import specifier (`drizzle-orm/pg-core` vs `npm:` for
  Deno), output dir, casing
- Generated schema passes `drizzle-kit generate` without manual edits (test
  fixture)
- Generator fails loudly if the IR version it was built against changes

---

## Money Moon

`../money-moon` is the reference implementation for Phase 16. See
`../money-moon/docs/roadmap.md` (Fase 1.5) for the app-side migration plan.

---

## Project Nihon

Project Nihon is the reference implementation that drives these phases. See
`../project-nihon/ROADMAP.md` for the game-side roadmap that maps to the
Newel phases above.
