import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Dumbbell, LogOut, MessageSquare, Search, Send, Users } from 'lucide-react';
import { api } from './api';
import { number, shiftDate, todayKey } from './lib';
import { ErrorMessage, Loading } from './ui';
import { MetricChart, chartModes } from './MetricChart';

const statusLabel = (status) => status === 'COMPLETED' ? '답변 완료' : status === 'PENDING' ? '답변 대기' : '요청 없음';
const timeLabel = (value) => value?.replace('T', ' ').slice(0, 16);

function Pager({ offset, total, onChange }) {
  return <div className="admin-pager"><span>총 {total}개 · {total ? offset + 1 : 0}–{Math.min(offset + 25, total)}</span><button className="icon-button" disabled={offset === 0} aria-label="이전 목록" onClick={() => onChange(Math.max(0, offset - 25))}><ChevronLeft size={18} /></button><button className="icon-button" disabled={offset + 25 >= total} aria-label="다음 목록" onClick={() => onChange(offset + 25)}><ChevronRight size={18} /></button></div>;
}

export function UserReview({ userId, initialDay }) {
  const [page, setPage] = useState({ items: [], total: 0 });
  const [offset, setOffset] = useState(0);
  const [day, setDay] = useState(initialDay || '');
  const [journal, setJournal] = useState(null);
  const [error, setError] = useState('');
  const [journalError, setJournalError] = useState('');
  const [loading, setLoading] = useState(true);
  const [journalLoading, setJournalLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [period, setPeriod] = useState(90);
  const [stats, setStats] = useState([]);
  const [statsError, setStatsError] = useState('');
  const [statsLoading, setStatsLoading] = useState(false);
  const [exerciseId, setExerciseId] = useState('');
  const [mode, setMode] = useState('both');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api(`/admin/users/${userId}/workouts?offset=${offset}`, { signal: controller.signal }).then((data) => { setPage(data); setDay((old) => old || data.items[0]?.workout_date || ''); })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, offset, revision]);
  useEffect(() => {
    if (!day) return;
    const controller = new AbortController(); setJournalLoading(true); setJournalError(''); setJournal(null);
    api(`/admin/users/${userId}/workouts/${day}`, { signal: controller.signal }).then(setJournal)
      .catch((err) => { if (err.name !== 'AbortError') setJournalError(err.message); }).finally(() => { if (!controller.signal.aborted) setJournalLoading(false); });
    return () => controller.abort();
  }, [userId, day, revision]);
  const end = day || todayKey();
  useEffect(() => {
    const controller = new AbortController(); setStatsLoading(true); setStatsError(''); setStats([]);
    api(`/admin/users/${userId}/statistics?start=${shiftDate(end, -(period - 1))}&end=${end}`, { signal: controller.signal }).then(setStats)
      .catch((err) => { if (err.name !== 'AbortError') setStatsError(err.message); }).finally(() => { if (!controller.signal.aborted) setStatsLoading(false); });
    return () => controller.abort();
  }, [userId, end, period, revision]);
  const exerciseMap = new Map(stats.map((row) => [String(row.exercise_id), row]));
  const chosen = exerciseMap.has(exerciseId) ? exerciseId : exerciseMap.keys().next().value || '';
  const points = stats.filter((p) => String(p.exercise_id) === chosen);
  return <div className="user-review"><div className="admin-section-title"><h3>전체 운동 기록</h3><span>조회 전용</span><button className="text-button" onClick={() => setRevision((n) => n + 1)}>새로고침</button></div><ErrorMessage>{error}</ErrorMessage>
    <div className="review-layout"><aside className="record-date-list">{loading ? <Loading text="날짜 조회 중" /> : page.items.length ? <>{page.items.map((item) => <button key={item.workout_id} className={day === item.workout_date ? 'active' : ''} onClick={() => setDay(item.workout_date)}><strong>{item.workout_date}</strong><span>{item.exercise_count}개 운동 · {statusLabel(item.feedback_status)}</span></button>)}<Pager offset={offset} total={page.total} onChange={setOffset} /></> : <p className="empty-small">저장한 일지가 없어요.</p>}</aside>
      <section className="review-journal" aria-label="사용자 운동 일지"><h4>{day || '일지 선택'}</h4><ErrorMessage>{journalError}</ErrorMessage>{journalLoading ? <Loading /> : journal?.exercises?.map((exercise) => <article className="review-exercise" key={exercise.exercise_id}><div><h4>{exercise.name}</h4><span className="scope">{exercise.visibility === 'PUBLIC' ? '공용' : '개인'}</span></div><p>{exercise.description || '설명 없음'}</p><table><thead><tr><th>세트</th><th>중량 (kg)</th><th>반복 (회)</th></tr></thead><tbody>{exercise.sets.map((set, i) => <tr key={set.workout_set_id}><td>{i + 1}</td><td>{number(set.weight_kg)}</td><td>{set.reps}</td></tr>)}</tbody></table></article>)}{!journalLoading && journal && !journal.exercises.length && <p className="empty-small">이 날짜에는 기록이 없어요.</p>}</section>
    </div>
    <div className="admin-section-title"><h3>종목별 변화</h3><span>{end}까지</span></div><div className="period-control">{[30, 90, 365].map((n) => <button key={n} className={period === n ? 'active' : ''} aria-pressed={period === n} onClick={() => setPeriod(n)}>최근 {n === 365 ? '1년' : `${n}일`}</button>)}</div><ErrorMessage>{statsError}</ErrorMessage>
    {statsLoading ? <Loading text="통계 조회 중" /> : points.length ? <><label className="select-label">비교할 운동<select value={chosen} onChange={(e) => setExerciseId(e.target.value)}>{[...exerciseMap.values()].map((exercise) => <option key={exercise.exercise_id} value={exercise.exercise_id}>{exercise.name} · {exercise.visibility === 'PUBLIC' ? '공용' : '개인'} #{exercise.exercise_id}</option>)}</select></label><fieldset className="metric-picker"><legend>그래프 선택</legend>{chartModes.map((item) => <label key={item.key}><input type="radio" name={`admin-mode-${userId}`} checked={mode === item.key} onChange={() => setMode(item.key)} /><span>{item.label}</span></label>)}</fieldset><MetricChart mode={mode} points={points} />
      <details className="record-details"><summary>날짜별 수치 보기</summary><table><thead><tr><th>날짜</th><th>최고 중량 (kg)</th><th>총 반복 수 (회)</th></tr></thead><tbody>{points.map((p) => <tr key={p.day}><td>{p.day}</td><td>{number(p.max)}</td><td>{number(p.reps)}</td></tr>)}</tbody></table></details></> : <p className="empty-small">선택한 기간에 비교할 기록이 없어요.</p>}
  </div>;
}

function FeedbackReview({ requestId, user, onBack, onSaved }) {
  const [request, setRequest] = useState(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api(`/admin/feedback/${requestId}`, { signal: controller.signal }).then((data) => { setRequest(data); setContent(data.feedback_content || ''); })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestId]);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api(`/admin/feedback/${requestId}/answer`, { method: 'PUT', body: { feedback_content: content.trim() } }); setDirty(false); onSaved(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <><button className="back-link" disabled={busy} onClick={() => { if (!dirty || window.confirm('저장하지 않은 답변을 닫을까요?')) onBack(); }}><ArrowLeft size={16} />요청 목록으로</button><ErrorMessage>{error}</ErrorMessage>{loading ? <Loading /> : request && <>
    <div className="review-heading"><div><p className="eyebrow">FEEDBACK REQUEST</p><h2>{request.login_id}님의 운동 일지</h2><p>{request.workout_date} · 신청 {timeLabel(request.requested_at)}</p></div><span className={`status-badge ${request.status === 'COMPLETED' ? 'done' : ''}`}>{statusLabel(request.status)}</span></div>
    <div className="request-question"><strong>사용자가 남긴 질문</strong><p>{request.request_message || '별도로 남긴 질문이 없습니다.'}</p></div>
    <UserReview key={request.user_id} userId={request.user_id} initialDay={request.workout_date} />
    <form className="admin-answer-form stack" onSubmit={submit}><div><h3>{request.status === 'COMPLETED' ? '관리자 답변' : '피드백 작성'}</h3><p className="muted">기록의 중량과 반복 수 변화를 참고해 작성해 주세요.</p></div>
      {request.status === 'COMPLETED' && request.reviewer_user_id !== user.user_id ? <><p className="readonly-answer">{request.feedback_content}</p><p className="field-hint">최초 답변을 작성한 관리자만 수정할 수 있습니다.</p></>
        : <><label>피드백 내용<textarea value={content} onChange={(e) => { setContent(e.target.value); setDirty(true); }} disabled={busy} required maxLength={10000} rows={6} placeholder="이전 기록과 비교한 내용을 작성하세요." /></label><p className="field-hint">답변을 등록하면 이 일지는 수정·삭제가 제한됩니다. 답변은 작성한 관리자만 수정할 수 있습니다.</p><ErrorMessage>{error}</ErrorMessage><button className="primary" disabled={busy || !content.trim()}>{busy ? '저장 중…' : request.status === 'COMPLETED' ? '답변 수정 저장' : '피드백 답변 등록'}<Send size={18} /></button></>}
    </form>
  </>}</>;
}

function FeedbackQueue({ user, notify }) {
  const [status, setStatus] = useState('PENDING');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState({ items: [], total: 0 });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (selected) return;
    const controller = new AbortController(); setLoading(true); setError('');
    api(`/admin/feedback?status=${status}&offset=${offset}`, { signal: controller.signal }).then(setPage)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, offset, revision, selected]);
  if (selected) return <FeedbackReview requestId={selected} user={user} onBack={() => setSelected(null)} onSaved={() => { setSelected(null); setRevision((n) => n + 1); notify('피드백을 저장했습니다.'); }} />;
  return <><div className="page-title"><div><p className="eyebrow">REVIEW & SUPPORT</p><h1>피드백 관리<span className="title-dot">.</span></h1><p className="muted">기록을 살펴보고, 다음 걸음을 함께해 주세요.</p></div><button className="secondary" onClick={() => setRevision((n) => n + 1)}>새로고침</button></div><div className="filters">{[['PENDING', '답변 대기'], ['COMPLETED', '답변 완료']].map(([value, label]) => <button key={value} className={status === value ? 'active' : ''} onClick={() => { setStatus(value); setOffset(0); }}>{label}</button>)}</div><ErrorMessage>{error}</ErrorMessage>
    {loading ? <Loading /> : <><div className="admin-request-list">{page.items.map((item) => <button className="admin-request-row" key={item.feedback_request_id} onClick={() => setSelected(item.feedback_request_id)}><span className="avatar">{item.login_id[0].toUpperCase()}</span><span><strong>{item.login_id}</strong><small>{item.workout_date} 운동 일지</small><p>{item.request_message || '운동 기록을 검토해 주세요.'}</p></span><span className={`status-badge ${status === 'COMPLETED' ? 'done' : ''}`}>{statusLabel(status)}</span><ArrowRight size={17} /></button>)}{!page.items.length && <p className="empty-small">{status === 'PENDING' ? '대기 중인 피드백 요청이 없습니다.' : '완료된 피드백이 없습니다.'}</p>}</div><Pager offset={offset} total={page.total} onChange={setOffset} /></>}
  </>;
}

