import type {
  Generator,
  GeneratorContext,
  GeneratorOutput,
  FabricSchema,
  EntitySchema,
  FieldSchema,
  StateMachineSchema,
  BehaviorSchema,
} from '@newel/core'

// --- Field helpers ---

function inputType(field: FieldSchema): string {
  switch (field.type) {
    case 'boolean':   return 'checkbox'
    case 'number':
    case 'integer':
    case 'decimal':   return 'number'
    case 'email':     return 'email'
    case 'url':       return 'url'
    case 'timestamp':
    case 'date':      return 'date'
    default:          return 'text'
  }
}

function tsInputType(field: FieldSchema): string {
  switch (field.type) {
    case 'boolean':             return 'boolean'
    case 'number':
    case 'integer':
    case 'decimal':             return 'number'
    case 'enum':                return field.enumValues
                                  ? field.enumValues.map(v => JSON.stringify(v)).join(' | ')
                                  : 'string'
    default:                    return 'string'
  }
}

function renderFieldInput(field: FieldSchema, indent: string): string {
  const label = field.description ?? field.name
  const required = !field.nullable && !field.primaryKey

  if (field.type === 'enum' && field.enumValues) {
    const options = field.enumValues
      .map(v => `${indent}        <option value="${v}">${v}</option>`)
      .join('\n')
    return [
      `${indent}      <label>`,
      `${indent}        <span>${label}${required ? ' *' : ''}</span>`,
      `${indent}        <select`,
      `${indent}          name="${field.name}"`,
      `${indent}          value={values.${field.name} ?? ''}`,
      `${indent}          onChange={e => onChange('${field.name}', e.target.value)}`,
      `${indent}          required={${required}}`,
      `${indent}        >`,
      `${indent}          <option value="">Select…</option>`,
      options,
      `${indent}        </select>`,
      `${indent}      </label>`,
    ].join('\n')
  }

  if (field.type === 'boolean') {
    return [
      `${indent}      <label>`,
      `${indent}        <input`,
      `${indent}          type="checkbox"`,
      `${indent}          name="${field.name}"`,
      `${indent}          checked={!!values.${field.name}}`,
      `${indent}          onChange={e => onChange('${field.name}', e.target.checked)}`,
      `${indent}        />`,
      `${indent}        <span>${label}</span>`,
      `${indent}      </label>`,
    ].join('\n')
  }

  return [
    `${indent}      <label>`,
    `${indent}        <span>${label}${required ? ' *' : ''}</span>`,
    `${indent}        <input`,
    `${indent}          type="${inputType(field)}"`,
    `${indent}          name="${field.name}"`,
    `${indent}          value={values.${field.name} ?? ''}`,
    `${indent}          onChange={e => onChange('${field.name}', e.target.value)}`,
    `${indent}          required={${required}}`,
    `${indent}        />`,
    `${indent}      </label>`,
  ].join('\n')
}

// --- Form component ---

function generateEntityForm(entity: EntitySchema): string {
  const name = entity.name
  const formName = `${name}Form`

  // Only include editable fields: not primary keys, not foreign-key-only uuid fields
  // (FK fields that are also named *Id are included as hidden inputs)
  const editableFields = Object.values(entity.fields).filter(f => !f.primaryKey)

  // Build the values type
  const valueTypeLines = editableFields.map(f => {
    const t = tsInputType(f)
    const optional = f.nullable ? '?' : ''
    return `  ${f.name}${optional}: ${t}`
  })

  const fieldInputs = editableFields
    .map(f => renderFieldInput(f, '    '))
    .join('\n\n')

  return `// #region ${formName}
export interface ${name}FormValues {
${valueTypeLines.join('\n')}
}

export interface ${name}FormProps {
  values: Partial<${name}FormValues>
  onChange: (field: keyof ${name}FormValues, value: ${name}FormValues[keyof ${name}FormValues]) => void
  onSubmit: (values: Partial<${name}FormValues>) => void
  disabled?: boolean
}

export function ${formName}({ values, onChange, onSubmit, disabled = false }: ${name}FormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit} aria-label="${name} form">
${fieldInputs}
      <button type="submit" disabled={disabled}>Save ${name}</button>
    </form>
  )
}
// #endregion ${formName}`
}

// --- Action panel component ---

