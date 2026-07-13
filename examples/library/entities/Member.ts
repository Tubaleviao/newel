import { defineEntity } from '@newel/core'

export default defineEntity({
  description: 'A registered library member',
  goal: 'Track member identity and borrowing eligibility',
  fields: {
    id:                  { type: 'uuid',   primaryKey: true },
    name:                { type: 'string', pii: true, gdpr: { category: 'identity' } },
    email:               { type: 'email',  pii: true, gdpr: { category: 'contact', retention: '3y', legalBasis: 'contract' } },
    status:              { type: 'enum',   values: ['active', 'suspended'] },
    membershipExpiresAt: { type: 'date' },
  },
  stateMachine: {
    field: 'status',
    initial: 'active',
    states: {
      active:    'Member can borrow and reserve books',
      suspended: 'Member cannot borrow until reinstated',
    },
    transitions: [
      { from: 'active',    to: 'suspended', trigger: 'suspend',   guard: 'Only a librarian may suspend a member' },
      { from: 'suspended', to: 'active',    trigger: 'reinstate', guard: 'Only a librarian may reinstate a member' },
    ],
  },
  behaviors: {
    suspend: {
      description: 'Temporarily blocks a member from borrowing',
      rules: ['Only a librarian may suspend a member'],
      auth: { roles: ['librarian'] },
    },
    reinstate: {
      description: 'Restores borrowing privileges for a suspended member',
      rules: ['Only a librarian may reinstate a member'],
      auth: { roles: ['librarian'] },
    },
  },
})
