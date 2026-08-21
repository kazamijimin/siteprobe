import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { AccessibilityEvaluationListItem } from '@siteprobe/contracts';
import { ApiError } from '@/services/api/client';
import { listAccessibilityEvaluations } from '@/features/accessibility-evaluations/accessibility-evaluation-api';
import {
  formatAccessibilityProvenance,
  formatAccessibilityListSource,
  formatAccessibilityListSummary,
  formatAccessibilityTimestamp,
} from '@/features/accessibility-evaluations/presentation';

const PAGE_SIZE = 20;

type IndexStatus = 'loading' | 'success' | 'unavailable' | 'error';

type IndexState = {
  status: IndexStatus;
  evaluations: AccessibilityEvaluationListItem[];
  nextCursor: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
  message: string | null;
};
type SourceFilter = 'all' | 'real-site-smoke-test' | 'controlled-fixture';

const initialState: IndexState = {
  status: 'loading',
  evaluations: [],
  nextCursor: null,
  loadingMore: false,
  loadMoreError: null,
  message: null,
};

function appendUnique(current: AccessibilityEvaluationListItem[], incoming: AccessibilityEvaluationListItem[]): AccessibilityEvaluationListItem[] {
  const existingIds = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !existingIds.has(item.id))];
}

function getListError(error: unknown): { status: 'unavailable' | 'error'; message: string } {
  if (error instanceof ApiError && error.status === 404) {
    return {
      status: 'unavailable',
      message: 'This controlled development feature is not enabled on the SiteProbe API.',
    };
  }
  return { status: 'error', message: 'Unable to load controlled accessibility evaluations.' };
}

