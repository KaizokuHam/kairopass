import type { RequestHandler } from 'express';

// Built assets are same-origin. QR PNGs/object URLs and local camera preview
// require data/blob images and blob media; no inline scripts/styles or remote CDN.
const productionPolicy = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'",
  "font-src 'self'", "img-src 'self' data: blob:", "connect-src 'self'",
  "media-src 'self' blob:", "object-src 'none'", "base-uri 'none'",
  "frame-ancestors 'none'", "form-action 'self'", "manifest-src 'self'"
].join('; ');

export function securityHeaders(production: boolean): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    if (production) {
      res.setHeader('Content-Security-Policy', productionPolicy);
      // TLS termination is required in production; do not assume subdomain policy.
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  };
}
