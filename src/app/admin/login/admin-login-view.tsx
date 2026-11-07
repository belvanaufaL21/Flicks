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
    <main className={styles.adminShell}>
      <div className={styles.loginCard}>
        <h1 className={styles.headerTitle}>Administrator Sign In</h1>
        <p className={styles.headerSubtitle}>
          Sign in with an authorized Flicks admin account.
        </p>

        {errorMessage ? (
          <div className={styles.errorBanner} role="alert">
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={{ marginTop: '1.25rem' }}>
          <div className={styles.formField} style={{ marginBottom: '0.85rem' }}>
            <label htmlFor="admin-email" className={styles.formLabel}>
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              className={styles.formInput}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@flicks.id"
            />
          </div>

          <div className={styles.formField} style={{ marginBottom: '1.1rem' }}>
            <label htmlFor="admin-password" className={styles.formLabel}>
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              className={styles.formInput}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className={styles.primaryButton}
            style={{ width: '100%' }}
          >
            Sign In
          </button>
        </form>

        {allowLocalDevFallback && onLocalDevLogin ? (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
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
    </main>
  );
}
