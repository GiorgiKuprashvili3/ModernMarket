export const environment = {
  production: false,
  // Proxied to the NestJS API by proxy.conf.json during `npm start`.
  apiBaseUrl: '/api/v1',
  defaultLocale: 'ka' as const,
  supportedLocales: ['ka', 'en'] as const,
};
