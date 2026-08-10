import type {
  Generator,
  GeneratorContext,
  GeneratorOutput,
  FabricSchema,
  EntitySchema,
  FieldSchema,
  StateMachineSchema,
} from '@newel/core'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** IR version this generator was built against. Mismatches fail loudly. */
const SUPPORTED_IR_VERSION = '3.0.0'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pascalCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

function screamingSnake(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .replace(/[^A-Z0-9_]/gi, '')
    .toUpperCase()
}

function toSlug(s: string): string {
  return s
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/gi, '')
    .toLowerCase()
}

function pluralizeTag(tag: string): string {
  if (
    tag.endsWith('y') &&
    !tag.endsWith('ey') &&
    !tag.endsWith('ay') &&
    !tag.endsWith('oy') &&
    !tag.endsWith('uy')
  ) {
    return tag.slice(0, -1) + 'ies'
  }
  if (
    tag.endsWith('s') ||
    tag.endsWith('sh') ||
    tag.endsWith('ch') ||
    tag.endsWith('x') ||
    tag.endsWith('z')
  ) {
    return tag + 'es'
  }
  return tag + 's'
}

// ---------------------------------------------------------------------------
// .tres resource file
// ---------------------------------------------------------------------------

function renderTres(entity: EntitySchema, gdScriptPath: string): string {
  const lines: string[] = []
  lines.push(`[gd_resource type="Resource" format=3]`)
  lines.push('')
  lines.push(`[ext_resource type="Script" path="res://${gdScriptPath}" id="1"]`)
  lines.push('')
  lines.push('[resource]')
  lines.push('script = ExtResource("1")')

  for (const field of Object.values(entity.fields)) {
    const value = gdTresValue(field)
    lines.push(`${field.name} = ${value}`)
  }

  // Write state machine initial state as a string property
  if (entity.stateMachine) {
    lines.push(`state_machine_field = "${entity.stateMachine.field}"`)
    lines.push(`initial_state = "${entity.stateMachine.initial}"`)
  }

  // Write description
  if (entity.description) {
    lines.push(`description = ${JSON.stringify(entity.description)}`)
  }

  // Write tags array
  if (entity.tags.length) {
    const tagStr = entity.tags.map((t) => JSON.stringify(t)).join(', ')
    lines.push(`tags = [${tagStr}]`)
  }

  return lines.join('\n') + '\n'
}

function gdTresValue(field: FieldSchema): string {
  switch (field.type) {
    case 'integer':
      return '0'
    case 'decimal':
    case 'number':
      return '0.0'
    case 'boolean':
      return 'false'
    case 'enum':
      return '0'
    default:
      return '""'
  }
}

// ---------------------------------------------------------------------------
// GDScript enums file per entity
// ---------------------------------------------------------------------------

function gdEnumConst(val: string, fieldName?: string): string {
  const snake = screamingSnake(val)
  const prefix = fieldName ? screamingSnake(fieldName) + '_' : 'V_'
  if (!snake || /^[0-9]/.test(snake)) {
    return `${prefix}${snake || 'EMPTY'}`
  }
  return snake
}

function renderEnums(entity: EntitySchema): string {
  const smField = entity.stateMachine?.field
  // Skip the field whose name matches the state machine field — the SM enum covers it
  const enumFields = Object.values(entity.fields).filter(
    (f) => f.type === 'enum' && f.enumValues?.length && f.name !== smField,
  )
  const hasSm = entity.stateMachine && Object.keys(entity.stateMachine.states).length > 0

  const lines: string[] = []
  lines.push(`class_name ${entity.name}Data`)
  lines.push(`extends Resource`)
  lines.push('')

  for (const field of enumFields) {
    lines.push(`enum ${pascalCase(field.name)} {`)
    const seen = new Set<string>()
    for (const val of field.enumValues!) {
      const constant = gdEnumConst(val, field.name)
      if (seen.has(constant)) {
        throw new Error(
          `@newel/generator-godot: enum field "${field.name}" produces duplicate GDScript constant "${constant}" (from value "${val}")`,
        )
      }
      seen.add(constant)
      lines.push(`\t${constant},`)
    }
    lines.push('}')
    lines.push('')
  }

  if (hasSm) {
    lines.push(renderStateMachineEnum(entity.stateMachine!))
  }

  return lines.join('\n') + '\n'
}

