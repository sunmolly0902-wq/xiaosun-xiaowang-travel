const JOURNAL_KEY = 'xiaosun-xiaowang-australia-journal-v1';
let journalDay = null;
let journalTodo = null;

function applyJournalUpdates(data) {
  const updateId = '20261013-swap-nov18-nov19';
  const updates = data.metadata.journalUpdates || [];
  if (!updates.includes(updateId)) {
    const firstIndex = data.days.findIndex(day => day.date === '2026-11-18');
    const secondIndex = data.days.findIndex(day => day.date === '2026-11-19');
    if (firstIndex >= 0 && secondIndex >= 0) {
      const first = data.days[firstIndex];
      const second = data.days[secondIndex];
      const move = (source, target) => ({ ...source, day: target.day, date: target.date,
        schedule: source.schedule.map(item => ({ ...item, id: item.id.replace(/^day-\d+-/, `day-${target.day}-`) })) });
      data.days[firstIndex] = move(second, first);
      data.days[secondIndex] = move(first, second);
      data.metadata.journalUpdates = [...updates, updateId];
    }
  }
  const cityDay = data.days.find(day => day.date === '2026-11-18');
  const marketItem = cityDay?.schedule.find(item => item.text.includes('维多利亚女皇市场'));
  if (marketItem && !updates.includes(updateId)) {
    marketItem.text = '维多利亚女皇市场（周三常规日间休市，待另择营业日）';
    const note = '维多利亚女皇市场周三不营业（日间常规市场）；11月18日先安排其余市区景点和咖啡。营业时间来源：https://qvm.com.au/blog/faq/when-is-the-market-open/';
    if (!cityDay.notes.includes(note)) cityDay.notes.push(note);
  }
  data.config.modules.overview = false;
  data.config.modules.ledger = true;
  applyHotelBookingUpdates(data);
  return data;
}

function validJournal(data) {
  return data?.format === 'xiaosun-xiaowang-travel' && data.version === 1 && data.tripData?.metadata?.tripId === 'xiaosun-xiaowang-australia-2026' && Array.isArray(data.tripData.days) && data.tripData.days.length === 15 && data.tripData.days.every((day, index) => day.day === index + 1 && day.date === `2026-11-${16 + index}` && typeof day.title === 'string' && Array.isArray(day.schedule) && day.schedule.every(item => typeof item.text === 'string') && Array.isArray(day.notes)) && Array.isArray(data.todos) && data.todos.every(todo => typeof todo.id === 'string' && typeof todo.text === 'string' && typeof todo.completed === 'boolean') && new Set(data.todos.map(todo=>todo.id)).size===data.todos.length && Array.isArray(data.purchasedTickets);
}

function loadJournalState() {
  const published = state.data;
  try {
    const saved = JSON.parse(localStorage.getItem(JOURNAL_KEY));
    if (validJournal(saved) && saved.tripData.metadata.contentRevision === published.metadata.contentRevision) {
      state.data = applyJournalUpdates(saved.tripData);
      localStorage.setItem(JOURNAL_KEY, JSON.stringify({ ...saved, tripData: state.data }));
    } else if (published.metadata.contentRevision) {
      if (validJournal(saved)) localStorage.setItem(JOURNAL_KEY+':before-mobile-update', JSON.stringify(saved));
      const runtimeKey='travel-plan:runtime:v1:'+encodeURIComponent(published.metadata.tripId);
      const runtime=JSON.parse(localStorage.getItem(runtimeKey)||'{}');
      runtime.todos=published.preTrip.packingItems;
      runtime.tickets=(published.metadata.initialPurchasedTickets||[]).map(id=>({id,completed:true}));
      localStorage.setItem(runtimeKey,JSON.stringify(runtime));
      localStorage.setItem(JOURNAL_KEY,JSON.stringify({format:'xiaosun-xiaowang-travel',version:1,tripData:published,todos:runtime.todos,purchasedTickets:published.metadata.initialPurchasedTickets||[],updatedAt:new Date().toISOString()}));
    }
  } catch {}
  applyJournalUpdates(state.data);
}

function journalBackup() {
  return { format:'xiaosun-xiaowang-travel', version:1, tripData:state.data, todos:state.todos, purchasedTickets:[...state.purchasedTickets], ledger:window.TravelLedger?.getSnapshot?.()||null, updatedAt:new Date().toISOString() };
}

function persistJournal() {
  try {
    state.data.preTrip.packingItems = state.todos.map(todo=>({...todo}));
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journalBackup()));
    $('#journal-status').textContent = '已自动保存到这台设备的浏览器';
    window.TravelCloud?.capture?.();
  } catch { $('#journal-status').textContent = '无法自动保存，请导出备份'; }
}

function dayPlan(day) { return day.schedule.filter(item=>item.id!==`day-${day.day}-hotel` && item.id!==`day-${day.day}-activity`); }
function dayField(day, field) { return day.schedule.find(item=>item.id===`day-${day.day}-${field}`)?.text || ''; }

function openJournalDay(number) {
  const day=state.data.days.find(day=>day.day===number);
  if(!day)return;
  journalDay=number;
  $('#journal-day-date').textContent=formatCompactDate(day.date);
  const form=$('#journal-day-form');
  form.elements.title.value=day.title;
  form.elements.plan.value=dayPlan(day).map(item=>item.text).join('\n');
  form.elements.hotel.value=dayField(day,'hotel');
  form.elements.activity.value=dayField(day,'activity');
  form.elements.notes.value=day.notes.join('\n');
  form.elements.tentative.checked=Boolean(day.tentative);
  form.elements.title.setCustomValidity('');
  $('#journal-day-dialog').showModal();
}

