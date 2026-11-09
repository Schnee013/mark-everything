import { call, put, takeLatest } from 'redux-saga/effects'
import Api from '../modules/api'
import {
	COVERS_LOAD_REQ, COVERS_LOAD_SUCCESS, COVERS_LOAD_ERROR
} from '../constants/covers'

//Requests
export default function* () {
	yield takeLatest([
		COVERS_LOAD_REQ
	], load)
}

function* load({ ignore=false, query='' }) {
	if (ignore)
		return;

	try {
		const { items } = process.env.ME_LOCAL ? { items: [
            { title: 'Twemoji · CC BY 4.0', color: true },
            { title: 'Raindrop · MIT', color: false }
        ].map(({ title, color }) => ({
            title,
            icons: process.env.ME_ICON_FILES.filter(name => name.startsWith('twemoji-') === color && name.includes(query.trim().toLowerCase())).map(name => ({ png: 'assets/collection-icons/' + name }))
        })).filter(group => group.icons.length) } : yield call(Api.get, `collections/covers/${encodeURIComponent(query.trim())}`)

		yield put({
			type: COVERS_LOAD_SUCCESS,
			items
		});
	} catch (error) {
		yield put({
			type: COVERS_LOAD_ERROR,
			error
		});
	}
}