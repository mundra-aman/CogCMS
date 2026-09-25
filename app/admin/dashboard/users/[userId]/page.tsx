'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { AdminUserView } from '@/lib/admin/serializers';
import { UserForm } from '@/components/admin/user-form';

export default function EditUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<AdminUserView | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load user');
        setUser(await response.json());
      })
      .catch(() => setError(true));
  }, [userId]);

  return (
    <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Edit user</h1>
      <p className="mt-2 mb-8 text-sm text-stone-600">Update access without exposing password hashes or audit fields.</p>
      {error ? <p role="alert" className="text-sm text-red-700">The user could not be loaded.</p> : null}
      {!error && !user ? <p className="text-sm text-stone-500">Loading user...</p> : null}
      {user ? <UserForm user={user} /> : null}
    </section>
  );
}
