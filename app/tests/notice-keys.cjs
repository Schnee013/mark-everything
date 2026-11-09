const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process')
const {conflictNoticeKeys}=require('../src/me/conflict-notice-keys.cjs')
const root=fs.mkdtempSync('/private/tmp/me-notice-keys-');fs.cpSync(path.resolve(__dirname,'../../helper'),root+'/helper',{recursive:true})
const fixture=(mode,name)=>JSON.parse(execFileSync('/usr/bin/python3',[__dirname+'/notice-fixture.py',root,mode,...(name?[name]:[])],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}))
const info=fixture('setup'),lib=info.libraryId
const native=(method,params={})=>JSON.parse(execFileSync('/usr/bin/python3',[root+'/helper/host.py','--stdio','--config',root+'/config'],{input:JSON.stringify({v:1,id:crypto.randomUUID(),method,params})+'\n',encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}})).result
const get=id=>native('get',{id}),map=()=>conflictNoticeKeys(lib,Object.values(native('query',{conflicts:true}).items),get)
test('真实候选版本：重复、部分解决、追加候选及库身份 key',async()=>{
 fixture('conflict','a');fixture('conflict','b');const a=await map(),seen=a.records.flatMap(r=>r.keys);assert.equal(a.records.length,2);assert.deepEqual((await map()).records,a.records)
 fixture('resolve','b');assert.ok((await map()).records.flatMap(r=>r.keys).every(k=>seen.includes(k)))
 fixture('third','a');assert.equal((await map()).records.flatMap(r=>r.keys).filter(k=>!seen.includes(k)).length,1)
 const other=await conflictNoticeKeys('other-library',[get(info.ids.a)],get);assert.ok(other.records[0].keys.every(k=>!seen.includes(k)))
 fixture('resolve','a')
})
test('删除集合、标注标签及 redirect 标签：类型明确；重新删除使用新 life heads',async()=>{
 for(const name of ['parent','annotationTag','redirectTarget']){
  const state=fixture('delete',name);const result=await conflictNoticeKeys(lib,state.entities,get);assert.equal(result.records.length,1,name);assert.equal(result.gaps.length,0);const before=result.records[0].keys[0]
  fixture('restore',name);const second=fixture('delete',name),after=await conflictNoticeKeys(lib,second.entities,get);assert.notEqual(after.records[0].keys[0],before)
  await assert.rejects(conflictNoticeKeys(lib,second.entities,async id=>({...get(id),kind:name==='parent'?'tag':'collection'})),/类型或身份/)
  fixture('restore',name)
 }
})
test('真实合入的环与缺失引用明确留作缺口，不猜测版本',async()=>{
 const cycle=fixture('cycle'),c=await conflictNoticeKeys(lib,cycle.entities,get);assert.equal(c.records.length,0);assert.ok(c.gaps.some(x=>x.reason==='cycle'))
 const missing=fixture('missing'),m=await conflictNoticeKeys(lib,missing.entities,get);assert.equal(m.records.length,0);assert.ok(m.gaps.some(x=>x.reason==='missing-reference'))
})
test.after(()=>fs.rmSync(root,{recursive:true,force:true}))