function renderStateMachineEnum(sm: StateMachineSchema): string {
  const lines: string[] = []
  lines.push(`enum ${pascalCase(sm.field)} {`)
  const seen = new Set<string>()
  for (const state of Object.values(sm.states)) {
    const constant = gdEnumConst(state.name, sm.field)
    if (seen.has(constant)) {
      throw new Error(
        `@newel/generator-godot: state machine field "${sm.field}" produces duplicate GDScript constant "${constant}" (from state "${state.name}")`,
      )
    }
    seen.add(constant)
    lines.push(`\t${constant},`)
  }
  lines.push('}')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// GameData.gd autoload singleton
// ---------------------------------------------------------------------------

function renderGameData(schema: FabricSchema): string {
  const lines: string[] = []
  lines.push(`extends Node`)
  lines.push(`# Add to Project → Autoload as "GameData"`)
  lines.push('')

  // Group entities by first tag
  const groups: Record<string, string[]> = {}
  for (const entity of Object.values(schema.entities)) {
    const tag = toSlug(entity.tags[0] ?? 'other')
    if (!groups[tag]) groups[tag] = []
    groups[tag].push(entity.name)
  }

  for (const [tag, names] of Object.entries(groups).sort()) {
    const dir = pluralizeTag(tag)
    const varName = screamingSnake(dir)
    const entries = names
      .sort()
      .map((n) => {
        const slug = toSlug(n)
        return `\t\t${JSON.stringify(n)}: preload("res://godot/${dir}/${slug}.tres")`
      })
      .join(',\n')
    lines.push(`const ${varName}: Dictionary = {`)
    lines.push(entries)
    lines.push('}')
    lines.push('')
  }

  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export class GodotGenerator implements Generator {
  readonly name = 'godot'
  readonly dependsOn: string[] = []

  async generate(schema: FabricSchema, _ctx: GeneratorContext): Promise<GeneratorOutput> {
    if (schema.version !== SUPPORTED_IR_VERSION) {
      throw new Error(
        `@newel/generator-godot requires IR version ${SUPPORTED_IR_VERSION}, got ${schema.version}`,
      )
    }

    const files: GeneratorOutput['files'] = []
    const gdHeader = `# @generated by @newel/generator-godot — do not edit\n`
    const seenPaths = new Set<string>()

    for (const entity of Object.values(schema.entities)) {
      const tag = entity.tags[0] ?? 'other'
      const slug = toSlug(entity.name)
      const dir = pluralizeTag(toSlug(tag))

      const tresPath = `godot/${dir}/${slug}.tres`
      const gdPath = `godot/${dir}/${slug}.gd`
      if (seenPaths.has(tresPath)) {
        throw new Error(
          `@newel/generator-godot: entities "${entity.name}" and another entity produce the same output path "${tresPath}" — rename one of them`,
        )
      }
      seenPaths.add(tresPath)

      // GDScript class file — always emitted so .tres can reference it via script=
      files.push({
        path: gdPath,
        content: renderEnums(entity),
        header: gdHeader,
      })

      // .tres resource — Godot requires [gd_resource] on the very first line,
      // so no comment header is prepended.
      files.push({
        path: tresPath,
        content: renderTres(entity, gdPath),
        header: '',
      })
    }

    // Autoload singleton
    files.push({
      path: `godot/autoload/GameData.gd`,
      content: renderGameData(schema),
      header: gdHeader,
    })

    return { files }
  }
}
