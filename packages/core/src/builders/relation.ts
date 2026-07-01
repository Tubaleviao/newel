import type { RelationSchema } from '../ir/types'

export class RelationBuilder {
  private _schema: RelationSchema

  constructor(name: string) {
    this._schema = {
      name,
      kind: 'hasMany',
      target: '',
    }
  }

  hasMany(target: string): this {
    this._schema.kind = 'hasMany'
    this._schema.target = target
    return this
  }

  hasOne(target: string): this {
    this._schema.kind = 'hasOne'
    this._schema.target = target
    return this
  }

  belongsTo(target: string): this {
    this._schema.kind = 'belongsTo'
    this._schema.target = target
    return this
  }

  manyToMany(target: string, through: string): this {
    this._schema.kind = 'manyToMany'
    this._schema.target = target
    this._schema.through = through
    return this
  }

  foreignKey(key: string): this {
    this._schema.foreignKey = key
    return this
  }

  toIR(): RelationSchema {
    return { ...this._schema }
  }
}
