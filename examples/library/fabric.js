// @ts-check
// Assemble the schema from individual entity files.
// Each entity lives in its own file — organize however suits your project.

/** @type {import('@quoin/core').FabricInput} */
module.exports = {
  meta: {
    name: 'LibrarySystem',
    description: 'Library book lending system',
    version: '1.0.0',
  },

  entities: {
    Book:   require('./entities/Book'),
    Member: require('./entities/Member'),
    Loan:   require('./entities/Loan'),
  },

  apis: {
    LibraryAPI: require('./apis/LibraryAPI'),
  },
}
