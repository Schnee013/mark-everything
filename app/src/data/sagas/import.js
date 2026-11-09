import { call, put, select, takeLatest } from 'redux-saga/effects'
import * as c from '../constants/import'
import { previewFile, commitPreview } from '../../me/exchange'

export default function* () {
    yield takeLatest(c.IMPORT_FILE_UPLOAD_REQ, fileUpload)
    yield takeLatest(c.IMPORT_PARCEL_SAVE_REQ, parcelSave)
}

function* fileUpload({ file, ignore=false, onSuccess, onFail }) {
    if (ignore) return
    try {
        const { preview, count } = yield call(previewFile, file)
        yield put({ type: c.IMPORT_FILE_UPLOAD_SUCCESS, items: preview.rows, count, preview, onSuccess, onFail })
    } catch (error) {
        yield put({ type: c.IMPORT_FILE_UPLOAD_ERROR, error, onSuccess, onFail })
    }
}

function* parcelSave({ ignore=false, onSuccess, onFail }) {
    if (ignore) return
    try {
        const { import: { file } } = yield select()
        yield call(commitPreview, file._mePreview)
        yield put({ type: c.IMPORT_PARCEL_SAVE_SUCCESS, onSuccess, onFail })
    } catch (error) {
        yield put({ type: c.IMPORT_PARCEL_SAVE_ERROR, error, onSuccess, onFail })
    }
}
