import { defineConfig } from '@quoin/core'
import { TypeScriptGenerator } from '@quoin/generator-typescript'
import { OpenApiGenerator } from '@quoin/generator-openapi'
import { SqlGenerator } from '@quoin/generator-sql'
import { DocsGenerator } from '@quoin/generator-docs'
import { UiGenerator } from '@quoin/generator-ui'

export default defineConfig({
  schema: './fabric.ts',
  output: './src/generated',
  patches: './fabric.patches.ts',
  generators: [
    new TypeScriptGenerator(),
    new OpenApiGenerator(),
    new SqlGenerator(),
    new DocsGenerator(),
    new UiGenerator(),
  ],
})
