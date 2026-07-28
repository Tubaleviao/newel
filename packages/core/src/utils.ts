/** Shared naming utilities used by SQL, Prisma, and other generators. */

export function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

export function tableName(entityName: string): string {
  const snake = toSnakeCase(entityName)
  if (snake.endsWith('s')) return snake
  if (snake.endsWith('y') && !/[aeiou]y$/.test(snake)) return snake.slice(0, -1) + 'ies'
  return snake + 's'
}

export function enumTypeName(entityName: string, fieldName: string): string {
  return `${toSnakeCase(entityName)}_${toSnakeCase(fieldName)}_enum`
}

export function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
