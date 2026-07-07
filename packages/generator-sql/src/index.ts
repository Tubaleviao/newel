import type {
  Generator,
  GeneratorContext,
  GeneratorOutput,
  FabricSchema,
  EntitySchema,
  FieldSchema,
  RelationSchema,
  StateMachineSchema,
} from '@quoin/core'
import type { IRSnapshot } from '@quoin/core'

// --- Naming helpers ---

function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

function tableName(entityName: string): string {
  const snake = toSnakeCase(entityName)
  if (snake.endsWith('s')) return snake
  if (snake.endsWith('y') && !/[aeiou]y$/.test(snake)) return snake.slice(0, -1) + 'ies'
  return snake + 's'
}

function enumTypeName(entityName: string, fieldName: string): string {
  return `${toSnakeCase(entityName)}_${toSnakeCase(fieldName)}_enum`
}

// --- SQL type mapping ---

function fieldToSqlType(entityName: string, field: FieldSchema): string {
  if (field.type === 'enum' && field.enumValues) {
    return enumTypeName(entityName, field.name)
  }
  const map: Record<string, string> = {
    string:    'TEXT',
    number:    'NUMERIC',
    integer:   'INTEGER',
    decimal:   'NUMERIC(19, 4)',
    boolean:   'BOOLEAN',
    uuid:      'UUID',
    timestamp: 'TIMESTAMPTZ',
    date:      'DATE',
    email:     'TEXT',
    url:       'TEXT',
    json:      'JSONB',
  }
  return map[field.type] ?? 'TEXT'
}

// --- Terminal state CHECK constraint ---

function terminalCheckConstraint(entityName: string, sm: StateMachineSchema): string | null {
  const terminalStates = Object.values(sm.states)
    .filter(s => s.terminal)
    .map(s => `'${s.name}'`)

  if (terminalStates.length === 0) return null

  const col = toSnakeCase(sm.field)
  const vals = terminalStates.join(', ')
  const table = tableName(entityName)
  return `  CONSTRAINT chk_${table}_terminal_${col} CHECK (${col} NOT IN (${vals}) OR ${col} IS NOT NULL)`
}

// --- CREATE TYPE (enum) ---

function renderCreateEnum(entityName: string, field: FieldSchema): string {
  const typeName = enumTypeName(entityName, field.name)
  const vals = (field.enumValues ?? []).map(v => `'${v}'`).join(', ')
  return `CREATE TYPE ${typeName} AS ENUM (${vals});`
}

// --- Column DDL ---

function renderColumn(entityName: string, field: FieldSchema): string {
  const colName = toSnakeCase(field.name)
  const sqlType = fieldToSqlType(entityName, field)
  const parts: string[] = [`  ${colName} ${sqlType}`]

  if (field.primaryKey) parts.push('PRIMARY KEY')
  if (!field.nullable && !field.primaryKey) parts.push('NOT NULL')

  return parts.join(' ')
}

// --- FK constraints ---

function renderFkConstraint(entityName: string, field: FieldSchema): string | null {
  if (!field.foreignKey) return null
  const [refEntity, refField = 'id'] = field.foreignKey.split('.')
  const colName = toSnakeCase(field.name)
  const constraintName = `fk_${toSnakeCase(entityName)}_${colName}`
  return `  CONSTRAINT ${constraintName} FOREIGN KEY (${colName}) REFERENCES ${tableName(refEntity)} (${toSnakeCase(refField)})`
}

// --- Join table for manyToMany ---

