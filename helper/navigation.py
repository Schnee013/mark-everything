"""Registered browser/profile handoff; completion requires an extension-page acknowledgment."""
import hashlib, os, re, subprocess, sys, time
from pathlib import Path
from urllib.parse import urlencode
from core import Error,atomic,read,uid

MANAGER_PAGE='index.html'
MANAGER_ROOT='/my/0'

def view_id(entity_id):
    """Same derived display id the manager uses: first 52 bits of the UUID digest plus one."""
    return int(hashlib.sha256(str(entity_id).encode()).hexdigest()[:13],16)+1

def manager_fragment(params):
    if params.get('id'):return MANAGER_ROOT+'/item/'+str(view_id(params['id']))
    return MANAGER_ROOT

def open_manager(config_dir,config,library_id,params):
    fragment=manager_fragment(params)
    result={'path':MANAGER_PAGE,'fragment':fragment,'libraryId':library_id}
    target=config.get('manager')
    if not params.get('launch'):return {**result,'target':target}
    if not target or target.get('browser') not in ('chrome','edge','arc') or not re.fullmatch('[a-p]{32}',target.get('extensionId','')):
        raise Error('MANAGER_UNBOUND','请在安装时登记管理浏览器与配置目录')
    apps={'chrome':'Google Chrome','edge':'Microsoft Edge','arc':'Arc'}
    if sys.platform=='darwin':
        app=apps[target['browser']];exe=Path('/Applications')/(app+'.app')/'Contents/MacOS'/app
    elif os.name=='nt':
        candidates={'chrome':[Path(os.environ.get('PROGRAMFILES',''))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('LOCALAPPDATA',''))/'Google/Chrome/Application/chrome.exe'],'edge':[Path(os.environ.get('PROGRAMFILES(X86)',''))/'Microsoft/Edge/Application/msedge.exe'],'arc':[]}
        exe=next((p for p in candidates[target['browser']] if p.is_file()),None)
    else:exe=None
    if not exe or not exe.is_file():raise Error('MANAGER_UNAVAILABLE','管理浏览器尚未安装或目标平台启动方式未验证')
    request_id=uid();path=config_dir/'manager-requests'/(request_id+'.json')
    path.parent.mkdir(parents=True,exist_ok=True)
    record={'requestId':request_id,'libraryId':library_id,'created':time.time(),'opened':False,'fragment':fragment}
    atomic(path,record)
    query={'handoff':request_id,'libraryId':library_id}
    if params.get('conflicts'):query['conflicts']='1'
    url='chrome-extension://'+target['extensionId']+'/'+MANAGER_PAGE+'?'+urlencode(query)+'#'+fragment
    args=[str(exe)]
    if target.get('profile'):args+=['--user-data-dir='+str(Path(target['profile']).resolve()),'--profile-directory=Default']
    args += [url]
    subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    deadline=time.monotonic()+8
    while time.monotonic()<deadline:
        record=read(path)
        if record.get('opened'):break
        time.sleep(.1)
    return {**result,**record,'target':target}

def configure(config_dir,config,params):
    """Record which installed browser the manager handoff launches.

    The extension id is fixed by the packaged manifest, so switching browsers
    never changes it; a profile only applies to the browser it was set for.
    """
    browser=params.get('browser')
    if browser not in ('chrome','edge','arc'):
        raise Error('INVALID','请选择 Chrome、Edge 或 Arc')
    current=config.get('manager') or {}
    extension_id=current.get('extensionId') or read(config_dir/'helper-install.json',{}).get('extensionId','')
    if not re.fullmatch('[a-p]{32}',extension_id):
        raise Error('MANAGER_UNBOUND','缺少扩展编号，请先完成 ME 安装')
    target={
        'browser':browser,
        'profile':current.get('profile') if current.get('browser')==browser else None,
        'extensionId':extension_id,
    }
    config['manager']=target
    atomic(config_dir/'binding.json',config)
    return target

def status(config_dir,request_id):
    if not re.fullmatch('[0-9a-f-]{36}',request_id):raise Error('INVALID','管理请求编号格式错误')
    record=read(config_dir/'manager-requests'/(request_id+'.json'))
    if not record:raise Error('NOT_FOUND','没有这条管理请求')
    return record

def acknowledge(config_dir,request_id,library_id):
    record=status(config_dir,request_id)
    if record['libraryId']!=library_id:raise Error('LIBRARY_MISMATCH','管理页连接了其他库')
    if time.time()-record['created']>300:raise Error('INVALID','管理请求已过期，请重新打开')
    record.update(opened=True,acknowledged=time.time())
    atomic(config_dir/'manager-requests'/(request_id+'.json'),record)
    return record
