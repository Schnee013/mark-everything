import React, { useEffect, useState, useRef } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import Button from '~co/common/button'
import { Layout, Label, Text, Group } from '~co/common/form'
import { send, setLibrary } from './client'
import CollectionPicker from '~co/collections/picker'

export default function LibraryGate() {
    const location = useLocation()
    const dispatch = useDispatch()
    const [session, setSession] = useState(null)
    const [error, setError] = useState('')
    const [path, setPath] = useState('')
    const [busy, setBusy] = useState(false)
    const [retry, setRetry] = useState(0)
    const openedLibrary = useRef(null)
    const acknowledged = useRef(false)
    const openedConflicts = useRef(false)
    const [choice, setChoice] = useState(null)
    useEffect(() => {
        const wake = () => { if (openedLibrary.current) send('sync.wake').catch(() => {}) }
        window.addEventListener('online', wake)
        return () => window.removeEventListener('online', wake)
    }, [])
    useEffect(() => {
        const choose = event => setChoice(event.detail)
        window.addEventListener('me-choose-collection', choose)
        return () => window.removeEventListener('me-choose-collection', choose)
    }, [])
    useEffect(() => {
        let alive = true, timer, revision
        async function check() {
            try {
                const cap = await send('session')
                if (!alive) return
                if (openedLibrary.current && cap.library?.libraryId !== openedLibrary.current) throw new Error('书签库已切换，请关闭页面后重新打开；原库草稿保留')
                if (cap.library) {
                    setLibrary(cap.library.libraryId)
                    if (!openedLibrary.current) send('sync.wake').catch(() => {})
                    openedLibrary.current = cap.library.libraryId
                    dispatch({ type: 'ME_LIBRARY_READY', library: cap.library })
                    setSession(cap)
                    const status = await send('status')
                    if (!alive) return
                    dispatch({ type: 'ME_LIBRARY_STATUS', status })
                    if (revision !== status.revision) {
                        dispatch({ type: 'COLLECTIONS_REFRESH_REQ' })
                        dispatch({ type: 'FILTERS_LOAD_PRE', spaceId: 'global', query: {} })
                        window.dispatchEvent(new Event('me-library-change'))
                    }
                    revision = status.revision
                    const handoff = new URLSearchParams(window.location.search)
                    if (!acknowledged.current && handoff.get('handoff')) {
                        // The helper's openManager waits for this page to confirm the same library.
                        acknowledged.current = true
                        send('manager.opened', { requestId: handoff.get('handoff') }).catch(() => {})
                    }
                    if (!openedConflicts.current && handoff.get('conflicts') === '1') {
                        openedConflicts.current = true
                        require('./organize').showConflicts()
                    }
                } else setSession(cap)
                setError('')
            } catch (e) { if (alive) setError(e.message) }
            if (alive) timer = setTimeout(check, 2000)
        }
        const refresh = () => { dispatch({ type: 'FILTERS_LOAD_PRE', spaceId: 'global', query: {} }); dispatch({ type: 'COLLECTIONS_REFRESH_REQ' }); dispatch({ type: 'ME_LIBRARY_REFRESH' }) }
        window.addEventListener('me-organized', refresh)
        check()
        return () => { alive = false; clearTimeout(timer); window.removeEventListener('me-organized', refresh) }
    }, [retry])
    async function bind(op) {
        setBusy(true)
        try { await send(op, { params: { path, name: '我的书签' } }); setRetry(retry + 1) }
        catch (e) { setError(e.message) }
        finally { setBusy(false) }
    }
    // A transient helper failure keeps mounted editors and their acknowledged drafts intact.
    if (session?.library) return <>
        {error && <div role='status' style={{ padding: '8px 16px' }}>{error}</div>}
        {choice && <CollectionPicker onClose={() => { choice.resolve(null); setChoice(null) }} events={{ onItemClick: item => { choice.resolve(item); setChoice(null) } }} />}
        <Outlet />
    </>
    if (location.pathname === '/settings/sync' && session) return <Outlet />
    return <main style={{ maxWidth: 560, margin: '48px auto', padding: 24 }}>
        <h1>连接本地书签库</h1>
        <p>使用已有 ME 文件助手。Chrome 与 Edge 连接同一目录后共用书签。</p>
        <Layout>
            <Label>书签库完整路径</Label>
            <Text aria-label='书签库完整路径' value={path} onChange={e => setPath(e.target.value)} />
            <Group>
                <Button as='button' disabled={busy || !path || !session} onClick={() => bind('bind')}>接入已有库</Button>
                <Button as='button' disabled={busy || !path || !session} onClick={() => bind('create')}>在空目录创建</Button>
                <Button as='button' disabled={busy} onClick={() => setRetry(retry + 1)}>重新连接</Button>
                <Button as={Link} to='/settings/sync'>接入云端库</Button>
            </Group>
        </Layout>
        <p role='status'>{error || '正在连接本地助手…'}</p>
    </main>
}
