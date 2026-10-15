"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  dismissible = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`app-dialog ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        if (dismissible) onClose();
        else e.preventDefault();
      }}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        {dismissible && (
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
