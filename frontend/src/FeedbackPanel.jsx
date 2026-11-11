import { useState } from 'react';
import { Check, LockKeyhole, MessageSquare, Send } from 'lucide-react';
import { api } from './api';
import { ErrorMessage, Modal } from './ui';

export default function FeedbackPanel({ day, journal, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const feedback = journal.feedback;
  async function request(e) {
    e.preventDefault(); setBusy(true); setError('');
    const message = new FormData(e.currentTarget).get('message').trim();
    try {
      await api(`/workouts/${day}/feedback`, { method: 'POST', body: { request_message: message || null } });
      setOpen(false); onChanged('피드백을 신청했어요.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function cancel() {
    if (!window.confirm('피드백 신청을 취소하고 일지 편집을 다시 허용할까요?')) return;
    setBusy(true); setError('');
    try { await api(`/workouts/${day}/feedback`, { method: 'DELETE' }); onChanged('피드백 신청을 취소했어요.'); }
    catch (err) { setError(err.message); if (err.status === 409 || err.status === 404) onChanged(); }
    finally { setBusy(false); }
  }
  return <section className="feedback-panel" aria-label="일지 피드백">
    <div className="feedback-panel-title"><MessageSquare size={19} /><h3>관리자 피드백</h3>{feedback && <span className={`status-badge ${feedback.status === 'COMPLETED' ? 'done' : ''}`}>{feedback.status === 'COMPLETED' ? '답변 완료' : '답변 대기'}</span>}</div>
    {!feedback ? <><p>지난 운동 기록과 비교한 피드백을 받아 보세요.</p><button className="secondary wide" onClick={() => { setError(''); setOpen(true); }}><Send size={16} />피드백 신청</button></>
      : <><p className="feedback-lock"><LockKeyhole size={14} />{feedback.status === 'COMPLETED' ? '답변이 완료된 일지는 수정·삭제할 수 없어요.' : '대기 중에는 신청을 취소한 뒤 일지를 수정할 수 있어요.'}</p>
        {feedback.request_message && <div className="feedback-message"><strong>내가 남긴 질문</strong><p>{feedback.request_message}</p></div>}
        {feedback.status === 'COMPLETED' ? <div className="feedback-answer"><strong><Check size={15} />관리자의 답변</strong><p>{feedback.feedback_content}</p><small>{feedback.answered_at?.replace('T', ' ').slice(0, 16)} 답변</small></div>
          : <button className="text-button" disabled={busy} onClick={cancel}>{busy ? '처리 중…' : '피드백 신청 취소'}</button>}</>}
    <ErrorMessage>{error}</ErrorMessage>
    {open && <Modal title="일지 피드백 신청" subtitle={day} onClose={() => setOpen(false)} busy={busy}>
      <form className="modal-body stack" onSubmit={request}><p className="muted">관리자는 이 일지와 이전 운동 기록을 함께 확인해요.</p><label>궁금한 점 <span className="optional">선택</span><textarea name="message" rows={4} maxLength={5000} placeholder="예: 지난 기록과 비교해 어떤 점을 살펴보면 좋을까요?" /></label>
        <div className="feedback-warning">신청 후에는 일지 편집이 잠시 중지돼요. 대기 중에는 취소할 수 있지만, 답변이 완료되면 해당 일지는 수정하거나 삭제할 수 없어요.</div>
        <ErrorMessage>{error}</ErrorMessage><button className="primary" disabled={busy}>{busy ? '신청하는 중…' : '피드백 신청하기'}<Send size={17} /></button></form>
    </Modal>}
  </section>;
}
