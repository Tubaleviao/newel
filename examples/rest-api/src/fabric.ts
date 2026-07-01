import { fabric } from '@quoin/core'

export default fabric()
  .meta(m => m
    .name('RestAPIExample')
    .description('Example REST API — order management system')
    .version('1.0.0')
    .namespace('https://example.com/ontology/')
  )

  .entity('Customer', e => e
    .description('A registered customer')
    .goal('Track customer identity and contact details')

    .field('id', f => f.uuid().primaryKey())
    .field('email', f => f
      .email()
      .description('Primary contact email')
      .pii()
      .gdpr('contact')
      .gdprRetention('7y')
      .gdprLegalBasis('contract')
    )
    .field('name', f => f.string().description('Full legal name').pii().gdpr('identity'))
    .field('createdAt', f => f.timestamp())
    .field('shippingAddress', f => f.string().nullable().description('Default shipping address'))

    .relation('orders', r => r.hasMany('Order').foreignKey('customerId'))
  )

  .entity('Order', e => e
    .description('A customer purchase request')
    .goal('Track the full lifecycle of a purchase from placement to fulfillment')

    .field('id', f => f.uuid().primaryKey())
    .field('status', f => f
      .enum(['draft', 'placed', 'paid', 'shipped', 'delivered', 'cancelled'])
      .description('Current lifecycle state of the order'))
    .field('totalAmount', f => f.decimal().description('Sum of all line item prices'))
    .field('customerId', f => f.uuid().foreignKey('Customer.id'))
    .field('placedAt', f => f.timestamp().nullable())
    .field('cancelledAt', f => f.timestamp().nullable())
    .field('cancellationReason', f => f.string().nullable())

    .stateMachine('status', sm => sm
      .initial('draft')
      .state('draft',     s => s.description('Order created but not submitted'))
      .state('placed',    s => s.description('Order submitted by customer'))
      .state('paid',      s => s.description('Payment confirmed'))
      .state('shipped',   s => s.description('Package handed to carrier'))
      .state('delivered', s => s.description('Package received by customer').terminal())
      .state('cancelled', s => s.description('Order cancelled').terminal())

      .transition(t => t
        .from('draft').to('placed').trigger('placeOrder')
        .guard('Order must have at least one line item')
        .guard('Customer must have a valid shipping address')
        .effect('Sets placedAt to current timestamp')
      )
      .transition(t => t
        .from('placed').to('paid').trigger('confirmPayment')
        .guard('Payment amount must match order total')
        .effect('Triggers inventory reservation')
      )
      .transition(t => t
        .from(['draft', 'placed']).to('cancelled').trigger('cancel')
        .guard('Only the owning customer or an admin may cancel')
        .effect('Sets cancelledAt and cancellationReason')
      )
    )

    .behavior('placeOrder', b => b
      .description('Submits a draft order for processing')
      .rule('Order must have at least one line item')
      .rule('Customer must have a valid shipping address')
      .auth(a => a.roles('customer', 'admin'))
    )
    .behavior('confirmPayment', b => b
      .description('Records successful payment for an order')
      .rule('Payment amount must match order total')
      .auth(a => a.roles('payment-service'))
    )
    .behavior('cancel', b => b
      .description('Cancels an order and records the reason')
      .input('reason', f => f.string().description('Why the order was cancelled'))
      .rule('Only the owning customer or an admin may cancel')
      .auth(a => a.roles('customer', 'admin'))
    )

    .relation('lineItems', r => r.hasMany('LineItem').foreignKey('orderId'))
    .relation('customer',  r => r.belongsTo('Customer').foreignKey('customerId'))
  )

  .entity('LineItem', e => e
    .description('A single product within an order')
    .goal('Record what was ordered and at what price')

    .field('id', f => f.uuid().primaryKey())
    .field('orderId', f => f.uuid().foreignKey('Order.id'))
    .field('productId', f => f.uuid().foreignKey('Product.id'))
    .field('quantity', f => f.integer().description('Number of units ordered'))
    .field('unitPrice', f => f.decimal().description('Price per unit at time of order'))
    .field('subtotal', f => f.decimal().description('quantity × unitPrice'))

    .relation('order', r => r.belongsTo('Order').foreignKey('orderId'))
  )

  .api('OrderAPI', a => a
    .endpoint('POST /orders', ep => ep
      .behavior('Order.placeOrder')
      .description('Place a new order'))
    .endpoint('POST /orders/:id/pay', ep => ep
      .behavior('Order.confirmPayment')
      .description('Confirm payment for an order'))
    .endpoint('DELETE /orders/:id', ep => ep
      .behavior('Order.cancel')
      .description('Cancel an order'))
    .endpoint('GET /orders/:id', ep => ep
      .returns('Order')
      .description('Get order details')
      .auth(a => a.roles('customer', 'admin')))
    .endpoint('GET /orders', ep => ep
      .returns('Order')
      .description('List orders for authenticated customer')
      .auth(a => a.roles('customer', 'admin')))
  )

  .api('CustomerAPI', a => a
    .endpoint('POST /customers', ep => ep
      .description('Register a new customer')
      .returns('Customer'))
    .endpoint('GET /customers/:id', ep => ep
      .returns('Customer')
      .auth(a => a.roles('customer', 'admin')))
  )
