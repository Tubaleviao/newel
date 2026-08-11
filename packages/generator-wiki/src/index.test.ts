import { WikiGenerator } from './index'
import type { FabricSchema, GeneratorContext, GeneratorOutput } from '@newel/core'

const makeCtx = (): GeneratorContext => ({
  outputDir: '/tmp/test-wiki',
  outputs: new Map<string, GeneratorOutput>(),
})

const minimalSchema: FabricSchema = {
  version: '3.0.0',
  meta: { name: 'TestGame', version: '0.1.0' },
  entities: {},
  apis: {},
}

const richSchema: FabricSchema = {
  version: '3.0.0',
  meta: { name: 'TestGame', description: 'A test game wiki', version: '0.1.0' },
  entities: {
    ForestBoar: {
      name: 'ForestBoar',
      tags: ['creature'],
      description: 'A wild boar that roams the temperate forest.',
      fields: {
        id: {
          name: 'id',
          type: 'uuid',
          nullable: false,
          primaryKey: true,
          pii: false,
          description: 'Internal ID',
        },
        tier: {
          name: 'tier',
          type: 'integer',
          nullable: false,
          primaryKey: false,
          pii: false,
          description: 'Difficulty tier',
        },
        status: {
          name: 'status',
          type: 'enum',
          nullable: false,
          primaryKey: false,
          pii: false,
          enumValues: ['idle', 'aggressive', 'dead'],
        },
      },
      relations: {
        biome: { name: 'biome', kind: 'belongsTo', target: 'TemperateForest' },
      },
      behaviors: {
        attack: {
          name: 'attack',
          description: 'The boar charges at a target.',
          rules: ['Target must be in range'],
          auth: { roles: ['system'] },
        },
      },
      stateMachine: {
        field: 'status',
        initial: 'idle',
        states: {
          idle: { name: 'idle', description: 'Grazing peacefully', terminal: false },
          aggressive: { name: 'aggressive', description: 'Charging the player', terminal: false },
          dead: { name: 'dead', description: 'Defeated', terminal: true },
        },
        transitions: [
          { from: 'idle', to: 'aggressive', trigger: 'detect', guards: [], effects: [] },
          { from: 'aggressive', to: 'dead', trigger: 'die', guards: [], effects: [] },
        ],
      },
      pii: [],
      gdpr: {},
    },
    TemperateForest: {
      name: 'TemperateForest',
      tags: ['biome'],
      description: 'A lush temperate forest.',
      fields: {},
      relations: {},
      behaviors: {},
      pii: [],
      gdpr: {},
    },
  },
  apis: {},
}

describe('WikiGenerator', () => {
  it('has name "wiki" and depends on "bible"', () => {
    const gen = new WikiGenerator()
    expect(gen.name).toBe('wiki')
    expect(gen.dependsOn).toEqual(['bible'])
  })

  it('produces only an index for an empty schema', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(minimalSchema, makeCtx())
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('wiki/index.md')
  })

  it('produces entity pages plus an index', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('wiki/index.md')
    expect(paths).toContain('wiki/entities/forestboar.md')
    expect(paths).toContain('wiki/entities/temperateforest.md')
    expect(result.files).toHaveLength(3)
  })

  it('entity page has VitePress frontmatter with title', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.content).toMatch(/^---\ntitle: "ForestBoar"\n---/)
  })

  it('index page has VitePress frontmatter with title', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const index = result.files.find((f) => f.path === 'wiki/index.md')!
    expect(index.content).toMatch(/^---\ntitle: "TestGame"\n---/)
  })

  it('entity page omits primary-key fields', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.content).not.toContain('| id |')
    expect(boarPage.content).toContain('tier')
  })

  it('entity page includes state machine diagram', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.content).toContain('stateDiagram-v2')
    expect(boarPage.content).toContain('idle --> aggressive : detect')
    expect(boarPage.content).toContain('dead --> [*]')
  })

  it('entity page includes behaviors with player-facing section heading', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.content).toContain('## Actions')
    expect(boarPage.content).toContain('The boar charges at a target.')
  })

  it('entity page cross-links to related entities', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.content).toContain('[TemperateForest](temperateforest.md)')
  })

  it('index groups entities by first tag', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const index = result.files.find((f) => f.path === 'wiki/index.md')!
    expect(index.content).toContain('## Biome')
    expect(index.content).toContain('## Creature')
    expect(index.content).toContain('[ForestBoar](entities/forestboar.md)')
  })

  it('hiddenSections suppresses stateMachine', async () => {
    const gen = new WikiGenerator({ hiddenSections: ['stateMachine'] })
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.content).not.toContain('stateDiagram-v2')
  })

  it('hiddenSections suppresses behaviors', async () => {
    const gen = new WikiGenerator({ hiddenSections: ['behaviors'] })
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.content).not.toContain('## Actions')
  })

  it('hiddenSections suppresses fields', async () => {
    const gen = new WikiGenerator({ hiddenSections: ['fields'] })
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.content).not.toContain('## Attributes')
  })

  it('entity page includes @generated header', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.header).toContain('@generated by @newel/generator-wiki')
  })
})
