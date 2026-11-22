import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing'],
        disallow: [
          '/api/',
          '/serve',
          '/kds',
          '/pos',
          '/floor-plan',
          '/reservations',
          '/inventory',
          '/scheduling',
          '/briefing',
          '/onboarding',
          '/architect',
          '/mobile',
          '/voice-ai',
          '/end-of-night',
          '/pay/',
          '/setup',
          '/login',
        ],
      },
    ],
    sitemap: 'https://chefuffle.online/sitemap.xml',
    host: 'https://chefuffle.online',
  };
}
