import type {
  Generator,
  GeneratorContext,
  GeneratorOutput,
  FabricSchema,
  EntitySchema,
  FieldSchema,
  StateMachineSchema,
  BehaviorSchema,
  ApiSchema,
  EndpointSchema,
} from '@quoin/core'

// --- Markdown helpers ---

function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map(h => '-'.repeat(Math.max(h.length, 3)))
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map(r => `| ${r.join(' | ')} |`),
  ]
  return lines.join('\n')
}

function escMd(s: string): string {
  return s.replace(/\|/g, '\\|')
}

// --- Entity page ---

function renderFieldsTable(fields: Record<string, FieldSchema>): string {
  const headers = ['Name', 'Type', 'Required', 'PII', 'Description']
  const rows = Object.values(fields).map(f => [
    `\`${f.name}\``,
    f.type === 'enum' && f.enumValues ? `enum (${f.enumValues.map(v => `\`${v}\``).join(', ')})` : f.type,
    f.nullable ? 'no' : 'yes',
    f.pii ? '✓' : '',
    escMd(f.description ?? ''),
  ])
  return mdTable(headers, rows)
}

function renderStateMachine(sm: StateMachineSchema): string {
  const lines: string[] = []
  lines.push('### State Machine')
  lines.push('')
  lines.push(`**Field:** \`${sm.field}\`  **Initial:** \`${sm.initial}\``)
  lines.push('')

  // Mermaid diagram
  lines.push('```mermaid')
  lines.push('stateDiagram-v2')
  lines.push(`  [*] --> ${sm.initial}`)
  for (const t of sm.transitions) {
    const froms = Array.isArray(t.from) ? t.from : [t.from]
    for (const f of froms) {
      const label = t.trigger + (t.guards.length ? `\\n[${t.guards.join('; ')}]` : '')
      lines.push(`  ${f} --> ${t.to} : ${label}`)
    }
  }
  for (const [name, state] of Object.entries(sm.states)) {
    if (state.terminal) lines.push(`  ${name} --> [*]`)
  }
  lines.push('```')
  lines.push('')

  // States table
  lines.push('**States:**')
  lines.push('')
  const stateRows = Object.values(sm.states).map(s => [
    `\`${s.name}\``,
    escMd(s.description),
    s.terminal ? 'yes' : '',
  ])
  lines.push(mdTable(['State', 'Description', 'Terminal'], stateRows))
  lines.push('')

  // Transitions table
  lines.push('**Transitions:**')
  lines.push('')
  const transRows = sm.transitions.map(t => [
    Array.isArray(t.from) ? t.from.map(f => `\`${f}\``).join(', ') : `\`${t.from}\``,
    `\`${t.to}\``,
    `\`${t.trigger}\``,
    escMd(t.guards.join('; ')),
    escMd(t.effects.join('; ')),
  ])
  lines.push(mdTable(['From', 'To', 'Trigger', 'Guards', 'Effects'], transRows))

  return lines.join('\n')
}

function renderBehaviors(behaviors: Record<string, BehaviorSchema>): string {
  const lines: string[] = []
  lines.push('## Behaviors')
  lines.push('')
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
      const owner = b.auth.ownerField ? `  Owner field: \`${b.auth.ownerField}\`` : ''
      lines.push(`**Auth:** roles \`${roles}\`${owner}`)
      lines.push('')
    }
    if (b.input && Object.keys(b.input).length) {
      lines.push('**Input:**')
      lines.push('')
      lines.push(renderFieldsTable(b.input))
      lines.push('')
    }
  }
  return lines.join('\n')
}

function renderEntityPage(entity: EntitySchema): string {
  const lines: string[] = []

  lines.push(`# ${entity.name}`)
  lines.push('')
  lines.push(entity.description)
  if (entity.goal) {
    lines.push('')
    lines.push(`> **Goal:** ${entity.goal}`)
  }
  lines.push('')

  lines.push('## Fields')
  lines.push('')
  lines.push(renderFieldsTable(entity.fields))
  lines.push('')

  if (entity.stateMachine) {
    lines.push(renderStateMachine(entity.stateMachine))
    lines.push('')
  }

  if (Object.keys(entity.behaviors).length) {
    lines.push(renderBehaviors(entity.behaviors))
    lines.push('')
  }

  if (Object.keys(entity.relations).length) {
    lines.push('## Relations')
    lines.push('')
    const relRows = Object.values(entity.relations).map(r => [
      `\`${r.name}\``,
      r.kind,
      `\`${r.target}\``,
      r.foreignKey ? `\`${r.foreignKey}\`` : '',
    ])
    lines.push(mdTable(['Name', 'Kind', 'Target', 'Foreign Key'], relRows))
  }

  return lines.join('\n') + '\n'
}

