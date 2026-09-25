import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { mongo } from 'mongoose';
import { publishedViews, provisionPublishedViews, readerPrivileges } from '../lib/publishing/views';

export function parseProvisionArgs(args: string[]): { site: string; write: boolean } {
  const { values, tokens } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    tokens: true,
    options: {
      site: { type: 'string' },
      write: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  });
  if (
    !values.site ||
    (values.write && values['dry-run']) ||
    tokens.filter((token) => token.kind === 'option' && token.name === 'site').length !== 1
  ) {
    throw new Error('Use --site <ObjectId> and optionally --write or --dry-run.');
  }
  publishedViews(values.site);
  return { site: values.site.toLowerCase(), write: values.write === true };
}

async function main(): Promise<void> {
  const options = parseProvisionArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI?.trim();
  const database = process.env.MONGODB_DB_NAME?.trim();
  if (!uri || !database) throw new Error('Explicit operator database configuration is required.');
  const privileges = readerPrivileges(database, options.site);
  const client = new mongo.MongoClient(uri, { maxPoolSize: 2, serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const plan = await provisionPublishedViews(client.db(database), options.site, options);
    console.log(
      JSON.stringify(
        { mode: options.write ? 'write' : 'dry-run', views: plan, readerPrivileges: privileges },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Driver/URI errors can contain credentials: never print the exception or stack here.
    console.error(
      'Published-view provisioning failed. Check arguments, operator connection, site existence and namespace collisions; no existing views are overwritten.',
    );
    process.exitCode = 1;
  });
}
