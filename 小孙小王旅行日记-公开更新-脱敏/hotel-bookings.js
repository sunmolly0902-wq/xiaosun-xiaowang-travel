const HOTEL_BOOKING_UPDATE = '20261014-guangzhou-reservation-v3';
let editingHotelId = null;
// Public booking details only; personal identifiers and screenshots are excluded.
const HOTEL_BOOKINGS = [
  { id:'hotel-mel-merged', name:'Holiday Inn Melbourne Bourke Street Mall by IHG', city:'墨尔本', checkIn:'2026-11-17', checkOut:'2026-11-21', nights:4, status:'booked', evidence:'已合并订单 · 用户确认', room:'标准大床房 · 1 间 · 2 人', address:'296 Little Collins Street, Melbourne', checkInTime:'15:00 后', checkOutTime:'11:00 前', breakfast:'不含早餐', notes:['11 月 17—21 日连续入住 4 晚，已合并为一个订单。'] },
  { id:'hotel-apollo', name:'Apollo Bay Motel & Apartments', city:'阿波罗湾', checkIn:'2026-11-21', checkOut:'2026-11-22', nights:1, status:'booked', evidence:'已提供订单', room:'特大床房 · 1 间 · 2 人', address:'2 Moore St, Apollo Bay', checkInTime:'14:00—18:00', checkOutTime:'10:00 前', breakfast:'不含早餐', notes:['若预计 18:00 后到店，请提前联系酒店确认晚到入住方式。','截图显示免费取消截止：北京时间 11 月 20 日 11:00，具体以订单页面为准。'] },
  { id:'hotel-airport', name:'Ibis Styles Melbourne Airport', city:'墨尔本机场', checkIn:'2026-11-22', checkOut:'2026-11-23', nights:1, status:'booked', evidence:'已提供订单', room:'高级大床房 · 1 间 · 2 人', address:'1 Grants Rd, Melbourne Airport', checkInTime:'14:00 后', checkOutTime:'11:00 前', breakfast:'不含早餐', notes:['23 日暂选约 11:10 起飞的航班，按机场值机时间提前退房。'] },
  { id:'hotel-sydney', name:'Meriton Suites Mascot Central', city:'悉尼', checkIn:'2026-11-23', checkOut:'2026-11-29', nights:6, status:'booked', evidence:'预订成功', room:'一卧室特大床套房 · 1 间', address:'', checkInTime:'', checkOutTime:'', breakfast:'订单截图未显示', notes:['入住与退房时间、早餐及取消政策，待补充订单详情。'] },
  { id:'hotel-guangzhou', name:'广州南航明珠大酒店（北区）', city:'广州', checkIn:'2026-11-29', checkOut:'2026-11-30', nights:1, status:'awaiting_confirmation', evidence:'预约已提交 · 待房源确认', room:'房型待确认（截图酒店等级：C 级）', address:'', checkInTime:'', checkOutTime:'', breakfast:'待确认', notes:['免费中转住宿。截图显示订单支付成功，正在锁定酒店房源；最终以短信或邮件确认通知为准。','抵达广州后，按南航中转柜台指引办理入住；接送方式与柜台位置待补充。'] }
];

