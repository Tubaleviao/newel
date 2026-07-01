import type { BehaviorSchema, AuthSchema, FieldSchema } from '../ir/types'
import { TypedFieldBuilder } from './field'

class AuthBuilder {
  private _schema: AuthSchema = { roles: [] }

  roles(...roleNames: string[]): this {
    this._schema.roles.push(...roleNames)
    return this
  }

  toIR(): AuthSchema {
    return { ...this._schema, roles: [...this._schema.roles] }
  }
}

export class BehaviorBuilder {
  private _schema: BehaviorSchema

  constructor(name: string) {
    this._schema = {
      name,
      description: '',
      rules: [],
    }
  }

  description(desc: string): this {
    this._schema.description = desc
    return this
  }

  rule(rule: string): this {
    this._schema.rules.push(rule)
    return this
  }

  input(name: string, fn: (f: TypedFieldBuilder) => TypedFieldBuilder | void): this {
    if (!this._schema.input) this._schema.input = {}
    const b = new TypedFieldBuilder(name)
    fn(b)
    this._schema.input[name] = b.toIR()
    return this
  }

  output(entityNameOrPrimitive: string): this {
    this._schema.output = entityNameOrPrimitive
    return this
  }

  auth(fn: (a: AuthBuilder) => AuthBuilder | void): this {
    const b = new AuthBuilder()
    fn(b)
    this._schema.auth = b.toIR()
    return this
  }

  toIR(): BehaviorSchema {
    return {
      ...this._schema,
      rules: [...this._schema.rules],
      input: this._schema.input
        ? Object.fromEntries(Object.entries(this._schema.input).map(([k, v]) => [k, { ...v }]))
        : undefined,
    }
  }
}
