/**
 * Content queries shared by pages. Wraps astro:content, so it is not unit-testable in Node;
 * the pure parts live in src/lib/.
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { contentRoot } from '../config/content-root';
import type { Locale } from '../config/site';
import { localizePath } from '../i18n/routing';

export type Project = CollectionEntry<'projects'>;
export type Painting = CollectionEntry<'paintings'>;
export type Category = Project['data']['category'];

const byOrder = (a: { data: { order: number; title: string } }, b: { data: { order: number; title: string } }) =>
  a.data.order - b.data.order || a.data.title.localeCompare(b.data.title);

/** Published projects in display order. */
export async function getProjects(category?: Category): Promise<Project[]> {
  const entries = await getCollection(
    'projects',
    ({ data }) => !data.draft && (!category || data.category === category),
  );
  return entries.sort(byOrder);
}

export async function getFeaturedProjects(): Promise<Project[]> {
  return (await getProjects()).filter((p) => p.data.featured);
}

export async function getPaintings(): Promise<Painting[]> {
  return (await getCollection('paintings', ({ data }) => !data.draft)).sort(byOrder);
}

export async function getProfile() {
  const entry = await getEntry('profile', 'main');
  if (!entry) throw new Error(`Missing ${contentRoot}/profile/main/index.md`);
  return entry.data;
}

export const projectPath = (id: string, locale: Locale) => localizePath(`/work/${id}/`, locale);
