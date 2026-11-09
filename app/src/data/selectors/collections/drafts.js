import { createSelector } from 'reselect'
import { normalizeCollection, blankDraft } from '../../helpers/collections'

//Draft
export const makeDraftItem = ()=>createSelector(
	[
		({collections={}}, _id)=>collections.getIn(['drafts', _id, 'item']),
		(state, _id)=>_id
	],
	(item, _id)=>item || normalizeCollection({_id: _id})
)

//Draft Status
export const makeDraftStatus = ()=>createSelector(
	[({collections={}}, _id)=>collections.getIn(['drafts', _id, 'status'])],
	(status)=>status || blankDraft.status
)
