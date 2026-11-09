import { all, spawn, delay, call } from 'redux-saga/effects'

import collections from './collections'
import bookmarks from './bookmarks'
import filters from './filters'
import tags from './tags'
import covers from './covers'
import config from './config'
import _import from './import'

//Restart a failed saga after the existing delay.
function* failSafe(saga) {
	return yield spawn(function* () {
		while (true) {
			try {
				yield call(saga)
				break
			} catch (e) {
				if (process.env.NODE_ENV!='production')
					console.error('saga fail', e)

				yield delay(1000)
			}
		}
	})
}

const root = function* () {
	const enabled = [config, collections, bookmarks, filters, tags, covers, _import, require('../../me/state').preferencesSaga]
	yield all(enabled.map(failSafe))
}

export default root
