import type { ApiSchema, EndpointSchema, AuthSchema } from '../ir/types'

class ApiAuthBuilder {
  private _schema: AuthSchema = { roles: [] }

  roles(...roleNames: string[]): this {
    this._schema.roles.push(...roleNames)
    return this
  }

  toIR(): AuthSchema {
    return { roles: [...this._schema.roles] }
  }
}

class EndpointBuilder {
  private _schema: EndpointSchema

  constructor(methodAndPath: string) {
    const spaceIdx = methodAndPath.indexOf(' ')
    if (spaceIdx === -1) {
      this._schema = { method: methodAndPath, path: '' }
    } else {
      this._schema = {
        method: methodAndPath.slice(0, spaceIdx).toUpperCase(),
        path: methodAndPath.slice(spaceIdx + 1),
      }
    }
  }

  description(desc: string): this {
    this._schema.description = desc
    return this
  }

  behavior(behaviorRef: string): this {
    this._schema.behavior = behaviorRef
    return this
  }

  returns(entityName: string): this {
    this._schema.returns = entityName
    return this
  }

  auth(fn: (a: ApiAuthBuilder) => ApiAuthBuilder | void): this {
    const b = new ApiAuthBuilder()
    fn(b)
    this._schema.auth = b.toIR()
    return this
  }

  toIR(): EndpointSchema {
    return { ...this._schema }
  }
}

export class ApiBuilder {
  private _name: string
  private _endpoints: Record<string, EndpointSchema> = {}

  constructor(name: string) {
    this._name = name
  }

  endpoint(methodAndPath: string, fn: (ep: EndpointBuilder) => EndpointBuilder | void): this {
    const b = new EndpointBuilder(methodAndPath)
    fn(b)
    const ir = b.toIR()
    const key = `${ir.method} ${ir.path}`
    this._endpoints[key] = ir
    return this
  }

  toIR(): ApiSchema {
    return {
      name: this._name,
      endpoints: { ...this._endpoints },
    }
  }
}