function renderJoinTable(rel: RelationSchema, ownerEntityName: string): string | null {
  if (rel.kind !== 'manyToMany') return null

  const left = toSnakeCase(ownerEntityName)
  const right = toSnakeCase(rel.target)
  const joinTable = rel.through ? toSnakeCase(rel.through) : `${left}_${right}`

  return [
    `CREATE TABLE IF NOT EXISTS ${joinTable} (`,
    `  ${left}_id UUID NOT NULL,`,
    `  ${right}_id UUID NOT NULL,`,
    `  PRIMARY KEY (${left}_id, ${right}_id),`,
    `  CONSTRAINT fk_${joinTable}_${left} FOREIGN KEY (${left}_id) REFERENCES ${tableName(ownerEntityName)} (id),`,
    `  CONSTRAINT fk_${joinTable}_${right} FOREIGN KEY (${right}_id) REFERENCES ${tableName(rel.target)} (id)`,
    ');',
  ].join('\n')
}

// --- CREATE TABLE ---

function renderCreateTable(entityName: string, entity: EntitySchema): string {
  const table = tableName(entityName)
  const lines: string[] = [`CREATE TABLE IF NOT EXISTS ${table} (`]
  const cols: string[] = []
  const constraints: string[] = []

  for (const field of Object.values(entity.fields)) {
    cols.push(renderColumn(entityName, field))
    const fk = renderFkConstraint(entityName, field)
    if (fk) constraints.push(fk)
  }

  // Terminal state CHECK constraint
  if (entity.stateMachine) {
    const chk = terminalCheckConstraint(entityName, entity.stateMachine)
    if (chk) constraints.push(chk)
  }

  const allLines = [...cols, ...constraints]
  for (let i = 0; i < allLines.length; i++) {
    lines.push(allLines[i] + (i < allLines.length - 1 ? ',' : ''))
  }

  lines.push(');')
  return lines.join('\n')
}

// --- Full DDL ---

function generateDdl(schema: FabricSchema): string {
  const blocks: string[] = [
    `-- Generated from ${schema.meta.name} v${schema.meta.version ?? '1.0.0'}`,
    '',
  ]

  // Enum types first
  for (const [name, entity] of Object.entries(schema.entities)) {
    for (const field of Object.values(entity.fields)) {
      if (field.type === 'enum' && field.enumValues) {
        blocks.push(renderCreateEnum(name, field))
      }
    }
  }

  // Tables
  for (const [name, entity] of Object.entries(schema.entities)) {
    blocks.push(renderCreateTable(name, entity))
    blocks.push('')
  }

  // Join tables for manyToMany
  for (const [entityName, entity] of Object.entries(schema.entities)) {
    for (const rel of Object.values(entity.relations)) {
      const joinTable = renderJoinTable(rel, entityName)
      if (joinTable) {
        blocks.push(joinTable)
        blocks.push('')
      }
    }
  }

  return blocks.join('\n')
}

// --- IR diff for incremental migrations ---

interface FieldDiff {
  added: FieldSchema[]
  removed: FieldSchema[]
  changed: Array<{ prev: FieldSchema; next: FieldSchema }>
}

interface EntityDiff {
  entityName: string
  tableCreated: boolean
  tableDropped: boolean
  fields: FieldDiff
  enumsAdded: Array<{ field: FieldSchema }>
  enumValuesAdded: Array<{ field: FieldSchema; newValues: string[] }>
}

