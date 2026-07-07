import { definePatchSet } from '@quoin/core'

/**
 * Semantic patches for the library example.
 *
 * These override parts of the IR without editing generated files.
 * Run `pnpm generate` to see them in effect; `pnpm diff` to preview.
 */
export default definePatchSet({
  patches: [
    // Override the Book.isbn field description with richer detail.
    {
      op: 'merge',
      target: 'entity.Book.fields.isbn',
      value: {
        description: 'ISBN-13 barcode identifier (e.g. 978-3-16-148410-0). Validated on input.',
      },
    },

    // Add a goal to the Member entity without changing the entity source file.
    {
      op: 'merge',
      target: 'entity.Member',
      value: {
        goal: 'Manage library membership, borrowing privileges, and account standing.',
      },
    },

    // Suppress the RDF and OWL outputs — this project does not need them.
    // Remove these lines to re-enable semantic web output.
    // { op: 'suppress', pattern: 'rdf/*.ttl' },
    // { op: 'suppress', pattern: 'owl/*.owl' },
  ],
})
