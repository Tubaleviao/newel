// Assemble the schema from individual JSON files.
// Each entity lives in its own file — organize however suits your project.

module.exports = {
  meta: {
    name: 'LibrarySystem',
    description: 'Library book lending system',
    version: '1.0.0',
  },

  entities: {
    Book:   require('./entities/Book.json'),
    Member: require('./entities/Member.json'),
    Loan:   require('./entities/Loan.json'),
  },

  apis: {
    LibraryAPI: require('./apis/LibraryAPI.json'),
  },
}