function diffSchemas(prev: FabricSchema, next: FabricSchema): EntityDiff[] {
  const diffs: EntityDiff[] = []

  const prevEntities = prev.entities
  const nextEntities = next.entities

  // New tables
  for (const [name, entity] of Object.entries(nextEntities)) {
    if (!prevEntities[name]) {
      diffs.push({
        entityName: name,
        tableCreated: true,
        tableDropped: false,
        fields: { added: [], removed: [], changed: [] },
        enumsAdded: [],
        enumValuesAdded: [],
      })
      continue
    }

    // Diff existing entity fields
    const prevFields = prevEntities[name].fields
    const nextFields = entity.fields
    const fieldDiff: FieldDiff = { added: [], removed: [], changed: [] }
    const enumsAdded: Array<{ field: FieldSchema }> = []
    const enumValuesAdded: Array<{ field: FieldSchema; newValues: string[] }> = []

    for (const [fname, field] of Object.entries(nextFields)) {
      if (!prevFields[fname]) {
        fieldDiff.added.push(field)
        if (field.type === 'enum' && field.enumValues) {
          enumsAdded.push({ field })
        }
      } else {
        const pf = prevFields[fname]
        // Detect enum values additions
        if (field.type === 'enum' && pf.type === 'enum') {
          const prevVals = new Set(pf.enumValues ?? [])
          const newVals = (field.enumValues ?? []).filter(v => !prevVals.has(v))
          if (newVals.length > 0) {
            enumValuesAdded.push({ field, newValues: newVals })
          }
        }
        // Detect other column changes (type, nullability)
        if (pf.type !== field.type || pf.nullable !== field.nullable) {
          fieldDiff.changed.push({ prev: pf, next: field })
        }
      }
    }

    for (const [fname, field] of Object.entries(prevFields)) {
      if (!nextFields[fname]) {
        fieldDiff.removed.push(field)
      }
    }

    const hasDiff =
      fieldDiff.added.length > 0 ||
      fieldDiff.removed.length > 0 ||
      fieldDiff.changed.length > 0 ||
      enumValuesAdded.length > 0

    if (hasDiff) {
      diffs.push({
        entityName: name,
        tableCreated: false,
        tableDropped: false,
        fields: fieldDiff,
        enumsAdded,
        enumValuesAdded,
      })
    }
  }

  // Removed tables
  for (const name of Object.keys(prevEntities)) {
    if (!nextEntities[name]) {
      diffs.push({
        entityName: name,
        tableCreated: false,
        tableDropped: true,
        fields: { added: [], removed: [], changed: [] },
        enumsAdded: [],
        enumValuesAdded: [],
      })
    }
  }

  return diffs
}

function renderIncrementalMigration(
  schema: FabricSchema,
  prev: FabricSchema,
  migrationLabel: string,
): string {
  const diffs = diffSchemas(prev, schema)
  if (diffs.length === 0) return ''

  const lines: string[] = [
    `-- Incremental migration: ${migrationLabel}`,
    `-- From: ${prev.meta.version ?? 'unknown'} → ${schema.meta.version ?? 'unknown'}`,
    '',
    '-- Up',
    '',
  ]

  for (const diff of diffs) {
    const table = tableName(diff.entityName)

    if (diff.tableCreated) {
      const entity = schema.entities[diff.entityName]
      // Emit enum types for new tables
      for (const field of Object.values(entity.fields)) {
        if (field.type === 'enum' && field.enumValues) {
          lines.push(renderCreateEnum(diff.entityName, field))
        }
      }
      lines.push(renderCreateTable(diff.entityName, entity))
      lines.push('')
      continue
    }

    if (diff.tableDropped) {
      lines.push(`-- MANUAL REVIEW: Table "${table}" was removed from the schema.`)
      lines.push(`-- DROP TABLE IF EXISTS ${table}; -- uncomment after verifying data migration`)
      lines.push('')
      continue
    }

    // New enum types for added enum fields
    for (const { field } of diff.enumsAdded) {
      lines.push(renderCreateEnum(diff.entityName, field))
    }

    // Enum value additions (ALTER TYPE ... ADD VALUE)
    for (const { field, newValues } of diff.enumValuesAdded) {
      const typeName = enumTypeName(diff.entityName, field.name)
      for (const val of newValues) {
        lines.push(`ALTER TYPE ${typeName} ADD VALUE IF NOT EXISTS '${val}';`)
      }
    }

    // Added columns
    for (const field of diff.fields.added) {
      const colName = toSnakeCase(field.name)
      const sqlType = fieldToSqlType(diff.entityName, field)
      if (!field.nullable && !field.primaryKey) {
        // NOT NULL column — must provide a default for existing rows
        lines.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${colName} ${sqlType} NOT NULL DEFAULT '';`)
        lines.push(`-- TODO: backfill ${colName} with appropriate values, then consider removing DEFAULT`)
      } else {
        lines.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${colName} ${sqlType};`)
      }
    }

    // Changed columns
    for (const { prev: pf, next: nf } of diff.fields.changed) {
      const colName = toSnakeCase(nf.name)
      if (pf.type !== nf.type) {
        lines.push(`-- MANUAL REVIEW: Column "${table}.${colName}" type changed from ${pf.type} → ${nf.type}`)
        lines.push(`-- ALTER TABLE ${table} ALTER COLUMN ${colName} TYPE ${fieldToSqlType(diff.entityName, nf)} USING ${colName}::${fieldToSqlType(diff.entityName, nf)};`)
      }
      if (pf.nullable && !nf.nullable) {
        lines.push(`ALTER TABLE ${table} ALTER COLUMN ${colName} SET NOT NULL;`)
      } else if (!pf.nullable && nf.nullable) {
        lines.push(`ALTER TABLE ${table} ALTER COLUMN ${colName} DROP NOT NULL;`)
      }
    }

    // Removed columns — never silently dropped
    for (const field of diff.fields.removed) {
      const colName = toSnakeCase(field.name)
      lines.push(`-- MANUAL REVIEW: Column "${table}.${colName}" was removed from the schema.`)
      lines.push(`-- ALTER TABLE ${table} DROP COLUMN IF EXISTS ${colName}; -- uncomment after verifying data migration`)
    }

    if (
      diff.enumsAdded.length > 0 ||
      diff.enumValuesAdded.length > 0 ||
      diff.fields.added.length > 0 ||
      diff.fields.changed.length > 0 ||
      diff.fields.removed.length > 0
    ) {
      lines.push('')
    }
  }

  return lines.join('\n')
}

