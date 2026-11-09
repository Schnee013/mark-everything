import {
	blankSpace,
	blankBookmark,
	blankMeta
} from '../../helpers/bookmarks'

const emptyObject = {}
const emptyArray = []

//Single
export const bookmark = ({bookmarks}, _id)=>bookmarks.elements[_id] ? bookmarks.elements[_id] : blankBookmark

export const makeBookmark = ()=>bookmark

export const highlight = ({bookmarks : { spaces } }, spaceId, _id)=>
	(
		(spaces[spaceId] ? spaces[spaceId] : blankSpace)
			.highlight
	)[_id] || emptyObject

export const makeHighlight = ()=>highlight

export const tags = ({bookmarks}, _id)=>(bookmarks.meta[_id] ? bookmarks.meta[_id] : blankMeta).tags

export const highlights = ({bookmarks}, _id, limit=0)=>{
	const items = (bookmarks.meta[_id] ? bookmarks.meta[_id] : blankMeta).highlights
	if (limit)
		return items.slice(0, limit)
	return items
}

export const makeHighlights = ()=>highlights
