import { topoSort } from './dag'
import type { Generator } from './types'

function makeGen(name: string, dependsOn: string[] = []): Generator {
  return {
    name,
    dependsOn,
    async generate() {
      return { files: [] }
    },
  }
}

describe('topoSort', () => {
  it('returns generators in dependency order', () => {
    const ts = makeGen('typescript', [])
    const sql = makeGen('sql', ['typescript'])
    const openapi = makeGen('openapi', ['typescript'])
    const docs = makeGen('docs', ['openapi', 'typescript'])

    const result = topoSort([docs, sql, openapi, ts])
    const names = result.map(g => g.name)

    expect(names.indexOf('typescript')).toBeLessThan(names.indexOf('sql'))
    expect(names.indexOf('typescript')).toBeLessThan(names.indexOf('openapi'))
    expect(names.indexOf('openapi')).toBeLessThan(names.indexOf('docs'))
    expect(names.indexOf('typescript')).toBeLessThan(names.indexOf('docs'))
  })

  it('handles generators with no dependencies', () => {
    const a = makeGen('a')
    const b = makeGen('b')
    const result = topoSort([a, b])
    expect(result).toHaveLength(2)
  })

  it('throws on circular dependency', () => {
    const a = makeGen('a', ['b'])
    const b = makeGen('b', ['a'])
    expect(() => topoSort([a, b])).toThrow(/Circular dependency/)
  })

  it('throws on unknown dependency', () => {
    const a = makeGen('a', ['nonexistent'])
    expect(() => topoSort([a])).toThrow(/Unknown generator/)
  })

  it('handles single generator', () => {
    const gen = makeGen('solo')
    expect(topoSort([gen])).toHaveLength(1)
  })
})
