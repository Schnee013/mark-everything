import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import useBookmarksChanged from './useBookmarksChanged'
import useExternalLinks from './useExternalLinks'
import useCloseSidepanel from './useCloseSidepanel'

export default function AppExtension({ children }) {
    const dispatch = useDispatch()
    useEffect(() => {
        if (!process.env.ME_LOCAL) return
        const refresh = () => dispatch({ type: 'ME_LIBRARY_REFRESH' })
        window.addEventListener('me-library-change', refresh)
        return () => window.removeEventListener('me-library-change', refresh)
    }, [])
    useBookmarksChanged()
    useExternalLinks()
    useCloseSidepanel()

    return children
}