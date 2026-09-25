import type { ISite } from '@/models/Site';
import type { IUser } from '@/models/User';

export interface AdminSiteView {
  id: string;
  name: string;
  slug: string;
  primaryDomain: string;
  publicPaths: { blogs: string; whitepapers: string; faq: string; releaseNotes: string };
  publisher: { name: string; url: string; logoUrl: string };
  defaultLocale: string;
  mediaPrefix: string;
  status: 'active' | 'archived';
  webhookUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserView {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor';
  siteIds: string[];
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeSite(site: ISite): AdminSiteView {
  return {
    id: site._id.toString(),
    name: site.name,
    slug: site.slug,
    primaryDomain: site.primaryDomain,
    publicPaths: {
      blogs: site.publicPaths.blogs,
      whitepapers: site.publicPaths.whitepapers,
      faq: site.publicPaths.faq,
      releaseNotes: site.publicPaths.releaseNotes,
    },
    publisher: {
      name: site.publisher.name,
      url: site.publisher.url,
      logoUrl: site.publisher.logoUrl,
    },
    defaultLocale: site.defaultLocale,
    mediaPrefix: site.mediaPrefix,
    status: site.status,
    webhookUrl: site.webhookUrl ?? null,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };
}

export function serializeUser(user: IUser): AdminUserView {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    siteIds: user.siteIds.map((siteId) => siteId.toString()),
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
