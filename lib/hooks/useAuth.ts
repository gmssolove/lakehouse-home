'use client';

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import {
  ensureAdminProfile,
  getUserProfile,
  isAdminUser,
  type UserProfile,
} from '@/lib/auth/userProfile';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);

  const loadProfile = useCallback(async (u: User) => {
    await ensureAdminProfile(u);
    return getUserProfile(u.uid);
  }, []);

  const refreshAuth = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) {
      setUser(null);
      setProfile(null);
      return;
    }
    await u.reload();
    const next = auth.currentUser;
    if (!next) {
      setUser(null);
      setProfile(null);
      return;
    }
    try {
      const p = await getUserProfile(next.uid);
      setProfile(p);
    } catch {
      setProfile(null);
    }
    setUser(next);
    setAuthEpoch((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const p = await loadProfile(u);
          if (!cancelled) setProfile(p);
        } catch {
          if (!cancelled) setProfile(null);
        }
      } else {
        setProfile(null);
      }
      if (!cancelled) {
        setReady(true);
        setAuthEpoch((n) => n + 1);
      }
    });
  }, [loadProfile]);

  const isAdmin = isAdminUser(user, profile);

  return { user, profile, isAdmin, ready, refreshAuth, authEpoch };
}
