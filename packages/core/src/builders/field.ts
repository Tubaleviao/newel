import type { FieldSchema, FieldType, GdprCategory, GdprLegalBasis } from '../ir/types'

export class FieldBuilder {
  protected _schema: FieldSchema

  constructor(name: string, type: FieldType = 'string') {
    this._schema = {
      name,
      type,
      nullable: false,
      primaryKey: false,
      pii: false,
    }
  }

  description(desc: string): this {
    this._schema.description = desc
    return this
  }

  nullable(): this {
    this._schema.nullable = true
    return this
  }

  primaryKey(): this {
    this._schema.primaryKey = true
    return this
  }

  foreignKey(ref: string): this {
    this._schema.foreignKey = ref
    return this
  }

  enum(values: string[]): this {
    this._schema.type = 'enum'
    this._schema.enumValues = values
    return this
  }

  pii(): this {
    this._schema.pii = true
    return this
  }

  gdpr(category: GdprCategory): this {
    this._schema.gdprCategory = category
    return this
  }

  gdprRetention(retention: string): this {
    this._schema.gdprRetention = retention
    return this
  }

  gdprLegalBasis(basis: GdprLegalBasis): this {
    this._schema.gdprLegalBasis = basis
    return this
  }

  toIR(): FieldSchema {
    return { ...this._schema }
  }
}

type FieldBuilderFn = (f: FieldBuilder) => FieldBuilder | void

export function buildField(name: string, fn?: FieldBuilderFn, type: FieldType = 'string'): FieldSchema {
  const b = new FieldBuilder(name, type)
  if (fn) fn(b)
  return b.toIR()
}

export class TypedFieldBuilder extends FieldBuilder {
  uuid(): this { this._schema.type = 'uuid'; return this }
  string(): this { this._schema.type = 'string'; return this }
  number(): this { this._schema.type = 'number'; return this }
  integer(): this { this._schema.type = 'integer'; return this }
  decimal(): this { this._schema.type = 'decimal'; return this }
  boolean(): this { this._schema.type = 'boolean'; return this }
  timestamp(): this { this._schema.type = 'timestamp'; return this }
  date(): this { this._schema.type = 'date'; return this }
  email(): this { this._schema.type = 'email'; return this }
  url(): this { this._schema.type = 'url'; return this }
  json(): this { this._schema.type = 'json'; return this }
}