function refreshJournalTimeline() {
  const expanded=state.expandedDay;
  renderTimeline();
  state.expandedDay=expanded;
  $('#timeline').innerHTML=state.data.days.map(dayCard).join('');
}

function openJournalTodo(id) {
  const todo=state.todos.find(todo=>todo.id===id);
  if(!todo)return;
  journalTodo=id;
  $('#journal-todo-text').value=todo.text;
  $('#journal-todo-text').setCustomValidity('');
  $('#journal-todo-dialog').showModal();
  $('#journal-todo-text').focus();
}

function exportJournal() {
  const blob=new Blob([JSON.stringify(journalBackup(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download='小孙小王旅行日记-备份.json';anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function renderUnplannedAttractions() {
  const input=$('#unplanned-text');
  if(input)input.value=state.data.unplannedAttractions?.[0]?.text || '';
}

function setupUnplannedAttractions() {
  const input=$('#unplanned-text'),form=$('#unplanned-form');
  if(!input||!form)return;
  const save=()=>{
    state.data.unplannedAttractions=[{id:'unplanned-attractions',text:input.value}];
    persistJournal();
  };
  input.addEventListener('input',save);
  form.addEventListener('submit',event=>{event.preventDefault();save();input.blur();event.submitter?.blur();});
  renderUnplannedAttractions();
}

async function importJournal(file) {
  const data=JSON.parse(await file.text());
  if(!validJournal(data))throw new Error('请选择本旅行网页导出的有效 JSON 备份。');
  if(!confirm('导入将覆盖这台设备上的行程和准备清单，确定继续吗？'))return;
  const adapter=state.runtimeAdapters.todos;
  const snapshot=await adapter.load();
  snapshot.todos=data.todos;
  snapshot.tickets=data.purchasedTickets.map(id=>({id,completed:true}));
  await adapter.save(snapshot);
  state.data=data.tripData;state.todos=data.todos;state.purchasedTickets=new Set(data.purchasedTickets);
  if(data.ledger)await window.TravelLedger?.replaceSnapshot?.(data.ledger);
  applyJournalUpdates(state.data);
  window.TRAVEL_PLAN_DATA=state.data;
  persistJournal();renderHero();renderFlights();refreshJournalTimeline();renderRental();renderTodoList();renderHotelBookings();renderUnplannedAttractions();
  $('#journal-status').textContent='备份已导入并保存';
}

function setupJournal() {
  renderHotelBookings();
  setupHotelEditor();
  setupUnplannedAttractions();
  window.TravelCloud?.setup?.();
  const map=state.data.mapLinks.providedGoogleMapsLinks[0];
  if(map){$('#journal-maps').href=map.url;$('#journal-maps').textContent=map.label+' ↗';}
  $('#journal-export').onclick=exportJournal;
  $('#journal-import').onclick=()=>$('#journal-import-file').click();
  $('#journal-import-file').onchange=async(event)=>{
    const file=event.target.files?.[0];if(!file)return;
    try{await importJournal(file);}catch(error){alert(error.message);}
    event.target.value='';
  };
  $('#journal-day-form').onsubmit=(event)=>{
    event.preventDefault();
    const form=event.currentTarget;
    const title=form.elements.title.value.trim();
    form.elements.title.setCustomValidity(title?'':'请填写当天主题');
    if(!title){form.elements.title.reportValidity();return;}
    const day=state.data.days.find(day=>day.day===journalDay);
    if(!day)return;
    const previous=dayPlan(day);
    day.title=title;
    day.schedule=form.elements.plan.value.split(/[；;\n]/).map(text=>text.trim()).filter(Boolean).map((text,index)=>{
      const original=previous.find(item=>item.text===text);
      return original?{...original,id:`day-${day.day}-plan-${index+1}`}:{id:`day-${day.day}-plan-${index+1}`,time:'',type:'walk',text};
    });
    for(const field of ['hotel','activity']){const text=form.elements[field].value.trim();if(text)day.schedule.push({id:`day-${day.day}-${field}`,time:field==='hotel'?'住宿':'预订',type:'note',text});}
    const notes=form.elements.notes.value.trim();day.notes=notes?[notes]:[];
    day.tentative=form.elements.tentative.checked;
    persistJournal();refreshJournalTimeline();$('#journal-day-dialog').close();
  };
  $('#journal-day-form').elements.title.oninput=()=>$('#journal-day-form').elements.title.setCustomValidity('');
  $('#journal-day-cancel').onclick=()=>$('#journal-day-dialog').close();
  $('#journal-todo-form').onsubmit=async(event)=>{
    event.preventDefault();const input=$('#journal-todo-text');const text=input.value.trim();
    input.setCustomValidity(text?'':'请填写物品内容');if(!text){input.reportValidity();return;}
    const todo=state.todos.find(todo=>todo.id===journalTodo);if(!todo)return;
    todo.text=text;
    try{await saveSharedChange('todos',todo);persistJournal();renderTodoList();$('#journal-todo-dialog').close();}catch{alert('保存失败，请重试。');}
  };
  $('#journal-todo-text').oninput=()=>$('#journal-todo-text').setCustomValidity('');
  $('#journal-todo-cancel').onclick=()=>$('#journal-todo-dialog').close();
  $('#todo-form').addEventListener('submit',()=>persistJournal());
  $('#todo-list').addEventListener('change',()=>persistJournal());
  $('#todo-list').addEventListener('click',event=>{if(event.target.closest('.todo-delete'))persistJournal();});
}
