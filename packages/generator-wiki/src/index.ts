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
  return s
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\r?\n|\r/g, ' ')
}

function escLinkText(s: string): string {
  return s.replace(/\[/g, '\\[').replace(/\]/g, '\\]')
}

function escInline(s: string): string {
  return s.replace(/\r?\n|\r/g, ' ').replace(/\[/g, '\\[')
}

function mermaidId(name: string): string {
  // Sanitize characters that are problematic inside Mermaid stateDiagram-v2 node IDs.
  // Newlines break the code block regardless of quoting; double-quotes cannot be escaped
  // inside a quoted string in the stateDiagram-v2 grammar — replace all with underscores.
  const safe = name.replace(/[\r\n]+/g, '_').replace(/"/g, '_')
  if (!/[ :[\]{}]/.test(safe)) return safe
  return `"${safe}"`
}

function mermaidSanitize(s: string): string {
  return s
    .replace(/[|><":]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
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
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
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
    f.type === 'enum' && f.enumValues
      ? f.enumValues.map((v) => `\`${esc(v)}\``).join(', ')
      : f.type,
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
  lines.push(`  [*] --> ${mermaidId(sm.initial)}`)
  for (const t of sm.transitions) {
    const froms = Array.isArray(t.from) ? t.from : [t.from]
    const guards = t.guards.map(mermaidSanitize)
    const safeTrigger = mermaidSanitize(t.trigger)
    const label = safeTrigger + (guards.length ? ` [${guards.join('; ')}]` : '')
    for (const f of froms) {
      lines.push(`  ${mermaidId(f)} --> ${mermaidId(t.to)} : ${label}`)
    }
  }
  for (const [name, state] of Object.entries(sm.states)) {
    if (state.terminal) lines.push(`  ${mermaidId(name)} --> [*]`)
  }
  lines.push('```')
  lines.push('')

  const stateRows = Object.values(sm.states).map((s) => [`\`${esc(s.name)}\``, esc(s.description)])
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
    lines.push(b.description || '_No description._')
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
  slugMap: Map<string, string>,
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
      const targetEntity = allEntities[r.target]
      const targetSlug = targetEntity
        ? (slugMap.get(r.target) ?? slugify(targetEntity.name))
        : slugify(r.target)
      const targetLink = targetEntity
        ? `[${escLinkText(targetEntity.name)}](${targetSlug}.md)`
        : esc(r.target)
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

function renderIndex(schema: FabricSchema, slugMap: Map<string, string>): string {
  const lines: string[] = []
  lines.push(frontmatter({ title: schema.meta.name }))
  lines.push(`# ${schema.meta.name}`)
  lines.push('')
  if (schema.meta.description) {
    lines.push(schema.meta.description)
    lines.push('')
  }

  const groups: Record<string, [string, EntitySchema][]> = {}
  for (const [key, entity] of Object.entries(schema.entities)) {
    const sortedTags = [...entity.tags].sort()
    const group = sortedTags[0] ?? 'other'
    if (!groups[group]) groups[group] = []
    groups[group].push([key, entity])
  }

  for (const [group, entries] of Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${group.charAt(0).toUpperCase() + group.slice(1)}`)
    lines.push('')
    for (const [key, e] of entries.sort((a, b) => a[1].name.localeCompare(b[1].name))) {
      const slug = slugMap.get(key) ?? slugify(e.name)
      const desc = e.description
        ? ` — ${escInline(e.description.replace(/\.(?=\s+[A-Z]).*$|\.\s*$/, ''))}`
        : ''
      lines.push(`- [${escLinkText(e.name)}](entities/${slug}.md)${desc}`)
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

    // Build collision-aware slug map. When a suffix slug is assigned (e.g. foo-2),
    // the base slug (foo) is also added to taken so that a later entity whose
    // natural slug is foo does not silently collide with the suffixed one.
    const taken = new Set<string>()
    const slugCounts = new Map<string, number>()
    const entitySlugs = new Map<string, string>()
    for (const [key, entity] of Object.entries(schema.entities)) {
      const base = slugify(entity.name)
      let count = slugCounts.get(base) ?? 0
      let slug = count === 0 ? base : `${base}-${count + 1}`
      // If the generated slug is already taken, keep incrementing.
      while (taken.has(slug)) {
        count += 1
        slug = `${base}-${count + 1}`
      }
      // When a suffix was needed, reserve the base slug too.
      if (count > 0) taken.add(base)
      slugCounts.set(base, count + 1)
      taken.add(slug)
      entitySlugs.set(key, slug)
    }

    for (const [key, entity] of Object.entries(schema.entities)) {
      const slug = entitySlugs.get(key)!
      files.push({
        path: `wiki/entities/${slug}.md`,
        content: renderEntityPage(entity, schema.entities, this.hidden, entitySlugs),
        header,
      })
    }

    files.push({
      path: 'wiki/index.md',
      content: renderIndex(schema, entitySlugs),
      header,
    })

    return { files }
  }
}
