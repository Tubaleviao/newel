import type { FabricSchema, EntitySchema, FieldSchema, StateMachineSchema } from './types'

export interface ValidationError {
  path: string
  message: string
}

export interface ValidationWarning {
  path: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

function err(path: string, message: string): ValidationError {
  return { path, message }
}

function warn(path: string, message: string): ValidationWarning {
  return { path, message }
}

function validateStateMachine(
  sm: StateMachineSchema,
  entity: EntitySchema,
  entityName: string,
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  const base = `entities.${entityName}.stateMachine`
  const stateNames = new Set(Object.keys(sm.states))

  if (!stateNames.has(sm.initial)) {
    errors.push(err(`${base}.initial`, `initial state "${sm.initial}" is not declared in states`))
  }

  if (!(sm.field in entity.fields)) {
    errors.push(err(`${base}.field`, `state machine field "${sm.field}" does not exist on entity`))
  }

  for (let i = 0; i < sm.transitions.length; i++) {
    const t = sm.transitions[i]
    const tBase = `${base}.transitions[${i}]`

    const froms = Array.isArray(t.from) ? t.from : [t.from]
    for (const f of froms) {
      if (!stateNames.has(f)) {
        errors.push(err(`${tBase}.from`, `state "${f}" is not declared in states`))
      }
    }

    if (!stateNames.has(t.to)) {
      errors.push(err(`${tBase}.to`, `state "${t.to}" is not declared in states`))
    }

    if (t.trigger && !(t.trigger in entity.behaviors)) {
      errors.push(
        err(
          `${tBase}.trigger`,
          `trigger "${t.trigger}" does not match any behavior on entity "${entityName}"`,
        ),
      )
    } else if (t.trigger && t.guards.length > 0) {
      const behavior = entity.behaviors[t.trigger]
      if (behavior) {
        const guardSet = new Set(t.guards)
        const ruleSet = new Set(behavior.rules)
        const guardsDifferFromRules =
          t.guards.some((g) => !ruleSet.has(g)) || behavior.rules.some((r) => !guardSet.has(r))
        if (guardsDifferFromRules) {
          warnings.push(
            warn(
              `${tBase}.guards`,
              `transition guards differ from behavior "${t.trigger}" rules — prefer letting the normalizer derive guards from rules to avoid duplication`,
            ),
          )
        }
      }
    }
  }

  return { errors, warnings }
}

function seedValueError(field: FieldSchema, v: unknown): string | null {
  if (v === null) return field.nullable ? null : 'null is not allowed (field is not nullable)'
  switch (field.type) {
    case 'string':
    case 'email':
    case 'url':
    case 'uuid':
    case 'timestamp':
    case 'date':
      if (typeof v !== 'string') return `expected string, got ${typeof v}`
      break
    case 'number':
    case 'decimal':
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'expected finite number'
      break
    case 'integer':
      if (typeof v !== 'number' || !Number.isInteger(v)) return 'expected integer'
      break
    case 'bigint':
    case 'money':
      if (!(typeof v === 'string' && /^-?\d+$/.test(v)) && !Number.isSafeInteger(v)) {
        return 'expected integer (number, bigint or integer string)'
      }
      break
    case 'boolean':
      if (typeof v !== 'boolean') return 'expected boolean'
      break
    case 'enum':
      if (typeof v !== 'string' || !(field.enumValues ?? []).includes(v)) {
        return `expected one of [${(field.enumValues ?? []).join(', ')}]`
      }
      break
  }
  if (field.pattern !== undefined && typeof v === 'string') {
    try {
      if (!new RegExp(field.pattern).test(v)) return `does not match pattern ${field.pattern}`
    } catch {
      // invalid pattern is reported on the field itself
    }
  }
  return null
}

function validateSeeds(
  name: string,
  entity: EntitySchema,
  schema: FabricSchema,
): ValidationError[] {
  const errors: ValidationError[] = []
  entity.seeds?.forEach((row, i) => {
    const loc = `entities.${name}.seeds[${i}]`
    for (const key of Object.keys(row)) {
      if (!(key in entity.fields)) errors.push(err(`${loc}.${key}`, `unknown field "${key}"`))
    }
    for (const [fName, field] of Object.entries(entity.fields)) {
      const v = row[fName]
      if (v === undefined) {
        // generated SQL/TS seeds emit no column defaults, so every non-null field must be explicit
        if (!field.nullable) {
          errors.push(err(`${loc}.${fName}`, `missing required field "${fName}"`))
        }
        continue
      }
      const msg = seedValueError(field, v)
      if (msg) errors.push(err(`${loc}.${fName}`, msg))
      else if (field.foreignKey && v !== null) {
        const [refEntity, refField = 'id'] = field.foreignKey.split('.')
        const target = schema.entities[refEntity]
        if (target?.seeds && !target.seeds.some((s) => String(s[refField]) === String(v))) {
          errors.push(
            err(
              `${loc}.${fName}`,
              `foreign key "${String(v)}" not found in ${refEntity}.${refField} seeds`,
            ),
          )
        }
      }
    }
  })
  return errors
}

const PATTERN_TYPES = new Set(['string', 'email', 'url'])

function validateEntity(
  name: string,
  entity: EntitySchema,
  schema: FabricSchema,
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  if (!Array.isArray(entity.tags)) {
    errors.push(err(`entities.${name}.tags`, `"tags" must be an array of strings`))
  } else {
    const badIdx = entity.tags.findIndex((t) => typeof t !== 'string')
    if (badIdx !== -1) {
      errors.push(
        err(
          `entities.${name}.tags[${badIdx}]`,
          `must be a string, got ${JSON.stringify(entity.tags[badIdx])}`,
        ),
      )
    }
  }

  entity.spawns?.forEach((spawn, i) => {
    if (!(spawn.target in schema.entities)) {
      errors.push(
        err(
          `entities.${name}.spawns[${i}].target`,
          `spawn target "${spawn.target}" does not exist in entities`,
        ),
      )
    }
    if (typeof spawn.weight !== 'number' || spawn.weight < 0 || spawn.weight > 1) {
      errors.push(err(`entities.${name}.spawns[${i}].weight`, `weight must be between 0 and 1`))
    }
  })

  errors.push(...validateSeeds(name, entity, schema))

  for (const [fName, field] of Object.entries(entity.fields)) {
    const loc = `entities.${name}.fields.${fName}`
    if (field.currency !== undefined && field.type !== 'money') {
      errors.push(err(`${loc}.currency`, `"currency" is only valid on "money" fields`))
    }
    if (field.pattern !== undefined) {
      if (!PATTERN_TYPES.has(field.type)) {
        errors.push(err(`${loc}.pattern`, `"pattern" is only valid on string-like fields`))
      }
      try {
        new RegExp(field.pattern)
      } catch (e) {
        errors.push(err(`${loc}.pattern`, `invalid regular expression: ${(e as Error).message}`))
      }
    }
  }

  for (const [bName, behavior] of Object.entries(entity.behaviors)) {
    if (behavior.auth?.ownerField && !(behavior.auth.ownerField in entity.fields)) {
      errors.push(
        err(
          `entities.${name}.behaviors.${bName}.auth.ownerField`,
          `ownerField "${behavior.auth.ownerField}" does not exist on entity "${name}"`,
        ),
      )
    }
  }

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const base = `entities.${name}.fields.${fieldName}`
    if (field.type === 'enum' && (!field.enumValues || field.enumValues.length === 0)) {
      errors.push(err(base, `enum field must have at least one value in enumValues`))
    }
    if (
      field.type === 'enum' &&
      field.enumValues &&
      field.defaultValue !== undefined &&
      typeof field.defaultValue === 'string' &&
      !field.enumValues.includes(field.defaultValue)
    ) {
      errors.push(
        err(
          `${base}.defaultValue`,
          `defaultValue "${field.defaultValue}" is not a member of enumValues [${field.enumValues.join(', ')}]`,
        ),
      )
    }
    if (field.foreignKey) {
      const [refEntity] = field.foreignKey.split('.')
      if (!(refEntity in schema.entities)) {
        errors.push(err(`${base}.foreignKey`, `references unknown entity "${refEntity}"`))
      }
    }
  }

