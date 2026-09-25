import { UserForm } from '@/components/admin/user-form';

export default function NewUserPage() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Create user</h1>
      <p className="mt-2 mb-8 text-sm text-stone-600">Grant only the sites this person needs.</p>
      <UserForm />
    </section>
  );
}
