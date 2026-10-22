/**
 * Parses video links from frontmatter into a normalized form.
 * Tracking parameters (?si=, utm_*, feature=…) are dropped because only the ID is kept.
 *
 * Plain functions without Astro imports, so they can run in Node scripts and unit tests.
 */
export type VideoProvider = 'youtube' | 'vimeo' | 'gdrive' | 'gdrive-folder' | 'link';

export interface VideoInfo {
  provider: VideoProvider;
  /** Provider-specific ID; empty for generic links. */
  id: string;
  /** Clean public URL to watch the video on the provider's site. */
  url: string;
  /** Privacy-friendly iframe URL, or null when the provider can't be embedded. */
  embedUrl: string | null;
}

const YOUTUBE_ID = /^[\w-]{11}$/;

export function parseVideoUrl(input: string): VideoInfo {
  const url = new URL(input.trim());
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? segments[0]
        : segments[0] === 'watch'
          ? url.searchParams.get('v')
          : ['embed', 'shorts', 'live'].includes(segments[0] ?? '')
            ? segments[1]
            : null;
    if (!id || !YOUTUBE_ID.test(id)) throw new Error(`Unrecognized YouTube URL: ${input}`);
    return {
      provider: 'youtube',
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
    };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = segments[0] === 'video' ? segments.slice(1) : segments;
    const [id, hash] = parts;
    if (!id || !/^\d+$/.test(id)) throw new Error(`Unrecognized Vimeo URL: ${input}`);
    const privateHash = hash ?? url.searchParams.get('h');
    return {
      provider: 'vimeo',
      id,
      url: `https://vimeo.com/${id}${privateHash ? `/${privateHash}` : ''}`,
      embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1${privateHash ? `&h=${privateHash}` : ''}`,
    };
  }

  if (host === 'drive.google.com') {
    if (segments[0] === 'file' && segments[1] === 'd' && segments[2]) {
      const id = segments[2];
      return { provider: 'gdrive', id, url: `https://drive.google.com/file/d/${id}/view`, embedUrl: null };
    }
    if (segments[0] === 'drive' && segments[1] === 'folders' && segments[2]) {
      const id = segments[2];
      return { provider: 'gdrive-folder', id, url: `https://drive.google.com/drive/folders/${id}`, embedUrl: null };
    }
  }

  url.search = '';
  url.hash = '';
  return { provider: 'link', id: '', url: url.toString(), embedUrl: null };
}

/** Thumbnail candidates for a YouTube video, best quality first. */
export const youtubeThumbnailUrls = (id: string) =>
  ['maxresdefault', 'sddefault', 'hqdefault'].map((size) => `https://i.ytimg.com/vi/${id}/${size}.jpg`);
