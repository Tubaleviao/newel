import { fabric } from './fabric'

describe('FabricBuilder', () => {
  it('produces valid IR with empty schema', () => {
    const ir = fabric().toIR()
    expect(ir.version).toBe('3.0.0')
    expect(ir.entities).toEqual({})
    expect(ir.apis).toEqual({})
  })

  it('builds entity with fields', () => {
    const ir = fabric()
      .entity('User', e => e
        .description('A user')
        .goal('Track users')
        .field('id', f => f.uuid().primaryKey())
        .field('email', f => f.email().pii().gdpr('contact').gdprRetention('7y').gdprLegalBasis('consent'))
        .field('name', f => f.string().nullable())
      )
      .toIR()

    const user = ir.entities['User']
    expect(user.name).toBe('User')
    expect(user.description).toBe('A user')
    expect(user.goal).toBe('Track users')
    expect(user.fields['id'].type).toBe('uuid')
    expect(user.fields['id'].primaryKey).toBe(true)
    expect(user.fields['email'].type).toBe('email')
    expect(user.fields['email'].pii).toBe(true)
    expect(user.fields['email'].gdprCategory).toBe('contact')
    expect(user.fields['email'].gdprRetention).toBe('7y')
    expect(user.fields['email'].gdprLegalBasis).toBe('consent')
    expect(user.fields['name'].nullable).toBe(true)
    expect(user.pii).toContain('email')
    expect(user.gdpr['email']).toBe('contact')
  })

  it('builds relations', () => {
    const ir = fabric()
      .entity('Order', e => e
        .description('Order')
        .relation('lineItems', r => r.hasMany('LineItem').foreignKey('orderId'))
        .relation('customer', r => r.belongsTo('Customer').foreignKey('customerId'))
      )
      .toIR()

    const order = ir.entities['Order']
    expect(order.relations['lineItems'].kind).toBe('hasMany')
    expect(order.relations['lineItems'].target).toBe('LineItem')
    expect(order.relations['customer'].kind).toBe('belongsTo')
  })

  it('builds behaviors with rules and auth', () => {
    const ir = fabric()
      .entity('Order', e => e
        .description('Order')
        .behavior('cancel', b => b
          .description('Cancel an order')
          .rule('Only owner or admin')
          .input('reason', f => f.string().description('Cancellation reason'))
          .auth(a => a.roles('customer', 'admin'))
        )
      )
      .toIR()

    const cancel = ir.entities['Order'].behaviors['cancel']
    expect(cancel.description).toBe('Cancel an order')
    expect(cancel.rules).toContain('Only owner or admin')
    expect(cancel.auth?.roles).toEqual(['customer', 'admin'])
    expect(cancel.input?.['reason'].type).toBe('string')
  })

  it('builds state machine', () => {
    const ir = fabric()
      .entity('Order', e => e
        .description('Order')
        .field('status', f => f.enum(['draft', 'placed', 'cancelled']))
        .stateMachine('status', sm => sm
          .initial('draft')
          .state('draft', s => s.description('Draft'))
          .state('placed', s => s.description('Placed'))
          .state('cancelled', s => s.description('Cancelled').terminal())
          .transition(t => t
            .from('draft').to('placed').trigger('placeOrder')
            .guard('Must have items')
            .effect('Sets placedAt')
          )
          .transition(t => t
            .from(['draft', 'placed']).to('cancelled').trigger('cancel')
            .guard('Only owner')
          )
        )
      )
      .toIR()

    const sm = ir.entities['Order'].stateMachine!
    expect(sm.field).toBe('status')
    expect(sm.initial).toBe('draft')
    expect(sm.states['cancelled'].terminal).toBe(true)
    expect(sm.transitions[0].trigger).toBe('placeOrder')
    expect(sm.transitions[0].guards).toContain('Must have items')
    expect(sm.transitions[0].effects).toContain('Sets placedAt')
    expect(sm.transitions[1].from).toEqual(['draft', 'placed'])
  })

  it('builds entity tags from a string array', () => {
    const ir = fabric()
      .entity('Wolf', e => e.tags(['creature', 'npc']))
      .toIR()
    expect(ir.entities['Wolf'].tags).toEqual(['creature', 'npc'])
  })

  it('accumulates tags across multiple .tags() calls', () => {
    const ir = fabric()
      .entity('Wolf', e => e.tags(['creature']).tags(['npc']))
      .toIR()
    expect(ir.entities['Wolf'].tags).toEqual(['creature', 'npc'])
  })

  it('throws when tags() receives a non-array (guards plain JS callers)', () => {
    expect(() =>
      fabric().entity('Wolf', e => e.tags('creature' as unknown as string[]))
    ).toThrow('EntityBuilder.tags(): expected string[]')
  })

  it('throws when tags() receives an array with non-string elements', () => {
    expect(() =>
      fabric().entity('Wolf', e => e.tags([42] as unknown as string[]))
    ).toThrow('must be a string')
  })

  it('builds apis with endpoints', () => {
    const ir = fabric()
      .api('OrderAPI', a => a
        .endpoint('POST /orders', ep => ep
          .behavior('Order.placeOrder')
          .description('Place an order'))
        .endpoint('GET /orders/:id', ep => ep
          .returns('Order')
          .auth(a => a.roles('customer', 'admin')))
      )
      .toIR()

    const api = ir.apis['OrderAPI']
    expect(api.endpoints['POST /orders'].behavior).toBe('Order.placeOrder')
    expect(api.endpoints['GET /orders/:id'].returns).toBe('Order')
    expect(api.endpoints['GET /orders/:id'].auth?.roles).toContain('customer')
  })
})