// --- API page ---

function renderEndpointRow(key: string, ep: EndpointSchema): string[] {
  const auth = ep.auth?.roles.length ? ep.auth.roles.join(', ') : ''
  return [
    `\`${ep.method} ${ep.path}\``,
    escMd(ep.description ?? ''),
    ep.behavior ? `\`${ep.behavior}\`` : '',
    ep.returns ? `\`${ep.returns}\`` : '',
    auth,
  ]
}

function renderApiPage(api: ApiSchema): string {
  const lines: string[] = []

  lines.push(`# ${api.name}`)
  if (api.baseUrl) {
    lines.push('')
    lines.push(`**Base URL:** \`${api.baseUrl}\``)
  }
  lines.push('')
  lines.push('## Endpoints')
  lines.push('')

  const rows = Object.entries(api.endpoints).map(([key, ep]) => renderEndpointRow(key, ep))
  lines.push(mdTable(['Endpoint', 'Description', 'Behavior', 'Returns', 'Auth Roles'], rows))

  return lines.join('\n') + '\n'
}

// --- GDPR data map ---

function buildGdprMap(schema: FabricSchema): string {
  const lines: string[] = []

  lines.push('# GDPR Data Map')
  lines.push('')
  lines.push(`Generated from **${schema.meta.name}** v${schema.meta.version ?? '1.0.0'}`)
  lines.push('')

  // Collect all endpoints that expose each entity
  const entityEndpoints: Record<string, string[]> = {}
  for (const api of Object.values(schema.apis)) {
    for (const ep of Object.values(api.endpoints)) {
      if (ep.returns && schema.entities[ep.returns]) {
        if (!entityEndpoints[ep.returns]) entityEndpoints[ep.returns] = []
        entityEndpoints[ep.returns].push(`\`${ep.method} ${ep.path}\``)
      }
      if (ep.behavior) {
        const [entityName] = ep.behavior.split('.')
        if (entityName && schema.entities[entityName]) {
          if (!entityEndpoints[entityName]) entityEndpoints[entityName] = []
          entityEndpoints[entityName].push(`\`${ep.method} ${ep.path}\``)
        }
      }
    }
  }

  const piiRows: string[][] = []
  for (const entity of Object.values(schema.entities)) {
    for (const field of Object.values(entity.fields)) {
      if (!field.pii) continue
      const endpoints = entityEndpoints[entity.name] ?? []
      piiRows.push([
        `\`${entity.name}\``,
        `\`${field.name}\``,
        field.gdprCategory ?? '',
        field.gdprRetention ?? '',
        field.gdprLegalBasis ?? '',
        endpoints.join(', '),
      ])
    }
  }

  if (piiRows.length === 0) {
    lines.push('_No PII fields declared._')
  } else {
    lines.push(mdTable(
      ['Entity', 'Field', 'GDPR Category', 'Retention', 'Legal Basis', 'Exposed By'],
      piiRows,
    ))
  }

  return lines.join('\n') + '\n'
}

// --- Generator ---

export class DocsGenerator implements Generator {
  readonly name = 'docs'
  readonly dependsOn: string[] = []

  async generate(schema: FabricSchema, _ctx: GeneratorContext): Promise<GeneratorOutput> {
    const files: GeneratorOutput['files'] = []
    const header = '<!-- @generated by @quoin/generator-docs — do not edit -->\n'

    for (const entity of Object.values(schema.entities)) {
      files.push({
        path: `docs/entities/${entity.name}.md`,
        content: renderEntityPage(entity),
        header,
      })
    }

    for (const api of Object.values(schema.apis)) {
      files.push({
        path: `docs/apis/${api.name}.md`,
        content: renderApiPage(api),
        header,
      })
    }

    files.push({
      path: 'docs/gdpr-data-map.md',
      content: buildGdprMap(schema),
      header,
    })

    return { files }
  }
}
