import { defineEntity } from '@quoin/core'

export default defineEntity({
  description: 'A book in the library catalogue',
  goal: 'Track books and their availability',
  fields: {
    id:          { type: 'uuid',   primaryKey: true },
    title:       { type: 'string', description: 'Full title of the book' },
    author:      { type: 'string', description: "Author's full name" },
    isbn:        { type: 'string', description: 'ISBN-13 identifier' },
    status:      { type: 'enum',   values: ['available', 'borrowed', 'reserved'] },
    publishedAt: { type: 'date',   nullable: true },
  },
  stateMachine: {
    field: 'status',
    initial: 'available',
    states: {
      available: 'On the shelf, ready to borrow',
      borrowed:  'Currently with a member',
      reserved:  'Held for a member',
    },
    transitions: [
      { from: 'available', to: 'borrowed',  trigger: 'borrow',            guard: 'Member must have no overdue loans' },
      { from: 'borrowed',  to: 'available', trigger: 'return' },
      { from: 'available', to: 'reserved',  trigger: 'reserve',           guard: 'Member must be active' },
      { from: 'reserved',  to: 'borrowed',  trigger: 'borrow' },
      { from: 'reserved',  to: 'available', trigger: 'cancelReservation' },
    ],
  },
  behaviors: {
    borrow: {
      description: 'Borrows a book for a member',
      rules: ['Member must have no overdue loans'],
      auth: { roles: ['member', 'librarian'] },
    },
    return: {
      description: 'Returns a borrowed book',
      auth: { roles: ['member', 'librarian'] },
    },
    reserve: {
      description: 'Reserves an available book for a member',
      rules: ['Member must be active'],
      auth: { roles: ['member'] },
    },
    cancelReservation: {
      description: 'Cancels a reservation and makes the book available again',
      auth: { roles: ['member', 'librarian'] },
    },
  },
})
