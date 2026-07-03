import { defineFabric } from '@quoin/core'
import Book      from './entities/Book'
import Member    from './entities/Member'
import Loan      from './entities/Loan'
import LibraryAPI from './apis/LibraryAPI'

export default defineFabric({
  meta: {
    name: 'LibrarySystem',
    description: 'Library book lending system',
    version: '1.0.0',
  },
  entities: { Book, Member, Loan },
  apis: { LibraryAPI },
})
