import wrapFunc from '../utils/wrapFunc'
import {
	TAG_RENAME_REQ,
	TAG_REMOVE_REQ,
	TAGS_REORDER
} from '../constants/tags'

export const oneRemove = (tagName, onSuccess, onFail, localEntity)=>({
	type: TAG_REMOVE_REQ,
	tagName,
    localEntity,
	onSuccess: wrapFunc(onSuccess),
	onFail: wrapFunc(onFail)
})

export const oneRename = (tagName, newName, onSuccess, onFail, localEntity)=>({
	type: TAG_RENAME_REQ,
	tagName,
    localEntity,
	newName,
	onSuccess: wrapFunc(onSuccess),
	onFail: wrapFunc(onFail)
})

export const reorder = (method)=>({
	type: TAGS_REORDER,
	method
})