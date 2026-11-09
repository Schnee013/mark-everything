const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { Model, clone } = require('../src/me/model.cjs')
const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3 DATA-QID="root">中文 &amp; collection</H3><DL><p><DT><A DATA-QID="a" HREF="https://example.com/?a=1&amp;b=2">First &lt;title&gt;</A><DT><H3 DATA-QID="child">子集合</H3><DL><p><DT><A DATA-QID="deep" HREF="https://example.com/deep">深层</A></DL><p><DT><A DATA-QID="b" HREF="https://example.com/last">最后</A></DL><p></DL><p>'
async function fixture() {
    const root = await fs.mkdtemp('/private/tmp/me-html-core-')
    const storage = { data: {}, async get(k) { return clone(this.data[k] || null) }, async set(k,v) { this.data[k] = clone(v) }, async entries() { return clone(this.data) } }
    async function native(method, params = {}, libraryId) {
        const out = execFileSync('/usr/bin/python3', [path.resolve(__dirname, '../../helper/host.py'), '--stdio', '--config', root + '/config'], { input: JSON.stringify({ v:1,id:crypto.randomUUID(),method,params,libraryId })+'\n', encoding:'utf8' })
        const result = JSON.parse(out)
        if (!result.ok) throw Object.assign(new Error(result.error.message), result.error)
        return result.result
    }
    const { libraryId } = await native('create',{path:root+'/library',name:'HTML test'})
    const model = new Model(native,storage)
    const api = (method,url,data={})=>model.api(method,url,data,libraryId)
    const preview = async (content=html,source='Chrome:test.html')=>(await api('post','me/import/preview',{content,source})).preview
    const commit = (p,decisions={})=>api('post','me/import/commit',{id:p.command.id,decisions})
    const entities = async kind=>(await native('query',{kind,limit:200},libraryId)).items
    const tree = async ()=> {
        const all = [...await entities('collection'), ...await entities('bookmark')]
        const walk = parent=>all.filter(e=>(e.values.position?.parent||null)===parent).sort((a,b)=>a.values.position.order-b.values.position.order).map(e=>e.kind==='collection'?{title:e.values.name,children:walk(e.id)}:{title:e.values.title,url:e.values.url})
        return walk(null)
    }
    return {root,storage,native,libraryId,model,api,preview,commit,entities,tree,async close(){await fs.rm(root,{recursive:true,force:true})}}
}
test('旧解析、导出及执行核心：中文转义、网址、深层与混合顺序往返', async()=>{
    const a=await fixture(),b=await fixture()
    try {
        await a.commit(await a.preview())
        const expected=[{title:'中文 & collection',children:[{title:'First <title>',url:'https://example.com/?a=1&b=2'},{title:'子集合',children:[{title:'深层',url:'https://example.com/deep'}]},{title:'最后',url:'https://example.com/last'}]}]
        assert.deepEqual(await a.tree(),expected)
        const {html:exported}=await a.api('get','me/export/html')
        await b.commit(await b.preview(exported))
        assert.deepEqual(await b.tree(),expected)
        const p=await b.preview(exported);assert.equal(p.counts.new,0)
        await b.commit(p);assert.deepEqual(await b.tree(),expected)
    } finally {await a.close();await b.close()}
})
test('重复导入与保护：人工标题、主动清空、备注标签、源缺项及永久删除',async()=>{
    const f=await fixture()
    try {
        await f.commit(await f.preview())
        let items=await f.entities('bookmark'), a=items.find(e=>e.values.title==='First <title>'), b=items.find(e=>e.values.title==='最后')
        const tag=crypto.randomUUID()
        await f.native('execute',{id:crypto.randomUUID(),edits:[{entity:tag,kind:'tag',values:{name:'中文标签'}},{entity:a.id,base:a.heads,values:{title:'人工标题',description:'',note:'富备注',favorite:true,['tag:'+tag]:true}},{entity:b.id,base:b.heads,values:{life:'purged'}}]},f.libraryId)
        const revised=html.replace('First &lt;title&gt;','来源新标题')
        const p=await f.preview(revised);assert.equal(p.counts.new,0);assert.ok(p.rows.find(r=>r.id===a.id).review);assert.ok(p.rows.find(r=>r.id===b.id).deleted)
        await f.commit(p)
        a=await f.native('get',{id:a.id},f.libraryId)
        assert.equal(a.values.title,'人工标题');assert.equal(a.values.note,'富备注');assert.equal(a.values.description,'');assert.equal(a.values.favorite,true);assert.equal(a.values['tag:'+tag],true)
        assert.ok((await f.native('get',{id:b.id},f.libraryId)).purged)
        assert.equal((await f.entities('bookmark')).length,2)
        await assert.rejects(f.commit(p,{[b.id]:'source'}),{code:'PURGED'})
        const missing=await f.preview('<DL><p></DL><p>');await f.commit(missing)
        assert.equal((await f.entities('bookmark')).length,2)
    } finally {await f.close()}
})
test('同网址现有独立身份须明确选择，不存在另存新条目的导入分支',async()=>{
    const f=await fixture()
    try {
        const ids=[crypto.randomUUID(),crypto.randomUUID()]
        await f.native('execute',{id:crypto.randomUUID(),edits:ids.map((entity,i)=>({entity,kind:'bookmark',values:{title:'已有'+i,url:'https://example.com/same',note:'备注'+i}}))},f.libraryId)
        const p=await f.preview('<DL><p><DT><A HREF="https://example.com/same">源标题</A></DL><p>')
        const row=p.rows[0];assert.equal(row.candidates.length,2)
        for(const choice of [undefined,'new','keep','not-an-id']) await assert.rejects(f.commit(p,{[row.id]:choice}),{code:'IMPORT_MATCH_REQUIRED'})
        await f.commit(p,{[row.id]:ids[1]})
        assert.equal((await f.entities('bookmark')).length,2)
        assert.equal((await f.native('get',{id:ids[1]},f.libraryId)).values.note,'备注1')
    } finally {await f.close()}
})
test('格式错误、库身份及导出冲突明确报错；显式跳过复用原核心',async()=>{
    const f=await fixture()
    try {
        for(const content of ['', 'plain text', '{"version":1,"roots":{}}']) await assert.rejects(f.preview(content),{code:'IMPORT_FORMAT'})
        await f.commit(await f.preview())
        const a=(await f.entities('bookmark'))[0]
        for(const title of ['甲','乙']) await f.native('execute',{id:crypto.randomUUID(),edits:[{entity:a.id,base:a.heads,values:{title}}]},f.libraryId)
        await assert.rejects(f.api('get','me/export/html'),{code:'EXPORT_CONFLICT'})
        const {html:out}=await f.api('get','me/export/html?skip=true');assert.ok(!out.includes('DATA-QID="'+a.id+'"'))
        await assert.rejects(f.model.api('get','me/export/html',{},'wrong-library'),{code:'LIBRARY_MISMATCH'})
    } finally {await f.close()}
})
test('导入回执丢失后精确重放并在新 Model 恢复，不重复新增',async()=>{
    const f=await fixture()
    try {
        const p=await f.preview(),native=f.model.native
        let lost=false
        f.model.native=async(...args)=>{const r=await native(...args);if(args[0]==='execute'&&!lost){lost=true;throw Object.assign(new Error('lost receipt'),{code:'TRANSPORT'})}return r}
        await assert.rejects(f.commit(p),{code:'TRANSPORT'})
        const before=(await f.native('status',{},f.libraryId)).revision
        const fresh=new Model(native,f.storage);await fresh.recover(f.libraryId)
        const r=await fresh.api('post','me/import/commit',{id:p.command.id},f.libraryId)
        assert.ok(r._meReceipt);assert.equal((await f.native('status',{},f.libraryId)).revision,before)
        assert.equal((await f.entities('bookmark')).length,3)
    } finally {await f.close()}
})


test('标准 Chrome HTML 无 DATA-QID：重复原文件不增条；已删除集合的子树不复活',async()=>{
    const f=await fixture()
    try {
        const chrome=html.replace(/ DATA-QID="[^"]*"/g,'')
        await f.commit(await f.preview(chrome))
        const before=await f.tree()
        await f.commit(await f.preview(chrome))
        assert.deepEqual(await f.tree(),before)
        const parent=(await f.entities('collection')).find(e=>e.values.name==='中文 & collection')
        await f.native('execute',{id:crypto.randomUUID(),edits:[{entity:parent.id,base:parent.heads,values:{life:'purged'}}]},f.libraryId)
        const revision=(await f.native('status',{},f.libraryId)).revision
        const p=await f.preview(chrome);await f.commit(p)
        assert.ok((await f.native('get',{id:parent.id},f.libraryId)).purged)
        assert.equal((await f.native('status',{},f.libraryId)).revision,revision)
    } finally {await f.close()}
})
