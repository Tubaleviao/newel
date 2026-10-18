import { TypeScriptGenerator } from './index'
import type { FabricSchema, GeneratorContext, GeneratorOutput } from '@newel/core'

const makeCtx = (): GeneratorContext => ({
  outputDir: '/tmp/test-typescript',
  outputs: new Map<string, GeneratorOutput>(),
})

const richSchema: FabricSchema = {
  version: '3.0.0',
  meta: { name: 'LibraryApp', version: '1.0.0' },
  entities: {
    Book: {
      name: 'Book',
      tags: [],
      description: 'A book in the catalogue',
      fields: {
        id: { name: 'id', type: 'uuid', nullable: false, primaryKey: true, pii: false },
        title: { name: 'title', type: 'string', nullable: false, primaryKey: false, pii: false },
        status: {
          name: 'status',
          type: 'enum',
          nullable: false,
          primaryKey: false,
          pii: false,
          enumValues: ['available', 'borrowed'],
        },
        email: {
          name: 'email',
          type: 'email',
          nullable: true,
          primaryKey: false,
          pii: true,
          gdprCategory: 'contact',
        },
      },
      relations: {},
      behaviors: {},
      pii: ['email'],
      gdpr: { email: 'contact' },
      stateMachine: {
        field: 'status',
        initial: 'available',
        states: {
          available: { name: 'available', description: 'On shelf', terminal: false },
          borrowed: { name: 'borrowed', description: 'With member', terminal: false },
        },
        transitions: [
          { from: 'available', to: 'borrowed', trigger: 'borrow', guards: [], effects: [] },
        ],
      },
    },
    Member: {
      name: 'Member',
      tags: [],
      description: 'A library member',
      fields: {
        id: { name: 'id', type: 'uuid', nullable: false, primaryKey: true, pii: false },
        name: { name: 'name', type: 'string', nullable: false, primaryKey: false, pii: false },
      },
      relations: {},
      behaviors: {},
      pii: [],
      gdpr: {},
    },
  },
  apis: {},
}

describe('TypeScriptGenerator', () => {
  it('generates a single file at typescript/index.ts', async () => {
    const gen = new TypeScriptGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('typescript/index.ts')
  })

  it('includes zod import', async () => {
    const gen = new TypeScriptGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    expect(result.files[0].content).toContain("import { z } from 'zod'")
  })

  it('generates TypeScript interface for each entity', async () => {
    const gen = new TypeScriptGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const content = result.files[0].content
    expect(content).toContain('export interface Book {')
    expect(content).toContain('export interface Member {')
  })

  it('generates Zod schema for each entity', async () => {
    const gen = new TypeScriptGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const content = result.files[0].content
    expect(content).toContain('export const bookSchema = z.object({')
    expect(content).toContain('export const memberSchema = z.object({')
  })

  it('generates state enum for entities with stateMachine', async () => {
    const gen = new TypeScriptGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const content = result.files[0].content
    expect(content).toContain('export enum BookState {')
    expect(content).toContain("AVAILABLE = 'available'")
    expect(content).toContain("BORROWED = 'borrowed'")
    expect(content).not.toContain('MemberState')
  })

  it('wraps each entity in VS Code #region / #endregion markers', async () => {
    const gen = new TypeScriptGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const content = result.files[0].content
    expect(content).toContain('// #region Book')
    expect(content).toContain('// #endregion Book')
    expect(content).toContain('// #region Member')
    expect(content).toContain('// #endregion Member')
  })

  it('places the interface and schema inside the region markers', async () => {
    const gen = new TypeScriptGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const content = result.files[0].content
    const regionStart = content.indexOf('// #region Book')
    const regionEnd = content.indexOf('// #endregion Book')
    const ifacePos = content.indexOf('export interface Book {')
    const schemaPos = content.indexOf('export const bookSchema')
    expect(regionStart).toBeLessThan(ifacePos)
    expect(ifacePos).toBeLessThan(regionEnd)
    expect(schemaPos).toBeLessThan(regionEnd)
  })

  it('marks nullable fields as optional in the interface', async () => {
    const gen = new TypeScriptGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const content = result.files[0].content
    expect(content).toMatch(/email\?:/)
    expect(content).not.toMatch(/title\?:/)
  })

  it('maps enum fields to a string union type', async () => {
    const gen = new TypeScriptGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const content = result.files[0].content
    expect(content).toContain('"available" | "borrowed"')
  })

  it('exposes artifacts with entity names', async () => {
    const gen = new TypeScriptGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    expect(result.artifacts?.['entities']).toEqual(expect.arrayContaining(['Book', 'Member']))
  })
})

const finSchema: FabricSchema = {
  version: '3.0.0',
  meta: { name: 'Fin', version: '0.1.0' },
  entities: {
    Charge: {
      name: 'Charge',
      tags: [],
      fields: {
        id: { name: 'id', type: 'uuid', nullable: false, primaryKey: true, pii: false },
        amount: {
          name: 'amount',
          type: 'money',
          currency: 'BRL',
          nullable: false,
          primaryKey: false,
          pii: false,
        },
        count: { name: 'count', type: 'bigint', nullable: false, primaryKey: false, pii: false },
        period: {
          name: 'period',
          type: 'string',
          pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
          nullable: false,
          primaryKey: false,
          pii: false,
        },
      },
      relations: {},
      behaviors: {},
      pii: [],
      gdpr: {},
    },
  },
  apis: {},
}

describe('TypeScriptGenerator money/bigint/pattern', () => {
  it('handles money, bigint and pattern fields', async () => {
    const result = await new TypeScriptGenerator().generate(finSchema, {
      outputDir: '/tmp/fin',
      outputs: new Map<string, GeneratorOutput>(),
    })
    const text = result.files.map((f) => f.content).join('\n')
    expect(text).toContain('amount: z.bigint()')
    expect(text).toContain('count: z.bigint()')
    expect(text).toContain('amount: bigint')
    expect(text).toContain('.regex(new RegExp(')
  })
})

describe('TypeScriptGenerator seeds', () => {
  it('emits typed as-const arrays with bigint literals', async () => {
    const schema: FabricSchema = {
      version: '3.0.0',
      meta: { name: 'S', version: '0.1.0' },
      entities: {
        Rate: {
          name: 'Rate',
          tags: [],
          fields: {
            code: { name: 'code', type: 'string', nullable: false, primaryKey: false, pii: false },
            bps: { name: 'bps', type: 'bigint', nullable: false, primaryKey: false, pii: false },
          },
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
          seeds: [{ code: 'x', bps: '600' }],
        },
      },
      apis: {},
    }
    const result = await new TypeScriptGenerator().generate(schema, {
      outputDir: '/tmp/s',
      outputs: new Map<string, GeneratorOutput>(),
    })
    const text = result.files[0].content
    expect(text).toContain('export const rateSeeds = [')
    expect(text).toContain('{ code: "x", bps: 600n },')
    expect(text).toContain('] as const')
  })
})