  for (const [relName, rel] of Object.entries(entity.relations)) {
    if (!(rel.target in schema.entities)) {
      errors.push(
        err(
          `entities.${name}.relations.${relName}.target`,
          `references unknown entity "${rel.target}"`,
        ),
      )
    }
  }

  if (entity.stateMachine) {
    const smResult = validateStateMachine(entity.stateMachine, entity, name)
    errors.push(...smResult.errors)
    warnings.push(...smResult.warnings)
  }

  return { errors, warnings }
}

function validateApis(schema: FabricSchema): ValidationError[] {
  const errors: ValidationError[] = []

  for (const [apiName, api] of Object.entries(schema.apis)) {
    for (const [key, endpoint] of Object.entries(api.endpoints)) {
      const base = `apis.${apiName}.endpoints["${key}"]`
      if (endpoint.returns && !(endpoint.returns in schema.entities)) {
        errors.push(err(`${base}.returns`, `references unknown entity "${endpoint.returns}"`))
      }

      if (endpoint.auth?.ownerField) {
        const [entityName] = (endpoint.behavior ?? '').split('.')
        const entity = entityName ? schema.entities[entityName] : undefined
        if (entity && !(endpoint.auth.ownerField in entity.fields)) {
          errors.push(
            err(
              `${base}.auth.ownerField`,
              `ownerField "${endpoint.auth.ownerField}" does not exist on entity "${entityName}"`,
            ),
          )
        }
      }
    }
  }

  return errors
}

export function validateSchema(schema: FabricSchema): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  for (const [name, entity] of Object.entries(schema.entities)) {
    const result = validateEntity(name, entity, schema)
    errors.push(...result.errors)
    warnings.push(...result.warnings)
  }

  errors.push(...validateApis(schema))

  return { valid: errors.length === 0, errors, warnings }
}
