import { useEffect } from 'react'
import browser from '~target/extension/browser'
import { useSelector } from 'react-redux'

export default function useBookmarksChanged() {
    const elements = useSelector(state=>state.bookmarks.elements)

    useEffect(()=>{
        browser.runtime.sendMessage(null, { type: 'BOOKMARKS_CHANGED' })
    }, [elements])
}
