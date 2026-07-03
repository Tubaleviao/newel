export type GdprCategory =
  | 'identity'
  | 'contact'
  | 'financial'
  | 'health'
  | 'behavioral'
  | 'location'

export type GdprLegalBasis =
  | 'consent'
  | 'contract'
  | 'legal-obligation'
  | 'legitimate-interest'

export type FieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'uuid'
  | 'timestamp'
  | 'date'
  | 'email'
  | 'url'
  | 'json'
  | 'enum'

export interface FieldSchema {
  name: string
  type: FieldType
  description?: string
  nullable: boolean
  primaryKey: boolean
  enumValues?: string[]
  foreignKey?: string
  pii: boolean
  gdprCategory?: GdprCategory
  gdprRetention?: string
  gdprLegalBasis?: GdprLegalBasis
}

export interface RelationSchema {
  name: string
  kind: 'hasMany' | 'hasOne' | 'belongsTo' | 'manyToMany'
  target: string
  foreignKey?: string
  through?: string
}

export interface AuthSchema {
  roles: string[]
}

export interface BehaviorSchema {
  name: string
  description: string
  rules: string[]
  input?: Record<string, FieldSchema>
  output?: string
  auth?: AuthSchema
  transitions?: string[]
}

export interface StateSchema {
  name: string
  description: string
  terminal: boolean
}

export interface TransitionSchema {
  from: string | string[]
  to: string
  trigger: string
  guards: string[]
  effects: string[]
}

export interface StateMachineSchema {
  field: string
  initial: string
  states: Record<string, StateSchema>
  transitions: TransitionSchema[]
}

export interface EntitySchema {
  name: string
  description: string
  goal?: string
  fields: Record<string, FieldSchema>
  relations: Record<string, RelationSchema>
  behaviors: Record<string, BehaviorSchema>
  stateMachine?: StateMachineSchema
  pii: string[]
  gdpr: Record<string, GdprCategory>
}

export interface EndpointSchema {
  method: string
  path: string
  description?: string
  behavior?: string
  returns?: string
  auth?: AuthSchema
}

export interface ApiSchema {
  name: string
  baseUrl?: string
  endpoints: Record<string, EndpointSchema>
}

export interface EventSchema {
  name: string
  description?: string
  payload?: Record<string, FieldSchema>
}

export interface GraphSchema {
  name: string
  description?: string
}

export interface SchemaMeta {
  name: string
  description?: string
  version?: string
  namespace?: string
}

export interface FabricSchema {
  version: string
  meta: SchemaMeta
  entities: Record<string, EntitySchema>
  apis: Record<string, ApiSchema>
  events?: Record<string, EventSchema>
  graphs?: Record<string, GraphSchema>
}
