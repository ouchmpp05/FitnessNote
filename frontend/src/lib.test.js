import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthCells, shiftDate, weekDates, totals, fetchJournals, chartCeiling } from './lib.js';

test('일요일과 연도 경계에서도 월요일부터 일요일까지 표시', () => {
  assert.deepEqual(weekDates('2027-01-03'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.equal(shiftDate('2028-03-01', -1), '2028-02-29');
  assert.equal(monthCells('2026-11').length, 42);
  assert.equal(monthCells('2026-11')[0], '2026-10-26');
});
test('중량 문자열과 맨몸 운동을 포함해 지표 계산', () => {
  assert.deepEqual(totals([{ weight_kg: '50.00', reps: 10 }, { weight_kg: '45.00', reps: 12 }, { weight_kg: '0', reps: 20 }]), { sets: 3, max: 50, reps: 42 });
});
test('기록일만 조회하고, 일지 요청의 동시 실행은 4개 이하', async () => {
  let active = 0, peak = 0;
  const dates = Array.from({ length: 9 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
  const fakeApi = async (path) => {
    if (path.includes('calendar')) return { dates };
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return { workout_date: path.split('/').at(-1), exercises: [] };
  };
  const result = await fetchJournals(fakeApi, '2026-11-01', '2026-11-30');
  assert.equal(result.length, 9);
  assert.equal(peak, 4);
  assert.deepEqual(result.map((r) => r.workout_date), dates);
});

test('함께 보는 그래프는 중량과 반복 수 축을 각각 계산하고 0도 표시', () => {
  assert.equal(chartCeiling([0, 0]), 2);
  assert.equal(chartCeiling([50, 60]), 70);
  assert.equal(chartCeiling([10, 20]), 24);
  assert.deepEqual(totals([]), { sets: 0, max: 0, reps: 0 });
});
