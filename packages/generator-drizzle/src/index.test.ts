import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { DrizzleGenerator } from './index'
import { normalizeSchema } from '@newel/core'
import type { FabricSchema, GeneratorOutput } from '@newel/core'

const ctx = { outputDir: '/tmp/drizzle-test', outputs: new Map<string, GeneratorOutput>() }

const schema: FabricSchema = normalizeSchema({
  meta: { name: 'Fx' },
  entities: {
    Company: {
      fields: {
        id: { type: 'uuid', primaryKey: true },
        name: { type: 'string' },
        taxRegime: { type: 'enum', values: ['simples', 'presumido'] },
        createdAt: { type: 'timestamp' },
      },
      relations: { invoices: { name: 'invoices', kind: 'hasMany', target: 'Invoice' } },
    },
    Invoice: {
      fields: {
        id: { type: 'uuid', primaryKey: true },
        companyId: { type: 'uuid', foreignKey: 'Company.id' },
        amount: { type: 'money', currency: 'BRL' },
        count: { type: 'bigint' },
        period: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
        note: { type: 'string', nullable: true },
      },
      relations: {
        company: { name: 'company', kind: 'belongsTo', target: 'Company', foreignKey: 'companyId' },
      },
    },
  },
})

const gen = async (opts = {}, s: FabricSchema = schema) =>
  Object.fromEntries(
    (await new DrizzleGenerator(opts).generate(s, ctx)).files.map((f) => [f.path, f.content]),
  )

describe('DrizzleGenerator', () => {
  it('emits one file per entity plus an index barrel', async () => {
    const files = await gen()
    expect(Object.keys(files).sort()).toEqual([
      'drizzle/company.ts',
      'drizzle/index.ts',
      'drizzle/invoice.ts',
    ])
    expect(files['drizzle/index.ts']).toContain("export * from './company'")
    expect(files['drizzle/index.ts']).toContain("export * from './invoice'")
  })

  it('maps field types to column builders', async () => {
    const { 'drizzle/invoice.ts': inv, 'drizzle/company.ts': co } = await gen()
    expect(co).toContain('id: uuid("id").primaryKey().defaultRandom()')
    expect(co).toContain('pgEnum("company_tax_regime_enum", ["simples", "presumido"])')
    expect(inv).toContain('bigint("amount", { mode: \'bigint\' }).notNull()')
    expect(inv).toContain('bigint("count", { mode: \'bigint\' }).notNull()')
    expect(inv).toContain('note: text("note"),')
  })

  it('emits foreign keys, relations and escaped CHECK patterns', async () => {
    const { 'drizzle/invoice.ts': inv, 'drizzle/company.ts': co } = await gen()
    expect(inv).toContain('.references(() => companyTable.id)')
    expect(inv).toContain('fields: [invoiceTable.companyId], references: [companyTable.id]')
    expect(co).toContain('invoices: many(invoiceTable)')
    expect(inv).toContain('^\\\\d{4}')
  })

  it('honours importPrefix, outDir and casing', async () => {
    const files = await gen({ importPrefix: 'npm:', outDir: 'db/schema', casing: 'camel' })
    expect(Object.keys(files)).toContain('db/schema/invoice.ts')
    const inv = files['db/schema/invoice.ts']
    expect(inv).toContain('from "npm:drizzle-orm/pg-core"')
    expect(inv).toContain('from "npm:drizzle-orm"')
    expect(inv).toContain('pgTable("invoice"')
    expect(inv).toContain('uuid("companyId")')
  })

  it('fails loudly on an unsupported IR version', async () => {
    await expect(gen({}, { ...schema, version: '9.9.9' })).rejects.toThrow('built against IR')
  })

  it('output passes drizzle-kit generate', async () => {
    const dir = fs.mkdtempSync(path.join(__dirname, '..', 'kit-'))
    try {
      for (const [p, content] of Object.entries(await gen())) {
        fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true })
        fs.writeFileSync(path.join(dir, p), content)
      }
      fs.writeFileSync(
        path.join(dir, 'drizzle.config.ts'),
        `export default { dialect: 'postgresql', schema: './drizzle/index.ts', out: './migrations' }\n`,
      )
      const bin = path.join(__dirname, '..', 'node_modules', '.bin', 'drizzle-kit')
      execFileSync(bin, ['generate', '--config', 'drizzle.config.ts'], { cwd: dir, stdio: 'pipe' })
      const sqlFile = fs.readdirSync(path.join(dir, 'migrations')).find((f) => f.endsWith('.sql'))!
      const ddl = fs.readFileSync(path.join(dir, 'migrations', sqlFile), 'utf8')
      expect(ddl).toContain('CREATE TABLE "invoices"')
      expect(ddl).toContain('CHECK')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)

  it('uses table refs in CHECKs, AnyPgColumn for self references and skips unpaired hasMany', async () => {
    const s = normalizeSchema({
      meta: { name: 'Fx' },
      entities: {
        Category: {
          fields: {
            id: { type: 'uuid', primaryKey: true },
            parentId: { type: 'uuid', nullable: true, foreignKey: 'Category.id' },
            userName: { type: 'string', pattern: '^a+$' },
          },
          relations: { items: { name: 'items', kind: 'hasMany', target: 'Item' } },
        },
        Item: { fields: { id: { type: 'uuid', primaryKey: true } } },
      },
    })
    const out = await gen({ casing: 'camel' }, s)
    const cat = out['drizzle/category.ts']
    expect(cat).toContain('(): AnyPgColumn => categoryTable.id')
    expect(cat).toContain('type AnyPgColumn')
    expect(cat).toContain('sql`${table.userName} ~')
    expect(cat).not.toContain('many(')
  })
})
