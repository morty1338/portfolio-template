/**
 * Where this instance's content lives. Code never hard-codes instance data; everything personal
 * (texts, images, name, URL, e-mail) comes from this folder.
 *
 * - The public template ships fictional demo content in `content-demo/`.
 * - A real site (e.g. the private repo built from the template) adds its own `content/`, which wins automatically.
 * - `CONTENT_DIR` overrides both (e.g. CONTENT_DIR=content-demo to preview the demo inside a real repo).
 */
import { existsSync } from 'node:fs';

export const contentRoot = process.env.CONTENT_DIR ?? (existsSync('content') ? 'content' : 'content-demo');
