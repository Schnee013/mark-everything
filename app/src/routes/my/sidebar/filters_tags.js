import React, { useMemo, useCallback, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { load } from '~data/actions/filters'
import { getTags } from '~data/selectors/tags'
import { getQuickFilters } from '~data/selectors/filters'

import FiltersSection from '~co/filters/section'
import Filter from '~co/filters/item'
import TagsSection from '~co/tags/section'
import Tag from '~co/tags/item'
import Button from '~co/common/button'
import { Item, ItemTitle } from '~co/common/list'

export default function MySidebarFiltersTags({ children, activeId }) {
    const dispatch = useDispatch()

    //load
    useEffect(()=>{dispatch(load('global'))}, [])

    //data
    const { tags_hide, filters_hide } = useSelector(state=>state.config)
    const conflicts = useSelector(state => state.user.localStatus?.conflicts || 0)
    const tags = useSelector(state=>getTags(state, 'global'))
    const filters = useSelector(state=>getQuickFilters(state, 'global'))

    const data = useMemo(()=>[
        ...(process.env.ME_LOCAL && conflicts ? [{ _id: 'me-conflicts', count: conflicts }] : []),
        ...(filters.length ? [
            { _id: 'filters', hidden: filters_hide },
            ...(!filters_hide ? filters.map(filter=>({ ...filter, type: 'filter' })) : [])
        ] : []),

        ...(tags.length ? [
            { _id: 'tags', hidden: tags_hide, count: tags.length },
            ...(!tags_hide ? tags.map(tag=>({ ...tag, type: 'tag' })) : [])
        ] : [])
    ], [filters, filters_hide, tags, tags_hide, conflicts])

    //item render
    const rowRenderer = useCallback((row={})=>{
        if (row._id === 'me-conflicts') return <Button as={Item} onClick={() => require('../../../me/organize').showConflicts()}><ItemTitle>冲突（{row.count}）· 查看与处理</ItemTitle></Button>
        let Component
        let active = false

        switch(row.type || row._id) {
            case 'filters': 
                Component = FiltersSection
                break

            case 'filter':
                Component = Filter
                active = activeId == (row.query||'').trim()
                break

            case 'tags':
                Component = TagsSection
                break

            case 'tag':
                Component = Tag
                active = activeId == ('#'+row._id)
                break

            default: return false
        }

        return (
            <Component 
                item={row}
                active={active} />
        )
    }, [activeId])

    return children(
        data,
        rowRenderer
    )
}