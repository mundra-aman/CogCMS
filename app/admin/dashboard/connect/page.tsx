import type { ReactNode } from 'react';
import { DeveloperPrompt } from '@/components/admin/developer-prompt';

const details = [
  [
    'Website identity',
    'Name, full public origin (for example https://www.example.com), publisher name/URL, logo URL and language.',
    'Marketing',
  ],
  [
    'Content and URLs',
    'Which sections to edit; their existing paths; old content to import; images, authors and dates to preserve.',
    'Marketing + developer',
  ],
  [
    'Website access',
    'Repository, working branch, framework, hosting provider, preview URL and person who can deploy.',
    'Developer',
  ],
  ['Forms', 'Whether newsletter signups or FAQ submissions should go to this CMS.', 'Marketing'],
  [
    'Team access',
    'Editors who need access and the person who approves publishing.',
    'Marketing + CMS admin',
  ],
  [
    'CMS connection',
    'Site ID/slug, agreed read mode, database/view names or API access, media origin, and secure credential references.',
    'CMS admin + operator',
  ],
  [
    'Publishing updates',
    'Website webhook URL, signing secret in the secret manager, expected update delay and support contact.',
    'Developer + CMS admin',
  ],
] as const;

function Step({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7"
    >
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">{children}</div>
    </section>
  );
}

export default function ConnectWebsitePage() {
  return (
    <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <p className="text-sm font-medium text-orange-700">Marketing setup guide</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Connect an existing website</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
        Use this CMS to write and publish content while your website keeps its own design. Marketing
        provides the brief, a CMS administrator sets up access, and a developer connects the
        website. Adding a domain in Sites is only the first step.
      </p>
      <nav
        aria-label="Guide sections"
        className="my-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-orange-700"
      >
        <a className="underline underline-offset-4" href="#collect">
          Details to collect
        </a>
        <a className="underline underline-offset-4" href="#setup">
          CMS setup
        </a>
        <a className="underline underline-offset-4" href="#developer">
          Developer prompt
        </a>
        <a className="underline underline-offset-4" href="#handoff">
          Go-live checklist
        </a>
      </nav>

      <div className="space-y-6">
        <Step id="collect" title="1. Collect the website details">
          <p>
            Fill in what you know. Your developer can inspect the repository for the technical
            details. Use a separate site for each client website.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <caption className="sr-only">Website setup details and who supplies them</caption>
              <thead>
                <tr className="border-b border-stone-200">
                  <th scope="col" className="py-3 pr-4">
                    Detail
                  </th>
                  <th scope="col" className="py-3 pr-4">
                    What to provide
                  </th>
                  <th scope="col" className="py-3">
                    Who provides it
                  </th>
                </tr>
              </thead>
              <tbody>
                {details.map(([name, description, owner]) => (
                  <tr key={name} className="border-b border-stone-100 align-top last:border-0">
                    <th scope="row" className="py-3 pr-4 font-medium text-stone-900">
                      {name}
                    </th>
                    <td className="py-3 pr-4">{description}</td>
                    <td className="py-3">{owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Share passwords, API keys and connection strings through your approved secret manager.
            The brief and AI prompt need only the names or references of those secrets.
          </p>
        </Step>

        <Step id="setup" title="2. Ask the CMS administrator to set up the site">
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              Open <strong>Sites → New site</strong>. Enter the name, unique slug, public origin,
              publisher details, locale and existing public paths. The origin is the domain only;
              put paths such as <code>/blogs</code> in Public paths.
            </li>
            <li>
              Agree a unique media prefix with the CMS operator. Creating the site does not
              automatically configure upload permissions. The operator must confirm its storage
              permissions and public media origin, then verify an upload.
            </li>
            <li>
              Open <strong>Users</strong> to create or update each editor and assign the correct
              site. Editors can use this guide; site registration, keys and team management require
              an administrator.
            </li>
            <li>
              Ask the operator for website read access. The current Atlas setup uses six published
              views and a separate reader that can only read this site. Atlas views and users are
              provisioned outside the CMS UI. If an API integration is agreed instead, create a{' '}
              <code>content:read</code> key in <strong>Sites → select the site → API keys</strong>.
            </li>
            <li>
              If the website has signup or question forms, create a separate{' '}
              <code>intake:write</code> key. Give credentials directly to the developer through the
              secret manager. Keys are shown only once.
            </li>
            <li>
              Once the developer supplies the website endpoint, open the site’s{' '}
              <strong>Webhook</strong> section, save its Consumer webhook URL and generate the
              signing secret. The developer installs that same secret on the website server.
              Coordinate regeneration with them because it changes the secret.
            </li>
          </ol>
          <p>
            Record the site’s immutable ID as well as its slug. The administrator can copy the ID
            from the site settings page URL, after <code>/sites/</code>. Confirm the chosen site in
            the switcher before editing content.
          </p>
        </Step>

        <Step id="developer" title="3. Send this prompt to your developer">
          <p>
            Copy the prompt, fill the bracketed details and send it to the developer. They can give
            it to their AI coding agent inside the existing website repository. It asks the agent to
            report missing information before making the integration.
          </p>
          <p>
            The developer supplies a preview link, the website webhook URL, deployment instructions
            and evidence that publishing works. Existing content needs an agreed import; it does not
            move automatically when you register a site.
          </p>
          <DeveloperPrompt />
        </Step>

        <Step id="handoff" title="4. Check the connection before the team starts">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Sign in, select the correct site and confirm each editor can access only their
              assigned websites.
            </li>
            <li>
              Compare imported content, dates, authors, images and existing URLs with the original
              website.
            </li>
            <li>
              In preview, publish a test item, change it, then unpublish it. Confirm each change
              appears on the website and its lists. Have the developer test rename, deletion,
              drafts, sitemap updates and a missed notification too.
            </li>
            <li>
              Upload an image and check it on a content page. If forms are connected, submit them
              and have the administrator verify their saved records.
            </li>
            <li>
              Agree the expected update delay and who to contact if an update fails. A saved CMS
              entry and its editor preview do not confirm that the public website has updated.
            </li>
            <li>
              After preview approval, the deployment owner releases the connected website and the
              CMS administrator switches the webhook to the public website endpoint. Repeat a
              controlled publish/edit/unpublish check on the public URL and remove the test item.
            </li>
          </ul>
          <p>
            Keep the original content source and a rollback path until the owner accepts the
            handoff. Remove old entries only after identifying the exact site and records; another
            client’s content must remain untouched.
          </p>
        </Step>

        <Step id="daily" title="After setup: the marketing workflow">
          <p>
            Sign in → select your website → open the content section → save a draft → review →
            publish → check the public URL after the agreed update delay. Published changes are
            picked up by the website’s integration; visitors with an already-open page may need to
            refresh.
          </p>
          <p>
            If the website does not update, send your developer the site name, content URL, action
            and time of the change. Ask them to check the publishing notification and website cache.
            Keep credentials out of that message.
          </p>
        </Step>
      </div>
    </article>
  );
}
