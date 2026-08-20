export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

export function getApiBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!configuredUrl) {
    throw new ApiConfigurationError(
      'SiteProbe API URL is not configured. Set EXPO_PUBLIC_API_URL before trying again.',
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new ApiConfigurationError(
      'SiteProbe API URL is invalid. Use an absolute HTTP or HTTPS URL.',
    );
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ApiConfigurationError(
      'SiteProbe API URL must use HTTP or HTTPS.',
    );
  }

  if (!parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
    throw new ApiConfigurationError(
      'SiteProbe API URL must include a hostname and no credentials.',
    );
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new ApiConfigurationError(
      'SiteProbe API URL must not include a query string or fragment.',
    );
  }

  return parsedUrl.toString().replace(/\/+$/, '');
}
