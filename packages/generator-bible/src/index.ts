import type {
  Generator,
  GeneratorContext,
  GeneratorOutput,
  FabricSchema,
  EntitySchema,
  StateMachineSchema,
  BehaviorSchema,
  FieldSchema,
} from '@newel/core'

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/\|/g, '\\|')
}

function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map((h) => '-'.repeat(Math.max(h.length, 3)))
  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n')
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

// ---------------------------------------------------------------------------
// State-machine diagram (Mermaid)
// ---------------------------------------------------------------------------

function renderStateMachine(sm: StateMachineSchema): string {
  const lines: string[] = []
  lines.push('### State machine')
  lines.push('')
  lines.push(`**Field:** \`${sm.field}\` &nbsp; **Initial:** \`${sm.initial}\``)
  lines.push('')
  lines.push('```mermaid')
  lines.push('stateDiagram-v2')
  lines.push(`  [*] --> ${sm.initial}`)
  for (const t of sm.transitions) {
    const froms = Array.isArray(t.from) ? t.from : [t.from]
    const label = t.trigger + (t.guards.length ? `\\n[${t.guards.join('; ')}]` : '')
    for (const f of froms) {
      lines.push(`  ${f} --> ${t.to} : ${label}`)
    }
  }
  for (const [name, state] of Object.entries(sm.states)) {
    if (state.terminal) lines.push(`  ${name} --> [*]`)
  }
  lines.push('```')
  lines.push('')

  const stateRows = Object.values(sm.states).map((s) => [
    `\`${s.name}\``,
    esc(s.description),
    s.terminal ? 'yes' : '',
  ])
  lines.push(mdTable(['State', 'Description', 'Terminal'], stateRows))
  lines.push('')

  const transRows = sm.transitions.map((t) => {
    const from = Array.isArray(t.from) ? t.from.map((f) => `\`${f}\``).join(', ') : `\`${t.from}\``
    return [
      from,
      `\`${t.to}\``,
      `\`${t.trigger}\``,
      esc(t.guards.join('; ')),
      esc(t.effects.join('; ')),
    ]
  })
  lines.push(mdTable(['From', 'To', 'Trigger', 'Guards', 'Effects'], transRows))

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Fields table
// ---------------------------------------------------------------------------

function renderFields(fields: Record<string, FieldSchema>): string {
  if (!Object.keys(fields).length) return '_No fields._'
  const rows = Object.values(fields).map((f) => [
    `\`${f.name}\``,
    f.type === 'enum' && f.enumValues
      ? `enum (${f.enumValues.map((v) => `\`${v}\``).join(', ')})`
      : f.type,
    f.nullable ? 'no' : 'yes',
    esc(f.description ?? ''),
  ])
  return mdTable(['Name', 'Type', 'Required', 'Description'], rows)
}

// ---------------------------------------------------------------------------
// Behaviors section
// ---------------------------------------------------------------------------

function renderBehaviors(behaviors: Record<string, BehaviorSchema>): string {
  if (!Object.keys(behaviors).length) return ''
  const lines: string[] = ['## Behaviors', '']
  for (const b of Object.values(behaviors)) {
    lines.push(`### \`${b.name}\``)
    lines.push('')
    lines.push(b.description)
    lines.push('')
    if (b.rules.length) {
      lines.push('**Rules:**')
      for (const r of b.rules) lines.push(`- ${r}`)
      lines.push('')
    }
    if (b.auth) {
      const roles = b.auth.roles.join(', ')
      const owner = b.auth.ownerField ? ` &nbsp; Owner field: \`${b.auth.ownerField}\`` : ''
      lines.push(`**Auth:** \`${roles}\`${owner}`)
      lines.push('')
    }
    if (b.input && Object.keys(b.input).length) {
      lines.push('**Input:**')
      lines.push('')
      lines.push(renderFields(b.input))
      lines.push('')
    }
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Entity page
// ---------------------------------------------------------------------------

function renderEntityPage(entity: EntitySchema, allEntities: Record<string, EntitySchema>): string {
  const lines: string[] = []

  lines.push(`# ${entity.name}`)
  lines.push('')
  if (entity.tags.length) {
    lines.push(`**Tags:** ${entity.tags.map((t) => `\`${t}\``).join(', ')}`)
    lines.push('')
  }
  lines.push(entity.description || '_No description._')
  if (entity.goal) {
    lines.push('')
    lines.push(`> **Goal:** ${entity.goal}`)
  }
  lines.push('')

  lines.push('## Fields')
  lines.push('')
  lines.push(renderFields(entity.fields))
  lines.push('')

  if (Object.keys(entity.relations).length) {
    lines.push('## Relations')
    lines.push('')
    const relRows = Object.values(entity.relations).map((r) => {
      const targetSlug = slugify(r.target)
      const targetLink = allEntities[r.target] ? `[${r.target}](${targetSlug}.md)` : r.target
      return [`\`${r.name}\``, r.kind, targetLink, r.foreignKey ? `\`${r.foreignKey}\`` : '']
    })
    lines.push(mdTable(['Name', 'Kind', 'Target', 'Foreign Key'], relRows))
    lines.push('')
  }

  if (entity.stateMachine) {
    lines.push(renderStateMachine(entity.stateMachine))
    lines.push('')
  }

  const behaviorsBlock = renderBehaviors(entity.behaviors)
  if (behaviorsBlock) {
    lines.push(behaviorsBlock)
    lines.push('')
  }

  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Index page
// ---------------------------------------------------------------------------

function renderIndex(schema: FabricSchema): string {
  const lines: string[] = []
  lines.push(`# ${schema.meta.name} — Design Bible`)
  lines.push('')
  if (schema.meta.description) {
    lines.push(schema.meta.description)
    lines.push('')
  }
  lines.push(`> Fabric version: \`${schema.meta.version ?? '?'}\``)
  lines.push('')

  // Group entities by first tag
  const groups: Record<string, EntitySchema[]> = {}
  for (const entity of Object.values(schema.entities)) {
    const group = entity.tags[0] ?? 'other'
    if (!groups[group]) groups[group] = []
    groups[group].push(entity)
  }

  for (const [group, entities] of Object.entries(groups).sort()) {
    lines.push(`## ${group.charAt(0).toUpperCase() + group.slice(1)}`)
    lines.push('')
    for (const e of entities.sort((a, b) => a.name.localeCompare(b.name))) {
      const slug = slugify(e.name)
      const desc = e.description ? ` — ${e.description.split('.')[0]}` : ''
      lines.push(`- [${e.name}](entities/${slug}.md)${desc}`)
    }
    lines.push('')
  }

  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export class BibleGenerator implements Generator {
  readonly name = 'bible'
  readonly dependsOn: string[] = []

  async generate(schema: FabricSchema, _ctx: GeneratorContext): Promise<GeneratorOutput> {
    const files: GeneratorOutput['files'] = []
    const header = '<!-- @generated by @newel/generator-bible — do not edit -->\n'

    // Per-entity pages
    for (const entity of Object.values(schema.entities)) {
      const slug = slugify(entity.name)
      files.push({
        path: `bible/entities/${slug}.md`,
        content: renderEntityPage(entity, schema.entities),
        header,
      })
    }

    // Index
    files.push({
      path: 'bible/index.md',
      content: renderIndex(schema),
      header,
    })

    return { files }
  }
}
