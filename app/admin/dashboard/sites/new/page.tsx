import { SiteForm } from '@/components/admin/site-form';

export default function NewSitePage() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Create site</h1>
      <p className="mt-2 mb-8 text-sm text-stone-600">Add an isolated publishing tenant.</p>
      <SiteForm />
    </section>
  );
}
