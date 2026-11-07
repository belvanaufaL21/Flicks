'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { AdminLoginView } from './admin-login-view';

export default function AdminLoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowLocalDevFallback =
    process.env.NODE_ENV !== 'production' && (!supabaseUrl || !supabaseAnonKey);

  const handleCredentialsSubmit = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    setErrorMessage(null);
    if (!supabaseUrl || !supabaseAnonKey) {
      if (allowLocalDevFallback) {
        handleLocalDevLogin();
        return;
      }
      setErrorMessage(
        'Supabase Auth is not configured in this environment. Use Local Dev Admin in development.',
      );
      return;
    }

    const client = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session?.access_token) {
      setErrorMessage(error?.message ?? 'Invalid administrator credentials.');
      return;
    }

    const token = data.session.access_token;
    window.sessionStorage.setItem('flicks_admin_access_token', token);
    document.cookie = `sb-access-token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
    router.push('/admin');
  };

  const handleLocalDevLogin = () => {
    // ponytail: store in both session and local storage for tab persistence. Upgrade path: proper Supabase session.
    window.sessionStorage.setItem(
      'flicks_admin_access_token',
      'dev-admin-token',
    );
    window.localStorage.setItem(
      'flicks_admin_access_token',
      'dev-admin-token',
    );
    document.cookie = 'sb-access-token=dev-admin-token; path=/; SameSite=Lax';
    window.location.href = '/admin';
  };

  return (
    <AdminLoginView
      allowLocalDevFallback={allowLocalDevFallback}
      errorMessage={errorMessage}
      onSubmitCredentials={handleCredentialsSubmit}
      onLocalDevLogin={handleLocalDevLogin}
    />
  );
}
