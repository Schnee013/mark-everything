import Immutable from 'seamless-immutable'
import { takeEvery, call, put, select } from 'redux-saga/effects'
import { blankCurrent } from '~data/helpers/user'
import api from './client'

const initial = Immutable({ current: blankCurrent, status: { authorized: 'disabled' }, fromCache: false })
export function userReducer(state = initial, action) {
    if (action.type === 'ME_LIBRARY_READY') return state.set('current', blankCurrent.merge({ name: action.library.name || '本地书签库' }))
    if (action.type === 'ME_LIBRARY_STATUS') return state.set('localStatus', action.status)
    return state
}
export function* preferencesSaga() {
    yield takeEvery('USER_UPDATE_REQ', function* (action) {
        try {
            const result = yield call(api.put, 'user', action.user)
            yield put({ type: 'USER_UPDATE_SUCCESS', user: result.user })
        } catch (error) { yield put({ type: 'USER_UPDATE_ERROR', error }) }
    })
    yield takeEvery(['BOOKMARK_CREATE_SUCCESS', 'BOOKMARK_UPDATE_SUCCESS', 'BOOKMARK_REMOVE_SUCCESS',
        'COLLECTION_CREATE_SUCCESS', 'COLLECTION_UPDATE_SUCCESS', 'COLLECTION_REMOVE_SUCCESS'], function* () {
        yield put({ type: 'ME_LIBRARY_REFRESH' })
    })
    yield takeEvery('ME_LIBRARY_REFRESH', function* () {
        const { bookmarks: { spaces } } = yield select()
        for (const [spaceId, space] of Object.entries(spaces))
            yield put({ type: 'SPACE_REFRESH_REQ', spaceId, query: space.query })
    })
}
