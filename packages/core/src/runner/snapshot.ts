import * as fs from 'fs'
import * as path from 'path'
import type { FabricSchema } from '../ir/types'
import { CURRENT_IR_VERSION } from '../ir/version'
import { hashSchema } from './manifest'

export const SNAPSHOT_FILE = 'newel.ir-snapshot.json'

export interface IRSnapshot {
  generatedAt: string
  schemaHash: string
  schema: FabricSchema
}

export function writeSnapshot(outputDir: string, snapshot: IRSnapshot): void {
  const snapshotPath = path.join(outputDir, SNAPSHOT_FILE)
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2))
}

export function readSnapshot(outputDir: string): IRSnapshot | null {
  const snapshotPath = path.join(outputDir, SNAPSHOT_FILE)
  if (!fs.existsSync(snapshotPath)) return null
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as IRSnapshot
  if (snapshot.schema?.version !== CURRENT_IR_VERSION) return null
  return snapshot
}

export function buildSnapshot(schema: FabricSchema, generatedAt: string): IRSnapshot {
  return {
    generatedAt,
    schemaHash: hashSchema(schema),
    schema,
  }
}
