(() => {
  const STORAGE='xiaosun-xiaowang-cloud-v1';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const FIELDS={days:['title','city','locations','tentative','schedule','notes'],hotels:['name','city','checkIn','checkOut','nights','status','evidence','room','address','checkInTime','checkOutTime','breakfast','notes'],todos:['text','completed'],tickets:['completed'],bills:['originalAmountCents','baseAmountCents','currency','category','note','orderedAt','payerId','participantIds','createdAt','updatedAt'],travelers:['name','initial','color'],settings:['baseCurrency','commonCurrencies','lastCurrency']};
  FIELDS.ideas=['text'];
  let endpoint='',token='',revision=0,baseline=null,pending=[],busy=false,connected=false,conflicted=false,deferred=false;
  const list=(snapshot,key)=>key==='ideas'?(snapshot.tripData.unplannedAttractions||[{id:'unplanned-attractions',text:''}]):key==='days'?snapshot.tripData.days:key==='hotels'?snapshot.tripData.hotelBookings:key==='tickets'?snapshot.purchasedTickets.map(id=>({id,completed:true})):key==='todos'?snapshot.todos:snapshot.ledger?.[key]||[];
  const id=(key,item)=>String(key==='days'?item.day:item.id);
  function diff(before,after){
    const changes=[];
    for(const [key,fields] of Object.entries(FIELDS)){
      if(key==='settings'){
        const a=before.ledger?.settings||{},b=after.ledger?.settings||{};
        const patches=fields.filter(field=>!equal(a[field],b[field])).map(field=>({field,before:a[field],after:b[field]}));
        if(patches.length)changes.push({collection:key,id:'settings',op:'edit',fields:patches});
        continue;
      }
      const a=new Map(list(before,key).map(item=>[id(key,item),item])),b=new Map(list(after,key).map(item=>[id(key,item),item]));
      for(const [recordId,old] of a)if(!b.has(recordId))changes.push({collection:key,id:recordId,op:'delete',before:old});
      for(const [recordId,item] of b){
        if(!a.has(recordId)){changes.push({collection:key,id:recordId,op:'add',after:item});continue;}
        const patches=fields.filter(field=>!equal(a.get(recordId)[field],item[field])).map(field=>({field,before:a.get(recordId)[field],after:item[field]}));
        if(patches.length)changes.push({collection:key,id:recordId,op:'edit',fields:patches});
      }
    }
    return changes;
  }
  function snapshot(){
    const data=journalBackup();
    data.ledger=window.TravelLedger?.getSnapshot?.()||{version:1,settings:{baseCurrency:'CNY',commonCurrencies:['AUD'],lastCurrency:'AUD'},travelers:[],bills:[]};
    return clone(data);
  }
  function status(message){
    for(const target of ['#cloud-status','#journal-status']){const el=document.querySelector(target);if(el)el.textContent=message;}
  }
  function persist(){
    localStorage.setItem(STORAGE,JSON.stringify({endpoint,token,revision,baseline,pending}));
  }
  async function request(path,body){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(endpoint+path,{method:body?'POST':'GET',headers:{'Authorization':'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:controller.signal});
      const data=await response.json();
      if(!response.ok){const error=new Error(data.error||'云端暂时无法连接');error.status=response.status;throw error;}
      return data;
    }finally{clearTimeout(timeout);}
  }
  function editing(){return Boolean(document.querySelector('dialog[open]')||window.TravelLedger?.isEditing?.()||document.activeElement?.closest('form'));}
  async function applyRemote(remote){
    const data=remote.snapshot;
    if(!validJournal(data))throw new Error('云端数据格式不匹配');
    state.data=data.tripData;state.todos=data.todos;state.purchasedTickets=new Set(data.purchasedTickets);
    window.TRAVEL_PLAN_DATA=state.data;
    const adapter=state.runtimeAdapters.todos;
    if(adapter){const local=await adapter.load();local.todos=clone(data.todos);local.tickets=data.purchasedTickets.map(id=>({id,completed:true}));await adapter.save(local);}
    if(data.ledger)await window.TravelLedger?.replaceSnapshot?.(data.ledger);
    localStorage.setItem(JOURNAL_KEY,JSON.stringify(data));
    renderHero();renderFlights();refreshJournalTimeline();renderRental();renderTodoList();renderHotelBookings();renderUnplannedAttractions();
    baseline=snapshot();revision=remote.revision;persist();
  }
  function capture(){
    if(!baseline||!connected)return;
    const current=snapshot(),changes=diff(baseline,current);
    if(!changes.length)return;
    pending.push({changes});baseline=current;persist();status('修改已保存在本机，等待云端同步');void flush();
  }
  async function flush(){
    if(busy||!connected||conflicted)return;
    busy=true;
    try{
      while(pending.length){
        status('正在同步到云端…');
        const result=await request('/api/changes',pending[0]);
        pending.shift();revision=result.revision;persist();
        if(!pending.length){
          if(!editing())await applyRemote(result);
          else {deferred=true;status('已同步到云端，正在编辑的内容会继续保留');}
        }
      }
      status('已同步到云端 · 两人共享');
    }catch(error){
      if(error.status===409){conflicted=true;status('同步冲突：本机修改已保留，请打开“同步”核对');}
      else if(error.status===401){connected=false;status('登录已过期，请重新连接云端');}
      else status('云端暂时无法连接，修改已保存在本机，联网后重试');
    }finally{busy=false;}
  }
  async function pull(){
    if(!connected||busy||conflicted||document.hidden)return;
    if(pending.length){void flush();return;}
    if(editing())return;
    busy=true;
    try{const remote=await request('/api/snapshot');if(remote.revision!==revision||deferred){await applyRemote(remote);deferred=false;}status('已同步到云端 · 两人共享');}
    catch(error){status(error.status===401?'登录已过期，请重新连接云端':'网络暂时不可用，显示本机保存的内容');}
    finally{busy=false;}
  }
  async function connect(key){
    if(!endpoint)throw new Error('云端服务尚未配置完成');
    status('正在连接云端…');
    const session=await request('/api/session',{key});token=session.token;
    const remote=await request('/api/snapshot');
    localStorage.setItem(STORAGE+':before-connect',JSON.stringify(snapshot()));
    if(pending.length){connected=true;conflicted=false;persist();await flush();if(conflicted)throw new Error('本机与云端有同一项修改冲突，请先导出备份，再核对云端。');return;}
    const localLedger=snapshot().ledger;
    await applyRemote(remote);connected=true;conflicted=false;persist();
    // Existing local bills are copied only into an empty cloud ledger; a used
    // cloud ledger is never replaced by another device's old local copy.
    if(!remote.snapshot.ledger.bills.length&&!remote.snapshot.ledger.travelers.length&&(localLedger.bills.length||localLedger.travelers.length)){
      await window.TravelLedger.replaceSnapshot(localLedger);capture();await flush();
    }
    status('已连接云端 · 行程、酒店、清单和账本共同保存');
  }
  function downloadCloud(snapshotValue){
    const url=URL.createObjectURL(new Blob([JSON.stringify(snapshotValue,null,2)],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='小孙小王旅行日记-云端核对备份.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function setup(){
    try{const response=await fetch('cloud-config.json',{cache:'no-store'});const config=await response.json();endpoint=String(config.endpoint||'').replace(/\/$/,'');}catch{}
    try{const saved=JSON.parse(localStorage.getItem(STORAGE));if(saved?.endpoint===endpoint){token=saved.token||'';revision=saved.revision||0;pending=saved.pending||[];baseline=saved.baseline||null;}}catch{}
    const form=document.querySelector('#cloud-connect-form'),dialog=document.querySelector('#cloud-dialog');
    document.querySelector('#cloud-open').onclick=()=>{document.querySelector('#cloud-form-message').textContent=endpoint?'输入你们共用的同步口令。新设备会载入云端最新版，本机原内容会先保留备份。':'云端服务正在配置，暂时继续保存在本机。';dialog.showModal();};
    document.querySelector('#cloud-cancel').onclick=()=>dialog.close();
    form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{await connect(form.elements.key.value);form.elements.key.value='';dialog.close();}catch(error){document.querySelector('#cloud-form-message').textContent=error.message;}finally{button.disabled=false;}};
    document.querySelector('#cloud-download-remote').onclick=async()=>{try{downloadCloud((await request('/api/snapshot')).snapshot);}catch(error){document.querySelector('#cloud-form-message').textContent=error.message;}};
    document.querySelector('#cloud-download-before').onclick=()=>{const saved=localStorage.getItem(STORAGE+':before-connect')||localStorage.getItem(STORAGE+':before-conflict');if(saved)downloadCloud(JSON.parse(saved));else downloadCloud(snapshot());};
    document.querySelector('#cloud-use-remote').onclick=async()=>{
      if(!confirm('将保留一份本机备份，并载入云端最新版；本机未同步的修改不会继续上传。确定吗？'))return;
      try{localStorage.setItem(STORAGE+':before-conflict',JSON.stringify(snapshot()));const remote=await request('/api/snapshot');pending=[];conflicted=false;await applyRemote(remote);connected=true;status('已载入云端最新版');dialog.close();}catch(error){document.querySelector('#cloud-form-message').textContent=error.message;}
    };
    document.querySelector('#cloud-disconnect').onclick=()=>{token='';connected=false;pending=[];baseline=null;localStorage.removeItem(STORAGE);status('已断开云端，继续保存在本机');dialog.close();};
    document.addEventListener('travel-ledger:changed',()=>capture());
    window.addEventListener('online',()=>{void flush();void pull();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void pull();});
    setInterval(()=>void pull(),15000);
    if(endpoint&&token){
      connected=true;
      if(!baseline)baseline=snapshot();
      if(pending.length)await flush();else await pull();
    }else{status(endpoint?'本机保存 · 点击“同步”连接云端':'本机保存 · 云端服务配置中');}
  }
  window.TravelCloud={setup,capture,flush,pull,diff};
})();
