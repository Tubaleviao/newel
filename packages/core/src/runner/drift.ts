import * as fs from 'fs'
import * as path from 'path'
import { hashContent, readManifest } from './manifest'

export interface DriftResult {
  drifted: string[]
  missing: string[]
  ok: string[]
}

export function checkDrift(outputDir: string): DriftResult {
  const manifest = readManifest(outputDir)
  if (!manifest) {
    return { drifted: [], missing: [], ok: [] }
  }

  const drifted: string[] = []
  const missing: string[] = []
  const ok: string[] = []

  for (const entry of manifest.files) {
    const filePath = path.join(outputDir, entry.path)
    if (!fs.existsSync(filePath)) {
      missing.push(entry.path)
      continue
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const currentHash = hashContent(content)
    if (currentHash !== entry.contentHash) {
      drifted.push(entry.path)
    } else {
      ok.push(entry.path)
    }
  }

  return { drifted, missing, ok }
}
