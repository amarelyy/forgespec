import { ReactNode, useEffect, useRef } from 'react';
import { WsIcon } from './icons';

/** Small tasks open here; anything that needs a wide table or a long form gets its own page. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog ws-modal" aria-label={title} onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="ws-modal-body">
        <div className="ws-modal-head">
          <h2>{title}</h2>
          <button type="button" className="ws-iconbtn" aria-label="Close" onClick={onClose}>
            <WsIcon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