function applyHotelBookingUpdates(data) {
  if (data.metadata.hotelBookingUpdate === HOTEL_BOOKING_UPDATE) return;
  const hadPreviousBookings = Boolean(data.metadata.hotelBookingUpdate);
  const retained = data.hotelBookings?.filter(item => !['hotel-mel-first','hotel-mel-extra','hotel-mel-merged','hotel-guangzhou'].includes(item.id));
  data.hotelBookings = JSON.parse(JSON.stringify(hadPreviousBookings && retained?.length
    ? [data.hotelBookings.find(item=>item.id==='hotel-mel-merged') || HOTEL_BOOKINGS[0], ...retained, HOTEL_BOOKINGS.at(-1)] : HOTEL_BOOKINGS));
  for (const day of data.days) {
    day.notes = day.notes.filter(note => note !== 'USER_NOTE');
    if (['2026-11-17','2026-11-20'].includes(day.date)) {
      day.notes = day.notes.filter(note => !(note.startsWith('住宿预订：') && /无障碍标准特大床房|床型随机安排|是否需要换房|两笔订单/.test(note)));
    }
    if (hadPreviousBookings && data.metadata.hotelBookingUpdate === '20261014-holiday-inn-merged-v2' && day.date !== '2026-11-29') continue;
    if (hadPreviousBookings && day.date >= '2026-11-21' && day.date !== '2026-11-29') continue;
    const booking = HOTEL_BOOKINGS.find(item => day.date >= item.checkIn && day.date < item.checkOut);
    if (!booking) continue;
    if (day.date === '2026-11-29') day.notes = day.notes.filter(note=>!note.startsWith('住宿预订：酒店及房型待落实')).map(note=>note.replace(/广州过夜住宿待安排/g,'广州中转酒店预约已提交，等待房源确认'));
    const hotelText = `${booking.name}（${booking.id === 'hotel-mel-merged' ? '已预订，已合并为一个订单' : booking.status === 'booked' ? '已预订，依据订单截图' : booking.status === 'awaiting_confirmation' ? '预约已提交，待房源确认' : '需预订，尚未办理'}）`;
    const item = day.schedule.find(entry => entry.id === `day-${day.day}-hotel`);
    if (item) item.text = hotelText;
    else day.schedule.push({id:`day-${day.day}-hotel`, time:'住宿', type:'note', text:hotelText});
    const stay = data.accommodations?.find(entry => entry.date === day.date);
    if (stay) Object.assign(stay, {name:booking.name, status:booking.status === 'booked' ? 'confirmed' : 'pending', bookingId:booking.id});
    if (day.date === booking.checkIn) {
      const note = `住宿预订：${booking.room}。${booking.checkInTime ? `入住 ${booking.checkInTime}；退房 ${booking.checkOutTime}。` : ''}${booking.breakfast}。${booking.notes.join(' ')}`;
      if (!day.notes.includes(note)) day.notes.push(note);
    }
  }
  data.metadata.hotelBookingUpdate = HOTEL_BOOKING_UPDATE;
}

function renderHotelBookings() {
  const root = document.querySelector('#hotel-bookings-list');
  if (!root) return;
  const bookings = state.data.hotelBookings || HOTEL_BOOKINGS;
  const booked = bookings.filter(item => item.status === 'booked').reduce((sum,item)=>sum+item.nights,0);
  const total = bookings.reduce((sum,item)=>sum+item.nights,0);
  const awaiting = bookings.filter(item=>item.status==='awaiting_confirmation').reduce((sum,item)=>sum+item.nights,0);
  document.querySelector('#hotel-bookings-progress').textContent = `${booked} / ${total} 晚已落实预订`;
  document.querySelector('#hotel-bookings-description').textContent = `已落实 ${booked} 晚${awaiting ? `；另 ${awaiting} 晚预约已提交，等待房源确认` : ''}。点击“编辑酒店”可修改预订资料，点击地址可打开 Google 地图。资料依据订单截图和你的更新整理。入住时间为酒店当地时间，取消截止另有标注。`;
  root.innerHTML = bookings.map(booking => `<article class="hotel-booking-card ${booking.status !== 'booked' ? 'hotel-booking-card--pending' : ''}">
    <div class="hotel-booking-top"><span class="hotel-booking-city">${escapeHtml(booking.city)}</span><span class="hotel-booking-status">${escapeHtml(booking.evidence)}</span></div>
    <h3>${escapeHtml(booking.name)}</h3>
    <p class="hotel-booking-dates">${escapeHtml(formatCompactDate(booking.checkIn))} 入住<br>${escapeHtml(formatCompactDate(booking.checkOut))} 退房 · ${booking.nights} 晚</p>
    <p>${escapeHtml(booking.room)}</p>
    <p class="hotel-booking-muted"><a class="hotel-address" href="${escapeHtml('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(booking.name+' '+booking.city+' '+booking.address))}" target="_blank" rel="noopener noreferrer">${escapeHtml(booking.address || '在 Google 地图查看酒店')} ↗</a></p>
    ${booking.checkInTime ? `<p>入住 ${escapeHtml(booking.checkInTime)} · 退房 ${escapeHtml(booking.checkOutTime)}</p>` : ''}
    <p>早餐：${escapeHtml(booking.breakfast)}</p>
    <ul>${booking.notes.map(note=>`<li>${escapeHtml(note)}</li>`).join('')}</ul>
    <div class="journal-day-tools"><button class="journal-button" type="button" data-edit-hotel="${escapeHtml(booking.id)}">编辑酒店</button></div>
  </article>`).join('');
}