function UserBrowser() {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState({ items: [], total: 0 });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api(`/admin/users?q=${encodeURIComponent(search)}&offset=${offset}`, { signal: controller.signal }).then(setPage)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, offset, revision]);
  if (selected) return <><button className="back-link" onClick={() => setSelected(null)}><ArrowLeft size={16} />사용자 목록으로</button><div className="review-heading"><h2>{selected.login_id}님의 운동 기록</h2><span className="scope">조회 전용</span></div><UserReview key={selected.user_id} userId={selected.user_id} /></>;
  return <><div className="page-title"><div><p className="eyebrow">MEMBER RECORDS</p><h1>사용자 기록<span className="title-dot">.</span></h1><p className="muted">피드백 신청 여부와 관계없이 전체 기록을 조회합니다.</p></div><button className="secondary" onClick={() => setRevision((n) => n + 1)}>새로고침</button></div><form className="admin-search" onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearch(new FormData(e.currentTarget).get('q')); }}><div className="search-box"><Search size={18} /><input name="q" maxLength={50} placeholder="사용자 아이디 검색" aria-label="사용자 아이디 검색" /></div><button className="primary">검색</button></form><ErrorMessage>{error}</ErrorMessage>
    {loading ? <Loading /> : <><div className="admin-request-list">{page.items.map((member) => <button className="admin-request-row" key={member.user_id} onClick={() => setSelected(member)}><span className="avatar">{member.login_id[0].toUpperCase()}</span><span><strong>{member.login_id}</strong><small>운동 일지 {member.workout_count}개 · 가입 {member.created_at.slice(0, 10)}</small></span><ArrowRight size={18} /></button>)}{!page.items.length && <p className="empty-small">검색 결과가 없습니다.</p>}</div><Pager offset={offset} total={page.total} onChange={setOffset} /></>}
  </>;
}

export default function AdminDashboard({ user, onLogout, notify, toast, library }) {
  const [tab, setTab] = useState('feedback');
  const tabs = [{ id: 'feedback', label: '피드백 관리', icon: MessageSquare }, { id: 'users', label: '사용자 기록', icon: Users }, { id: 'library', label: '공용 운동', icon: Dumbbell }];
  return <div className="admin-shell"><header className="admin-header"><a className="brand" href="/"><span className="brand-mark"><Dumbbell size={20} /></span>fitness<span className="brand-light">note</span><span className="admin-tag">ADMIN</span></a><div className="account"><span>{user.login_id}</span><button className="icon-button" aria-label="로그아웃" onClick={onLogout}><LogOut size={19} /></button></div></header><div className="admin-container"><nav className="admin-navigation" aria-label="관리자 메뉴">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={19} />{label}</button>)}<p>사용자 기록은 조회만 가능합니다.</p></nav><main className="admin-content" key={tab}>{tab === 'feedback' ? <FeedbackQueue user={user} notify={notify} /> : tab === 'users' ? <UserBrowser /> : library}</main></div>{toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}</div>;
}
