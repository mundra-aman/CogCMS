import Author from '@/models/Author';
import type { ISite } from '@/models/Site';
export async function publishingSiteData(site: ISite, siteId: string) {
  const authors = await Author.find({ siteId, status: 'publish' }).sort({ name: 1 }).exec();
  return {
    id: siteId,
    name: site.name,
    primaryDomain: site.primaryDomain,
    blogsPath: site.publicPaths.blogs,
    authors: authors.map((author) => ({ id: author._id.toString(), name: author.name })),
    protocol: 'cognerd-publishing-v1',
  };
}
