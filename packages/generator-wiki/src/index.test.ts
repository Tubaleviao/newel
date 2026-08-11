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
  it('has name "wiki" and no dependencies', () => {
    const gen = new WikiGenerator()
    expect(gen.name).toBe('wiki')
    expect(gen.dependsOn).toEqual([])
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

  it('hiddenSections suppresses relations', async () => {
    const gen = new WikiGenerator({ hiddenSections: ['relations'] })
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.content).not.toContain('## Related')
    expect(boarPage.content).not.toContain('[TemperateForest](temperateforest.md)')
  })

  it('array-form transition.from produces one diagram line per source state', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        Mob: {
          name: 'Mob',
          tags: [],
          description: 'A mob.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
          stateMachine: {
            field: 'status',
            initial: 'idle',
            states: {
              idle: { name: 'idle', description: 'Idle', terminal: false },
              fleeing: { name: 'fleeing', description: 'Fleeing', terminal: false },
              dead: { name: 'dead', description: 'Dead', terminal: true },
            },
            transitions: [
              { from: ['idle', 'fleeing'], to: 'dead', trigger: 'die', guards: [], effects: [] },
            ],
          },
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const page = result.files.find((f) => f.path === 'wiki/entities/mob.md')!
    expect(page.content).toContain('idle --> dead : die')
    expect(page.content).toContain('fleeing --> dead : die')
  })

  it('state names with spaces are quoted in mermaid diagram', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        Mob: {
          name: 'Mob',
          tags: [],
          description: 'A mob.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
          stateMachine: {
            field: 'status',
            initial: 'in progress',
            states: {
              'in progress': { name: 'in progress', description: 'Ongoing', terminal: false },
              done: { name: 'done', description: 'Finished', terminal: true },
            },
            transitions: [
              { from: 'in progress', to: 'done', trigger: 'finish', guards: [], effects: [] },
            ],
          },
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const page = result.files.find((f) => f.path === 'wiki/entities/mob.md')!
    expect(page.content).toContain('[*] --> "in progress"')
    expect(page.content).toContain('"in progress" --> done : finish')
    expect(page.content).not.toContain('[*] --> in progress')
  })

  it('enum values with pipes are escaped in the attributes table', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        Item: {
          name: 'Item',
          tags: [],
          description: 'An item.',
          fields: {
            rarity: {
              name: 'rarity',
              type: 'enum',
              nullable: false,
              primaryKey: false,
              pii: false,
              enumValues: ['common', 'rare|epic'],
            },
          },
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const page = result.files.find((f) => f.path === 'wiki/entities/item.md')!
    expect(page.content).toContain('`rare\\|epic`')
  })

  it('behavior with empty description renders a fallback placeholder', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        Mob: {
          name: 'Mob',
          tags: [],
          description: 'A mob.',
          fields: {},
          relations: {},
          behaviors: {
            idle: {
              name: 'idle',
              description: '',
              rules: [],
              auth: { roles: [] },
            },
          },
          pii: [],
          gdpr: {},
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const page = result.files.find((f) => f.path === 'wiki/entities/mob.md')!
    expect(page.content).toContain('_No description._')
  })

  it('entity page includes @generated header', async () => {
    const gen = new WikiGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const boarPage = result.files.find((f) => f.path === 'wiki/entities/forestboar.md')!
    expect(boarPage.header).toContain('@generated by @newel/generator-wiki')
  })

  it('slugify strips non-URL-safe characters so entity names with special chars produce valid paths', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        'Fish & Chips': {
          name: 'Fish & Chips',
          tags: [],
          description: 'A dish.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const paths = result.files.map((f) => f.path)
    expect(
      paths.some(
        (p) => p === 'wiki/entities/fish---chips.md' || p === 'wiki/entities/fish-chips.md',
      ),
    ).toBe(true)
    expect(paths.some((p) => p.includes('&'))).toBe(false)
  })

  it('two entities that slugify to the same base get deduplicated paths', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        Hero: {
          name: 'Hero',
          tags: [],
          description: 'A hero.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
        },
        hero: {
          name: 'hero',
          tags: [],
          description: 'Another hero.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const entityPaths = result.files
      .filter((f) => f.path.startsWith('wiki/entities/'))
      .map((f) => f.path)
    const unique = new Set(entityPaths)
    expect(unique.size).toBe(entityPaths.length)
  })

  it('state names with special chars (colon) are quoted in mermaid diagram', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        Mob: {
          name: 'Mob',
          tags: [],
          description: 'A mob.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
          stateMachine: {
            field: 'status',
            initial: 'pending:review',
            states: {
              'pending:review': {
                name: 'pending:review',
                description: 'Under review',
                terminal: false,
              },
              done: { name: 'done', description: 'Done', terminal: true },
            },
            transitions: [
              { from: 'pending:review', to: 'done', trigger: 'approve', guards: [], effects: [] },
            ],
          },
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const page = result.files.find((f) => f.path === 'wiki/entities/mob.md')!
    expect(page.content).toContain('"pending:review" --> done')
    expect(page.content).not.toMatch(/^\s+pending:review --> /m)
  })

  it('guard with < is sanitized in mermaid output', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        Mob: {
          name: 'Mob',
          tags: [],
          description: 'A mob.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
          stateMachine: {
            field: 'status',
            initial: 'idle',
            states: {
              idle: { name: 'idle', description: 'Idle', terminal: false },
              aggressive: { name: 'aggressive', description: 'Aggressive', terminal: true },
            },
            transitions: [
              {
                from: 'idle',
                to: 'aggressive',
                trigger: 'attack',
                guards: ['count < 10'],
                effects: [],
              },
            ],
          },
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const page = result.files.find((f) => f.path === 'wiki/entities/mob.md')!
    expect(page.content).not.toContain('count < 10')
    expect(page.content).toContain('count   10')
  })

  it('backticks in field descriptions are escaped in the attributes table', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        Item: {
          name: 'Item',
          tags: [],
          description: 'An item.',
          fields: {
            mode: {
              name: 'mode',
              type: 'string',
              nullable: false,
              primaryKey: false,
              pii: false,
              description: 'Run `fast` mode',
            },
          },
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const page = result.files.find((f) => f.path === 'wiki/entities/item.md')!
    expect(page.content).toContain('Run \\`fast\\` mode')
  })

  it('entity name with ] is escaped in index link text', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        'User]Name': {
          name: 'User]Name',
          tags: [],
          description: 'Test entity.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const index = result.files.find((f) => f.path === 'wiki/index.md')!
    expect(index.content).toContain('[User\\]Name]')
  })

  it('description starting with [ is escaped in index entry', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        Mob: {
          name: 'Mob',
          tags: [],
          description: '[Rare] creature found in the wild.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const index = result.files.find((f) => f.path === 'wiki/index.md')!
    expect(index.content).toContain('\\[Rare]')
  })

  it('index grouping uses alphabetically sorted tags for stability', async () => {
    const schema: FabricSchema = {
      ...richSchema,
      entities: {
        E1: {
          name: 'E1',
          tags: ['creature', 'boss'],
          description: 'Entity 1.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
        },
        E2: {
          name: 'E2',
          tags: ['boss', 'creature'],
          description: 'Entity 2.',
          fields: {},
          relations: {},
          behaviors: {},
          pii: [],
          gdpr: {},
        },
      },
    }
    const gen = new WikiGenerator()
    const result = await gen.generate(schema, makeCtx())
    const index = result.files.find((f) => f.path === 'wiki/index.md')!
    // Both have 'boss' as the alphabetically first tag → both in Boss section
    expect(index.content).toContain('## Boss')
    expect(index.content).toContain('[E1]')
    expect(index.content).toContain('[E2]')
    // No creature section because 'boss' sorts before 'creature'
    expect(index.content).not.toContain('## Creature')
  })
})
