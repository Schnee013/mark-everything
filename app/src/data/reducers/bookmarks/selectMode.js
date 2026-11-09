import _ from 'lodash-es'

import { blankSelectMode, queryIsEqual } from '../../helpers/bookmarks'

import { SELECT_MODE_ENABLE, SELECT_MODE_DISABLE, SELECT_MODE_SELECT_BOOKMARK, SELECT_MODE_UNSELECT_BOOKMARK, SELECT_MODE_SELECT_ALL, SELECT_MODE_UNSELECT_ALL, SELECT_MODE_IMPORTANT_SELECTED, SELECT_MODE_REMOVE_SELECTED, SELECT_MODE_APPENDTAGS_SELECTED, SELECT_MODE_REMOVETAGS_SELECTED, SELECT_MODE_MOVE_SELECTED, SELECT_MODE_REPARSE_SELECTED, SELECT_MODE_FAIL_SELECTED, SPACE_LOAD_REQ, BOOKMARK_REMOVE_SUCCESS } from '../../constants/bookmarks'

export default function(state, action) {switch (action.type) {
	case SELECT_MODE_ENABLE:{
		if (state.getIn(['spaces', action.spaceId, 'status', 'main']) != 'loaded')
			return state

		return state
			.set('selectMode', blankSelectMode)
			.setIn(['selectMode', 'enabled'], true)
			.setIn(['selectMode', 'spaceId'], action.spaceId)
	}

	case SPACE_LOAD_REQ:{
		if (process.env.ME_LOCAL && state.selectMode.enabled && state.selectMode.spaceId == action.spaceId &&
			queryIsEqual(_.omit(state.selectMode._query || {}, 'page'), _.omit(action.query || {}, 'page'))) return state
		if (!action.ignore)
			return state
				.set('selectMode', blankSelectMode)
	}break
	case SELECT_MODE_DISABLE:
		if (!action.ignore) return state.set('selectMode', blankSelectMode)
		break

	case SELECT_MODE_SELECT_BOOKMARK:{
		const { spaceId, _id, shift=false } = action

		if (state.selectMode.enabled && state.selectMode.all && state.selectMode.spaceId == spaceId)
			return state

		//get ids
		let selected = [...getEstimatedIds(state, spaceId)]

		if (!shift)
			selected.unshift(_id)
		else {
			const already = state.selectMode.ids
			const all = state.spaces[spaceId].ids
			const fromIndex = already.length ? all.findIndex(id=>id==already[0]) : 0
			const toIndex = all.findIndex(id=>id==_id)

			selected.push(...all.filter((id,index)=>{
				if (fromIndex > toIndex)
					return index <= fromIndex && index >= toIndex
				else if (fromIndex < toIndex)
					return index >= fromIndex && index <= toIndex
				else if (fromIndex == toIndex)
					return index == fromIndex
				else
					return false
			}))
		}

		return state
			.set('selectMode', blankSelectMode)
			.setIn(['selectMode', 'enabled'], true)
			.setIn(['selectMode', 'spaceId'], spaceId)
			.setIn(['selectMode', 'ids'], _.uniq(selected))
            .setIn(['selectMode', '_items'], process.env.ME_LOCAL ? freezeItems(state, _.uniq(selected)) : [])
            .setIn(['selectMode', '_query'], state.spaces[spaceId].query)
	}

	case SELECT_MODE_UNSELECT_BOOKMARK:{
		let ids = _.filter(getEstimatedIds(state, action.spaceId), (id)=>id!=action._id)

		if (!ids.length)
			return state
				.set('selectMode', blankSelectMode)

		return state
			.set('selectMode', blankSelectMode)
			.setIn(['selectMode', 'enabled'], true)
			.setIn(['selectMode', 'spaceId'], action.spaceId)
			.setIn(['selectMode', 'ids'], ids)
            .setIn(['selectMode', '_items'], process.env.ME_LOCAL ? freezeItems(state, ids) : [])
            .setIn(['selectMode', '_query'], state.spaces[action.spaceId].query)
	}

    case 'ME_SELECTION_FROZEN': {
        if (state.selectMode.localToken !== action.localToken) return state
        return state.setIn(['selectMode', 'working'], '')
            .setIn(['selectMode', 'ids'], action.items.map(item => item._id))
            .setIn(['selectMode', '_items'], action.items)
            .setIn(['selectMode', '_allFrozen'], true)
    }
	case SELECT_MODE_SELECT_ALL:{
		return state
			.set('selectMode', blankSelectMode)
			.setIn(['selectMode', 'enabled'], true)
			.setIn(['selectMode', 'spaceId'], action.spaceId)
			.setIn(['selectMode', 'ids'], process.env.ME_LOCAL ? state.spaces[action.spaceId].ids : [])
            .setIn(['selectMode', '_items'], process.env.ME_LOCAL ? freezeItems(state, state.spaces[action.spaceId].ids) : [])
            .setIn(['selectMode', '_query'], state.spaces[action.spaceId].query)
			.setIn(['selectMode', 'all'], !process.env.ME_LOCAL)
            .setIn(['selectMode', 'working'], process.env.ME_LOCAL ? 'freeze' : '')
            .setIn(['selectMode', 'localToken'], action.localToken || '')
	}

	case SELECT_MODE_UNSELECT_ALL:{
		return state
			.set('selectMode', blankSelectMode)
			.setIn(['selectMode', 'enabled'], true)
			.setIn(['selectMode', 'spaceId'], action.spaceId)
			.setIn(['selectMode', 'all'], false)
	}

	case SELECT_MODE_IMPORTANT_SELECTED:
		return state.setIn(['selectMode', 'working'], 'important')

	case SELECT_MODE_REMOVE_SELECTED:
		return state.setIn(['selectMode', 'working'], 'remove')

	case SELECT_MODE_APPENDTAGS_SELECTED:
		return state.setIn(['selectMode', 'working'], 'appendTags')

	case SELECT_MODE_REMOVETAGS_SELECTED:
		return state.setIn(['selectMode', 'working'], 'removeTags')

	case SELECT_MODE_MOVE_SELECTED:
		return state.setIn(['selectMode', 'working'], 'move')

	case SELECT_MODE_REPARSE_SELECTED:
		return state.setIn(['selectMode', 'working'], 'reparse')

	case SELECT_MODE_FAIL_SELECTED:
		return state.setIn(['selectMode', 'working'], '')

	case BOOKMARK_REMOVE_SUCCESS:{
		return state
			.setIn(
				['selectMode', 'ids'],
				_.without(state.selectMode.ids, ...(Array.isArray(action._id) ? action._id : [action._id]))
			)
	}
}}

const getEstimatedIds = (state, spaceId)=>{
	if (state.selectMode.spaceId!=spaceId)
		return blankSelectMode.ids

	if (state.selectMode.enabled && state.selectMode.all)
		return state.spaces[state.selectMode.spaceId].ids

	return state.selectMode.ids
}
const freezeItems = (state, ids) => ids.map(id =>
    (state.selectMode._items || []).find(item => item._id === id) ||
    { ...state.elements[id], ...state.meta[id] })