function setupHotelEditor() {
  const form = document.querySelector('#hotel-edit-form');
  document.querySelector('#hotel-bookings-list').addEventListener('click', event=>{
    const id = event.target.closest('[data-edit-hotel]')?.dataset.editHotel;
    const booking = state.data.hotelBookings.find(item=>item.id===id);
    if (!booking) return;
    editingHotelId=id;
    for (const key of ['name','city','room','address','checkIn','checkOut','checkInTime','checkOutTime','breakfast','status']) form.elements[key].value=booking[key] || '';
    form.elements.notes.value=booking.notes.join('\n');
    form.elements.checkOut.setCustomValidity('');
    document.querySelector('#hotel-edit-dialog').showModal();
  });
  document.querySelector('#hotel-edit-cancel').onclick=()=>document.querySelector('#hotel-edit-dialog').close();
  form.onsubmit=event=>{
    event.preventDefault();
    const old=state.data.hotelBookings.find(item=>item.id===editingHotelId);
    if(!old)return;
    const previous={...old};
    const next={...old};
    for(const key of ['name','city','room','address','checkIn','checkOut','checkInTime','checkOutTime','breakfast','status']) next[key]=form.elements[key].value.trim();
    const nights=(Date.parse(next.checkOut)-Date.parse(next.checkIn))/86400000;
    const overlap=state.data.hotelBookings.some(item=>item.id!==old.id&&next.checkIn<item.checkOut&&next.checkOut>item.checkIn);
    form.elements.checkOut.setCustomValidity(!Number.isInteger(nights)||nights<1?'退房日期必须晚于入住日期':overlap?'与另一笔住宿日期重叠，请检查日期':'');
    if(!form.reportValidity())return;
    next.nights=nights;
    next.notes=form.elements.notes.value.split('\n').map(text=>text.trim()).filter(Boolean);
    next.evidence={booked:'已预订 · 手动更新',awaiting_confirmation:'预约已提交 · 待房源确认',pending:'尚未预订'}[next.status];
    Object.assign(old,next);
    for(const day of state.data.days){
      if(day.date===previous.checkIn)day.notes=day.notes.filter(note=>!note.startsWith('住宿预订：'+previous.room));
      const stay=state.data.accommodations.find(item=>item.date===day.date);
      const inside=day.date>=next.checkIn&&day.date<next.checkOut;
      if(!inside&&stay?.bookingId!==old.id)continue;
      const text=inside?`${next.name}（${next.evidence}）`:'住宿待补充';
      const item=day.schedule.find(entry=>entry.id===`day-${day.day}-hotel`);
      if(item)item.text=text;
      if(stay)Object.assign(stay,{name:inside?next.name:'住宿待补充',status:inside&&next.status==='booked'?'confirmed':'pending',bookingId:inside?next.id:''});
      if(day.date===next.checkIn)day.notes.push(`住宿预订：${next.room}。${next.checkInTime?`入住 ${next.checkInTime}；退房 ${next.checkOutTime}。`:''}${next.breakfast}。${next.notes.join(' ')}`);
    }
    persistJournal();renderHotelBookings();refreshJournalTimeline();document.querySelector('#hotel-edit-dialog').close();
  };
  form.elements.checkOut.oninput=()=>form.elements.checkOut.setCustomValidity('');
}
