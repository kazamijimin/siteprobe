import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { ScanResponse } from '@siteprobe/contracts';
import { listScans } from '@/features/scans/scan-api';
import {
  formatScanHostname,
  formatScanStatus,
  formatScanTimestamp,
  formatScanTimestampForAccessibility,
} from '@/features/scans/presentation';
import { getUserFacingErrorMessage } from '@/services/api/errors';

const PAGE_SIZE = 20;

type HistoryState =
  | { status: 'loading'; items: ScanResponse[]; nextCursor: null; loadingMore: false; loadMoreError: null }
  | { status: 'error'; items: ScanResponse[]; nextCursor: null; loadingMore: false; loadMoreError: null; message: string }
  | { status: 'success'; items: ScanResponse[]; nextCursor: string | null; loadingMore: boolean; loadMoreError: string | null };

const initialState: HistoryState = {
  status: 'loading',
  items: [],
  nextCursor: null,
  loadingMore: false,
  loadMoreError: null,
};

export default function ScanHistoryScreen() {
  const router = useRouter();
  const [state, setState] = useState<HistoryState>(initialState);
  const [retryCount, setRetryCount] = useState(0);
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    const activeControllers = controllers.current;
    return () => {
      for (const controller of activeControllers) {
        controller.abort();
      }
      activeControllers.clear();
    };
  }, []);

  useEffect(() => {
    const activeControllers = controllers.current;
    const controller = new AbortController();
    activeControllers.add(controller);
    setState(initialState);

    void listScans({ limit: PAGE_SIZE, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'success',
          items: page.items,
          nextCursor: page.nextCursor,
          loadingMore: false,
          loadMoreError: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          items: [],
          nextCursor: null,
          loadingMore: false,
          loadMoreError: null,
          message: getUserFacingErrorMessage(error),
        });
      })
      .finally(() => activeControllers.delete(controller));

    return () => {
      controller.abort();
      activeControllers.delete(controller);
    };
  }, [retryCount]);

  async function loadMore() {
    if (state.status !== 'success' || state.loadingMore || !state.nextCursor) {
      return;
    }

    const cursor = state.nextCursor;
    const controller = new AbortController();
    controllers.current.add(controller);
    setState((current) => current.status === 'success'
      ? { ...current, loadingMore: true, loadMoreError: null }
      : current);

    try {
      const page = await listScans({ limit: PAGE_SIZE, cursor, signal: controller.signal });
      if (controller.signal.aborted) return;
      setState((current) => {
        if (current.status !== 'success') return current;
        const existingIds = new Set(current.items.map((scan) => scan.id));
        const newItems = page.items.filter((scan) => !existingIds.has(scan.id));
        return {
          ...current,
          items: [...current.items, ...newItems],
          nextCursor: page.nextCursor,
          loadingMore: false,
          loadMoreError: null,
        };
      });
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setState((current) => current.status === 'success'
        ? { ...current, loadingMore: false, loadMoreError: getUserFacingErrorMessage(error) }
        : current);
    } finally {
      controllers.current.delete(controller);
    }
  }

  function goHome() {
    router.replace('/');
  }

  if (state.status === 'loading') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan History' }} />
        <View accessibilityLiveRegion="polite" style={styles.centerContent}>
          <ActivityIndicator color="#2563EB" size="large" />
          <Text accessibilityRole="header" style={styles.title}>Loading scan history...</Text>
        </View>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Scan History' }} />
        <View style={styles.centerContent}>
          <Text accessibilityRole="header" style={styles.title}>Unable to load scan history.</Text>
          <Text accessibilityLiveRegion="polite" style={styles.message}>{state.message}</Text>
          <Pressable
            accessibilityLabel="Retry loading scan history"
            accessibilityRole="button"
            onPress={() => setRetryCount((count) => count + 1)}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Scan History' }} />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={state.items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Text accessibilityRole="header" style={styles.emptyTitle}>No scans yet.</Text>
            <Text style={styles.message}>Run your first SiteProbe scan from Home.</Text>
            <Pressable
              accessibilityLabel="Back to Home"
              accessibilityRole="button"
              onPress={goHome}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>Back to Home</Text>
            </Pressable>
          </View>
        )}
        ListFooterComponent={state.nextCursor ? (
          <View style={styles.footer}>
            {state.loadMoreError ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>{state.loadMoreError}</Text>
            ) : null}
            <Pressable
              accessibilityLabel={state.loadingMore ? 'Loading more scans' : 'Load more scans'}
              accessibilityRole="button"
              accessibilityState={{ busy: state.loadingMore, disabled: state.loadingMore }}
              disabled={state.loadingMore}
              onPress={() => void loadMore()}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
              {state.loadingMore ? <ActivityIndicator color="#2563EB" /> : null}
              <Text style={styles.secondaryButtonText}>{state.loadingMore ? 'Loading...' : state.loadMoreError ? 'Retry' : 'Load More'}</Text>
            </Pressable>
          </View>
        ) : null}
        ListHeaderComponent={(
          <View>
            <Text accessibilityRole="header" style={styles.title}>Scan History</Text>
            <Text style={styles.notice}>
              Current scan results use synthetic QA data while the real scanner remains in controlled development.
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const hostname = formatScanHostname(item.url);
          const status = formatScanStatus(item.status);
          const score = item.score === null ? 'Not available' : `${item.score} / 100`;
          const createdAt = formatScanTimestamp(item.createdAt);
          const accessibleCreatedAt = formatScanTimestampForAccessibility(item.createdAt);
          return (
            <Pressable
              accessibilityHint="Opens this scan result"
              accessibilityLabel={`${hostname}, ${status}, score ${item.score === null ? 'not available' : `${item.score} out of 100`}, ${item.summary.critical} critical, ${item.summary.warnings} warnings, ${item.summary.passed} passed, created ${accessibleCreatedAt}`}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/scans/[id]', params: { id: item.id } })}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
              <Text style={styles.hostname}>{hostname}</Text>
              <Text numberOfLines={2} style={styles.url}>{item.url}</Text>
              <View style={styles.cardRow}>
                <Text style={styles.score}>{score}</Text>
                <Text style={styles.status}>{status}</Text>
              </View>
              <Text style={styles.summary}>Critical {item.summary.critical}  •  Warnings {item.summary.warnings}  •  Passed {item.summary.passed}</Text>
              <Text style={styles.timestamp}>{createdAt}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7FAFC', flex: 1 },
  listContent: { padding: 24, paddingBottom: 40 },
  centerContent: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: '#1A202C', fontSize: 30, fontWeight: '700' },
  notice: { color: '#744210', fontSize: 14, lineHeight: 21, marginTop: 16 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 16, padding: 18 },
  cardPressed: { opacity: 0.8 },
  hostname: { color: '#1A202C', fontSize: 20, fontWeight: '700' },
  url: { color: '#4A5568', fontSize: 14, lineHeight: 20, marginTop: 6 },
  cardRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  score: { color: '#1A202C', fontSize: 24, fontWeight: '700' },
  status: { color: '#276749', fontSize: 15, fontWeight: '600' },
  summary: { color: '#2D3748', fontSize: 14, lineHeight: 22, marginTop: 12 },
  timestamp: { color: '#4A5568', fontSize: 14, marginTop: 12 },
  message: { color: '#4A5568', fontSize: 16, lineHeight: 24, marginTop: 18 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { color: '#1A202C', fontSize: 22, fontWeight: '700' },
  footer: { paddingTop: 20 },
  error: { color: '#C53030', fontSize: 14, lineHeight: 21, marginBottom: 8 },
  button: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 10, justifyContent: 'center', marginTop: 28, minHeight: 52, paddingHorizontal: 20 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: '#2563EB', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 16, minHeight: 52, paddingHorizontal: 20 },
  secondaryButtonText: { color: '#2563EB', fontSize: 16, fontWeight: '700' },
});
