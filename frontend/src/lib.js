export const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
export function todayKey() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function dateFromKey(key) { return new Date(`${key}T12:00:00`); }
export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function shiftDate(key, days) { const d = dateFromKey(key); d.setDate(d.getDate() + days); return dateKey(d); }
export function weekDates(key) {
  const d = dateFromKey(key);
  const monday = shiftDate(key, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}
export function monthCells(month) {
  const first = `${month}-01`;
  const start = shiftDate(first, -((dateFromKey(first).getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => shiftDate(start, i));
}
export function totals(sets) {
  return sets.reduce((acc, s) => ({ sets: acc.sets + 1,
    max: Math.max(acc.max, Number(s.weight_kg)), reps: acc.reps + Number(s.reps) }), { sets: 0, max: 0, reps: 0 });
}
export const number = (n) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(n);

// 캘린더 API가 반환한 실제 기록일만 조회합니다. 한 번에 최대 4개 요청으로 제한합니다.
export async function fetchJournals(api, start, end, signal) {
  const { dates } = await api(`/workouts/calendar?start=${start}&end=${end}`, { signal });
  const journals = [];
  for (let i = 0; i < dates.length; i += 4) {
    const batch = await Promise.all(dates.slice(i, i + 4).map((day) => api(`/workouts/${day}`, { signal })));
    journals.push(...batch);
  }
  return journals;
}

// 중량과 반복 수는 서로 다른 축으로 계산합니다. 0kg 기록도 유효합니다.
export function chartCeiling(values) {
  return Math.max(2, Math.ceil(Math.max(...values, 1) * 1.15 / 2) * 2);
}
