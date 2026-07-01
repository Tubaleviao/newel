import type { StateMachineSchema, StateSchema, TransitionSchema } from '../ir/types'

class StateBuilder {
  private _schema: StateSchema

  constructor(name: string) {
    this._schema = { name, description: '', terminal: false }
  }

  description(desc: string): this {
    this._schema.description = desc
    return this
  }

  terminal(): this {
    this._schema.terminal = true
    return this
  }

  toIR(): StateSchema {
    return { ...this._schema }
  }
}

class TransitionBuilder {
  private _schema: TransitionSchema = {
    from: '',
    to: '',
    trigger: '',
    guards: [],
    effects: [],
  }

  from(state: string | string[]): this {
    this._schema.from = state
    return this
  }

  to(state: string): this {
    this._schema.to = state
    return this
  }

  trigger(behaviorName: string): this {
    this._schema.trigger = behaviorName
    return this
  }

  guard(rule: string): this {
    this._schema.guards.push(rule)
    return this
  }

  effect(description: string): this {
    this._schema.effects.push(description)
    return this
  }

  toIR(): TransitionSchema {
    return {
      ...this._schema,
      guards: [...this._schema.guards],
      effects: [...this._schema.effects],
    }
  }
}

export class StateMachineBuilder {
  private _field: string
  private _initial: string = ''
  private _states: Record<string, StateSchema> = {}
  private _transitions: TransitionSchema[] = []

  constructor(field: string) {
    this._field = field
  }

  initial(state: string): this {
    this._initial = state
    return this
  }

  state(name: string, fn: (s: StateBuilder) => StateBuilder | void): this {
    const b = new StateBuilder(name)
    fn(b)
    this._states[name] = b.toIR()
    return this
  }

  transition(fn: (t: TransitionBuilder) => TransitionBuilder | void): this {
    const b = new TransitionBuilder()
    fn(b)
    this._transitions.push(b.toIR())
    return this
  }

  toIR(): StateMachineSchema {
    return {
      field: this._field,
      initial: this._initial,
      states: { ...this._states },
      transitions: this._transitions.map(t => ({ ...t, guards: [...t.guards], effects: [...t.effects] })),
    }
  }
}
