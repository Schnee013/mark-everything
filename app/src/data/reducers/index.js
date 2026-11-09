import { userReducer as user } from '../../me/state'
import collections from './collections'
import bookmarks from './bookmarks'
import filters from './filters'
import tags from './tags'
import covers from './covers'
import config from './config'
//import rate from './rate'
import _import from './import'

export default {
	user,
	collections, //before bookmarks!
	bookmarks,
	filters,
	tags,
	covers,
	config,
	//rate,
	import: _import
}
