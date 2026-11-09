import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet'
import { Header } from '~co/screen/splitview/main'
import { Title } from '~co/common/header'
import { Layout, Label, Text, Buttons, SubLabel, Separator } from '~co/common/form'
import Button from '~co/common/button'
import Alert from '~co/common/alert'
import { Alert as Notice, Confirm, Error as ErrorDialog } from '~co/overlay/dialog'
import { send, setLibrary } from './client'
import { syncLabel } from './sync-status.cjs'

export default function CloudSettings() {
    const navigate = useNavigate()
    const status = useSelector(state => state.user.localStatus)
    const [session, setSession] = useState(null)
    const [url, setUrl] = useState('')
    const [user, setUser] = useState('')
    const [password, setPassword] = useState('')
    const [path, setPath] = useState('')
    const [remoteId, setRemoteId] = useState('')
    const [busy, setBusy] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState('')
    useEffect(() => { send('session').then(setSession).catch(e => setError(e.message)) }, [])
    useEffect(() => {
        if (status && !loaded) {
            setUrl(status.remote?.url || '')
            setUser(status.remote?.user || '')
            setLoaded(true)
        }
    }, [status, loaded])
    const bound = !!session?.library
    async function action(op, publish = false) {
        if (publish && !await Confirm('将当前本地库发布到此云端目录？', { description: '沿用当前库编号；远端身份不匹配时原助手会拒绝上传。' })) return
        setBusy(true)
        try {
            const result = await send(op, { publish, params: { url, user, password, path, libraryId: remoteId } })
            if (result.error) throw Object.assign(new Error(result.error.message), result.error)
            if (['sync.configure', 'sync.join'].includes(op)) setPassword('')
            if (op === 'sync.join') { setLibrary(result.libraryId); navigate('/my/0'); return }
            await Notice(op === 'sync.configure' ? '云配置已保存' : result.localOnly ? '仅本地 · 请先配置云端' : '同步已完成')
        } catch (e) { await ErrorDialog(e) }
        finally { setBusy(false) }
    }
    return <>
        <Helmet><title>坚果云同步</title></Helmet>
        <Header data-fancy><Title>坚果云同步</Title></Header>
        {error && <Alert variant='warning'>{error}</Alert>}
        {bound && <Alert role='status' variant={status?.sync.error ? 'warning' : 'default'}>
            {syncLabel(status)}
            <SubLabel>本地：{status?.local === 'saved' ? '已保存' : '正在读取'} · 冲突：{status?.conflicts || 0} 项待处理</SubLabel>
            {status?.sync.lastSuccess && <SubLabel>上次同步：{new Date(status.sync.lastSuccess * 1000).toLocaleString()}</SubLabel>}
            {status?.sync.retryAt > Date.now() / 1000 && !status?.sync.authPaused && <SubLabel>下次重试：{new Date(status.sync.retryAt * 1000).toLocaleString()}</SubLabel>}
        </Alert>}
        <Layout as='form' onSubmit={e => { e.preventDefault(); action(bound ? 'sync.configure' : 'sync.join') }}>
            <Label>WebDAV HTTPS 目录</Label>
            <Text aria-label='WebDAV HTTPS 目录' type='url' required value={url} disabled={busy} onChange={e => setUrl(e.target.value)} />
            <Label>坚果云账号</Label>
            <Text aria-label='坚果云账号' autoComplete='username' required value={user} disabled={busy} onChange={e => setUser(e.target.value)} />
            <Label>WebDAV 应用密码</Label>
            <Text aria-label='WebDAV 应用密码' type='password' autoComplete='new-password' required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} />
            <SubLabel>密码仅交给原助手的系统凭据存储；修改配置时重新填写应用密码。</SubLabel>
            {!bound && <>
                <Label>云端库编号</Label>
                <Text aria-label='云端库编号' required value={remoteId} disabled={busy} onChange={e => setRemoteId(e.target.value)} />
                <Label>下载到本地空目录</Label>
                <Text aria-label='下载到本地空目录' required value={path} disabled={busy} onChange={e => setPath(e.target.value)} />
            </>}
            <Buttons>
                <Button as='input' type='submit' variant='primary' disabled={busy || !session || bound && !loaded} value={bound ? '保存云配置' : '接入云端库'} />
            </Buttons>
        </Layout>
        {bound && <Layout>
            <Separator />
            <Label>当前库编号</Label>
            <Text aria-label='当前库编号' readOnly value={session.library.libraryId} />
            <Buttons>
                <Button disabled={busy || !status?.configured} onClick={() => action('sync.run')}>立即同步</Button>
                <Button disabled={busy || !status?.configured} onClick={() => action('sync.run', true)}>发布当前本地库</Button>
                <Button disabled={busy || !status?.conflicts} onClick={() => require('./organize').showConflicts()}>查看与处理冲突（{status?.conflicts || 0}）</Button>
            </Buttons>
        </Layout>}
    </>
}
