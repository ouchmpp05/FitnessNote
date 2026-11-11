import { useEffect, useRef } from 'react';
import { AlertCircle, LoaderCircle, X } from 'lucide-react';

export function ErrorMessage({ children }) {
  return children ? <div className="error" role="alert"><AlertCircle size={17} /><span>{children}</span></div> : null;
}
export function Loading({ text = '기록을 불러오고 있어요' }) {
  return <div className="loading" role="status"><LoaderCircle className="spin" size={22} /><span>{text}</span></div>;
}
export function Modal({ title, subtitle, onClose, busy = false, children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-label={title}
    onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="modal-head"><div>{subtitle && <p className="eyebrow">{subtitle}</p>}<h2>{title}</h2></div>
      <button className="icon-button" aria-label="닫기" onClick={onClose} disabled={busy}><X size={22} /></button></div>
    {children}
  </dialog>;
}
