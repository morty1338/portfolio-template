import type { UiKey } from '../i18n/ui';

/** Locale-free paths; localize with localizePath(). `home` is only shown in the phone tab bar. */
export const navigation: { key: UiKey; path: string; home?: boolean; cta?: boolean }[] = [
  { key: 'nav.home', path: '/', home: true },
  { key: 'nav.work', path: '/work/' },
  { key: 'nav.about', path: '/about/' },
  { key: 'nav.contact', path: '/contact/', cta: true },
];

/** '/work/echo/' is inside '/work/'; '/' only matches itself. */
export const isCurrentSection = (currentPath: string, itemPath: string) =>
  itemPath === '/' ? currentPath === '/' : currentPath.startsWith(itemPath);