// --- Migration numbering ---

function nextMigrationNumber(existingPaths: string[]): string {
  let max = 0
  for (const p of existingPaths) {
    const m = p.match(/(\d+)__/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return String(max + 1).padStart(6, '0')
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

// --- Generator ---

export class SqlGenerator implements Generator {
  readonly name = 'sql'
  readonly dependsOn: string[] = ['typescript']

  async generate(schema: FabricSchema, ctx: GeneratorContext): Promise<GeneratorOutput> {
    const files = []
    const prevSnapshot: IRSnapshot | undefined = ctx.previousSnapshot

    // Always write the full DDL (baseline schema)
    files.push({
      path: 'sql/schema.sql',
      content: generateDdl(schema),
      header: '-- @generated by @quoin/generator-sql — do not edit\n',
    })

    if (!prevSnapshot) {
      // First run: emit init migration
      const version = schema.meta.version ?? '1.0.0'
      const label = slugify(`init_${version}`)
      files.push({
        path: `sql/migrations/000001__${label}.sql`,
        content: [
          `-- Migration: initial schema for ${schema.meta.name}`,
          `-- Version: ${version}`,
          '',
          '-- Up',
          '',
          generateDdl(schema),
        ].join('\n'),
        header: '-- @generated by @quoin/generator-sql — do not edit\n',
      })
    } else {
      // Incremental migration from previous snapshot
      const existingMigrationPaths = ctx.outputs
        .get('sql')
        ?.files
        .filter(f => f.path.startsWith('sql/migrations/'))
        .map(f => f.path) ?? []

      const num = nextMigrationNumber(existingMigrationPaths)
      const version = schema.meta.version ?? '1.0.0'
      const label = slugify(version)
      const migPath = `sql/migrations/${num}__${label}.sql`
      const migContent = renderIncrementalMigration(schema, prevSnapshot.schema, label)

      if (migContent.trim()) {
        files.push({
          path: migPath,
          content: migContent,
          header: '-- @generated by @quoin/generator-sql — do not edit\n',
        })
      }
    }

    return { files }
  }
}
