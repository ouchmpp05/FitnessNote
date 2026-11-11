import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, BarChart3, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Dumbbell, LayoutGrid, LockKeyhole, LogOut, Plus, RefreshCw, Sprout, TrendingUp } from 'lucide-react';
import { api, tokenStore } from './api';
import { dateFromKey, dateKey, fetchJournals, monthCells, number, shiftDate, todayKey, totals, weekdays, weekDates } from './lib';
import { ErrorMessage, Loading, Modal } from './ui';
import ExerciseEditor, { NewExercise } from './ExerciseEditor';
import { MetricChart, metricOptions, chartModes } from './MetricChart';
import AdminDashboard from './AdminDashboard';
import FeedbackPanel from './FeedbackPanel';

function Auth({ onLogin, expired }) {
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(expired ? '로그인이 만료되었어요. 다시 로그인해 주세요.' : '');
  const [notice, setNotice] = useState('');
  async function submit(e) {
    e.preventDefault(); setError(''); setNotice(''); setBusy(true);
    const data = new FormData(e.currentTarget);
    const username = data.get('login_id').trim();
    const password = data.get('password');
    try {
      if (mode === 'signup') {
        await api('/auth/register', { method: 'POST', body: { login_id: username, password } });
        setMode('login'); setNotice('가입이 완료되었어요. 같은 계정으로 로그인해 주세요.');
      } else {
        const { access_token } = await api('/auth/login', { method: 'POST', body: new URLSearchParams({ username, password }) });
        tokenStore.set(access_token);
        try { onLogin(await api('/auth/me')); } catch (err) { tokenStore.clear(); throw err; }
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-story"><a className="brand" href="/" aria-label="FitnessNote 홈"><span className="brand-mark"><Dumbbell size={23} strokeWidth={2.5} /></span>fitness<span className="brand-light">note</span><span className="brand-dot" /></a>
      <div className="story-main"><p className="eyebrow">A LITTLE STRONGER, EVERY DAY</p><h1>오늘의 기록이<br />내일의 나를<br /><span>만드니까.</span></h1><p>작은 세트 하나도 놓치지 않도록.<br />나만의 페이스로, 꾸준히 쌓아가는 운동 일지.</p></div>
      <div className="story-footer"><span className="tiny-spark">✳</span><span>YOUR EFFORT. YOUR PROGRESS.</span><span>01 — ∞</span></div>
    </section>
    <section className="auth-form-area"><div className="auth-form-wrap">
      <span className="round-symbol"><Sprout size={27} /></span><p className="eyebrow">WELCOME TO YOUR ROUTINE</p>
      <h2>{mode === 'login' ? '다시 만나 반가워요' : '첫 기록을 시작해 볼까요?'}</h2><p className="muted">{mode === 'login' ? '오늘도 어제보다 한 걸음 더.' : '나만의 운동 일지를 차곡차곡 쌓아 보세요.'}</p>
      <form className="stack auth-form" onSubmit={submit}>
        <label>아이디<input name="login_id" autoComplete="username" required minLength={mode === 'signup' ? 3 : 1} maxLength={50} pattern={mode === 'signup' ? '[A-Za-z0-9_]+' : undefined} placeholder="아이디를 입력해 주세요" /></label>
        <label>비밀번호<input type="password" name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : 1} maxLength={128} placeholder="비밀번호를 입력해 주세요" /></label>
        {mode === 'signup' && <p className="field-hint">아이디: 영문·숫자·밑줄 3~50자 / 비밀번호: 8~128자</p>}
        <ErrorMessage>{error}</ErrorMessage>{notice && <p className="success" role="status">{notice}</p>}
        <button className="primary" disabled={busy}>{busy ? '잠시만 기다려 주세요…' : mode === 'login' ? '로그인' : '회원가입'}<ArrowRight size={19} /></button>
      </form>
      <p className="auth-switch">{mode === 'login' ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'}<button className="text-button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setNotice(''); }}>{mode === 'login' ? '회원가입' : '로그인'}</button></p>
      <div className="auth-note"><LockKeyhole size={14} />나의 운동 기록을 안전하게 보관해요.</div>
    </div></section>
  </main>;
}

function DatePicker({ selected, onSelect, onClose }) {
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [recorded, setRecorded] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const cells = monthCells(month);
    setRecorded([]); setError('');
    api(`/workouts/calendar?start=${cells[0]}&end=${cells.at(-1)}`, { signal: controller.signal })
      .then((d) => setRecorded(d.dates)).catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [month]);
  function changeMonth(offset) { const d = dateFromKey(`${month}-01`); d.setMonth(d.getMonth() + offset); setMonth(dateKey(d).slice(0, 7)); }
  return <Modal title="어느 날의 기록을 볼까요?" subtitle="YOUR WORKOUT CALENDAR" onClose={onClose} className="calendar-modal">
    <div className="modal-body"><div className="month-header"><button className="icon-button" aria-label="이전 달" onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button><strong>{month.split('-')[0]}년 {Number(month.split('-')[1])}월</strong><button className="icon-button" aria-label="다음 달" onClick={() => changeMonth(1)}><ChevronRight size={20} /></button></div>
      <div className="month-grid">{weekdays.map((d) => <span className="month-weekday" key={d}>{d}</span>)}{monthCells(month).map((day) => <button key={day} className={`month-day ${day.startsWith(month) ? '' : 'outside'} ${recorded.includes(day) ? 'recorded' : ''} ${day === selected ? 'selected' : ''}`} aria-pressed={day === selected} aria-label={`${day}${recorded.includes(day) ? ' 운동 기록 있음' : ''}`} onClick={() => onSelect(day)}>{Number(day.slice(-2))}{day === todayKey() && <i />}</button>)}</div>
      <div className="calendar-legend"><span><i />운동 기록이 있는 날</span><button className="text-button" onClick={() => onSelect(todayKey())}>오늘로 이동</button></div><ErrorMessage>{error}</ErrorMessage>
    </div>
  </Modal>;
}

function Journal({ notify }) {
  const [day, setDay] = useState(todayKey);
  const [journal, setJournal] = useState(null);
  const [recorded, setRecorded] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekError, setWeekError] = useState('');
  const [revision, setRevision] = useState(0);
  const [calendar, setCalendar] = useState(false);
  const [editor, setEditor] = useState(null);
  const days = weekDates(day);
  const weekStart = days[0];
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setJournal(null);
    api(`/workouts/${day}`, { signal: controller.signal }).then(setJournal)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [day, revision]);
  useEffect(() => {
    const controller = new AbortController();
    setRecorded([]); setWeekError('');
    api(`/workouts/calendar?start=${weekStart}&end=${shiftDate(weekStart, 6)}`, { signal: controller.signal }).then((d) => setRecorded(d.dates))
      .catch((err) => { if (err.name !== 'AbortError') setWeekError('주간 기록 표시를 불러오지 못했어요.'); });
    return () => controller.abort();
  }, [weekStart, revision]);
  const items = journal?.exercises || [];
  const locked = Boolean(journal?.feedback);
  const isToday = day === todayKey();
  function saved(message) { setEditor(null); setRevision((r) => r + 1); notify(message); }
  return <>
    <div className="page-title"><div><p className="eyebrow">MY DAILY WORKOUT</p><h1>{isToday ? '오늘의 운동' : '나의 운동 일지'}<span className="title-dot">.</span></h1><p className="muted">{isToday ? '오늘의 노력을, 내일의 변화로.' : '차곡차곡 쌓인 나의 기록을 확인해요.'}</p></div><button className="calendar-button" aria-label="달력 열기" onClick={() => setCalendar(true)}><CalendarDays size={21} /><span>날짜 선택</span></button></div>
    <section className="week-section" aria-label="주간 운동 기록">
      <div className="week-top"><span>{dateFromKey(day).getFullYear()}년 {dateFromKey(day).getMonth() + 1}월 <ChevronDown size={14} /></span><div><button className="today-button" onClick={() => setDay(todayKey())}>오늘</button><button className="icon-button small" aria-label="이전 주" onClick={() => setDay(shiftDate(day, -7))}><ChevronLeft size={18} /></button><button className="icon-button small" aria-label="다음 주" onClick={() => setDay(shiftDate(day, 7))}><ChevronRight size={18} /></button></div></div>
      <div className="week-grid">{days.map((d, i) => <button key={d} className={`week-day ${d === day ? 'selected' : ''} ${recorded.includes(d) ? 'recorded' : ''}`} aria-label={`${d}${recorded.includes(d) ? ' 운동 기록 있음' : ''}`} aria-pressed={d === day} onClick={() => setDay(d)}><span>{weekdays[i]}</span><strong>{Number(d.slice(-2))}</strong><i className={d === todayKey() ? 'today-dot' : ''} /></button>)}</div>
      {weekError && <div className="inline-retry"><span>{weekError}</span><button className="text-button" onClick={() => setRevision((r) => r + 1)}>다시 시도</button></div>}
    </section>
    <div className="day-heading"><h2>{Number(day.slice(5, 7))}월 {Number(day.slice(-2))}일 <small>{['일', ...weekdays.slice(0, 6)][dateFromKey(day).getDay()]}요일</small>{isToday && <span className="pill">TODAY</span>}</h2><span className="small-muted">{items.length}개의 운동</span></div>
    {loading ? <Loading /> : error ? <div className="load-error"><ErrorMessage>{error}</ErrorMessage><button className="secondary" onClick={() => setRevision((r) => r + 1)}><RefreshCw size={16} />다시 불러오기</button></div> : <>

      {items.length === 0 ? <div className="empty-journal"><div className="empty-art" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><Dumbbell size={40} strokeWidth={1.5} /><span className="spark spark-one">✳</span><span className="spark spark-two">+</span></div><h3>아직 운동 기록이 없습니다</h3><p>작은 시작도 멋진 기록이 돼요.<br />첫 번째 운동을 추가해 볼까요?</p></div> : <div className="workout-list">{items.map((item, index) => {
        return <article className="workout-card" key={item.exercise_id}><div className="workout-card-head"><span className="exercise-icon"><Dumbbell size={22} /></span><div className="workout-name"><span className="eyebrow">WORKOUT {String(index + 1).padStart(2, '0')}</span><h3>{item.name}</h3></div><span className="completed-mark"><Check size={15} />기록 완료</span></div>
          <div className="saved-sets"><div className="saved-set labels"><span>세트</span><span>중량</span><span>횟수</span></div>{item.sets.map((s, i) => <div className="saved-set" key={s.workout_set_id || i}><span>{i + 1}</span><span>{number(s.weight_kg)}<small>kg</small></span><span>{s.reps}<small>회</small></span></div>)}</div>
          {!locked && <button className="edit-record-button" onClick={() => setEditor({ initial: item })}>기록 수정<ArrowUpRight size={19} /></button>}</article>;
      })}</div>}
      {!locked && <button className="add-workout" onClick={() => setEditor({})}><span className="plus-box"><Plus size={22} /></span><span>운동 추가</span><ArrowRight size={18} /></button>}
      {items.length > 0 && <FeedbackPanel day={day} journal={journal} onChanged={(message) => { setRevision((r) => r + 1); if (message) notify(message); }} />}
      <p className="journal-footnote"><Sprout size={15} />완벽한 하루보다, 꾸준한 한 세트.</p>
    </>}
    {calendar && <DatePicker selected={day} onClose={() => setCalendar(false)} onSelect={(d) => { setDay(d); setCalendar(false); }} />}
    {editor && <ExerciseEditor day={day} existingExercises={items} initial={editor.initial} onClose={() => setEditor(null)} onSaved={saved} />}
  </>;
}

