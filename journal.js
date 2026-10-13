const JOURNAL_KEY = 'xiaosun-xiaowang-australia-journal-v1';
let journalDay = null;
let journalTodo = null;

function validJournal(data) {
  return data?.format === 'xiaosun-xiaowang-travel' && data.version === 1 && data.tripData?.metadata?.tripId === 'xiaosun-xiaowang-australia-2026' && Array.isArray(data.tripData.days) && data.tripData.days.length === 15 && data.tripData.days.every((day, index) => day.day === index + 1 && day.date === `2026-11-${16 + index}` && typeof day.title === 'string' && Array.isArray(day.schedule) && day.schedule.every(item => typeof item.text === 'string') && Array.isArray(day.notes)) && Array.isArray(data.todos) && data.todos.every(todo => typeof todo.id === 'string' && typeof todo.text === 'string' && typeof todo.completed === 'boolean') && new Set(data.todos.map(todo=>todo.id)).size===data.todos.length && Array.isArray(data.purchasedTickets);
}

function loadJournalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(JOURNAL_KEY));
    if (validJournal(saved)) state.data = saved.tripData;
  } catch {}
  state.data.config.modules.overview = false;
}

function journalBackup() {
  return { format:'xiaosun-xiaowang-travel', version:1, tripData:state.data, todos:state.todos, purchasedTickets:[...state.purchasedTickets], updatedAt:new Date().toISOString() };
}

function persistJournal() {
  try {
    state.data.preTrip.packingItems = state.todos.map(todo=>({...todo}));
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journalBackup()));
    $('#journal-status').textContent = '已自动保存到这台设备的浏览器';
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
  state.data.config.modules.overview=false;
  window.TRAVEL_PLAN_DATA=state.data;
  persistJournal();renderHero();renderFlights();refreshJournalTimeline();renderRental();renderTodoList();
  $('#journal-status').textContent='备份已导入并保存';
}

function setupJournal() {
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
