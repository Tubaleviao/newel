import { defineConfig } from '@newel/core'
import { TypeScriptGenerator } from '@newel/generator-typescript'
import { OpenApiGenerator } from '@newel/generator-openapi'
import { SqlGenerator } from '@newel/generator-sql'
import { DocsGenerator } from '@newel/generator-docs'
import { JsonSchemaGenerator } from '@newel/generator-jsonschema'
import { RdfGenerator } from '@newel/generator-rdf'
import { OwlGenerator } from '@newel/generator-owl'

export default defineConfig({
  schema: './src/fabric.ts',
  output: './src/generated',
  generators: [
    new TypeScriptGenerator(),
    new OpenApiGenerator(),
    new SqlGenerator(),
    new DocsGenerator(),
    new JsonSchemaGenerator(),
    new RdfGenerator(),
    new OwlGenerator(),
  ],
})