function generateActionPanel(entity: EntitySchema): string {
  const name = entity.name
  const panelName = `${name}ActionPanel`
  const sm = entity.stateMachine

  if (!sm) {
    return `// #region ${panelName}
// ${name} has no state machine — no action panel generated
// #endregion ${panelName}`
  }

  const stateType = `${name}State`

  // Build transition → behavior lookup: trigger name → behavior
  const triggerToBehavior: Record<string, BehaviorSchema | undefined> = {}
  for (const t of sm.transitions) {
    const beh = entity.behaviors[t.trigger]
    triggerToBehavior[t.trigger] = beh
  }

  // Collect unique triggers (a trigger may appear for multiple froms)
  const uniqueTriggers = [...new Set(sm.transitions.map(t => t.trigger))]

  // For each trigger, determine which states it's valid from
  const triggerFromStates: Record<string, string[]> = {}
  for (const t of sm.transitions) {
    const froms = Array.isArray(t.from) ? t.from : [t.from]
    if (!triggerFromStates[t.trigger]) triggerFromStates[t.trigger] = []
    triggerFromStates[t.trigger].push(...froms)
  }

  // For each trigger, guards joined
  const triggerGuards: Record<string, string[]> = {}
  for (const t of sm.transitions) {
    if (!triggerGuards[t.trigger]) triggerGuards[t.trigger] = []
    triggerGuards[t.trigger].push(...t.guards)
  }

  // Build the allowed roles union per trigger from behavior auth
  const triggerRoles: Record<string, string[]> = {}
  for (const trigger of uniqueTriggers) {
    const beh = triggerToBehavior[trigger]
    triggerRoles[trigger] = beh?.auth?.roles ?? []
  }

  // State union type
  const stateUnion = Object.keys(sm.states)
    .map(s => JSON.stringify(s))
    .join(' | ')

  // Button elements
  const buttons = uniqueTriggers.map(trigger => {
    const froms = triggerFromStates[trigger].map(s => JSON.stringify(s)).join(', ')
    const guards = triggerGuards[trigger]
    const roles = triggerRoles[trigger]
    const guardTitle = guards.length ? guards.join('; ') : undefined
    const rolesStr = roles.length
      ? `[${roles.map(r => JSON.stringify(r)).join(', ')}].some(r => userRoles.includes(r))`
      : 'true'

    const lines = [
      `      {[${froms}].includes(currentState) && (${rolesStr}) && (`,
      `        <button`,
      `          type="button"`,
      `          onClick={() => onAction('${trigger}')}`,
      `          disabled={disabled}`,
      guardTitle ? `          title="${guardTitle}"` : null,
      `        >`,
      `          ${trigger}`,
      `        </button>`,
      `      )}`,
    ].filter(l => l !== null) as string[]

    return lines.join('\n')
  }).join('\n')

  return `// #region ${panelName}
export type ${stateType} = ${stateUnion}

export interface ${name}ActionPanelProps {
  currentState: ${stateType}
  userRoles?: string[]
  onAction: (trigger: string) => void
  disabled?: boolean
}

export function ${panelName}({ currentState, userRoles = [], onAction, disabled = false }: ${name}ActionPanelProps) {
  return (
    <div role="group" aria-label="${name} actions">
${buttons}
    </div>
  )
}
// #endregion ${panelName}`
}

// --- Index file ---

function generateIndex(entityNames: string[]): string {
  const exports = entityNames.flatMap(n => [
    `export type { ${n}FormValues, ${n}FormProps } from './${n}'`,
    `export { ${n}Form } from './${n}'`,
    `export type { ${n}ActionPanelProps } from './${n}'`,
    `export { ${n}ActionPanel } from './${n}'`,
  ])
  return exports.join('\n') + '\n'
}

// --- Generator ---

export class UiGenerator implements Generator {
  readonly name = 'ui'
  readonly dependsOn: string[] = ['typescript']

  async generate(schema: FabricSchema, _ctx: GeneratorContext): Promise<GeneratorOutput> {
    const files: GeneratorOutput['files'] = []
    const entityNames: string[] = []
    const header = "// @generated by @newel/generator-ui — do not edit\nimport React from 'react'\n\n"

    for (const entity of Object.values(schema.entities)) {
      const formSection = generateEntityForm(entity)
      const panelSection = generateActionPanel(entity)
      const content = header + formSection + '\n\n' + panelSection + '\n'

      files.push({
        path: `ui/${entity.name}.tsx`,
        content,
        header: '',  // header already embedded above
      })
      entityNames.push(entity.name)
    }

    files.push({
      path: 'ui/index.ts',
      content: generateIndex(entityNames),
      header: '// @generated by @newel/generator-ui — do not edit\n',
    })

    return {
      files,
      artifacts: { entities: entityNames },
    }
  }
}