function EvaluationCard({ evaluation, onPress }: { evaluation: AccessibilityEvaluationListItem; onPress: () => void }) {
  const summary = formatAccessibilityListSummary(evaluation);
  return (
    <Pressable
      accessibilityHint="Opens this controlled accessibility evaluation"
      accessibilityLabel={`${evaluation.requestedUrl}, ${summary}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <Text selectable style={styles.requestedUrl}>{evaluation.requestedUrl}</Text>
      <Text style={styles.provenanceBadge}>{formatAccessibilityProvenance(evaluation.provenance)}</Text>
      <Text style={styles.source}>{formatAccessibilityListSource(evaluation)}</Text>
      <Text style={styles.timestamp}>Scanned: {formatAccessibilityTimestamp(evaluation.scannedAt)}</Text>
      <Text style={styles.timestamp}>Persisted: {formatAccessibilityTimestamp(evaluation.createdAt)}</Text>
      <Text accessibilityLiveRegion="polite" style={evaluation.status === 'notApplicable' ? styles.failureStatus : styles.summary}>{summary}</Text>
      <Text style={styles.cardAction}>View evaluation</Text>
    </Pressable>
  );
}

export default function AccessibilityEvaluationIndexScreen() {
  const router = useRouter();
  const [state, setState] = useState<IndexState>(initialState);
  const [retryCount, setRetryCount] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    const activeControllers = controllers.current;
    const controller = new AbortController();
    activeControllers.add(controller);
    void listAccessibilityEvaluations({ limit: PAGE_SIZE, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setState({ status: 'success', evaluations: page.evaluations, nextCursor: page.nextCursor, loadingMore: false, loadMoreError: null, message: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const result = getListError(error);
        setState({ ...initialState, status: result.status, message: result.message });
      })
      .finally(() => activeControllers.delete(controller));
    return () => {
      controller.abort();
      activeControllers.delete(controller);
    };
  }, [retryCount]);

  async function loadMore() {
    if (state.status !== 'success' || state.loadingMore || !state.nextCursor) return;
    const cursor = state.nextCursor;
    const controller = new AbortController();
    controllers.current.add(controller);
    setState((current) => ({ ...current, loadingMore: true, loadMoreError: null }));
    try {
      const page = await listAccessibilityEvaluations({ limit: PAGE_SIZE, cursor, signal: controller.signal });
      if (controller.signal.aborted) return;
      setState((current) => current.status === 'success'
        ? { ...current, evaluations: appendUnique(current.evaluations, page.evaluations), nextCursor: page.nextCursor, loadingMore: false, loadMoreError: null }
        : current);
    } catch {
      if (controller.signal.aborted) return;
      setState((current) => current.status === 'success'
        ? { ...current, loadingMore: false, loadMoreError: 'Unable to load more controlled accessibility evaluations.' }
        : current);
    } finally {
      controllers.current.delete(controller);
    }
  }

  function retry() {
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    setState({ ...initialState, status: 'loading' });
    setRetryCount((count) => count + 1);
  }

  function goHome() { router.replace('/'); }

  function renderState() {
    if (state.status === 'loading') return <View accessibilityLiveRegion="polite" style={styles.centerContent}><ActivityIndicator color="#2563EB" size="large" /><Text accessibilityRole="header" style={styles.stateTitle}>Loading controlled accessibility evaluations...</Text></View>;
    if (state.status === 'unavailable') return <View style={styles.centerContent}><Text accessibilityRole="header" style={styles.stateTitle}>Controlled accessibility evaluations are unavailable.</Text><Text accessibilityLiveRegion="polite" style={styles.message}>{state.message}</Text><Pressable accessibilityLabel="Retry loading controlled accessibility evaluations" accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}><Text style={styles.buttonText}>Retry</Text></Pressable></View>;
    if (state.status === 'error') return <View style={styles.centerContent}><Text accessibilityRole="header" style={styles.stateTitle}>Unable to load controlled accessibility evaluations.</Text><Text accessibilityLiveRegion="polite" style={styles.message}>{state.message}</Text><Pressable accessibilityLabel="Retry loading controlled accessibility evaluations" accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}><Text style={styles.buttonText}>Retry</Text></Pressable></View>;
    const visibleEvaluations = state.evaluations.filter((evaluation) => sourceFilter === 'all' || evaluation.provenance === sourceFilter);
    if (state.evaluations.length === 0) return <View style={styles.emptyState}><Text accessibilityRole="header" style={styles.stateTitle}>No controlled accessibility evaluations yet.</Text><Text style={styles.message}>Run an approved controlled accessibility fixture through the authenticated developer workflow first.</Text></View>;
    if (visibleEvaluations.length === 0) return <View style={styles.emptyState}><Text accessibilityRole="header" style={styles.stateTitle}>No evaluations match this source.</Text></View>;
    return <View>{visibleEvaluations.map((evaluation) => <EvaluationCard evaluation={evaluation} key={evaluation.id} onPress={() => router.push({ pathname: '/accessibility-evaluations/[id]', params: { id: evaluation.id } })} />)}{state.nextCursor ? <View style={styles.loadMoreContainer}>{state.loadMoreError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{state.loadMoreError}</Text> : null}<Pressable accessibilityLabel={state.loadingMore ? 'Loading more controlled accessibility evaluations' : 'Load more controlled accessibility evaluations'} accessibilityRole="button" accessibilityState={{ busy: state.loadingMore, disabled: state.loadingMore }} disabled={state.loadingMore} onPress={() => void loadMore()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>{state.loadingMore ? <ActivityIndicator color="#2563EB" /> : null}<Text style={styles.secondaryButtonText}>{state.loadingMore ? 'Loading...' : 'Load More'}</Text></Pressable></View> : null}</View>;
  }

  return <View accessibilityRole={"main" as never} style={styles.container}><Stack.Screen options={{ title: 'Controlled Accessibility Evaluations' }} /><ScrollView contentContainerStyle={styles.content}><Text accessibilityRole="header" style={styles.pageTitle}>Controlled Accessibility Evaluations</Text><Text style={styles.provenanceNotice}>These are automated accessibility evaluations with explicit source attribution.{"\n"}They are separate from SiteProbe&apos;s synthetic public scan history.{"\n"}Viewing them does not run axe or start a scan.</Text><Text style={styles.disclaimer}>Automated accessibility checks are not equivalent to full WCAG conformance testing.</Text><View accessibilityRole={"tablist" as never} style={styles.filterRow}>{([['all', 'All'], ['real-site-smoke-test', 'Real-site Smoke Tests'], ['controlled-fixture', 'Controlled Fixtures']] as const).map(([value, label]) => <Pressable accessibilityRole={"tab" as never} accessibilityState={{ selected: sourceFilter === value }} key={value} onPress={() => setSourceFilter(value)} style={({ pressed }) => [styles.filterChip, sourceFilter === value && styles.filterChipSelected, pressed && styles.buttonPressed]}><Text style={[styles.filterChipText, sourceFilter === value && styles.filterChipTextSelected]}>{label}</Text></Pressable>)}</View>{renderState()}<Pressable accessibilityLabel="Back to Home" accessibilityRole="button" onPress={goHome} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}><Text style={styles.secondaryButtonText}>Back to Home</Text></Pressable></ScrollView></View>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7FAFC', flex: 1, paddingHorizontal: 24 },
  content: { alignSelf: 'center', flexGrow: 1, maxWidth: 520, paddingBottom: 40, paddingTop: 24, width: '100%' },
  pageTitle: { color: '#1A202C', fontSize: 30, fontWeight: '700' },
  provenanceNotice: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E', borderRadius: 10, borderWidth: 1, color: '#744210', fontSize: 15, lineHeight: 23, marginTop: 18, padding: 16 },
  disclaimer: { backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 10, borderWidth: 1, color: '#2A4365', fontSize: 15, lineHeight: 23, marginTop: 12, padding: 16 },
  centerContent: { alignItems: 'center', justifyContent: 'center', minHeight: 280, padding: 24 },
  stateTitle: { color: '#1A202C', fontSize: 22, fontWeight: '700', marginTop: 18, textAlign: 'center' },
  message: { color: '#4A5568', fontSize: 16, lineHeight: 24, marginTop: 18, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 16, padding: 18 },
  cardPressed: { opacity: 0.8 },
  requestedUrl: { color: '#1A202C', fontSize: 18, lineHeight: 25 },
  source: { color: '#2B6CB0', fontSize: 15, fontWeight: '700', marginTop: 12 },
  provenanceBadge: { alignSelf: 'flex-start', backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 999, borderWidth: 1, color: '#2A4365', fontSize: 13, fontWeight: '700', marginTop: 10, paddingHorizontal: 10, paddingVertical: 5 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  filterChip: { borderColor: '#CBD5E0', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  filterChipSelected: { backgroundColor: '#EBF8FF', borderColor: '#2563EB' },
  filterChipText: { color: '#4A5568', fontSize: 13, fontWeight: '600' },
  filterChipTextSelected: { color: '#1D4ED8' },
  timestamp: { color: '#4A5568', fontSize: 14, marginTop: 8 },
  summary: { color: '#2D3748', fontSize: 14, lineHeight: 22, marginTop: 12 },
  failureStatus: { color: '#9B2C2C', fontSize: 15, fontWeight: '700', lineHeight: 23, marginTop: 12 },
  cardAction: { color: '#2563EB', fontSize: 16, fontWeight: '700', marginTop: 16 },
  loadMoreContainer: { paddingTop: 20 },
  error: { color: '#C53030', fontSize: 14, lineHeight: 21, marginBottom: 8 },
  button: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 10, justifyContent: 'center', marginTop: 28, minHeight: 52, paddingHorizontal: 20 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: '#2563EB', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 52, paddingHorizontal: 20 },
  secondaryButtonText: { color: '#2563EB', fontSize: 16, fontWeight: '700' },
});
