import s from './index.module.styl'
import React, { useRef, useMemo, useCallback, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { makeCollection } from '~data/selectors/collections'
import { makeSort, makeSelectModeEnabled, getSearchEmpty } from '~data/selectors/bookmarks'
import { oneReorder } from '~data/actions/bookmarks'

import { ReactSortable } from 'react-sortablejs'

export default function BookmarksItemsSortable({ data, spaceId, children, onReorder }) {
    const dispatch = useDispatch()
    const drag = useRef()
    const [working, setWorking] = useState(false)
    const [generation, setGeneration] = useState(0)
    const searchEmpty = useSelector(state => getSearchEmpty(state, spaceId))

    //collection
    const getCollection = useRef(makeCollection()).current
    const { access } = useSelector(state=>getCollection(state, spaceId))

    //space
    const getSort = useRef(makeSort()).current
    const sort = useSelector(state=>getSort(state, spaceId))

    //select mode
    const getSelectModeEnabled = useRef(makeSelectModeEnabled()).current
    const selectModeEnabled = useSelector(state=>getSelectModeEnabled(state, spaceId))

    //enabled?
    const enabled = (
        sort=='sort' &&
        (!process.env.ME_LOCAL || (Number(spaceId) > 0 && searchEmpty && !!onReorder && !working)) &&
        !selectModeEnabled &&
        access && 
        access.level >= 3
    )

    //required for sortable
    const list = useMemo(
        ()=>enabled ? data.map(id=>({id})) : data, 
        [data, enabled]
    )
    const ignoreFunc = useCallback(()=>{}, [])

    //events
    const onSortStart = useCallback(() => { drag.current = { data, onReorder } }, [data, onReorder])
    const onSortEnd = useCallback(async ({ oldDraggableIndex, newDraggableIndex })=>{
        const frozen = drag.current || { data, onReorder }
        if (oldDraggableIndex === newDraggableIndex) return
        if (frozen.onReorder) {
            setWorking(true)
            try { await frozen.onReorder(oldDraggableIndex, newDraggableIndex) }
            finally { setWorking(false); setGeneration(value => value + 1) }
        } else if (!process.env.ME_LOCAL) dispatch(oneReorder(frozen.data[oldDraggableIndex], frozen.data[newDraggableIndex]))
    }, [data, onReorder])

    return (
        <ReactSortable 
            key={`${enabled}:${generation}`}
            disabled={!enabled}

            list={list}
            setList={ignoreFunc}
            onSort={undefined}
            onStart={onSortStart}
            onEnd={onSortEnd}
            forceFallback={!!onReorder}

            tag='main'
            ghostClass={s.ghost}
            handle='> *'
            
            animation='135'
            easing='cubic-bezier(0.45, 0, 0.55, 1)'
            delay={100}
            delayOnTouchOnly={true}
            scroll={false} //true freeze drag! in chrome >= 100
            revertOnSpill={true}
            removeOnSpill={true}
            supportPointer={false} //fix safari >=13
            >
            {children}
        </ReactSortable>
    )
}