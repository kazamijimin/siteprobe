import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { ScanResponse } from '@siteprobe/contracts';
import { getScan } from '@/features/scans/scan-api';
import { formatScanStatus, formatScanTimestamp } from '@/features/scans/presentation';
import { getUserFacingErrorMessage } from '@/services/api/errors';

type ResultState =
  | { status: 'loading' }
  | { status: 'success'; scan: ScanResponse }
  | { status: 'error'; message: string };

export default function ScanResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const scanId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [state, setState] = useState<ResultState>({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);

  const loadScan = useCallback(async (id: string, signal: AbortSignal) => {
    try {
      const scan = await getScan(id, signal);
      if (!signal.aborted) {
        setState({ status: 'success', scan });
      }
    } catch (error) {
      if (!signal.aborted) {
        setState({ status: 'error', message: getUserFacingErrorMessage(error) });
      }
    }
  }, []);

  useEffect(() => {
    if (!scanId) {
      return;
    }

    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        return loadScan(scanId, controller.signal);
      }
      return undefined;
    });
    return () => controller.abort();
  }, [loadScan, retryCount, scanId]);

  function goHome() {
    router.replace('/');
  }

  function goHistory() {
    router.replace('/scans');
  }

  const visibleState: ResultState = scanId
    ? state
    : { status: 'error', message: 'Scan id is missing.' };

  if (visibleState.status === 'loading') {
    return (
      <View accessibilityRole={"main" as never} style={styles.container}>
        <Stack.Screen options={{ title: 'Scan Result' }} />
        <View accessibilityLiveRegion="polite" style={styles.content}>
          <ActivityIndicator color="#2563EB" size="large" />
          <Text accessibilityRole="header" style={styles.title}>Loading scan...</Text>
        </View>
      </View>
    );
  }

  if (visibleState.status === 'error') {
    const isNotFound = visibleState.message === 'Scan not found.';
    return (
      <View accessibilityRole={"main" as never} style={styles.container}>
        <Stack.Screen options={{ title: 'Scan Result' }} />
        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>
            {isNotFound ? 'Scan not found.' : 'Unable to load scan'}
          </Text>
          <Text accessibilityLiveRegion="polite" style={styles.message}>{visibleState.message}</Text>
          {!isNotFound ? (
            <Pressable
              accessibilityLabel="Retry loading scan"
              accessibilityRole="button"
              onPress={() => {
                setState({ status: 'loading' });
                setRetryCount((count) => count + 1);
              }}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="Back to Home"
            accessibilityRole="button"
            onPress={goHome}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const { scan } = visibleState;
  const statusLabel = formatScanStatus(scan.status);

  return (
    <View accessibilityRole={"main" as never} style={styles.container}>
      <Stack.Screen options={{ title: 'Scan Result' }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.resultContent}>
        <Text accessibilityRole="header" style={styles.title}>
          Scan Result
        </Text>
        <Text style={styles.label}>Website</Text>
        <Text selectable style={styles.value}>{scan.url}</Text>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{statusLabel}</Text>
        <View style={styles.provenanceBadge}><Text style={styles.provenanceBadgeText}>Synthetic / Demo Result</Text></View>
        <Text style={styles.label}>QA Score</Text>
        <Text style={styles.score}>{scan.score === null ? 'Not available' : `${scan.score} / 100`}</Text>
        <Text style={styles.label}>Summary</Text>
        <View style={styles.summary}>
          <Text style={styles.summaryValue}>Critical: {scan.summary.critical}</Text>
          <Text style={styles.summaryValue}>Warnings: {scan.summary.warnings}</Text>
        <Text style={styles.summaryValue}>Passed: {scan.summary.passed}</Text>
        </View>
        <Text style={styles.label}>Created</Text>
        <Text style={styles.value}>{formatScanTimestamp(scan.createdAt)}</Text>
        <Text style={styles.label}>Completed</Text>
        <Text style={styles.value}>{scan.completedAt ? formatScanTimestamp(scan.completedAt) : 'Not completed'}</Text>
        <Text style={styles.label}>Scan ID</Text>
        <Text selectable style={styles.scanId}>
          {scan.id}
        </Text>
        <Text style={styles.notice}>
          This is a deterministic demo result. Real website scanning is not enabled in the public workflow.
        </Text>

        <Pressable
          accessibilityLabel="Back to Home"
          accessibilityRole="button"
          onPress={goHome}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Back to Home</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="View Scan History"
          accessibilityRole="button"
          onPress={goHistory}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
          <Text style={styles.secondaryButtonText}>View Scan History</Text>
        </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F7FAFC',
    flex: 1,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  resultContent: {
    flex: 1,
    justifyContent: 'center',
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    paddingVertical: 24,
  },
  title: {
    color: '#1A202C',
    fontSize: 30,
    fontWeight: '700',
  },
  label: {
    color: '#4A5568',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 32,
  },
  value: {
    color: '#1A202C',
    fontSize: 16,
    marginTop: 8,
  },
  score: {
    color: '#1A202C',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
  },
  summary: {
    gap: 8,
    marginTop: 8,
  },
  summaryValue: {
    color: '#1A202C',
    fontSize: 16,
  },
  scanId: {
    color: '#1A202C',
    fontFamily: 'monospace',
    fontSize: 16,
    marginTop: 8,
  },
  message: {
    color: '#4A5568',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 24,
  },
  notice: {
    color: '#744210',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 24,
  },
  provenanceBadge: { alignSelf: 'flex-start', backgroundColor: '#FEF3C7', borderColor: '#F6E05E', borderRadius: 999, borderWidth: 1, marginTop: 18, paddingHorizontal: 12, paddingVertical: 6 },
  provenanceBadgeText: { color: '#744210', fontSize: 14, fontWeight: '700' },
  button: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 28,
    minHeight: 52,
    paddingHorizontal: 20,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#2563EB',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 52,
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '700',
  },
});
