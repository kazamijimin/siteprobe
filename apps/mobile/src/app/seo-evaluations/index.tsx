import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { SeoEvaluationListItem } from '@siteprobe/contracts';
import { ApiError } from '@/services/api/client';
import { listSeoEvaluations } from '@/features/seo-evaluations/seo-evaluation-api';
import { formatSeoProvenance, formatSeoSummary, formatSeoTimestamp } from '@/features/seo-evaluations/presentation';
import { getUserFacingErrorMessage } from '@/services/api/errors';

const PAGE_SIZE = 20;
type SourceFilter = 'all' | 'real-site-smoke-test' | 'controlled-fixture';
type IndexState = { status: 'loading' | 'success' | 'unavailable' | 'error'; evaluations: SeoEvaluationListItem[]; nextCursor: string | null; loadingMore: boolean; loadMoreError: string | null; message: string | null };
const initialState: IndexState = { status: 'loading', evaluations: [], nextCursor: null, loadingMore: false, loadMoreError: null, message: null };

function appendUnique(current: SeoEvaluationListItem[], incoming: SeoEvaluationListItem[]) {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !ids.has(item.id))];
}

function listError(error: unknown) {
  if (error instanceof ApiError && error.status === 404) return { status: 'unavailable' as const, message: 'SEO evaluations are unavailable. This controlled development feature is not enabled on the SiteProbe API.' };
  return { status: 'error' as const, message: getUserFacingErrorMessage(error) };
}

