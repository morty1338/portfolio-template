/**
 * Content model. Content lives in the content root (`content/` or `content-demo/`, see config/content-root.ts).
 * Every entry is a folder with an index.md and its images next to it:
 *   <root>/projects/<slug>/index.md   (slug = URL: /work/<slug>/)
 *   <root>/paintings/<slug>/index.md
 *   <root>/profile/main/index.md      (exactly one entry: texts and portrait of the site owner)
 *   <root>/site.json                  (name, URL, e-mail, …; read by config/site.ts)
 * Text that differs per language is an object with one key per locale ({ en, de }).
 */
import { defineCollection, type ImageFunction } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { contentRoot } from './config/content-root';
import { site, type Locale } from './config/site';
import { ROLES } from './lib/roles';
import { parseVideoUrl } from './lib/video';

/** One required string per locale; a missing translation fails the build. */
const localized = () =>
  z.object(Object.fromEntries(site.locales.map((l) => [l, z.string().trim().min(1)])) as Record<Locale, z.ZodString>);

/** Folder name = id = URL slug. Folders starting with "_" are templates and are skipped. */
const folderEntries = (base: string) =>
  glob({ base, pattern: ['*/index.md', '!_*/**'], generateId: ({ entry }) => entry.split('/')[0]! });

const photo = (image: ImageFunction) => z.object({ src: image(), alt: localized() });

const projects = defineCollection({
  loader: folderEntries(`./${contentRoot}/projects`),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      category: z.enum(['cinematography', 'solo', 'photography']),
      roles: z.array(z.enum(ROLES)).min(1),
      year: z.number().int().min(1990).max(2100).optional(),
      description: localized(),
      /** YouTube, Vimeo or Google Drive link; tracking parameters are stripped. */
      video: z.url().transform(parseVideoUrl).optional(),
      /** Optional small print under the video, e.g. credits or a licence ("Video: Sintel, © Blender Foundation, CC BY 3.0"). */
      note: localized().optional(),
      /** Cover for cards and Open Graph. YouTube projects get one via `npm run images:youtube`. */
      thumbnail: image().optional(),
      /** Film stills (detail page) or the photos of a photo series (gallery with lightbox). */
      photos: z.array(photo(image)).default([]),
      featured: z.boolean().default(false),
      /** Lower comes first. */
      order: z.number().default(100),
      draft: z.boolean().default(false),
      /** Set to "approved" once the site owner has checked the non-English texts. */
      translationStatus: z.enum(['needs-review', 'approved']).default('needs-review'),
    }),
});

const paintings = defineCollection({
  loader: folderEntries(`./${contentRoot}/paintings`),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      year: z.number().int().min(1990).max(2100).optional(),
      /** e.g. { en: "Oil on canvas", de: "Öl auf Leinwand" } */
      medium: localized(),
      size: z.string().optional(),
      image: image(),
      alt: localized(),
      order: z.number().default(100),
      draft: z.boolean().default(false),
    }),
});

const profile = defineCollection({
  loader: folderEntries(`./${contentRoot}/profile`),
  schema: ({ image }) =>
    z.object({
      portrait: image(),
      portraitAlt: localized(),
      /** Short line under the name on the homepage. */
      tagline: localized(),
      jobTitle: localized(),
      /** Paragraphs of the About page. */
      about: z.array(localized()).min(1),
      lookingFor: z.array(localized()).min(1),
      skills: z.array(z.object({ group: localized(), items: z.array(localized()).min(1) })).min(1),
      translationStatus: z.enum(['needs-review', 'approved']).default('needs-review'),
    }),
});

export const collections = { projects, paintings, profile };
