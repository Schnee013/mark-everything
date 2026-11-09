import React from 'react'
import { connect } from 'react-redux'
import browser from 'webextension-polyfill'
import Form from '~co/bookmarks/edit/form'
import s from '~co/bookmarks/edit/index.module.styl'
import api, { send, getLibrary } from './client'
import Button from '~co/common/button'
import Modal, { Header, Content } from '~co/overlay/modal'
import { Layout } from '~co/common/form'
import { Item, ItemTitle } from '~co/common/list'
import { showConflict } from './organize'

class LocalEdit extends React.Component {
    state = { draft: null, status: 'loading', message: '' }
    alive = false
    draft = null
    loading = 0
    componentDidMount() {
        this.alive = true
        this.load()
        window.addEventListener('blur', this.commit)
        window.addEventListener('beforeunload', this.commit)
    }
    componentDidUpdate(prev) { if (prev._id !== this.props._id) { this.commit(); this.selectedId = null; this.load() } }
    componentWillUnmount() {
        this.commit()
        this.alive = false
        clearInterval(this.timer)
        window.removeEventListener('blur', this.commit)
        window.removeEventListener('beforeunload', this.commit)
    }
    load = async () => {
        const token = ++this.loading
        clearInterval(this.timer)
        this.draft = null
        this.setState({ draft: null, status: 'loading', message: '' })
        try {
            let owner = sessionStorage.getItem('me-editor-session')
            if (!owner) { owner = crypto.randomUUID(); sessionStorage.setItem('me-editor-session', owner) }
            const tab = await browser.tabs.getCurrent()
            if (tab) {
                owner = await send('editor.claim', { owner, tabId: tab.id })
                sessionStorage.setItem('me-editor-session', owner)
            }
            // Popup draft identities survive popup close; independent manager tabs retain independent bases.
            if (!tab && location.search.includes('action')) owner = 'popup'
            const key = `draft:${getLibrary()}:${owner}:${this.selectedId || this.props._id || this.props.new?.item?.link || 'new'}`
            const d = await send('draft.open', { key, options: { id: this.selectedId || this.props._id, item: this.props.new?.item, pageMetadata: this.props.new?.pageMetadata } })
            if (!this.alive || token !== this.loading) return
            this.draft = d
            this.accept(d)
            this.timer = setInterval(this.poll, 1000)
            if (this.props.new?.autoCreate && !d.item._me) this.save().catch(() => {})
        } catch (e) {
            if (this.alive && token === this.loading) {
                this.setState({ status: 'error', message: e.message })
                if (e.code === 'MULTIPLE_MATCHES') {
                    const link = this.props.new?.item?.link || this.props._id
                    const result = await api._get('me/matches?link=' + encodeURIComponent(link))
                    this.setState({ matches: result.items.filter(item => item.link === link) })
                }
            }
        }
    }
    accept = d => {
        if (!this.alive || d.key !== this.draft?.key) return
        // An older save response must not restore text that the user has since replaced.
        if (d.seq >= this.draft.seq) this.draft = d
        else {
            this.draft.item._me = d.item._me
            this.draft.item._id = d.item._id
        }
        const current = this.draft
        const saving = !!d.pending || d.savedSeq < current.seq && !!d.requestedSeq
        this.setState({ draft: { ...current, item: { ...current.item } },
            status: d.error ? 'errorSaving' : saving ? 'saving' : current.item._me ? 'loaded' : 'new',
            message: d.error?.message || (saving ? '正在写入本地…' : current.item._me ? '已保存本地' : '草稿已保留') })
    }
    poll = async () => {
        const d = this.draft
        if (!d) return
        try { this.accept(await send('draft.read', { key: d.key })) } catch (e) { this.report(e) }
    }
    report = e => { if (this.alive) this.setState({ status: 'errorSaving', message: e.message }) }
    change = patch => {
        if (!this.draft) return
        const d = this.draft
        const manual = Object.keys(patch)
        if ('link' in patch && patch.link !== d.item.link && !d.item._me) {
            for (const field of d.autoFields || []) if (!manual.includes(field)) patch[field] = ''
            d.item.media = []
        }
        if (d.autoFields) d.autoFields = d.autoFields.filter(field => !manual.includes(field))
        d.seq++
        for (const [field, value] of Object.entries(patch)) {
            d.item[field] = value
            d.fieldSeq[field] = d.seq
            d.dirty[field] = d.seq
        }
        this.setState({ draft: { ...d, item: { ...d.item } }, message: '正在保留输入…' })
        // Every input event transfers a complete versioned draft to the background worker.
        send('draft.change', { key: d.key, draft: d }).then(this.accept, this.report)
    }
    save = async () => {
        if (!this.draft) throw new Error('草稿尚未就绪')
        const key = this.draft.key
        this.setState({ status: 'saving', message: '正在写入本地…' })
        try {
            let d
            do {
                const input = JSON.parse(JSON.stringify(this.draft))
                d = await send('draft.save', { key, draft: input })
                this.accept(d)
                if (d.error) throw new Error(d.error.message)
            } while (this.draft?.key === key && d.savedSeq < this.draft.seq)
            this.props.dispatch({ type: 'ME_LIBRARY_REFRESH' })
            this.props.dispatch({ type: 'COLLECTIONS_REFRESH_REQ' })
            return d
        } catch (e) { this.report(e); throw e }
    }
    commit = () => {
        if (this.draft?.item._me && Object.keys(this.draft.dirty).length) return this.save().catch(() => {})
    }
    remove = async () => {
        if (this.draft?.item._me?.values.life === 'trashed') {
            if (await require('./organize').purgeBookmarks([this.draft.item])) {
                clearInterval(this.timer)
                this.draft = null
                this.setState({ draft: null, status: 'removed', message: '已永久删除' })
            }
            return
        }
        this.change({ removed: true })
        this.save().catch(() => {})
    }
    recover = () => { this.change({ removed: false, collectionId: -1 }); this.save().catch(() => {}) }
    render() {
        const { draft, status, message } = this.state
        // The status line is ME's own, the official .edit row was built for the form alone.
        // Stacked: a longer status text must not change the form's horizontal space.
        return <div className={s.edit} style={{ flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '8px 16px' }}>
                <p role='status' style={{ margin: 0, flex: 1, minWidth: 0 }}>{message || '正在读取本地…'}</p>
                {draft?.item._me?.values?.life === 'trashed' && <Button onClick={this.recover}>恢复原位置</Button>}
                {draft?.item._me?.conflicts && <Button onClick={() => showConflict(draft.item._me.id)}>查看与处理冲突</Button>}
            </div>
            {this.state.matches && <Modal onClose={() => this.setState({ matches: null })}>
                <Header title='此网址有多条书签，请选择' />
                <Content><Layout>{this.state.matches.map(item => <Button as={Item} key={item._id} aria-label={'编辑这条 ' + item.title} onClick={() => { this.selectedId = item._id; this.setState({ matches: null }); this.load() }}>
                    <ItemTitle>{item.title} · {item.note || item.link}</ItemTitle>
                </Button>)}</Layout></Content>
            </Modal>}
            {draft && <Form {...this.props} item={draft.item} status={status === 'loaded' && draft.item._me?.values.life === 'trashed' ? 'removed' : status} unsaved={Object.keys(draft.dirty).length > 0}
                onChange={this.change} onSave={this.save} onCommit={this.commit} onRemove={this.remove} onRecover={this.recover} />}
        </div>
    }
}
export default connect()(LocalEdit)
