import { defineApi } from '@newel/core'

export default defineApi({
  baseUrl: '/orders',
  endpoints: {
    'POST /':       { behavior: 'Order.placeOrder',     description: 'Place a new order' },
    'POST /:id/pay':{ behavior: 'Order.confirmPayment', description: 'Confirm payment for an order' },
    'DELETE /:id':  { behavior: 'Order.cancel',         description: 'Cancel an order' },
    'GET /:id':     { returns: 'Order',                 description: 'Get order details',                      auth: { roles: ['customer', 'admin'] } },
    'GET /':        { returns: 'Order',                 description: 'List orders for authenticated customer', auth: { roles: ['customer', 'admin'] } },
  },
})
