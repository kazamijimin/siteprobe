export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

function isLoopbackWebHost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
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

  // Expo's local .env is shared by native and web targets. Keep the Android
  // emulator target (10.0.2.2) for native builds, but translate it to the
  // host loopback address when the bundle is running in a browser on this PC.
  if (isLoopbackWebHost() && parsedUrl.hostname === '10.0.2.2') {
    parsedUrl.hostname = '127.0.0.1';
  }

  return parsedUrl.toString().replace(/\/+$/, '');
}
