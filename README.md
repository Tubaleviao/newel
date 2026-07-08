# quoin

Write one file. Generate everything.

**quoin** is a TypeScript library + CLI that lets you describe your entire application — its data model, behaviors, state machines, and API — in a single declarative `fabric.ts` file, then automatically generate all the artifacts you need: TypeScript types, Zod schemas, SQL migrations, OpenAPI specs, Markdown docs, GDPR data maps, RDF/OWL ontologies, and more.

---

## Why quoin?

| Tool | Data shape | DB + client | Behavior | Semantic meaning |
|------|:---:|:---:|:---:|:---:|
| LinkML | ✅ | ❌ | ❌ | ✅ |
| Prisma | ✅ | ✅ | ❌ | ❌ |
| XState | ❌ | ❌ | ✅ | ❌ |
| **quoin** | ✅ | ✅ | ✅ | ✅ |

---

## Getting started

### Scaffold a new project (recommended)

Run the interactive scaffold — no global install required:

```bash
npx create-quoin-app my-app
# or
pnpm create quoin-app my-app
```

The wizard asks a few questions:

```
  create-quoin-app — scaffold a quoin project

  ✔ Project name          › my-app
  ✔ Short description     › My quoin application
  ✔ Generators            › Full-stack — App scaffold (Express + React + Prisma)
  ✔ Package manager       › pnpm
  ✔ Install dependencies? › Yes
```

It then creates:

| File | Purpose |
|------|---------|
| `package.json` | Scripts + all required dependencies for the chosen generators |
| `quoin.config.ts` | Generator configuration wired up and ready |
| `src/fabric.ts` | Starter schema with a `User` entity and state machine |
| `tsconfig.json` | TypeScript configuration |
| `.gitignore` | Ignores `node_modules/`, `dist/`, and `src/generated/` |

**Available presets:**

| Preset | Included generators |
|--------|---------------------|
| Minimal | `typescript` |
| API | `typescript`, `openapi`, `sql` |
| Full-stack | `typescript`, `openapi`, `sql`, `ui`, `prisma`, `express`, `app` |
| Semantic / data | `typescript`, `rdf`, `owl`, `jsonschema` |
| Custom | Pick any combination interactively |

After scaffolding:

```bash
cd my-app
quoin generate       # generate all artifacts
# if you chose a full-stack preset:
pnpm run setup       # run Prisma migrations
pnpm run dev         # start Express + Vite dev servers
```

---

## Manual installation

For adding quoin to an existing project, install as dev dependencies:

```bash
npm install -D @quoin/core @quoin/generator-typescript
# or
pnpm add -D @quoin/core @quoin/generator-typescript
```

---

## Quick start

### 1. Write `src/fabric.ts`

This is the only file you author. It is never generated.

```typescript
import { fabric } from '@quoin/core'

export default fabric()
  .meta(m => m
    .name('MyApp')
    .description('My application schema')
  )

  .entity('User', e => e
    .description('A registered user')
    .goal('Track user identity and authentication state')

    .field('id',        f => f.uuid().primaryKey())
    .field('email',     f => f.email().pii().gdpr('contact').gdprRetention('7y').gdprLegalBasis('contract'))
    .field('name',      f => f.string())
    .field('status',    f => f.enum(['active', 'suspended', 'deleted']))
    .field('createdAt', f => f.timestamp())

    .stateMachine('status', sm => sm
      .initial('active')
      .state('active',    s => s.description('User can log in and use the app'))
      .state('suspended', s => s.description('Temporarily blocked'))
      .state('deleted',   s => s.description('Soft-deleted, data retained for compliance').terminal())

      .transition(t => t.from('active').to('suspended').trigger('suspend')
        .guard('Only an admin may suspend a user'))
      .transition(t => t.from('suspended').to('active').trigger('reinstate')
        .guard('Only an admin may reinstate a user'))
      .transition(t => t.from(['active', 'suspended']).to('deleted').trigger('delete')
        .effect('Anonymises PII fields after retention period'))
    )

    .behavior('suspend', b => b
      .description('Temporarily blocks a user from accessing the app')
      .rule('Only an admin may suspend a user')
      .auth(a => a.roles('admin'))
    )
    .behavior('reinstate', b => b
      .description('Restores access for a suspended user')
      .rule('Only an admin may reinstate a user')
      .auth(a => a.roles('admin'))
    )
    .behavior('delete', b => b
      .description('Soft-deletes a user account')
      .auth(a => a.roles('admin'))
    )
  )

  .api('UserAPI', a => a
    .endpoint('GET /users/:id',      ep => ep.returns('User').auth(a => a.roles('admin')))
    .endpoint('POST /users/:id/suspend',   ep => ep.behavior('User.suspend'))
    .endpoint('POST /users/:id/reinstate', ep => ep.behavior('User.reinstate'))
    .endpoint('DELETE /users/:id',         ep => ep.behavior('User.delete'))
  )
```

