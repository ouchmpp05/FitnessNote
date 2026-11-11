import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Dumbbell, Plus, Search, Trash2 } from 'lucide-react';
import { api } from './api';
import { fetchJournals, number, shiftDate } from './lib';
import { ErrorMessage, Loading, Modal } from './ui';

export function NewExercise({ admin = false, onClose, onCreated }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      const description = data.get('description').trim() || null;
      const exercise = await api('/exercises', { method: 'POST', body: { name: data.get('name').trim(), description } });
      onCreated({ ...exercise, description });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title={admin ? '공용 운동 만들기' : '나만의 운동 만들기'} subtitle="EXERCISE LIBRARY" onClose={onClose} busy={busy}>
    <form onSubmit={submit} className="modal-body stack">
      <p className="muted">{admin ? '모든 사용자가 선택할 수 있는 운동을 등록해요.' : '목록에 없는 운동을 추가해 보세요. 나만 기록에 사용할 수 있어요.'}</p>
      <label>운동 이름<input autoFocus name="name" maxLength={100} required placeholder="예: 인클라인 덤벨 프레스" /></label>
      <label>설명 <span className="optional">선택</span><textarea name="description" rows={4} maxLength={10000} placeholder="운동 방법이나 중량 입력 기준을 적어 주세요." /></label>
      <ErrorMessage>{error}</ErrorMessage>
      <button className="primary" disabled={busy}>{busy ? '만드는 중…' : '운동 만들기'}<Plus size={18} /></button>
    </form>
  </Modal>;
}

