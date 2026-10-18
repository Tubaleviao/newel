import { normalizeSchema } from './normalizer'
import { validateSchema } from './validator'

function makeSchema(overrides: object) {
  return normalizeSchema({
    meta: { name: 'Test' },
    ...overrides,
  })
}

describe('validateSchema', () => {
  it('errors when a spawn target is not an entity', () => {
    const schema = makeSchema({
      entities: { Forest: { spawns: [{ target: 'Ghost', weight: 0.5 }] } },
    })
    const result = validateSchema(schema)
    expect(result.errors.map((e) => e.path)).toContain('entities.Forest.spawns[0].target')
  })

  it('accepts a spawn whose target exists', () => {
    const schema = makeSchema({
      entities: { Wolf: {}, Forest: { spawns: [{ target: 'Wolf', weight: 0.5 }] } },
    })
    expect(validateSchema(schema).errors.filter((e) => e.path.includes('spawns'))).toEqual([])
  })

  it('passes a valid schema', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: {
            id: { type: 'uuid', primaryKey: true },
            status: { type: 'enum', values: ['draft', 'placed'] },
          },
          behaviors: { place: { description: 'Place order', rules: [] } },
          stateMachine: {
            field: 'status',
            initial: 'draft',
            states: { draft: 'Draft', placed: 'Placed' },
            transitions: [{ from: 'draft', to: 'placed', trigger: 'place' }],
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('warns when explicit guards differ from behavior rules', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: { status: { type: 'enum', values: ['draft', 'placed'] } },
          behaviors: { place: { description: 'Place order', rules: ['Must have items'] } },
          stateMachine: {
            field: 'status',
            initial: 'draft',
            states: { draft: 'Draft', placed: 'Placed' },
            transitions: [
              { from: 'draft', to: 'placed', trigger: 'place', guard: 'Different guard text' },
            ],
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some((w) => w.path.includes('guards'))).toBe(true)
  })

  it('produces no warning when explicit guards match behavior rules exactly', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: { status: { type: 'enum', values: ['draft', 'placed'] } },
          behaviors: { place: { description: 'Place order', rules: ['Must have items'] } },
          stateMachine: {
            field: 'status',
            initial: 'draft',
            states: { draft: 'Draft', placed: 'Placed' },
            transitions: [
              { from: 'draft', to: 'placed', trigger: 'place', guard: 'Must have items' },
            ],
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('errors on unknown initial state', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: { status: { type: 'enum', values: ['draft'] } },
          stateMachine: {
            field: 'status',
            initial: 'nonexistent',
            states: { draft: 'Draft' },
            transitions: [],
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.path.includes('initial'))).toBe(true)
  })

  it('errors on transition referencing undeclared state', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: { status: { type: 'enum', values: ['draft', 'placed'] } },
          stateMachine: {
            field: 'status',
            initial: 'draft',
            states: { draft: 'Draft', placed: 'Placed' },
            transitions: [{ from: 'draft', to: 'ghost', trigger: 'place' }],
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('"ghost"'))).toBe(true)
  })

  it('errors on trigger not matching a behavior', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: { status: { type: 'enum', values: ['draft', 'placed'] } },
          stateMachine: {
            field: 'status',
            initial: 'draft',
            states: { draft: 'Draft', placed: 'Placed' },
            transitions: [{ from: 'draft', to: 'placed', trigger: 'nonexistentBehavior' }],
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('nonexistentBehavior'))).toBe(true)
  })

  it('errors on foreignKey referencing unknown entity', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: {
            id: { type: 'uuid', primaryKey: true },
            userId: { type: 'uuid', foreignKey: 'User.id' },
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('"User"'))).toBe(true)
  })

  it('errors on endpoint returns referencing unknown entity', () => {
    const schema = makeSchema({
      apis: {
        OrderAPI: {
          endpoints: {
            'GET /orders': { returns: 'NonExistentEntity' },
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('"NonExistentEntity"'))).toBe(true)
  })

  it('errors on behavior ownerField referencing unknown field', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: { id: { type: 'uuid', primaryKey: true } },
          behaviors: {
            cancel: {
              description: 'Cancel',
              rules: [],
              auth: { roles: ['customer'], ownerField: 'nonExistentField' },
            },
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('nonExistentField'))).toBe(true)
  })

  it('accepts valid ownerField on behavior', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: {
            id: { type: 'uuid', primaryKey: true },
            customerId: { type: 'uuid' },
          },
          behaviors: {
            cancel: {
              description: 'Cancel',
              rules: [],
              auth: { roles: ['customer'], ownerField: 'customerId' },
            },
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(true)
  })

  it('errors when enum defaultValue is not a member of enumValues', () => {
    const schema = makeSchema({
      entities: {
        Item: {
          fields: {
            rarity: {
              type: 'enum',
              values: ['common', 'uncommon', 'rare'],
              defaultValue: 'legendary',
            },
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(false)
    expect(
      result.errors.some(
        (e) => e.path.includes('defaultValue') && e.message.includes('"legendary"'),
      ),
    ).toBe(true)
  })

  it('passes when enum defaultValue is a valid member of enumValues', () => {
    const schema = makeSchema({
      entities: {
        Item: {
          fields: {
            rarity: { type: 'enum', values: ['common', 'uncommon', 'rare'], defaultValue: 'rare' },
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(true)
  })

  it('errors on relation referencing unknown entity', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: { id: { type: 'uuid', primaryKey: true } },
          relations: { items: { name: 'items', kind: 'hasMany', target: 'GhostEntity' } },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('"GhostEntity"'))).toBe(true)
  })
})

describe('validateSchema money/bigint/pattern', () => {
  const base = (field: Record<string, unknown>) =>
    normalizeSchema({
      meta: { name: 'X' },
      entities: { E: { fields: { f: field } } },
    })

  it('accepts currency on money fields', () => {
    expect(validateSchema(base({ type: 'money', currency: 'BRL' })).valid).toBe(true)
  })

  it('rejects currency on non-money fields', () => {
    const r = validateSchema(base({ type: 'bigint', currency: 'BRL' }))
    expect(r.valid).toBe(false)
    expect(r.errors[0].path).toBe('entities.E.fields.f.currency')
  })

  it('rejects invalid regex patterns', () => {
    const r = validateSchema(base({ type: 'string', pattern: '(' }))
    expect(r.valid).toBe(false)
    expect(r.errors[0].path).toBe('entities.E.fields.f.pattern')
  })

  it('rejects pattern on non-string fields', () => {
    expect(validateSchema(base({ type: 'integer', pattern: '^1$' })).valid).toBe(false)
  })

  it('accepts a valid pattern on a string field', () => {
    expect(validateSchema(base({ type: 'string', pattern: '^\\d+$' })).valid).toBe(true)
  })
})

describe('validateSchema seeds', () => {
  const make = (seeds: Record<string, unknown>[], extraSeeds?: Record<string, unknown>[]) =>
    normalizeSchema({
      meta: { name: 'X' },
      entities: {
        Parent: {
          fields: { code: { type: 'string', primaryKey: true, pattern: '^p\\d$' } },
          ...(extraSeeds ? { seeds: extraSeeds } : {}),
        },
        E: {
          fields: {
            id: { type: 'string', primaryKey: true },
            rate: { type: 'bigint' },
            kind: { type: 'enum', values: ['a', 'b'] },
            parent: { type: 'string', foreignKey: 'Parent.code' },
          },
          seeds,
        },
      },
    })
  const good = { id: 'e', rate: 10n, kind: 'a', parent: 'p1' }

  it('accepts valid seeds', () => {
    expect(validateSchema(make([good], [{ code: 'p1' }])).valid).toBe(true)
  })

  it('rejects wrong type, bad enum, missing field, unknown field, bad pattern', () => {
    const r = validateSchema(
      make(
        [
          { ...good, rate: 'x' },
          { ...good, kind: 'z' },
          { id: 'e', rate: 1, kind: 'a' },
          { ...good, extra: 1 },
        ],
        [{ code: 'bad' }],
      ),
    )
    const paths = r.errors.map((e) => e.path)
    expect(paths).toContain('entities.E.seeds[0].rate')
    expect(paths).toContain('entities.E.seeds[1].kind')
    expect(paths).toContain('entities.E.seeds[2].parent')
    expect(paths).toContain('entities.E.seeds[3].extra')
    expect(paths).toContain('entities.Parent.seeds[0].code')
  })

  it('rejects foreign keys that do not resolve to a seed', () => {
    const r = validateSchema(make([good], [{ code: 'p2' }]))
    expect(r.errors.map((e) => e.path)).toContain('entities.E.seeds[0].parent')
  })
})