function EvaluationCard({ evaluation, onPress }: { evaluation: SeoEvaluationListItem; onPress: () => void }) {
  return (
    <Pressable accessibilityHint="Opens this SEO evaluation" accessibilityLabel={`${evaluation.requestedUrl}, ${formatSeoProvenance(evaluation.provenance)}, ${formatSeoSummary(evaluation.summary)}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Text selectable style={styles.requestedUrl}>{evaluation.requestedUrl}</Text>
      <Text style={styles.provenanceBadge}>{formatSeoProvenance(evaluation.provenance)}</Text>
      <Text style={styles.timestamp}>Scanned: {formatSeoTimestamp(evaluation.scannedAt)}</Text>
      <Text style={styles.timestamp}>Persisted: {formatSeoTimestamp(evaluation.createdAt)}</Text>
      <Text style={styles.summary}>{formatSeoSummary(evaluation.summary)}</Text>
      <Text style={styles.cardAction}>View evaluation</Text>
    </Pressable>
  );
}

export default function SeoEvaluationIndexScreen() {
  const router = useRouter();
  const [state, setState] = useState<IndexState>(initialState);
  const [retryCount, setRetryCount] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    const controller = new AbortController();
    const activeControllers = controllers.current;
    activeControllers.add(controller);
    void listSeoEvaluations({ limit: PAGE_SIZE, signal: controller.signal }).then((page) => {
      if (controller.signal.aborted) return;
      setState({ status: 'success', evaluations: page.evaluations, nextCursor: page.nextCursor, loadingMore: false, loadMoreError: null, message: null });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const result = listError(error);
      setState({ ...initialState, status: result.status, message: result.message });
    }).finally(() => activeControllers.delete(controller));
    return () => { controller.abort(); activeControllers.delete(controller); };
  }, [retryCount]);

  async function loadMore() {
    if (state.status !== 'success' || state.loadingMore || !state.nextCursor) return;
    const controller = new AbortController();
    controllers.current.add(controller);
    setState((current) => ({ ...current, loadingMore: true, loadMoreError: null }));
    try {
      const page = await listSeoEvaluations({ limit: PAGE_SIZE, cursor: state.nextCursor, signal: controller.signal });
      if (controller.signal.aborted) return;
      setState((current) => current.status === 'success' ? { ...current, evaluations: appendUnique(current.evaluations, page.evaluations), nextCursor: page.nextCursor, loadingMore: false, loadMoreError: null } : current);
    } catch {
      if (!controller.signal.aborted) setState((current) => current.status === 'success' ? { ...current, loadingMore: false, loadMoreError: 'Unable to load more SEO evaluations.' } : current);
    } finally { controllers.current.delete(controller); }
  }

  function retry() { for (const controller of controllers.current) controller.abort(); controllers.current.clear(); setState({ ...initialState, status: 'loading' }); setRetryCount((count) => count + 1); }
  const visible = state.evaluations.filter((evaluation) => sourceFilter === 'all' || evaluation.provenance === sourceFilter);

  function renderState() {
    if (state.status === 'loading') return <View accessibilityLiveRegion="polite" style={styles.center}><ActivityIndicator color="#2563EB" size="large" /><Text accessibilityRole="header" style={styles.stateTitle}>Loading SEO evaluations...</Text></View>;
    if (state.status === 'unavailable' || state.status === 'error') return <View style={styles.center}><Text accessibilityRole="header" style={styles.stateTitle}>{state.status === 'unavailable' ? 'SEO evaluations are unavailable.' : 'Unable to load SEO evaluations.'}</Text><Text accessibilityLiveRegion="polite" style={styles.message}>{state.message}</Text><Pressable accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>Retry</Text></Pressable></View>;
    if (state.evaluations.length === 0) return <View style={styles.empty}><Text accessibilityRole="header" style={styles.stateTitle}>No SEO evaluations yet.</Text><Text style={styles.message}>Persist a controlled SEO evaluation through the authenticated internal workflow first.</Text></View>;
    if (visible.length === 0) return <View style={styles.empty}><Text accessibilityRole="header" style={styles.stateTitle}>No evaluations match this source.</Text></View>;
    return <View>{visible.map((evaluation) => <EvaluationCard evaluation={evaluation} key={evaluation.id} onPress={() => router.push({ pathname: '/seo-evaluations/[id]', params: { id: evaluation.id } })} />)}{state.nextCursor ? <View style={styles.loadMore}><Text accessibilityLiveRegion="polite" style={styles.error}>{state.loadMoreError}</Text><Pressable accessibilityRole="button" accessibilityState={{ busy: state.loadingMore, disabled: state.loadingMore }} disabled={state.loadingMore} onPress={() => void loadMore()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>{state.loadingMore ? <ActivityIndicator color="#2563EB" /> : null}<Text style={styles.secondaryButtonText}>{state.loadingMore ? 'Loading...' : 'Load More'}</Text></Pressable></View> : null}</View>;
  }

  return <View accessibilityRole={"main" as never} style={styles.container}><Stack.Screen options={{ title: 'SEO Evaluations' }} /><ScrollView contentContainerStyle={styles.content}><Text accessibilityRole="header" style={styles.pageTitle}>SEO Evaluations</Text><Text style={styles.notice}>These are persisted SEO evaluation snapshots with explicit source attribution.{"\n"}They are separate from SiteProbe&apos;s synthetic public scan history and do not start a scan.</Text><View accessibilityRole="tablist" style={styles.filterRow}>{([['all', 'All'], ['real-site-smoke-test', 'Real-site Smoke Tests'], ['controlled-fixture', 'Controlled Fixtures']] as const).map(([value, label]) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: sourceFilter === value }} key={value} onPress={() => setSourceFilter(value)} style={({ pressed }) => [styles.filter, sourceFilter === value && styles.filterSelected, pressed && styles.pressed]}><Text style={[styles.filterText, sourceFilter === value && styles.filterTextSelected]}>{label}</Text></Pressable>)}</View>{renderState()}<Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Back to Home</Text></Pressable></ScrollView></View>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7FAFC', flex: 1, paddingHorizontal: 24 }, content: { alignSelf: 'center', flexGrow: 1, maxWidth: 520, paddingBottom: 40, paddingTop: 24, width: '100%' }, pageTitle: { color: '#1A202C', fontSize: 30, fontWeight: '700' }, notice: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E', borderRadius: 10, borderWidth: 1, color: '#744210', fontSize: 15, lineHeight: 23, marginTop: 18, padding: 16 }, center: { alignItems: 'center', justifyContent: 'center', minHeight: 280, padding: 24 }, stateTitle: { color: '#1A202C', fontSize: 22, fontWeight: '700', marginTop: 18, textAlign: 'center' }, message: { color: '#4A5568', fontSize: 16, lineHeight: 24, marginTop: 18, textAlign: 'center' }, empty: { alignItems: 'center', paddingVertical: 48 }, card: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 16, padding: 18 }, pressed: { opacity: 0.8 }, requestedUrl: { color: '#1A202C', fontSize: 18, lineHeight: 25 }, provenanceBadge: { alignSelf: 'flex-start', backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 999, borderWidth: 1, color: '#2A4365', fontSize: 13, fontWeight: '700', marginTop: 10, paddingHorizontal: 10, paddingVertical: 5 }, timestamp: { color: '#4A5568', fontSize: 14, marginTop: 8 }, summary: { color: '#2D3748', fontSize: 14, lineHeight: 22, marginTop: 12 }, cardAction: { color: '#2563EB', fontSize: 16, fontWeight: '700', marginTop: 16 }, filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }, filter: { borderColor: '#CBD5E0', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 }, filterSelected: { backgroundColor: '#EBF8FF', borderColor: '#2563EB' }, filterText: { color: '#4A5568', fontSize: 13, fontWeight: '600' }, filterTextSelected: { color: '#1D4ED8' }, loadMore: { paddingTop: 20 }, error: { color: '#C53030', fontSize: 14, lineHeight: 21, marginBottom: 8 }, button: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 10, justifyContent: 'center', marginTop: 28, minHeight: 52, paddingHorizontal: 20 }, buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, secondaryButton: { alignItems: 'center', borderColor: '#2563EB', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 52, paddingHorizontal: 20 }, secondaryButtonText: { color: '#2563EB', fontSize: 16, fontWeight: '700' },
});
