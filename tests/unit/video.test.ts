import { describe, expect, it } from 'vitest';
import { parseVideoUrl } from '../../src/lib/video';

describe('parseVideoUrl', () => {
  it.each([
    'https://youtu.be/AbCdEfGhIjK',
    'https://youtu.be/AbCdEfGhIjK?si=AbCdEfGh123',
    'https://www.youtube.com/watch?v=AbCdEfGhIjK&feature=share&utm_source=x',
    'https://m.youtube.com/watch?v=AbCdEfGhIjK',
    'https://www.youtube.com/shorts/AbCdEfGhIjK',
    'https://www.youtube-nocookie.com/embed/AbCdEfGhIjK',
  ])('normalizes YouTube URL %s', (input) => {
    expect(parseVideoUrl(input)).toEqual({
      provider: 'youtube',
      id: 'AbCdEfGhIjK',
      url: 'https://www.youtube.com/watch?v=AbCdEfGhIjK',
      embedUrl: 'https://www.youtube-nocookie.com/embed/AbCdEfGhIjK?autoplay=1&rel=0',
    });
  });

  it('keeps IDs that start with a dash or contain underscores', () => {
    expect(parseVideoUrl('https://youtu.be/-aB_cD3eF4g').id).toBe('-aB_cD3eF4g');
  });

  it('rejects malformed YouTube URLs instead of embedding garbage', () => {
    expect(() => parseVideoUrl('https://youtu.be/short')).toThrow(/YouTube/);
  });

  it('handles public and private Vimeo links with do-not-track', () => {
    expect(parseVideoUrl('https://vimeo.com/123456789?share=copy').embedUrl).toBe(
      'https://player.vimeo.com/video/123456789?autoplay=1&dnt=1',
    );
    expect(parseVideoUrl('https://vimeo.com/123456789/abcdef1234')).toMatchObject({
      url: 'https://vimeo.com/123456789/abcdef1234',
      embedUrl: 'https://player.vimeo.com/video/123456789?autoplay=1&dnt=1&h=abcdef1234',
    });
  });

  it('turns Google Drive files and folders into link-only entries', () => {
    expect(parseVideoUrl('https://drive.google.com/file/d/1FileIdForTests-abcdefghijklmnopq/view?usp=sharing')).toEqual(
      {
        provider: 'gdrive',
        id: '1FileIdForTests-abcdefghijklmnopq',
        url: 'https://drive.google.com/file/d/1FileIdForTests-abcdefghijklmnopq/view',
        embedUrl: null,
      },
    );
    expect(
      parseVideoUrl('https://drive.google.com/drive/folders/1FolderIdForTests-abcdefghijklmn?usp=drive_link'),
    ).toMatchObject({ provider: 'gdrive-folder', embedUrl: null });
  });

  it('strips query and hash from unknown links', () => {
    expect(parseVideoUrl('https://example.org/film?utm_source=x#t=10')).toEqual({
      provider: 'link',
      id: '',
      url: 'https://example.org/film',
      embedUrl: null,
    });
  });
});
