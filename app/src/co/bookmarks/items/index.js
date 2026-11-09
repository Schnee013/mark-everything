import React, { useRef, useCallback, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { bindActionCreators } from 'redux'
import * as collectionActions from '~data/actions/collections'
import CollectionItem from '~co/collections/item'
import { getSearchEmpty, query } from '~data/selectors/bookmarks'
import { reorderChildren } from '../../../me/mixed'
import { makeCollection } from '~data/selectors/collections'
import { bookmarksIds } from '~data/selectors/bookmarks'
import { SPACE_PER_PAGE } from '~data/constants/bookmarks'

import View from './view'
import Lazy from '~co/virtual/lazy'
import Sortable from './sortable'
import Item from '../item'
import Empty from './empty'

const initialNumToRender = parseInt(SPACE_PER_PAGE / 2)

export default function BookmarksItems(props) {
    const { spaceId, activeId, compact, compactLimit, events } = props

    //collection
    const getCollection = useRef(makeCollection()).current
    const { view, access } = useSelector(state=>getCollection(state, spaceId))

    const dispatch = useDispatch()
    const actions = useMemo(() => bindActionCreators(collectionActions, dispatch), [dispatch])
    const snapshot = useSelector(state => process.env.ME_LOCAL && Number(spaceId) > 0 && !compact &&
        getSearchEmpty(state, spaceId) && !props.search && !query(state, spaceId).descendants &&
        state.bookmarks.spaces[spaceId]?._meChildren?.sort === query(state, spaceId).sort && ['loaded', 'empty'].includes(state.bookmarks.spaces[spaceId]?.status.main)
        ? state.bookmarks.spaces[spaceId]?._meChildren : null)
    const mixed = snapshot?.entries
    const byId = useMemo(() => new Map((mixed || []).map(e => [e.item._id, e])), [mixed])
    const reorder = useCallback((from, to) => reorderChildren(snapshot, from, to), [snapshot])

    //bookmarks
    const ids = useSelector(state=>bookmarksIds(state, spaceId))
    const items = useMemo(
        ()=>mixed ? mixed.map(e => e.item._id) : !compact ? ids : ids.slice(0, compactLimit),
        [mixed, ids, compact, compactLimit]
    )
    const keyExtractor = useCallback(_id=>_id, [])

    if (!items.length)
        return <Empty {...props} />

    return (
        <View 
            spaceId={spaceId} 
            view={view}>
            <Sortable 
                data={items}
                onReorder={mixed ? reorder : undefined}
                spaceId={spaceId}>
                <Lazy
                    data={items}
                    keyExtractor={keyExtractor}
                    initialNumToRender={initialNumToRender}

                    scrollToItem={activeId}

                    mode={view == 'masonry' ? 'row-end-span' : 'height'}
                    gridCellSize={31} //grid-gap + grid-auto-rows
                    >
                    {_id=>byId.get(_id)?.kind === 'collection'
                        ? <CollectionItem item={byId.get(_id).item} level={0} expandable={false} actions={actions} />
                        : <Item
                            _id={_id}
                            dragDisabled={!!mixed}
                            //collection
                            spaceId={spaceId}
                            view={view}
                            access={access}
                            //listing specififc
                            active={activeId == _id}
                            events={events} />
                    }
                </Lazy>
            </Sortable>
        </View>
    )
}