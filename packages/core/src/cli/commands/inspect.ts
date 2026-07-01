import { loadSchema } from '../loader'

export async function inspectCommand(fabricPath: string): Promise<void> {
  try {
    const schema = await loadSchema(fabricPath)
    console.log(JSON.stringify(schema, null, 2))
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`)
    process.exit(1)
  }
}
