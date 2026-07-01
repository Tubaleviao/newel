import type { Generator } from './types'

export function topoSort(generators: Generator[]): Generator[] {
  const byName = new Map(generators.map(g => [g.name, g]))
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const result: Generator[] = []

  function visit(name: string, path: string[]): void {
    if (inStack.has(name)) {
      const cycle = [...path.slice(path.indexOf(name)), name].join(' → ')
      throw new Error(`Circular dependency detected: ${cycle}`)
    }
    if (visited.has(name)) return

    const gen = byName.get(name)
    if (!gen) throw new Error(`Unknown generator "${name}" referenced in dependsOn`)

    inStack.add(name)
    for (const dep of gen.dependsOn) {
      visit(dep, [...path, name])
    }
    inStack.delete(name)
    visited.add(name)
    result.push(gen)
  }

  for (const gen of generators) {
    visit(gen.name, [])
  }

  return result
}