function Library({ user, notify }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api('/exercises?active_only=false', { signal: controller.signal }).then(setExercises)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'ALL' || e.visibility === filter));
  return <><div className="page-title"><div><p className="eyebrow">YOUR EXERCISE LIBRARY</p><h1>{user.role === 'ADMIN' ? '공용 운동 관리' : '운동 보관함'}<span className="title-dot">.</span></h1><p className="muted">{user.role === 'ADMIN' ? '함께 사용하는 운동 목록을 채워 주세요.' : '익숙한 운동부터 나만의 운동까지.'}</p></div><span className="page-symbol"><Dumbbell size={24} /></span></div>
    <div className="library-toolbar"><div className="search-box"><SearchIcon /><input aria-label="보관함 운동 검색" placeholder="운동 이름으로 검색" value={query} onChange={(e) => setQuery(e.target.value)} /></div><button className="primary" onClick={() => setCreating(true)}><Plus size={18} />{user.role === 'ADMIN' ? '공용 운동 만들기' : '나만의 운동 만들기'}</button></div>
    {user.role !== 'ADMIN' && <div className="filters">{[['ALL', '전체'], ['PUBLIC', '공용 운동'], ['PRIVATE', '나의 운동']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>}
    <div className="section-label"><span>운동 목록</span><span>{filtered.length}개</span></div><ErrorMessage>{error}</ErrorMessage>{error && <button className="text-button" onClick={() => setRevision((r) => r + 1)}>다시 불러오기</button>}
    {loading ? <Loading /> : <div className="library-list">{filtered.map((e) => <article className="library-card" key={e.exercise_id}><span className="exercise-icon"><Dumbbell size={21} /></span><div><h3>{e.name}</h3><p>{e.description || '등록된 설명이 없어요.'}</p><span className="scope">{e.visibility === 'PUBLIC' ? '공용 운동' : '나의 운동'}</span>{!e.is_active && <span className="inactive">사용 중지</span>}</div></article>)}{!filtered.length && <div className="empty-small">표시할 운동이 없어요. 새로운 운동을 만들어 보세요.</div>}</div>}
    {creating && <NewExercise admin={user.role === 'ADMIN'} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setRevision((r) => r + 1); notify('새로운 운동을 만들었어요.'); }} />}
  </>;
}
function SearchIcon() { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>; }

