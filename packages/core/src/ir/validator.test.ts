import { normalizeSchema } from './normalizer'
import { validateSchema } from './validator'

function makeSchema(overrides: object) {
  return normalizeSchema({
    meta: { name: 'Test' },
    ...overrides,
  })
}

describe('validateSchema', () => {
  it('passes a valid schema', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: { id: { type: 'uuid', primaryKey: true }, status: { type: 'enum', values: ['draft', 'placed'] } },
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
            transitions: [{ from: 'draft', to: 'placed', trigger: 'place', guard: 'Different guard text' }],
          },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some(w => w.path.includes('guards'))).toBe(true)
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
            transitions: [{ from: 'draft', to: 'placed', trigger: 'place', guard: 'Must have items' }],
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
          stateMachine: { field: 'status', initial: 'nonexistent', states: { draft: 'Draft' }, transitions: [] },
        },
      },
    })
    const result = validateSchema(schema)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.path.includes('initial'))).toBe(true)
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
    expect(result.errors.some(e => e.message.includes('"ghost"'))).toBe(true)
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
    expect(result.errors.some(e => e.message.includes('nonexistentBehavior'))).toBe(true)
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
    expect(result.errors.some(e => e.message.includes('"User"'))).toBe(true)
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
    expect(result.errors.some(e => e.message.includes('"NonExistentEntity"'))).toBe(true)
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
    expect(result.errors.some(e => e.message.includes('nonExistentField'))).toBe(true)
  })

  it('accepts valid ownerField on behavior', () => {
    const schema = makeSchema({
      entities: {
        Order: {
          fields: {
            id:         { type: 'uuid', primaryKey: true },
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
    expect(result.errors.some(e => e.message.includes('"GhostEntity"'))).toBe(true)
  })
})
