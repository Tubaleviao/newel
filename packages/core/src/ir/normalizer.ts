import type {
  FabricSchema,
  EntitySchema,
  FieldSchema,
  FieldType,
  RelationSchema,
  BehaviorSchema,
  StateMachineSchema,
  TransitionSchema,
  StateSchema,
  ApiSchema,
  EndpointSchema,
  SchemaMeta,
  GdprCategory,
  GdprLegalBasis,
  AuthSchema,
} from './types'

const CURRENT_IR_VERSION = '1.0.0'

type RawGdpr = {
  category?: GdprCategory
  retention?: string
  legalBasis?: GdprLegalBasis
}

type RawField = {
  type: FieldType
  description?: string
  nullable?: boolean
  primaryKey?: boolean
  values?: string[]
  enumValues?: string[]
  foreignKey?: string
  pii?: boolean
  gdpr?: RawGdpr
  gdprCategory?: GdprCategory
  gdprRetention?: string
  gdprLegalBasis?: GdprLegalBasis
}

type RawTransition = {
  from: string | string[]
  to: string
  trigger: string
  guard?: string
  guards?: string[]
  effect?: string
  effects?: string[]
}

type RawState = {
  description?: string
  terminal?: boolean
}

type RawStateMachine = {
  field: string
  initial: string
  states: Record<string, RawState | string>
  transitions: RawTransition[]
}

type RawAuth = { roles: string[] }

type RawBehavior = {
  description: string
  rules?: string[]
  input?: Record<string, RawField>
  output?: string
  auth?: RawAuth
  transitions?: string[]
}

type RawEndpoint = {
  description?: string
  behavior?: string
  returns?: string
  auth?: RawAuth
}

type RawApi = {
  endpoints: Record<string, RawEndpoint>
}

type RawEntity = {
  description?: string
  goal?: string
  fields?: Record<string, RawField>
  relations?: Record<string, RelationSchema>
  behaviors?: Record<string, RawBehavior>
  stateMachine?: RawStateMachine
}

type RawSchema = {
  meta: Partial<SchemaMeta> & { name: string }
  entities?: Record<string, RawEntity>
  apis?: Record<string, RawApi>
}

function normalizeField(name: string, raw: RawField): FieldSchema {
  if (!raw.type) throw new Error(`Field "${name}" is missing required property "type"`)

  const gdprCategory = raw.gdprCategory ?? raw.gdpr?.category
  const gdprRetention = raw.gdprRetention ?? raw.gdpr?.retention
  const gdprLegalBasis = raw.gdprLegalBasis ?? raw.gdpr?.legalBasis

  return {
    name,
    type: raw.type,
    description: raw.description,
    nullable: raw.nullable ?? false,
    primaryKey: raw.primaryKey ?? false,
    enumValues: raw.type === 'enum' ? (raw.enumValues ?? raw.values) : undefined,
    foreignKey: raw.foreignKey,
    pii: raw.pii ?? false,
    gdprCategory,
    gdprRetention,
    gdprLegalBasis,
  }
}

function normalizeTransition(raw: RawTransition): TransitionSchema {
  const guards = raw.guards ?? (raw.guard ? [raw.guard] : [])
  const effects = raw.effects ?? (raw.effect ? [raw.effect] : [])
  return { from: raw.from, to: raw.to, trigger: raw.trigger, guards, effects }
}

function normalizeState(name: string, raw: RawState | string): StateSchema {
  if (typeof raw === 'string') {
    return { name, description: raw, terminal: false }
  }
  return { name, description: raw.description ?? '', terminal: raw.terminal ?? false }
}

function normalizeStateMachine(raw: RawStateMachine): StateMachineSchema {
  const states: Record<string, StateSchema> = {}
  for (const [name, s] of Object.entries(raw.states)) {
    states[name] = normalizeState(name, s)
  }
  return {
    field: raw.field,
    initial: raw.initial,
    states,
    transitions: raw.transitions.map(normalizeTransition),
  }
}

function normalizeBehavior(name: string, raw: RawBehavior): BehaviorSchema {
  const input: Record<string, FieldSchema> | undefined = raw.input
    ? Object.fromEntries(Object.entries(raw.input).map(([k, v]) => [k, normalizeField(k, v)]))
    : undefined
  return {
    name,
    description: raw.description ?? '',
    rules: raw.rules ?? [],
    input,
    output: raw.output,
    auth: raw.auth,
    transitions: raw.transitions,
  }
}

function normalizeEntity(name: string, raw: RawEntity): EntitySchema {
  const fields: Record<string, FieldSchema> = {}
  const pii: string[] = []
  const gdpr: Record<string, GdprCategory> = {}

  for (const [fieldName, rawField] of Object.entries(raw.fields ?? {})) {
    const field = normalizeField(fieldName, rawField)
    fields[fieldName] = field
    if (field.pii) pii.push(fieldName)
    if (field.gdprCategory) gdpr[fieldName] = field.gdprCategory
  }

  const behaviors: Record<string, BehaviorSchema> = {}
  for (const [bName, rawB] of Object.entries(raw.behaviors ?? {})) {
    behaviors[bName] = normalizeBehavior(bName, rawB)
  }

  return {
    name,
    description: raw.description ?? '',
    goal: raw.goal,
    fields,
    relations: raw.relations ?? {},
    behaviors,
    stateMachine: raw.stateMachine ? normalizeStateMachine(raw.stateMachine) : undefined,
    pii,
    gdpr,
  }
}

function normalizeEndpoint(key: string, raw: RawEndpoint): EndpointSchema {
  const spaceIdx = key.indexOf(' ')
  const method = spaceIdx === -1 ? key : key.slice(0, spaceIdx).toUpperCase()
  const path = spaceIdx === -1 ? '' : key.slice(spaceIdx + 1)
  return { method, path, description: raw.description, behavior: raw.behavior, returns: raw.returns, auth: raw.auth }
}

function normalizeApi(name: string, raw: RawApi): ApiSchema {
  const endpoints: Record<string, EndpointSchema> = {}
  for (const [key, rawEp] of Object.entries(raw.endpoints ?? {})) {
    endpoints[key] = normalizeEndpoint(key, rawEp)
  }
  return { name, endpoints }
}

export function normalizeSchema(raw: unknown): FabricSchema {
  const r = raw as RawSchema
  if (!r || typeof r !== 'object') throw new Error('fabric export must be a plain object')
  if (!r.meta?.name) throw new Error('fabric export must have a "meta.name" field')

  const entities: Record<string, EntitySchema> = {}
  for (const [name, rawEntity] of Object.entries(r.entities ?? {})) {
    entities[name] = normalizeEntity(name, rawEntity)
  }

  const apis: Record<string, ApiSchema> = {}
  for (const [name, rawApi] of Object.entries(r.apis ?? {})) {
    apis[name] = normalizeApi(name, rawApi)
  }

  return {
    version: CURRENT_IR_VERSION,
    meta: {
      name: r.meta.name,
      description: r.meta.description,
      version: r.meta.version,
      namespace: r.meta.namespace,
    },
    entities,
    apis,
  }
}
