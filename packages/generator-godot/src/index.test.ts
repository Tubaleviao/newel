import { GodotGenerator } from './index'
import type { FabricSchema, GeneratorContext, GeneratorOutput } from '@newel/core'

const makeCtx = (): GeneratorContext => ({
  outputDir: '/tmp/test-godot',
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
  meta: { name: 'TestGame', description: 'A test game', version: '0.1.0' },
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
    IronChestplate: {
      name: 'IronChestplate',
      tags: ['item'],
      description: 'A sturdy iron chestplate.',
      fields: {
        weight: {
          name: 'weight',
          type: 'decimal',
          nullable: false,
          primaryKey: false,
          pii: false,
          description: 'Weight in kg',
        },
        rarity: {
          name: 'rarity',
          type: 'enum',
          nullable: false,
          primaryKey: false,
          pii: false,
          enumValues: ['common', 'uncommon', 'rare'],
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

const wrongVersionSchema: FabricSchema = {
  ...minimalSchema,
  version: '2.0.0',
}

describe('GodotGenerator', () => {
  it('has name "godot" and no dependencies', () => {
    const gen = new GodotGenerator()
    expect(gen.name).toBe('godot')
    expect(gen.dependsOn).toEqual([])
  })

  it('throws when IR version does not match', async () => {
    const gen = new GodotGenerator()
    await expect(gen.generate(wrongVersionSchema, makeCtx())).rejects.toThrow(
      'requires IR version 3.0.0',
    )
  })

  it('produces only GameData.gd for an empty schema', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(minimalSchema, makeCtx())
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('godot/autoload/GameData.gd')
  })

  it('produces a .tres file per entity', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('godot/creatures/forestboar.tres')
    expect(paths).toContain('godot/items/ironchestplate.tres')
  })

  it('.tres file uses [gd_resource] header', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const tres = result.files.find((f) => f.path === 'godot/creatures/forestboar.tres')!
    expect(tres.content).toContain('[gd_resource type="Resource" format=3]')
    expect(tres.content).toContain('[resource]')
  })

  it('.tres file includes state machine metadata', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const tres = result.files.find((f) => f.path === 'godot/creatures/forestboar.tres')!
    expect(tres.content).toContain('state_machine_field = "status"')
    expect(tres.content).toContain('initial_state = "idle"')
  })

  it('produces a .gd enum file for entities with enum fields or a state machine', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const paths = result.files.map((f) => f.path)
    expect(paths).toContain('godot/creatures/forestboar.gd')
    expect(paths).toContain('godot/items/ironchestplate.gd')
  })

  it('.gd file contains state machine enum with SCREAMING_SNAKE constants', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const gd = result.files.find((f) => f.path === 'godot/creatures/forestboar.gd')!
    expect(gd.content).toContain('enum State {')
    expect(gd.content).toContain('IDLE,')
    expect(gd.content).toContain('AGGRESSIVE,')
    expect(gd.content).toContain('DEAD,')
  })

  it('.gd file contains enum for enum-typed fields', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const gd = result.files.find((f) => f.path === 'godot/items/ironchestplate.gd')!
    expect(gd.content).toContain('enum Rarity {')
    expect(gd.content).toContain('COMMON,')
    expect(gd.content).toContain('UNCOMMON,')
    expect(gd.content).toContain('RARE,')
  })

  it('GameData.gd contains typed dictionaries grouped by tag', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    const gd = result.files.find((f) => f.path === 'godot/autoload/GameData.gd')!
    expect(gd.content).toContain('const CREATURES: Dictionary')
    expect(gd.content).toContain('const ITEMS: Dictionary')
    expect(gd.content).toContain('"ForestBoar"')
    expect(gd.content).toContain('"IronChestplate"')
    expect(gd.content).toContain('preload("res://godot/creatures/forestboar.tres")')
  })

  it('.gd and autoload files carry the @generated header comment', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    for (const file of result.files) {
      if (file.path.endsWith('.gd')) {
        expect(file.header).toContain('@generated by @newel/generator-godot')
      }
    }
  })

  it('.tres files have an empty header so [gd_resource] is the first line', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(richSchema, makeCtx())
    for (const file of result.files.filter((f) => f.path.endsWith('.tres'))) {
      expect(file.header).toBe('')
    }
  })

  it('pascalCase converts snake_case field names to PascalCase enum names', async () => {
    const gen = new GodotGenerator()
    const schema: FabricSchema = {
      ...minimalSchema,
      entities: {
        Weapon: {
          name: 'Weapon',
          tags: ['item'],
          description: '',
          fields: {
            base_attack: {
              name: 'base_attack',
              type: 'enum',
              nullable: false,
              primaryKey: false,
              pii: false,
              enumValues: ['light', 'heavy'],
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
    const result = await gen.generate(schema, makeCtx())
    const gd = result.files.find((f) => f.path.endsWith('.gd'))!
    expect(gd.content).toContain('enum BaseAttack {')
  })

  it('gdEnumConst uses field-name prefix for digit-leading enum values', async () => {
    const gen = new GodotGenerator()
    const schema: FabricSchema = {
      ...minimalSchema,
      entities: {
        Enemy: {
          name: 'Enemy',
          tags: ['creature'],
          description: '',
          fields: {
            tier: {
              name: 'tier',
              type: 'enum',
              nullable: false,
              primaryKey: false,
              pii: false,
              enumValues: ['1', '2', '3'],
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
    const result = await gen.generate(schema, makeCtx())
    const gd = result.files.find((f) => f.path.endsWith('.gd'))!
    expect(gd.content).toContain('TIER_1,')
    expect(gd.content).toContain('TIER_2,')
    expect(gd.content).toContain('TIER_3,')
  })

  it('GameData.gd does not duplicate the autoload instruction as a comment', async () => {
    const gen = new GodotGenerator()
    const result = await gen.generate(minimalSchema, makeCtx())
    const gd = result.files.find((f) => f.path === 'godot/autoload/GameData.gd')!
    const lines = gd.content.split('\n')
    expect(lines[0]).toBe('extends Node')
  })
})
