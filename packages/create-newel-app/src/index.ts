#!/usr/bin/env node
import * as fs from 'fs'
import * as path from 'path'
import * as child_process from 'child_process'
import prompts from 'prompts'
import kleur from 'kleur'

// ---------------------------------------------------------------------------
// Generator catalogue
// ---------------------------------------------------------------------------

interface GeneratorDef {
  id: string
  package: string
  className: string
  description: string
  dependsOn: string[]
  /** Runtime deps added to package.json dependencies */
  runtimeDeps: Record<string, string>
  /** Dev-only deps added to devDependencies */
  devDeps: Record<string, string>
  /** Extra scripts added to package.json scripts */
  scripts?: Record<string, string>
  /** Whether choosing this generator implies choosing others */
  impliedBy?: string[]
}

const GENERATORS: GeneratorDef[] = [
  {
    id: 'typescript',
    package: '@newel/generator-typescript',
    className: 'TypeScriptGenerator',
    description: 'TypeScript interfaces + Zod schemas',
    dependsOn: [],
    runtimeDeps: { zod: '^3.23.8' },
    devDeps: {},
  },
  {
    id: 'openapi',
    package: '@newel/generator-openapi',
    className: 'OpenApiGenerator',
    description: 'OpenAPI 3.x YAML spec',
    dependsOn: ['typescript'],
    runtimeDeps: {},
    devDeps: {},
  },
  {
    id: 'sql',
    package: '@newel/generator-sql',
    className: 'SqlGenerator',
    description: 'SQL DDL + safe incremental migrations',
    dependsOn: ['typescript'],
    runtimeDeps: {},
    devDeps: {},
  },
  {
    id: 'docs',
    package: '@newel/generator-docs',
    className: 'DocsGenerator',
    description: 'Markdown docs + GDPR data map',
    dependsOn: ['openapi', 'typescript'],
    runtimeDeps: {},
    devDeps: {},
  },
  {
    id: 'jsonschema',
    package: '@newel/generator-jsonschema',
    className: 'JsonSchemaGenerator',
    description: 'JSON Schema (draft-07)',
    dependsOn: [],
    runtimeDeps: {},
    devDeps: {},
  },
  {
    id: 'rdf',
    package: '@newel/generator-rdf',
    className: 'RdfGenerator',
    description: 'RDF / Turtle ontology',
    dependsOn: [],
    runtimeDeps: {},
    devDeps: {},
  },
  {
    id: 'owl',
    package: '@newel/generator-owl',
    className: 'OwlGenerator',
    description: 'OWL ontology (extends RDF)',
    dependsOn: ['rdf'],
    runtimeDeps: {},
    devDeps: {},
  },
  {
    id: 'ui',
    package: '@newel/generator-ui',
    className: 'UiGenerator',
    description: 'React entity forms + state-machine action buttons',
    dependsOn: ['typescript'],
    runtimeDeps: { react: '^18.3.1', 'react-dom': '^18.3.1' },
    devDeps: {
      '@types/react': '^18.3.5',
      '@types/react-dom': '^18.3.0',
      '@vitejs/plugin-react': '^4.3.1',
      vite: '^5.4.8',
    },
    scripts: {
      'dev:client': 'cd src/generated/app/client && vite',
    },
  },
  {
    id: 'prisma',
    package: '@newel/generator-prisma',
    className: 'PrismaGenerator',
    description: 'Prisma schema + typed repositories',
    dependsOn: ['typescript'],
    runtimeDeps: { '@prisma/client': '^5.22.0' },
    devDeps: { prisma: '^5.22.0' },
    scripts: {
      setup: 'prisma generate --schema src/generated/prisma/schema.prisma && prisma db push --schema src/generated/prisma/schema.prisma',
    },
  },
  {
    id: 'express',
    package: '@newel/generator-express',
    className: 'ExpressGenerator',
    description: 'Express router + typed handlers',
    dependsOn: ['typescript'],
    runtimeDeps: { express: '^4.21.2', cors: '^2.8.5', dotenv: '^16.4.5' },
    devDeps: { '@types/express': '^4.17.21', '@types/cors': '^2.8.17', tsx: '^4.19.2' },
    scripts: {
      'dev:server': 'tsx watch src/generated/app/server.ts',
      start: 'tsx src/generated/app/server.ts',
    },
  },
  {
    id: 'app',
    package: '@newel/generator-app',
    className: 'AppGenerator',
    description: 'Full-stack scaffold (Express + Vite React)',
    dependsOn: ['express', 'prisma', 'ui'],
    runtimeDeps: {
      express: '^4.21.2',
      cors: '^2.8.5',
      dotenv: '^16.4.5',
      '@prisma/client': '^5.22.0',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDeps: {
      '@types/express': '^4.17.21',
      '@types/cors': '^2.8.17',
      '@types/react': '^18.3.5',
      '@types/react-dom': '^18.3.0',
      '@vitejs/plugin-react': '^4.3.1',
      concurrently: '^8.2.2',
      prisma: '^5.22.0',
      tsx: '^4.19.2',
      vite: '^5.4.8',
    },
    scripts: {
      setup: 'prisma generate --schema src/generated/app/schema.prisma && prisma db push --schema src/generated/app/schema.prisma',
      'dev:server': 'tsx watch src/generated/app/server.ts',
      'dev:client': 'cd src/generated/app/client && vite',
      dev: 'concurrently -n server,client -c cyan,yellow "pnpm dev:server" "pnpm dev:client"',
      start: 'tsx src/generated/app/server.ts',
    },
  },
]

// ---------------------------------------------------------------------------
// Generator presets (curated bundles)
// ---------------------------------------------------------------------------

interface Preset {
  label: string
  description: string
  generatorIds: string[]
}

const PRESETS: Preset[] = [
  {
    label: 'Minimal — TypeScript types only',
    description: 'Interfaces + Zod schemas. Great starting point.',
    generatorIds: ['typescript'],
  },
  {
    label: 'API — TypeScript + OpenAPI + SQL',
    description: 'Types, OpenAPI spec, and SQL migrations for a backend service.',
    generatorIds: ['typescript', 'openapi', 'sql'],
  },
  {
    label: 'Full-stack — App scaffold (Express + React + Prisma)',
    description: 'Complete runnable app with backend API and React frontend.',
    generatorIds: ['typescript', 'openapi', 'sql', 'ui', 'prisma', 'express', 'app'],
  },
  {
    label: 'Semantic / data — RDF + OWL + JSON Schema',
    description: 'Ontology and schema formats for semantic web or data validation.',
    generatorIds: ['typescript', 'rdf', 'owl', 'jsonschema'],
  },
  {
    label: 'Custom — pick generators manually',
    description: 'Choose exactly which generators to include.',
    generatorIds: [],
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTransitiveDeps(ids: string[]): string[] {
  const set = new Set<string>()
  const visit = (id: string) => {
    if (set.has(id)) return
    set.add(id)
    const gen = GENERATORS.find(g => g.id === id)
    if (gen) gen.dependsOn.forEach(visit)
  }
  ids.forEach(visit)
  return Array.from(set)
}

function detectPackageManager(): 'pnpm' | 'yarn' | 'npm' {
  const agent = process.env['npm_config_user_agent'] ?? ''
  if (agent.startsWith('pnpm')) return 'pnpm'
  if (agent.startsWith('yarn')) return 'yarn'
  return 'npm'
}

function run(cmd: string, cwd: string): void {
  child_process.execSync(cmd, { cwd, stdio: 'inherit' })
}

function writeFileSafe(filePath: string, content: string, overwrite: boolean): boolean {
  if (fs.existsSync(filePath) && !overwrite) return false
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  return true
}

// ---------------------------------------------------------------------------
// Template builders
// ---------------------------------------------------------------------------

function buildPackageJson(opts: {
  name: string
  description: string
  generatorIds: string[]
  packageManager: string
}): string {
  const allIds = resolveTransitiveDeps(opts.generatorIds)
  const gens = GENERATORS.filter(g => allIds.includes(g.id))

  const deps: Record<string, string> = {
    '@newel/core': 'latest',
    zod: '^3.23.8',
  }
  const devDeps: Record<string, string> = {
    typescript: '^5.4.0',
    '@types/node': '^20.0.0',
    tsx: '^4.19.2',
  }
  const scripts: Record<string, string> = {
    validate: 'newel validate -s ./src/fabric.ts',
    inspect: 'newel inspect -s ./src/fabric.ts',
    generate: 'newel generate -c ./newel.config.ts',
    diff: 'newel diff -c ./newel.config.ts',
    'check-drift': 'newel check-drift -c ./newel.config.ts',
  }

  for (const gen of gens) {
    deps[gen.package] = 'latest'
    Object.assign(deps, gen.runtimeDeps)
    Object.assign(devDeps, gen.devDeps)
    Object.assign(scripts, gen.scripts ?? {})
  }

  return JSON.stringify(
    {
      name: opts.name,
      version: '0.1.0',
      private: true,
      description: opts.description,
      scripts,
      dependencies: sortObject(deps),
      devDependencies: sortObject(devDeps),
      engines: { node: '>=20' },
    },
    null,
    2,
  ) + '\n'
}

function buildQuoinConfig(generatorIds: string[]): string {
  const allIds = resolveTransitiveDeps(generatorIds)
  const gens = GENERATORS.filter(g => allIds.includes(g.id))

  const imports = [
    `import { defineConfig } from '@newel/core'`,
    ...gens.map(g => `import { ${g.className} } from '${g.package}'`),
  ].join('\n')

  // Express with prisma ORM option
  const hasApp = allIds.includes('app')
  const hasPrisma = allIds.includes('prisma')
  const hasExpress = allIds.includes('express')

  const genLines = gens.map(g => {
    if (g.id === 'express' && hasPrisma && !hasApp) {
      return `    new ${g.className}({ orm: 'prisma' }),`
    }
    return `    new ${g.className}(),`
  })

  return `${imports}

export default defineConfig({
  schema: './src/fabric.ts',
  output: './src/generated',
  generators: [
${genLines.join('\n')}
  ],
})
`
}

function buildFabricTs(appName: string, appDescription: string): string {
  return `import { defineFabric, defineEntity, defineApi } from '@newel/core'

export default defineFabric({
  meta: {
    name: '${appName}',
    description: '${appDescription}',
    version: '1.0.0',
  },

  entities: {
    // Define your entities here. Each entity maps to a database table and
    // generates TypeScript interfaces, Zod schemas, SQL DDL, and more.
    User: defineEntity({
      description: 'A registered user of the application',

      fields: {
        id:        { type: 'uuid',      primaryKey: true },
        email:     { type: 'email',     pii: true, gdpr: { category: 'contact', legalBasis: 'contract' } },
        name:      { type: 'string',    pii: true, gdpr: { category: 'identity' } },
        status:    { type: 'enum',      values: ['active', 'suspended'] },
        createdAt: { type: 'timestamp' },
      },

      stateMachine: {
        field: 'status',
        initial: 'active',
        states: {
          active:    'User can log in and perform actions',
          suspended: { description: 'Account suspended by admin', terminal: false },
        },
        transitions: [
          { from: 'active',    to: 'suspended', trigger: 'suspend',   guard: 'Only admins may suspend users' },
          { from: 'suspended', to: 'active',    trigger: 'reinstate', guard: 'Only admins may reinstate users' },
        ],
      },

      behaviors: {
        suspend: {
          description: 'Suspend the user account',
          rules: ['Only admins may suspend users'],
          input: { reason: { type: 'string', description: 'Why the account was suspended' } },
          auth: { roles: ['admin'] },
        },
        reinstate: {
          description: 'Re-activate a suspended account',
          rules: ['Only admins may reinstate users'],
          auth: { roles: ['admin'] },
        },
      },
    }),
  },

  apis: {
    UserAPI: defineApi({
      baseUrl: '/users',
      endpoints: {
        'GET /':              { returns: 'User',  description: 'List all users',      auth: { roles: ['admin'] } },
        'GET /:id':           { returns: 'User',  description: 'Get a single user',   auth: { roles: ['admin', 'user'] } },
        'POST /:id/suspend':  { behavior: 'User.suspend',    description: 'Suspend a user account' },
        'POST /:id/reinstate':{ behavior: 'User.reinstate',  description: 'Reinstate a user account' },
      },
    }),
  },
})
`
}

function buildGitignore(): string {
  return `node_modules/
dist/
src/generated/
*.js.map
.env
.env.local
`
}

function sortObject(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

interface ScaffoldOptions {
  targetDir: string
  appName: string
  appDescription: string
  generatorIds: string[]
  packageManager: 'pnpm' | 'yarn' | 'npm'
  runInstall: boolean
}

async function promptUser(cliDir?: string): Promise<ScaffoldOptions | null> {
  const detectedPm = detectPackageManager()

  let targetDir = cliDir ?? ''

  if (!targetDir) {
    const res = await prompts({
      type: 'text',
      name: 'dir',
      message: 'Where should we create your project?',
      initial: './my-newel-app',
      validate: v => (v.trim() ? true : 'Please enter a directory name'),
    })
    if (res.dir === undefined) return null
    targetDir = res.dir as string
  }

  const defaultName = path.basename(path.resolve(targetDir)).replace(/[^a-z0-9-]/gi, '-').toLowerCase()

  const basics = await prompts([
    {
      type: 'text',
      name: 'appName',
      message: 'Project name',
      initial: defaultName,
      validate: (v: string) => (/^[a-z0-9][a-z0-9-]*$/.test(v) ? true : 'Use lowercase letters, numbers, and hyphens only'),
    },
    {
      type: 'text',
      name: 'appDescription',
      message: 'Short description',
      initial: 'My newel application',
    },
  ])

  if (basics.appName === undefined) return null

  // --- Preset selection ---
  const presetRes = await prompts({
    type: 'select',
    name: 'preset',
    message: 'Which generators would you like to include?',
    choices: PRESETS.map((p, i) => ({
      title: p.label,
      description: p.description,
      value: i,
    })),
    initial: 0,
  })

  if (presetRes.preset === undefined) return null

  const preset = PRESETS[presetRes.preset as number]

  let selectedIds: string[]

  if (preset.generatorIds.length === 0) {
    // Custom selection
    const customRes = await prompts({
      type: 'multiselect',
      name: 'ids',
      message: 'Select generators to include',
      choices: GENERATORS.map(g => ({
        title: g.id,
        description: `${g.description} (${g.package})`,
        value: g.id,
        selected: g.id === 'typescript',
      })),
      min: 1,
      hint: '- Space to select, Return to confirm',
    })
    if (customRes.ids === undefined) return null
    selectedIds = customRes.ids as string[]
  } else {
    selectedIds = preset.generatorIds
  }

  // Resolve transitive deps and show what was added
  const resolved = resolveTransitiveDeps(selectedIds)
  const added = resolved.filter(id => !selectedIds.includes(id))
  if (added.length > 0) {
    console.log(kleur.dim(`  → Also including required generators: ${added.join(', ')}`))
  }

  // --- Package manager ---
  const pmRes = await prompts({
    type: 'select',
    name: 'pm',
    message: 'Package manager',
    choices: [
      { title: 'pnpm', value: 'pnpm' },
      { title: 'npm', value: 'npm' },
      { title: 'yarn', value: 'yarn' },
    ],
    initial: detectedPm === 'pnpm' ? 0 : detectedPm === 'npm' ? 1 : 2,
  })
  if (pmRes.pm === undefined) return null

  const installRes = await prompts({
    type: 'confirm',
    name: 'install',
    message: `Install dependencies with ${pmRes.pm as string}?`,
    initial: true,
  })
  if (installRes.install === undefined) return null

  return {
    targetDir,
    appName: basics.appName as string,
    appDescription: basics.appDescription as string,
    generatorIds: resolved,
    packageManager: pmRes.pm as 'pnpm' | 'yarn' | 'npm',
    runInstall: installRes.install as boolean,
  }
}

// ---------------------------------------------------------------------------
// Scaffolding
// ---------------------------------------------------------------------------

function scaffold(opts: ScaffoldOptions): void {
  const root = path.resolve(opts.targetDir)
  const srcDir = path.join(root, 'src')

  const conflicts: string[] = []
  const check = (p: string) => { if (fs.existsSync(p)) conflicts.push(path.relative(root, p)) }
  check(path.join(root, 'package.json'))
  check(path.join(root, 'newel.config.ts'))
  check(path.join(srcDir, 'fabric.ts'))

  if (conflicts.length > 0) {
    console.error(kleur.red('\n  Aborted — the following files already exist:'))
    for (const f of conflicts) console.error(kleur.red(`    ${f}`))
    console.error(kleur.dim('  Delete them or choose a different directory.\n'))
    process.exit(1)
  }

  fs.mkdirSync(srcDir, { recursive: true })

  const files: Array<[string, string]> = [
    [path.join(root, 'package.json'), buildPackageJson({
      name: opts.appName,
      description: opts.appDescription,
      generatorIds: opts.generatorIds,
      packageManager: opts.packageManager,
    })],
    [path.join(root, 'newel.config.ts'), buildQuoinConfig(opts.generatorIds)],
    [path.join(srcDir, 'fabric.ts'), buildFabricTs(opts.appName, opts.appDescription)],
    [path.join(root, '.gitignore'), buildGitignore()],
    [path.join(root, 'tsconfig.json'), buildTsConfig()],
  ]

  for (const [filePath, content] of files) {
    fs.writeFileSync(filePath, content)
  }

  console.log(kleur.green('\n  Created files:'))
  for (const [filePath] of files) {
    console.log(kleur.dim(`    ${path.relative(root, filePath)}`))
  }
}

function buildTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        lib: ['ES2022'],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: 'dist',
        rootDir: 'src',
        declaration: true,
      },
      include: ['src', 'newel.config.ts'],
      exclude: ['node_modules', 'dist', 'src/generated'],
    },
    null,
    2,
  ) + '\n'
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

function installDeps(opts: ScaffoldOptions): void {
  const root = path.resolve(opts.targetDir)
  const pmInstall: Record<string, string> = {
    pnpm: 'pnpm install',
    npm: 'npm install',
    yarn: 'yarn install',
  }
  const cmd = pmInstall[opts.packageManager]
  console.log(kleur.cyan(`\n  Running ${cmd}...\n`))
  run(cmd, root)
}

// ---------------------------------------------------------------------------
// Post-install summary
// ---------------------------------------------------------------------------

function printNextSteps(opts: ScaffoldOptions): void {
  const isCurrentDir = path.resolve(opts.targetDir) === process.cwd()
  const hasApp = opts.generatorIds.includes('app')
  const hasPrisma = opts.generatorIds.includes('prisma')

  console.log(kleur.green('\n  Done! Next steps:\n'))

  if (!isCurrentDir) {
    console.log(kleur.white(`    cd ${opts.targetDir}`))
  }
  if (!opts.runInstall) {
    console.log(kleur.white(`    ${opts.packageManager} install`))
  }
  console.log(kleur.white('    newel validate       # check your fabric for errors'))
  console.log(kleur.white('    newel inspect        # view the resolved IR'))
  console.log(kleur.white('    newel generate       # generate all artifacts'))
  if (hasPrisma || hasApp) {
    console.log(kleur.white(`    ${opts.packageManager} run setup          # run Prisma migrations`))
  }
  if (hasApp) {
    console.log(kleur.white(`    ${opts.packageManager} run dev             # start the full-stack dev server`))
  }
  console.log()
  console.log(kleur.dim('  Edit src/fabric.ts to describe your application, then run newel generate.'))
  console.log()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log()
  console.log(kleur.bold('  create-newel-app') + kleur.dim(' — scaffold a newel project\n'))

  // Accept target directory as first CLI arg (mirrors create-next-app / create-vite UX)
  const cliDir = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : undefined

  const opts = await promptUser(cliDir)

  if (!opts) {
    console.log(kleur.yellow('\n  Cancelled.\n'))
    process.exit(0)
  }

  scaffold(opts)

  if (opts.runInstall) {
    installDeps(opts)
  }

  printNextSteps(opts)
}

main().catch(err => {
  console.error(kleur.red('\n  Error:'), err instanceof Error ? err.message : String(err))
  process.exit(1)
})
