import { loadSchema } from '../loader'

export async function validateCommand(fabricPath: string): Promise<void> {
  try {
    const schema = await loadSchema(fabricPath)
    console.log(`✓ Schema valid: ${schema.meta.name} (IR v${schema.version})`)
    console.log(`  entities: ${Object.keys(schema.entities).join(', ') || '(none)'}`)
    console.log(`  apis: ${Object.keys(schema.apis).join(', ') || '(none)'}`)
  } catch (err) {
    console.error(`✗ Validation failed: ${(err as Error).message}`)
    process.exit(1)
  }
}
