// Must match the base URLs used to build images.remotePatterns in next.config.js.
export function canOptimizeImage(src: string, bases = process.env.NEXT_PUBLIC_IMAGE_BASE_URLS ?? '') {
  if (src.startsWith('/') && !src.startsWith('//')) {
    // Only public assets, never authenticated application/API routes.
    return /^\/(?:inventory|login)\//.test(src) || /^\/[^/?]+\.(?:png|jpe?g|webp|avif)(?:\?|$)/i.test(src);
  }
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:' || url.username || url.password || url.search) return false;
    return bases.split(',').filter(Boolean).some((base) => {
      const allowed = new URL(base.trim());
      const prefix = `${allowed.pathname.replace(/\/+$/, '')}/`;
      return url.origin === allowed.origin && url.pathname.startsWith(prefix);
    });
  } catch {
    return false;
  }
}