export default function ExerciseEditor({ day, existingExercises, initial, onClose, onSaved }) {
  const [chosen, setChosen] = useState(initial || null);
  const [exercises, setExercises] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revision, setRevision] = useState(0);
  const [sets, setSets] = useState(initial?.sets?.map((s) => ({ weight_kg: String(s.weight_kg), reps: String(s.reps) })) || [{ weight_kg: '', reps: '' }]);
  const [dirty, setDirty] = useState(false);
  const [previous, setPrevious] = useState(null);
  const [recentError, setRecentError] = useState('');
  const [recentLoading, setRecentLoading] = useState(false);
  const savedItem = chosen && existingExercises.find((x) => x.exercise_id === chosen.exercise_id);

  useEffect(() => {
    if (chosen) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    api('/exercises', { signal: controller.signal }).then(setExercises)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [chosen, revision]);

  useEffect(() => {
    if (!chosen) return;
    const controller = new AbortController();
    setPrevious(null); setRecentError(''); setRecentLoading(true);
    fetchJournals(api, shiftDate(day, -365), shiftDate(day, -1), controller.signal)
      .then((journals) => {
        const found = [...journals].reverse().find((j) => j.exercises.some((x) => x.exercise_id === chosen.exercise_id));
        if (found) setPrevious({ day: found.workout_date, ...found.exercises.find((x) => x.exercise_id === chosen.exercise_id) });
      }).catch((err) => { if (err.name !== 'AbortError') setRecentError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setRecentLoading(false); });
    return () => controller.abort();
  }, [chosen, day]);

  function choose(exercise) {
    const existing = existingExercises.find((x) => x.exercise_id === exercise.exercise_id);
    setChosen(exercise); setError(''); setDirty(false);
    setSets(existing?.sets?.map((s) => ({ weight_kg: String(s.weight_kg), reps: String(s.reps) })) || [{ weight_kg: '', reps: '' }]);
  }
  function close() { if (!dirty || window.confirm('저장하지 않은 입력을 닫을까요?')) onClose(); }
  function updateSet(index, field, value) { setDirty(true); setSets(sets.map((s, i) => i === index ? { ...s, [field]: value } : s)); }
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api(`/workouts/${day}/exercises/${chosen.exercise_id}`, { method: 'PUT', body: { sets: sets.map((s) => ({ weight_kg: s.weight_kg, reps: Number(s.reps) })) } });
      onSaved('운동 기록을 저장했어요.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`이 날짜의 ${chosen.name} 기록과 세트를 삭제할까요?`)) return;
    setBusy(true); setError('');
    try { await api(`/workouts/${day}/exercises/${chosen.exercise_id}`, { method: 'DELETE' }); onSaved('운동 기록을 삭제했어요.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (creating) return <NewExercise onClose={() => setCreating(false)} onCreated={(exercise) => { setCreating(false); choose(exercise); }} />;
  return <Modal title={chosen ? chosen.name : '어떤 운동을 했나요?'} subtitle={chosen ? `${day.replaceAll('-', '.')} · 운동 기록` : 'ADD YOUR WORKOUT'} onClose={close} busy={busy}>
    {!chosen ? <div className="modal-body">
      <div className="search-box"><Search size={19} /><input autoFocus aria-label="운동 검색" placeholder="운동 이름으로 검색" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div className="section-label"><span>운동 목록</span><span>공용 + 나의 운동</span></div>
      <ErrorMessage>{error}</ErrorMessage>
      {error && <button className="text-button" onClick={() => setRevision((n) => n + 1)}>다시 불러오기</button>}
      {loading ? <Loading text="운동을 불러오고 있어요" /> : <div className="exercise-list">{exercises.filter((x) => x.name.toLowerCase().includes(query.toLowerCase())).map((exercise) =>
        <button className="exercise-option" key={exercise.exercise_id} onClick={() => choose(exercise)}>
          <span className="exercise-icon"><Dumbbell size={21} /></span><span className="option-text"><strong>{exercise.name}</strong><small>{exercise.description || '중량과 반복 횟수를 기록하세요'}</small></span>
          <span className="scope">{exercise.visibility === 'PUBLIC' ? '공용' : '개인'}</span>
        </button>)}
        {!exercises.some((x) => x.name.toLowerCase().includes(query.toLowerCase())) && <p className="empty-small">찾는 운동이 없나요? 직접 만들어 보세요.</p>}
      </div>}
      <button className="secondary wide" onClick={() => setCreating(true)}><Plus size={18} />나만의 운동 만들기</button>
    </div> : <form onSubmit={save}>
      <div className="modal-body stack">
        {!initial && <button className="back-link" type="button" onClick={() => { if (!dirty || window.confirm('입력 내용을 지우고 운동을 다시 선택할까요?')) { setChosen(null); setDirty(false); } }}><ArrowLeft size={15} />다른 운동 선택</button>}
        <p className="exercise-description">{chosen.description || '중량은 kg으로 입력해 주세요. 맨몸 운동은 추가 중량이 없으면 0kg이에요.'}</p>
        <div className="previous">
          <div className="section-label"><strong>이전 기록</strong><small>최근 1년 기준</small></div>
          {recentLoading ? <p className="muted">이전 기록을 확인하고 있어요…</p> : recentError ? <p className="muted">이전 기록을 불러오지 못했어요. 현재 기록은 입력할 수 있어요.</p> : previous ? <><p className="muted">{previous.day.replaceAll('-', '.')}</p>
            <div className="previous-sets">{previous.sets.map((s, i) => <span key={i}>{i + 1}세트 <b>{number(s.weight_kg)}kg × {s.reps}회</b></span>)}</div></> : <p className="muted">최근 1년간 이전 기록이 없어요. 첫 기록을 남겨 보세요.</p>}
        </div>
        <div className="set-table">
          <div className="set-row set-labels"><span>세트</span><span>중량 <small>kg</small></span><span>횟수 <small>회</small></span><span /></div>
          {sets.map((s, i) => <div className="set-row" key={i}>
            <span className="set-index">{String(i + 1).padStart(2, '0')}</span>
            <input type="number" inputMode="decimal" min="0" max="9999.99" step="0.01" required aria-label={`${i + 1}세트 중량`} placeholder="0" value={s.weight_kg} onChange={(e) => updateSet(i, 'weight_kg', e.target.value)} />
            <input type="number" inputMode="numeric" min="1" max="2147483647" step="1" required aria-label={`${i + 1}세트 횟수`} placeholder="0" value={s.reps} onChange={(e) => updateSet(i, 'reps', e.target.value)} />
            <button type="button" className="icon-button" aria-label={`${i + 1}세트 삭제`} disabled={sets.length === 1} onClick={() => { setSets(sets.filter((_, n) => n !== i)); setDirty(true); }}><Trash2 size={17} /></button>
          </div>)}
        </div>
        <button type="button" className="secondary wide" disabled={sets.length >= 100} onClick={() => { setSets([...sets, { ...sets.at(-1) }]); setDirty(true); }}><Plus size={18} />세트 추가</button>
        <ErrorMessage>{error}</ErrorMessage>
        {savedItem && <button type="button" className="danger-link" disabled={busy} onClick={remove}><Trash2 size={15} />이 운동 기록 삭제</button>}
      </div>
      <div className="modal-footer"><button className="primary wide" disabled={busy}>{busy ? '저장하는 중…' : '운동 기록 저장'}<Check size={19} /></button></div>
    </form>}
  </Modal>;
}
