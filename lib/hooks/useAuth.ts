'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;

    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          await ensureAdminProfile(u);
          const p = await getUserProfile(u.uid);
          if (!cancelled) setProfile(p);
        } catch {
          if (!cancelled) setProfile(null);
        }
      } else {
        setProfile(null);
      }
      if (!cancelled) setReady(true);
    });
  }, []);

  const isAdmin = isAdminUser(user, profile);

  return { user, profile, isAdmin, ready };
}
