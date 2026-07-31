import { BibleGenerator } from './index'
import type { FabricSchema, GeneratorContext, GeneratorOutput } from '@newel/core'

const makeCtx = (): GeneratorContext => ({
  outputDir: '/tmp/test-bible',
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
  meta: { name: 'TestGame', description: 'A test game design bible', version: '0.1.0' },
  entities: {
    ForestBoar: {
      name: 'ForestBoar',
      tags: ['creature'],
      description: 'A wild boar that roams the temperate forest.',
      fields: {
        tier: {
          name: 'tier',
          type: 'integer',
          nullable: false,
          primaryKey: false,
          pii: false,
          description: 'Difficulty tier',
        },
        baseHp: {
          name: 'baseHp',
          type: 'integer',
          nullable: false,
          primaryKey: false,
          pii: false,
          description: 'Base hit points',
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
        drop: {
          name: 'drop',
          description: 'Drops loot on death.',
          rules: [],
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
          { from: 'aggressive', to: 'dead', trigger: 'die', guards: [], effects: ['drop'] },
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

describe('BibleGenerator', () => {
  it('has name "bible" and no dependencies', () => {
    const gen = new BibleGenerator()
    expect(gen.name).toBe('bible')
    expect(gen.dependsOn).toEqual([])
  })

  it('produces only an index for an empty schema', async () => {
    const gen = new BibleGenerator()
    const result = await gen.generate(minimalSchema, makeCtx())
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('bible/index.md')
  })

  it('produces entity pages plus an index', async () => {
    const gen = new BibleGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('bible/index.md')
    expect(paths).toContain('bible/entities/forestboar.md')
    expect(paths).toContain('bible/entities/temperateforest.md')
    expect(result.files).toHaveLength(3)
  })

  it('entity page includes a Mermaid state machine diagram', async () => {
    const gen = new BibleGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'bible/entities/forestboar.md')!
    expect(boarPage.content).toContain('stateDiagram-v2')
    expect(boarPage.content).toContain('idle --> aggressive : detect')
    expect(boarPage.content).toContain('aggressive --> dead : die')
    expect(boarPage.content).toContain('dead --> [*]')
  })

  it('entity page includes behaviors section', async () => {
    const gen = new BibleGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'bible/entities/forestboar.md')!
    expect(boarPage.content).toContain('## Behaviors')
    expect(boarPage.content).toContain('The boar charges at a target.')
  })

  it('entity page cross-links to related entities that exist', async () => {
    const gen = new BibleGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'bible/entities/forestboar.md')!
    expect(boarPage.content).toContain('[TemperateForest](temperateforest.md)')
  })

  it('index groups entities by first tag', async () => {
    const gen = new BibleGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const index = result.files.find((f) => f.path === 'bible/index.md')!
    expect(index.content).toContain('## Biome')
    expect(index.content).toContain('## Creature')
    expect(index.content).toContain('[ForestBoar](entities/forestboar.md)')
  })

  it('entity page includes @generated header', async () => {
    const gen = new BibleGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'bible/entities/forestboar.md')!
    expect(boarPage.header).toContain('@generated by @newel/generator-bible')
  })
})
