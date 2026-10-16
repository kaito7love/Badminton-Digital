// "Lịch đặt của tôi": tách lịch sắp tới khỏi lịch sử (báo cáo 40, F10). Hàm thuần, không đụng DOM.

const ACTIVE = ['pending', 'confirmed'];

const endOf = (b) => new Date(`${String(b.bookingDate).slice(0, 10)}T${String(b.endTime || '23:59').slice(0, 8)}`);
const startKey = (b) => `${String(b.bookingDate).slice(0, 10)}T${String(b.startTime || '00:00').slice(0, 8)}`;

/** Lịch còn hiệu lực và chưa qua giờ kết thúc → còn có thể huỷ/đến chơi. */
export const isUpcoming = (b, now = new Date()) =>
  ACTIVE.includes(String(b.status || '').toLowerCase()) && endOf(b) > now;

/**
 * @returns {{ upcoming: object[], history: object[] }}
 *  upcoming: sắp tới, gần nhất trước · history: đã chơi/đã huỷ/đã qua, mới nhất trước.
 */
export function groupMyBookings(bookings, now = new Date()) {
  const list = Array.isArray(bookings) ? bookings : [];
  const upcoming = [];
  const history = [];
  list.forEach((b) => (isUpcoming(b, now) ? upcoming : history).push(b));
  upcoming.sort((a, b) => startKey(a).localeCompare(startKey(b)));
  history.sort((a, b) => startKey(b).localeCompare(startKey(a)));
  return { upcoming, history };
}
