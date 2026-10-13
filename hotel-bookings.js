const HOTEL_BOOKING_UPDATE = '20261013-hotel-orders-v1';
// Public booking details only; personal identifiers and screenshots are excluded.
const HOTEL_BOOKINGS = [
  { id:'hotel-mel-first', name:'Holiday Inn Melbourne Bourke Street Mall by IHG', city:'墨尔本', checkIn:'2026-11-17', checkOut:'2026-11-20', nights:3, status:'booked', evidence:'已提供订单', room:'无障碍标准特大床房 · 1 间 · 2 人', address:'296 Little Collins Street, Melbourne', checkInTime:'15:00 后', checkOutTime:'11:00 前', breakfast:'不含早餐', notes:['与 20—21 日为两笔订单，房型不同；请向酒店确认能否连续住同一间房。'] },
  { id:'hotel-mel-extra', name:'Holiday Inn Melbourne Bourke Street Mall by IHG', city:'墨尔本', checkIn:'2026-11-20', checkOut:'2026-11-21', nights:1, status:'booked', evidence:'已提供订单', room:'标准房 · 1 间 · 2 人 · 床型随机安排', address:'296 Little Collins Street, Melbourne', checkInTime:'15:00 后', checkOutTime:'11:00 前', breakfast:'不含早餐', notes:['与前三晚房型不同，20 日向前台确认是否需要换房；若换房，可询问行李寄存。'] },
  { id:'hotel-apollo', name:'Apollo Bay Motel & Apartments', city:'阿波罗湾', checkIn:'2026-11-21', checkOut:'2026-11-22', nights:1, status:'booked', evidence:'已提供订单', room:'特大床房 · 1 间 · 2 人', address:'2 Moore St, Apollo Bay', checkInTime:'14:00—18:00', checkOutTime:'10:00 前', breakfast:'不含早餐', notes:['若预计 18:00 后到店，请提前联系酒店确认晚到入住方式。','截图显示免费取消截止：北京时间 11 月 20 日 11:00，具体以订单页面为准。'] },
  { id:'hotel-airport', name:'Ibis Styles Melbourne Airport', city:'墨尔本机场', checkIn:'2026-11-22', checkOut:'2026-11-23', nights:1, status:'booked', evidence:'已提供订单', room:'高级大床房 · 1 间 · 2 人', address:'1 Grants Rd, Melbourne Airport', checkInTime:'14:00 后', checkOutTime:'11:00 前', breakfast:'不含早餐', notes:['23 日暂选约 11:10 起飞的航班，按机场值机时间提前退房。'] },
  { id:'hotel-sydney', name:'Meriton Suites Mascot Central', city:'悉尼', checkIn:'2026-11-23', checkOut:'2026-11-29', nights:6, status:'booked', evidence:'预订成功', room:'一卧室特大床套房 · 1 间', address:'', checkInTime:'', checkOutTime:'', breakfast:'订单截图未显示', notes:['入住与退房时间、早餐及取消政策，待补充订单详情。'] },
  { id:'hotel-guangzhou', name:'航空公司提供的广州中转住宿', city:'广州', checkIn:'2026-11-29', checkOut:'2026-11-30', nights:1, status:'pending', evidence:'尚未预订', room:'酒店及房型待落实', address:'', checkInTime:'', checkOutTime:'', breakfast:'待确认', notes:['需要提前预订，目前尚未办理；完成预约后补充酒店名称、接送方式和入住信息。'] }
];

function applyHotelBookingUpdates(data) {
  if (data.metadata.hotelBookingUpdate === HOTEL_BOOKING_UPDATE) return;
  data.hotelBookings = JSON.parse(JSON.stringify(HOTEL_BOOKINGS));
  for (const day of data.days) {
    const booking = HOTEL_BOOKINGS.find(item => day.date >= item.checkIn && day.date < item.checkOut);
    if (!booking) continue;
    const hotelText = `${booking.name}（${booking.status === 'booked' ? '已预订，依据订单截图' : '需预订，尚未办理'}）`;
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
  document.querySelector('#hotel-bookings-progress').textContent = `${booked} / ${total} 晚已提供订单`;
  root.innerHTML = bookings.map(booking => `<article class="hotel-booking-card ${booking.status === 'pending' ? 'hotel-booking-card--pending' : ''}">
    <div class="hotel-booking-top"><span class="hotel-booking-city">${escapeHtml(booking.city)}</span><span class="hotel-booking-status">${escapeHtml(booking.evidence)}</span></div>
    <h3>${escapeHtml(booking.name)}</h3>
    <p class="hotel-booking-dates">${escapeHtml(formatCompactDate(booking.checkIn))} 入住<br>${escapeHtml(formatCompactDate(booking.checkOut))} 退房 · ${booking.nights} 晚</p>
    <p>${escapeHtml(booking.room)}</p>
    ${booking.address ? `<p class="hotel-booking-muted">${escapeHtml(booking.address)}</p>` : ''}
    ${booking.checkInTime ? `<p>入住 ${escapeHtml(booking.checkInTime)} · 退房 ${escapeHtml(booking.checkOutTime)}</p>` : ''}
    <p>早餐：${escapeHtml(booking.breakfast)}</p>
    <ul>${booking.notes.map(note=>`<li>${escapeHtml(note)}</li>`).join('')}</ul>
  </article>`).join('');
}
