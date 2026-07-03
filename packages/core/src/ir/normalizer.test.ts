import { normalizeSchema } from './normalizer'

describe('normalizeSchema', () => {
  it('rejects non-objects', () => {
    expect(() => normalizeSchema(null)).toThrow('plain object')
    expect(() => normalizeSchema('string')).toThrow('plain object')
  })

  it('rejects missing meta.name', () => {
    expect(() => normalizeSchema({ meta: {} })).toThrow('meta.name')
  })

  it('produces a valid schema from minimal input', () => {
    const schema = normalizeSchema({ meta: { name: 'Test' } })
    expect(schema.version).toBe('1.0.0')
    expect(schema.meta.name).toBe('Test')
    expect(schema.entities).toEqual({})
    expect(schema.apis).toEqual({})
  })

  it('normalises field defaults', () => {
    const schema = normalizeSchema({
      meta: { name: 'Test' },
      entities: {
        Book: {
          fields: {
            id: { type: 'uuid', primaryKey: true },
            title: { type: 'string' },
          },
        },
      },
    })
    const { id, title } = schema.entities['Book'].fields
    expect(id.primaryKey).toBe(true)
    expect(id.nullable).toBe(false)
    expect(id.pii).toBe(false)
    expect(title.primaryKey).toBe(false)
    expect(title.nullable).toBe(false)
  })

  it('normalises enum values alias', () => {
    const schema = normalizeSchema({
      meta: { name: 'Test' },
      entities: {
        Book: {
          fields: {
            status: { type: 'enum', values: ['available', 'borrowed'] },
          },
        },
      },
    })
    expect(schema.entities['Book'].fields['status'].enumValues).toEqual(['available', 'borrowed'])
  })

  it('normalises flat GDPR keys', () => {
    const schema = normalizeSchema({
      meta: { name: 'Test' },
      entities: {
        Member: {
          fields: {
            email: { type: 'email', pii: true, gdprCategory: 'contact', gdprRetention: '7y', gdprLegalBasis: 'contract' },
          },
        },
      },
    })
    const email = schema.entities['Member'].fields['email']
    expect(email.pii).toBe(true)
    expect(email.gdprCategory).toBe('contact')
    expect(email.gdprRetention).toBe('7y')
    expect(email.gdprLegalBasis).toBe('contract')
  })

  it('normalises nested GDPR object', () => {
    const schema = normalizeSchema({
      meta: { name: 'Test' },
      entities: {
        Member: {
          fields: {
            email: { type: 'email', pii: true, gdpr: { category: 'contact', retention: '7y', legalBasis: 'consent' } },
          },
        },
      },
    })
    const email = schema.entities['Member'].fields['email']
    expect(email.gdprCategory).toBe('contact')
    expect(email.gdprRetention).toBe('7y')
    expect(email.gdprLegalBasis).toBe('consent')
  })

  it('derives entity pii and gdpr index from fields', () => {
    const schema = normalizeSchema({
      meta: { name: 'Test' },
      entities: {
        Member: {
          fields: {
            id:    { type: 'uuid' },
            email: { type: 'email', pii: true, gdprCategory: 'contact' },
            name:  { type: 'string', pii: true, gdprCategory: 'identity' },
          },
        },
      },
    })
    const entity = schema.entities['Member']
    expect(entity.pii).toContain('email')
    expect(entity.pii).toContain('name')
    expect(entity.pii).not.toContain('id')
    expect(entity.gdpr['email']).toBe('contact')
    expect(entity.gdpr['name']).toBe('identity')
  })

  it('normalises singular guard/effect on transitions', () => {
    const schema = normalizeSchema({
      meta: { name: 'Test' },
      entities: {
        Book: {
          fields: { status: { type: 'enum', values: ['available', 'borrowed'] } },
          stateMachine: {
            field: 'status',
            initial: 'available',
            states: {
              available: { description: 'On shelf' },
              borrowed: { description: 'With member' },
            },
            transitions: [
              { from: 'available', to: 'borrowed', trigger: 'borrow', guard: 'Member must be active', effect: 'Sends confirmation' },
            ],
          },
        },
      },
    })
    const t = schema.entities['Book'].stateMachine!.transitions[0]
    expect(t.guards).toEqual(['Member must be active'])
    expect(t.effects).toEqual(['Sends confirmation'])
  })

  it('normalises array guards/effects on transitions', () => {
    const schema = normalizeSchema({
      meta: { name: 'Test' },
      entities: {
        Book: {
          fields: { status: { type: 'enum', values: ['available', 'borrowed'] } },
          stateMachine: {
            field: 'status',
            initial: 'available',
            states: { available: 'On shelf', borrowed: 'With member' },
            transitions: [
              { from: ['available'], to: 'borrowed', trigger: 'borrow', guards: ['Rule A', 'Rule B'], effects: ['Effect 1'] },
            ],
          },
        },
      },
    })
    const t = schema.entities['Book'].stateMachine!.transitions[0]
    expect(t.guards).toEqual(['Rule A', 'Rule B'])
    expect(t.effects).toEqual(['Effect 1'])
  })

  it('accepts string shorthand for state descriptions', () => {
    const schema = normalizeSchema({
      meta: { name: 'Test' },
      entities: {
        Book: {
          fields: { status: { type: 'enum', values: ['available'] } },
          stateMachine: {
            field: 'status',
            initial: 'available',
            states: { available: 'On shelf' },
            transitions: [],
          },
        },
      },
    })
    expect(schema.entities['Book'].stateMachine!.states['available'].description).toBe('On shelf')
    expect(schema.entities['Book'].stateMachine!.states['available'].terminal).toBe(false)
  })

  it('normalises API endpoints', () => {
    const schema = normalizeSchema({
      meta: { name: 'Test' },
      apis: {
        LibraryAPI: {
          endpoints: {
            'POST /loans': { behavior: 'Loan.borrow', description: 'Borrow a book' },
            'GET /books':  { returns: 'Book', auth: { roles: ['member', 'admin'] } },
          },
        },
      },
    })
    const api = schema.apis['LibraryAPI']
    expect(api.endpoints['POST /loans'].method).toBe('POST')
    expect(api.endpoints['POST /loans'].path).toBe('/loans')
    expect(api.endpoints['GET /books'].returns).toBe('Book')
    expect(api.endpoints['GET /books'].auth?.roles).toContain('member')
  })
})
