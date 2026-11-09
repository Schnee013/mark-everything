import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { load } from '~data/actions/bookmarks'

import Wrap from './wrap'
import Scroll from './scroll'
import Header from '../header'
import Items from '../items'
import Footer from '../footer'

function BookmarksContainer(props) {
    const { spaceId, search } = props
    const dispatch = useDispatch()
    const sort = useSelector(state=>state.config.raindrops_sort)

    const descendants = useSelector(state => Number(spaceId) > 0 && !!state.bookmarks.spaces[spaceId]?.query.descendants)
    const query = useSelector(state => state.bookmarks.spaces[spaceId]?.query)
    const setDescendants = value => dispatch(load(spaceId, { ...query, search, descendants: value }))

    useEffect(()=>{
        dispatch(load(spaceId, {
            search,
            ...(process.env.ME_LOCAL ? { descendants } : {}),
            sort,
        }))
    }, [spaceId, search])

    return (
        <Wrap key={spaceId} {...props}>
            <Header {...props} descendants={descendants} setDescendants={setDescendants} />

            <Scroll {...props}>
                <Items {...props} />
                <Footer {...props} />
            </Scroll>
        </Wrap>
    )
}

BookmarksContainer.defaultProps = {
    spaceId:        0,
    activeId:       0,
    index:          0,
    compact:        false,
    compactLimit:   7,
    events:         {}  //onBookmarkClick
}

export default BookmarksContainer
