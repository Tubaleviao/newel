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
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function screamingSnake(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase()
}

function pluralizeTag(tag: string): string {
  if (tag.endsWith('y') && !tag.endsWith('ey') && !tag.endsWith('ay') && !tag.endsWith('oy')) {
    return tag.slice(0, -1) + 'ies'
  }
  if (tag.endsWith('s') || tag.endsWith('sh') || tag.endsWith('ch') || tag.endsWith('x') || tag.endsWith('z')) {
    return tag + 'es'
  }
  return tag + 's'
}

// ---------------------------------------------------------------------------
// .tres resource file
// ---------------------------------------------------------------------------

function renderTres(entity: EntitySchema): string {
  const lines: string[] = []
  lines.push(`[gd_resource type="Resource" format=3]`)
  lines.push('')
  lines.push('[resource]')

  // Write scalar fields (skip enum fields — those become typed int constants)
  for (const field of Object.values(entity.fields)) {
    if (field.type === 'enum') continue
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
    case 'integer': return '0'
    case 'decimal':
    case 'number': return '0.0'
    case 'boolean': return 'false'
    default: return '""'
  }
}

// ---------------------------------------------------------------------------
// GDScript enums file per entity
// ---------------------------------------------------------------------------

function gdEnumConst(val: string): string {
  const snake = screamingSnake(val)
  return /^[0-9]/.test(snake) ? `V_${snake}` : snake
}

function renderEnums(entity: EntitySchema): string | null {
  const smField = entity.stateMachine?.field
  // Skip the field whose name matches the state machine field — the SM enum covers it
  const enumFields = Object.values(entity.fields).filter(
    (f) => f.type === 'enum' && f.enumValues?.length && f.name !== smField,
  )
  const hasSm = entity.stateMachine && Object.keys(entity.stateMachine.states).length > 0

  if (!enumFields.length && !hasSm) return null

  const lines: string[] = []
  lines.push(`extends Resource`)
  lines.push(`class_name ${entity.name}Data`)
  lines.push('')

  for (const field of enumFields) {
    lines.push(`enum ${pascalCase(field.name)} {`)
    for (const val of field.enumValues!) {
      lines.push(`\t${gdEnumConst(val)},`)
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
  lines.push(`enum State {`)
  for (const state of Object.values(sm.states)) {
    lines.push(`\t${screamingSnake(state.name)},`)
  }
  lines.push('}')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// GameData.gd autoload singleton
// ---------------------------------------------------------------------------

function renderGameData(schema: FabricSchema): string {
  const lines: string[] = []
  lines.push(`# Autoload singleton — add to Project → Autoload as "GameData"`)
  lines.push(`extends Node`)
  lines.push('')

  // Group entities by first tag
  const groups: Record<string, string[]> = {}
  for (const entity of Object.values(schema.entities)) {
    const tag = entity.tags[0] ?? 'other'
    if (!groups[tag]) groups[tag] = []
    groups[tag].push(entity.name)
  }

  for (const [tag, names] of Object.entries(groups).sort()) {
    const dir = pluralizeTag(tag)
    const varName = screamingSnake(dir)
    const entries = names
      .sort()
      .map((n) => {
        const slug = n.toLowerCase()
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
    const header = `; @generated by @newel/generator-godot — do not edit\n`

    for (const entity of Object.values(schema.entities)) {
      const tag = entity.tags[0] ?? 'other'
      const slug = entity.name.toLowerCase()

      const dir = pluralizeTag(tag)

      // .tres resource
      files.push({
        path: `godot/${dir}/${slug}.tres`,
        content: renderTres(entity),
        header,
      })

      // GDScript enum file (only when there are enums or a state machine)
      const enumContent = renderEnums(entity)
      if (enumContent) {
        files.push({
          path: `godot/${dir}/${slug}.gd`,
          content: enumContent,
          header: `# @generated by @newel/generator-godot — do not edit\n`,
        })
      }
    }

    // Autoload singleton
    files.push({
      path: `godot/autoload/GameData.gd`,
      content: renderGameData(schema),
      header: `# @generated by @newel/generator-godot — do not edit\n`,
    })

    return { files }
  }
}