function Statistics() {
  const [period, setPeriod] = useState(30);
  const [journals, setJournals] = useState([]);
  const [selected, setSelected] = useState('');
  const [chartMode, setChartMode] = useState('max');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setJournals([]);
    fetchJournals(api, shiftDate(todayKey(), -(period - 1)), todayKey(), controller.signal).then(setJournals)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, revision]);
  const exerciseMap = new Map(journals.flatMap((j) => j.exercises).map((e) => [String(e.exercise_id), e]));
  const exerciseId = exerciseMap.has(selected) ? selected : exerciseMap.keys().next().value || '';
  const points = journals.flatMap((j) => {
    const exercise = j.exercises.find((e) => String(e.exercise_id) === exerciseId);
    return exercise ? [{ day: j.workout_date, ...totals(exercise.sets) }] : [];
  });
  return <><div className="page-title"><div><p className="eyebrow">EVERY REP COUNTS</p><h1>나의 변화<span className="title-dot">.</span></h1><p className="muted">숫자로 돌아보는, 꾸준함의 힘.</p></div><span className="page-symbol"><TrendingUp size={25} /></span></div>
    <div className="period-control" aria-label="통계 기간">{[30, 90, 365].map((n) => <button key={n} aria-pressed={period === n} className={period === n ? 'active' : ''} onClick={() => setPeriod(n)}>최근 {n === 365 ? '1년' : `${n}일`}</button>)}</div>
    <ErrorMessage>{error}</ErrorMessage>{error && <button className="text-button" onClick={() => setRevision((r) => r + 1)}>다시 불러오기</button>}
    {loading ? <Loading text="나의 변화를 살펴보고 있어요" /> : !exerciseMap.size ? <div className="stats-empty"><BarChart3 size={38} /><h3>{error ? '통계를 불러오지 못했어요' : '변화는 기록에서 시작돼요'}</h3><p>선택한 기간의 운동 기록이 쌓이면<br />여기에서 나의 성장을 확인할 수 있어요.</p></div> : <>
      <label className="select-label">비교할 운동<select value={exerciseId} onChange={(e) => setSelected(e.target.value)}>{[...exerciseMap.values()].map((e) => <option key={e.exercise_id} value={e.exercise_id}>{e.name} · {e.visibility === 'PUBLIC' ? '공용' : '개인'} #{e.exercise_id}</option>)}</select></label>
      <fieldset className="metric-picker"><legend>표시할 그래프를 하나 선택해 주세요</legend>{chartModes.map((m) => <label key={m.key}><input type="radio" name="chart-mode" value={m.key} checked={chartMode === m.key} onChange={() => setChartMode(m.key)} /><span>{m.label}</span></label>)}</fieldset>
      <div className="charts"><MetricChart mode={chartMode} points={points} /></div>
      <p className="field-hint">기록한 날짜만 표시해요. 맨몸 운동은 총 반복 수로 비교해 보세요.</p>
      <details className="record-details"><summary>날짜별 수치 보기<ChevronDown size={15} /></summary><div className="table-scroll"><table><thead><tr><th>운동 날짜</th>{metricOptions.filter((m) => chartMode === 'both' || m.key === chartMode).map((m) => <th key={m.key}>{m.label}<small> ({m.unit})</small></th>)}</tr></thead><tbody>{points.map((p) => <tr key={p.day}><td>{p.day}</td>{metricOptions.filter((m) => chartMode === 'both' || m.key === chartMode).map((m) => <td key={m.key}>{number(p[m.key])}</td>)}</tr>)}</tbody></table></div></details>
    </>}
  </>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(tokenStore.get()));
  const [sessionError, setSessionError] = useState('');
  const [sessionRevision, setSessionRevision] = useState(0);
  const [expired, setExpired] = useState(false);
  const [tab, setTab] = useState('journal');
  const [toast, setToast] = useState('');
  useEffect(() => {
    function expire() { setUser(null); setExpired(true); setChecking(false); }
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  useEffect(() => {
    if (!tokenStore.get()) { setChecking(false); return; }
    const controller = new AbortController(); setChecking(true); setSessionError('');
    api('/auth/me', { signal: controller.signal }).then(setUser)
      .catch((err) => { if (err.name !== 'AbortError' && err.status !== 401) setSessionError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [sessionRevision]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  function logout() { tokenStore.clear(); setUser(null); setTab('journal'); setSessionError(''); setExpired(false); }
  if (checking) return <div className="boot"><Loading text="나의 운동 일지를 준비하고 있어요" /></div>;
  if (sessionError) return <div className="boot stack"><ErrorMessage>{sessionError}</ErrorMessage><button className="primary" onClick={() => setSessionRevision((r) => r + 1)}>다시 연결하기</button><button className="text-button" onClick={logout}>로그인 화면으로</button></div>;
  if (!user) return <Auth onLogin={(u) => { setUser(u); setExpired(false); setTab('journal'); }} expired={expired} />;
  const admin = user.role === 'ADMIN';
  if (admin) return <AdminDashboard user={user} onLogout={logout} notify={setToast} toast={toast} library={<Library user={user} notify={setToast} />} />;
  const tabs = admin ? [{ id: 'library', label: '공용 운동', icon: Dumbbell }] : [{ id: 'journal', label: '운동 일지', icon: BookOpen }, { id: 'stats', label: '나의 변화', icon: BarChart3 }, { id: 'library', label: '운동 보관함', icon: LayoutGrid }];
  const activeTab = admin ? 'library' : tab;
  return <div className="app-shell"><aside className="desktop-rail"><div className="rail-brand"><Dumbbell size={26} /></div><span className="rail-line" />{tabs.map(({ id, label, icon: Icon }) => <button key={id} title={label} aria-label={label} className={activeTab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={23} /></button>)}<span className="rail-bottom">FN.</span></aside>
    <div className="app-main"><header className="app-header"><a className="brand" href="/" aria-label="FitnessNote 홈"><span className="brand-mark"><Dumbbell size={20} strokeWidth={2.5} /></span>fitness<span className="brand-light">note</span><span className="brand-dot" /></a><div className="account"><span className="avatar">{user.login_id.slice(0, 1).toUpperCase()}</span><span className="account-name">{user.login_id}<small>{admin ? '관리자' : '오늘도, 나답게'}</small></span><button className="icon-button" title="로그아웃" aria-label="로그아웃" onClick={logout}><LogOut size={18} /></button></div></header>
      <main className="page-content" key={activeTab}>{activeTab === 'journal' ? <Journal notify={setToast} /> : activeTab === 'stats' ? <Statistics /> : <Library user={user} notify={setToast} />}</main>
      <nav className="bottom-nav" aria-label="주 메뉴">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={activeTab === id ? 'active' : ''} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setTab(id)}><span><Icon size={21} /></span><strong>{label}</strong></button>)}</nav>
    </div>{toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
  </div>;
}
