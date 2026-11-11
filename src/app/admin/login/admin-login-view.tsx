'use client';

import React, { useState } from 'react';
import styles from '../admin.module.css';

export interface AdminLoginViewProps {
  allowLocalDevFallback?: boolean;
  errorMessage?: string | null;
  onSubmitCredentials: (credentials: {
    email: string;
    password: string;
  }) => void | Promise<void>;
  onLocalDevLogin?: () => void | Promise<void>;
}

export function AdminLoginView({
  allowLocalDevFallback = false,
  errorMessage = null,
  onSubmitCredentials,
  onLocalDevLogin,
}: AdminLoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmitCredentials({ email: email.trim(), password });
  };

  return (
    <main className={styles.loginShell}>
      <div className={styles.loginSplitCard}>
        <div className={styles.loginBrandPanel}>
          <div className={styles.loginBrandHeader}>
            <span className={styles.loginBrandMonogram} aria-hidden="true">
              F
            </span>
            <div>
              <div className={styles.loginBrandTitle}>FLICKS</div>
              <div className={styles.loginBrandWorkspace}>Admin Workspace</div>
            </div>
          </div>

          <div className={styles.loginBrandBody}>
            <h2 className={styles.loginBrandHeading}>
              Sistem Manajemen Kurasi & Operasional AI
            </h2>
            <p className={styles.loginBrandText}>
              Kelola katalog pakaian, pantau transaksi pelanggan, dan audit performa model visual dalam satu workspace terpadu.
            </p>
          </div>

          <div className={styles.loginBrandFooter}>
            <span className={styles.loginBrandDot} aria-hidden="true" />
            <span>Authorized Staff Only</span>
          </div>
        </div>

        <div className={styles.loginFormPanel}>
          <h1 className={styles.loginFormTitle}>Administrator Sign In</h1>
          <p className={styles.loginFormSubtitle}>
            Sign in with an authorized Flicks admin account.
          </p>

          {errorMessage ? (
            <div className={styles.errorBanner} role="alert">
              {errorMessage}
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <div className={styles.formField} style={{ marginBottom: '0.85rem' }}>
              <label htmlFor="admin-email" className={styles.formLabel}>
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                spellCheck={false}
                className={styles.formInput}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@flicks.id"
              />
            </div>

            <div className={styles.formField} style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="admin-password" className={styles.formLabel}>
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                autoComplete="current-password"
                className={styles.formInput}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className={styles.primaryButton}
              style={{ width: '100%', padding: '0.65rem 1rem' }}
            >
              Sign In
            </button>
          </form>

          {allowLocalDevFallback && onLocalDevLogin ? (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--admin-border)' }}>
              <button
                type="button"
                onClick={() => void onLocalDevLogin()}
                className={styles.secondaryButton}
                style={{ width: '100%' }}
              >
                Continue with Local Dev Admin
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