### 2. Create `quoin.config.ts` in your project root

```typescript
import { defineConfig } from '@quoin/core'
import { TypeScriptGenerator } from '@quoin/generator-typescript'

export default defineConfig({
  schema: './src/fabric.ts',
  output: './src/generated',
  generators: [
    new TypeScriptGenerator(),
  ],
})
```

### 3. Add scripts to `package.json`

Run quoin through your local install, not `npx`, so you always use the exact version you have pinned.

```json
{
  "scripts": {
    "validate":    "quoin validate",
    "inspect":     "quoin inspect",
    "generate":    "quoin generate",
    "check-drift": "quoin check-drift"
  }
}
```

Then run:

```bash
# Validate fabric.ts — no files written
npm run validate

# Print the full Internal Representation as JSON
npm run inspect

# Generate all artifacts
npm run generate

# Check if any generated file was manually edited
npm run check-drift
```

After `generate`, `src/generated/typescript/index.ts` contains:

```typescript
// @generated by @quoin/generator-typescript — do not edit

import { z } from 'zod'

export enum UserState {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export interface User {
  id: string
  email: string
  name: string
  status: 'active' | 'suspended' | 'deleted'
  createdAt: Date
}

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  status: z.enum(['active', 'suspended', 'deleted']),
  createdAt: z.date(),
})
```

---

## Available generators

| Package | Output | Depends on |
|---------|--------|------------|
| `@quoin/generator-typescript` | TS interfaces + Zod schemas | — |
| `@quoin/generator-openapi` | OpenAPI 3.x YAML | `typescript` |
| `@quoin/generator-sql` | Safe incremental SQL migrations via IR diff | `typescript` |
| `@quoin/generator-docs` | Markdown docs + GDPR data map | `openapi`, `typescript` |
| `@quoin/generator-jsonschema` | JSON Schema draft-07 per entity | — |
| `@quoin/generator-rdf` | RDF/Turtle ontology | — |
| `@quoin/generator-owl` | OWL ontology (extends RDF output) | `rdf` |
| `@quoin/generator-ui` | React forms + state-machine-aware action buttons | `typescript` |
| `@quoin/generator-prisma` | Prisma schema + typed repositories | `typescript` |
| `@quoin/generator-express` | Express router + typed handlers | `typescript` (or `prisma`) |
| `@quoin/generator-app` | Full-stack scaffold (Express + Vite React) | `express`, `prisma`, `ui` |

---

## Writing a custom generator

Any package can implement the `Generator` interface:

```typescript
import type { Generator, GeneratorContext, GeneratorOutput, FabricSchema } from '@quoin/core'

export class MyGenerator implements Generator {
  readonly name = 'my-generator'
  readonly dependsOn: string[] = [] // or ['typescript'] to receive its output

  async generate(schema: FabricSchema, ctx: GeneratorContext): Promise<GeneratorOutput> {
    const lines = Object.values(schema.entities).map(e => `entity: ${e.name}`)
    return {
      files: [{
        path: 'my-output/entities.txt',
        content: lines.join('\n'),
        header: '# @generated — do not edit\n',
      }],
    }
  }
}
```

Register it in `quoin.config.ts`:

```typescript
import { defineConfig } from '@quoin/core'
import { MyGenerator } from './my-generator'

export default defineConfig({
  schema: './src/fabric.ts',
  output: './src/generated',
  generators: [new MyGenerator()],
})
```

Generators declare `dependsOn` to access upstream outputs via `ctx.outputs`. The runner builds a DAG, topologically sorts it, and fails fast on circular dependencies.

---

## Design principles

1. **One source of truth.** `fabric.ts` is the only file that describes what your application is. Nothing else is authoritative.
2. **Generated files are never edited.** Every generated file carries a `@generated` header. The `check-drift` command enforces this.
3. **Customize without touching generated files.** Write a `fabric.patches.ts` to override field metadata, suppress files, or append imports. The runner applies patches to the IR before generation — drift detection stays meaningful.
4. **No runtime dependency.** `fabric.ts` calls `toIR()` at build time and returns a plain JSON object. Your application never imports `@quoin/core` at runtime.
5. **Declarative by design.** Guards, effects, and rules are strings — meaning, not code. Generators interpret them however they need to. Transition guards are automatically derived from their linked behavior's rules, eliminating duplication.
6. **Safe incremental migrations.** The SQL generator diffs IR snapshots across runs — new columns, enum additions, and renames are detected; dropped columns go to a `-- MANUAL REVIEW` block rather than being silently dropped.
7. **Open generator ecosystem.** Publish `quoin-generator-*` to npm. The runner discovers generators through `quoin.config.ts` — no registration required.

---

## License

MIT
