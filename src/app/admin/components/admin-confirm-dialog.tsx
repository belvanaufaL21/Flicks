'use client';

import React, { useEffect, useRef } from 'react';
import styles from '../admin.module.css';

export interface AdminConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  reasonField?: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (val: string) => void;
  };
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function AdminConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Batal',
  tone = 'primary',
  reasonField,
  onConfirm,
  onCancel,
}: AdminConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Focus reason input if present, otherwise confirm button
    if (reasonField) {
      inputRef.current?.focus();
    } else {
      confirmButtonRef.current?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, reasonField]);

  return (
    <div
      className={styles.confirmOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className={styles.confirmModalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div className={styles.modalHeader}>
          <h3 id="confirm-dialog-title" className={styles.sectionHeading}>
            {title}
          </h3>
          <button
            type="button"
            aria-label="Tutup dialog"
            className={styles.iconButton}
            onClick={onCancel}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p id="confirm-dialog-desc" className={styles.metricSubtext} style={{ marginBottom: '1rem', lineHeight: 1.5 }}>
          {description}
        </p>

        {reasonField ? (
          <div className={styles.formField} style={{ marginBottom: '1.25rem' }}>
            <label htmlFor="confirm-dialog-reason" className={styles.formLabel}>
              {reasonField.label}
            </label>
            <input
              ref={inputRef}
              id="confirm-dialog-reason"
              type="text"
              className={styles.formInput}
              placeholder={reasonField.placeholder}
              value={reasonField.value}
              onChange={(e) => reasonField.onChange(e.target.value)}
            />
          </div>
        ) : null}

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={tone === 'danger' ? styles.dangerButton : styles.primaryButton}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
