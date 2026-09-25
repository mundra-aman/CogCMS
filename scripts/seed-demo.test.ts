import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { assertLocalDemoTarget, buildDemoBlogs } from './seed-demo';

describe('demo seed target', () => {
  it.each([
    ['mongodb+srv://cluster.example.com', 'cms_public_demo'],
    ['mongodb://remote.example.com:27017', 'cms_public_demo'],
    ['mongodb://localhost:27017', 'production'],
    ['mongodb://user:pass@localhost:27017', 'cms_public_demo'],
    ['mongodb://localhost:27018', 'cms_public_demo'],
    ['mongodb://localhost:27017/production', 'cms_public_demo'],
  ])('refuses %s / %s', (uri, databaseName) => {
    expect(() => assertLocalDemoTarget(uri, databaseName)).toThrow();
  });

  it('accepts only the documented local replica set', () => {
    expect(() => assertLocalDemoTarget('mongodb://localhost:27017/?replicaSet=rs0', 'cms_public_demo')).not.toThrow();
  });
});

it('builds mixed, two-site fictional search and pagination data', () => {
  const [first, second, admin] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
  const blogs = buildDemoBlogs([first, second], admin);
  expect(blogs).toHaveLength(48);
  expect(blogs.filter((blog) => blog.siteId.equals(first))).toHaveLength(30);
  expect(blogs.filter((blog) => blog.siteId.equals(second))).toHaveLength(18);
  expect(new Set(blogs.map((blog) => blog.status))).toEqual(new Set(['draft', 'publish']));
  expect(blogs.some((blog) => blog.tag === 'a+b')).toBe(true);
  expect(blogs[0].createdAt).toEqual(blogs[1].createdAt);
  expect(blogs[0].title).toBe(blogs[30].title);
});
