import type { ScanStatus } from '@siteprobe/contracts';

export function formatScanHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function formatScanTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatScanTimestampForAccessibility(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatScanStatus(status: ScanStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
