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
// Options
// ---------------------------------------------------------------------------

export type WikiSection = 'fields' | 'relations' | 'stateMachine' | 'behaviors'

export interface WikiGeneratorOptions {
  /** Sections to omit from every entity page. */
  hiddenSections?: WikiSection[]
}

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

function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
  return `---\n${lines.join('\n')}\n---\n`
}

// ---------------------------------------------------------------------------
// Fields section — player-facing (no PII/primary-key/nullable details)
// ---------------------------------------------------------------------------

function renderFields(fields: Record<string, FieldSchema>): string {
  const visible = Object.values(fields).filter((f) => !f.primaryKey && !f.pii)
  if (!visible.length) return '_No fields._'
  const rows = visible.map((f) => [
    esc(f.name),
    f.type === 'enum' && f.enumValues ? f.enumValues.map((v) => `\`${v}\``).join(', ') : f.type,
    esc(f.description ?? ''),
  ])
  return mdTable(['Field', 'Type', 'Description'], rows)
}

// ---------------------------------------------------------------------------
// State machine section
// ---------------------------------------------------------------------------

function renderStateMachine(sm: StateMachineSchema): string {
  const lines: string[] = []
  lines.push('## States')
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

  const stateRows = Object.values(sm.states).map((s) => [`\`${s.name}\``, esc(s.description)])
  lines.push(mdTable(['State', 'Description'], stateRows))

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Behaviors section — player-facing (no auth/implementation details shown
// unless rules are explicitly provided, since some rules are design notes)
// ---------------------------------------------------------------------------

function renderBehaviors(behaviors: Record<string, BehaviorSchema>): string {
  if (!Object.keys(behaviors).length) return ''
  const lines: string[] = ['## Actions', '']
  for (const b of Object.values(behaviors)) {
    lines.push(`### ${b.name}`)
    lines.push('')
    lines.push(b.description)
    lines.push('')
    if (b.rules.length) {
      lines.push('**Conditions:**')
      for (const r of b.rules) lines.push(`- ${r}`)
      lines.push('')
    }
    if (b.input && Object.keys(b.input).length) {
      lines.push('**Parameters:**')
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

function renderEntityPage(
  entity: EntitySchema,
  allEntities: Record<string, EntitySchema>,
  hidden: Set<WikiSection>,
): string {
  const lines: string[] = []

  lines.push(frontmatter({ title: entity.name }))
  lines.push(`# ${entity.name}`)
  lines.push('')
  if (entity.tags.length) {
    lines.push(entity.tags.map((t) => `\`${t}\``).join(' · '))
    lines.push('')
  }
  lines.push(entity.description || '_No description._')
  if (entity.goal) {
    lines.push('')
    lines.push(`> ${entity.goal}`)
  }
  lines.push('')

  if (!hidden.has('fields')) {
    lines.push('## Attributes')
    lines.push('')
    lines.push(renderFields(entity.fields))
    lines.push('')
  }

  if (!hidden.has('relations') && Object.keys(entity.relations).length) {
    lines.push('## Related')
    lines.push('')
    const relRows = Object.values(entity.relations).map((r) => {
      const targetSlug = slugify(r.target)
      const targetLink = allEntities[r.target] ? `[${r.target}](${targetSlug}.md)` : r.target
      return [esc(r.name), r.kind, targetLink]
    })
    lines.push(mdTable(['Name', 'Kind', 'Target'], relRows))
    lines.push('')
  }

  if (!hidden.has('stateMachine') && entity.stateMachine) {
    lines.push(renderStateMachine(entity.stateMachine))
    lines.push('')
  }

  if (!hidden.has('behaviors')) {
    const behaviorsBlock = renderBehaviors(entity.behaviors)
    if (behaviorsBlock) {
      lines.push(behaviorsBlock)
      lines.push('')
    }
  }

  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Index page
// ---------------------------------------------------------------------------

function renderIndex(schema: FabricSchema): string {
  const lines: string[] = []
  lines.push(frontmatter({ title: schema.meta.name }))
  lines.push(`# ${schema.meta.name}`)
  lines.push('')
  if (schema.meta.description) {
    lines.push(schema.meta.description)
    lines.push('')
  }

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

export class WikiGenerator implements Generator {
  readonly name = 'wiki'
  readonly dependsOn: string[] = []

  private readonly hidden: Set<WikiSection>

  constructor(options: WikiGeneratorOptions = {}) {
    this.hidden = new Set(options.hiddenSections ?? [])
  }

  async generate(schema: FabricSchema, _ctx: GeneratorContext): Promise<GeneratorOutput> {
    const files: GeneratorOutput['files'] = []
    const header = '<!-- @generated by @newel/generator-wiki — do not edit -->\n'

    for (const entity of Object.values(schema.entities)) {
      const slug = slugify(entity.name)
      files.push({
        path: `wiki/entities/${slug}.md`,
        content: renderEntityPage(entity, schema.entities, this.hidden),
        header,
      })
    }

    files.push({
      path: 'wiki/index.md',
      content: renderIndex(schema),
      header,
    })

    return { files }
  }
}
