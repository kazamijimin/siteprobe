import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { ControlledEvaluationProvenance, EvaluationReportListItem } from '@siteprobe/contracts';
import { ApiError } from '@/services/api/client';
import { getUserFacingErrorMessage } from '@/services/api/errors';
import { listEvaluationReports } from '@/features/evaluation-reports/evaluation-report-history-api';
import { formatSeoProvenance, formatSeoTimestamp } from '@/features/seo-evaluations/presentation';

const PAGE_SIZE = 20;
type SourceFilter = 'all' | ControlledEvaluationProvenance;
type IndexState = {
  status: 'loading' | 'success' | 'error';
  reports: EvaluationReportListItem[];
  nextCursor: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
  message: string | null;
};
const initialState: IndexState = { status: 'loading', reports: [], nextCursor: null, loadingMore: false, loadMoreError: null, message: null };

function appendUnique(current: EvaluationReportListItem[], incoming: EvaluationReportListItem[]): EvaluationReportListItem[] {
  const ids = new Set(current.map((report) => report.anchorEvaluationId));
  return [...current, ...incoming.filter((report) => !ids.has(report.anchorEvaluationId))];
}

function formatUnavailable(domain: { available: boolean; reason?: 'not-produced' | 'public-access-disabled' }): string {
  if (domain.available) return '';
  return domain.reason === 'public-access-disabled' ? 'Public access disabled' : 'Not produced for this run';
}

function formatQa(domain: EvaluationReportListItem['qa']): string {
  if (!domain.available) return formatUnavailable(domain);
  return `${domain.summary.passed} passed · ${domain.summary.warnings} warnings`;
}

function formatAccessibility(domain: EvaluationReportListItem['accessibility']): string {
  if (!domain.available) return formatUnavailable(domain);
  return `${domain.summary.violationRules} violation${domain.summary.violationRules === 1 ? '' : 's'} · ${domain.summary.needsReviewRules} needs review`;
}

function formatSeo(domain: EvaluationReportListItem['seo']): string {
  if (!domain.available) return formatUnavailable(domain);
  return `${domain.summary.passed} passed · ${domain.summary.warnings} warnings`;
}

function ReportCard({ report, onPress }: { report: EvaluationReportListItem; onPress: () => void }) {
  return (
    <Pressable
      accessibilityHint="Opens the unified evaluation report"
      accessibilityLabel={`${report.requestedUrl}, ${formatSeoProvenance(report.provenance)}, scanned ${formatSeoTimestamp(report.scannedAt)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Text selectable style={styles.requestedUrl}>{report.requestedUrl}</Text>
      {report.finalUrl && report.finalUrl !== report.requestedUrl ? <Text selectable style={styles.finalUrl}>→ {report.finalUrl}</Text> : null}
      <Text style={styles.provenanceBadge}>{formatSeoProvenance(report.provenance)}</Text>
      <Text style={styles.timestamp}>Scanned: {formatSeoTimestamp(report.scannedAt)}</Text>
      <Text style={styles.timestamp}>Persisted: {formatSeoTimestamp(report.createdAt)}</Text>
      <View style={styles.summaryGrid}>
        <View style={styles.summaryBlock}><Text style={styles.summaryLabel}>QA</Text><Text style={styles.summaryValue}>{formatQa(report.qa)}</Text></View>
        <View style={styles.summaryBlock}><Text style={styles.summaryLabel}>Accessibility</Text><Text style={styles.summaryValue}>{formatAccessibility(report.accessibility)}</Text></View>
        <View style={styles.summaryBlock}><Text style={styles.summaryLabel}>SEO</Text><Text style={styles.summaryValue}>{formatSeo(report.seo)}</Text></View>
      </View>
      <Text style={styles.cardAction}>View Unified Report</Text>
    </Pressable>
  );
}

function getListError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return 'Unified reports are unavailable. Enable at least one evaluation public-read feature to discover persisted reports.';
  return getUserFacingErrorMessage(error);
}

export default function EvaluationReportIndexScreen() {
  const router = useRouter();
  const [state, setState] = useState<IndexState>(initialState);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [retryCount, setRetryCount] = useState(0);
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    const activeControllers = controllers.current;
    const controller = new AbortController();
    activeControllers.add(controller);
    void listEvaluationReports({ source: sourceFilter === 'all' ? undefined : sourceFilter, limit: PAGE_SIZE, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setState({ status: 'success', reports: page.reports, nextCursor: page.nextCursor, loadingMore: false, loadMoreError: null, message: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ ...initialState, status: 'error', message: getListError(error) });
      })
      .finally(() => activeControllers.delete(controller));
    return () => { controller.abort(); activeControllers.delete(controller); };
  }, [retryCount, sourceFilter]);

  async function loadMore() {
    if (state.status !== 'success' || state.loadingMore || !state.nextCursor) return;
    const controller = new AbortController();
    controllers.current.add(controller);
    setState((current) => ({ ...current, loadingMore: true, loadMoreError: null }));
    try {
      const page = await listEvaluationReports({ source: sourceFilter === 'all' ? undefined : sourceFilter, limit: PAGE_SIZE, cursor: state.nextCursor, signal: controller.signal });
      if (controller.signal.aborted) return;
      setState((current) => current.status === 'success' ? { ...current, reports: appendUnique(current.reports, page.reports), nextCursor: page.nextCursor, loadingMore: false, loadMoreError: null } : current);
    } catch {
      if (!controller.signal.aborted) setState((current) => current.status === 'success' ? { ...current, loadingMore: false, loadMoreError: 'Unable to load more unified reports.' } : current);
    } finally { controllers.current.delete(controller); }
  }

  function retry() {
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    setState({ ...initialState, status: 'loading' });
    setRetryCount((count) => count + 1);
  }

  const filterOptions: [SourceFilter, string][] = [
    ['all', 'All'],
    ['real-site-smoke-test', 'Real-site Smoke Tests'],
    ['controlled-fixture', 'Controlled Fixtures'],
    ['legacy-unknown', 'Legacy / Unknown'],
  ];

  function renderState() {
    if (state.status === 'loading') return <View accessibilityLiveRegion="polite" style={styles.center}><ActivityIndicator color="#2563EB" size="large" /><Text accessibilityRole="header" style={styles.stateTitle}>Loading unified reports...</Text></View>;
    if (state.status === 'error') return <View style={styles.center}><Text accessibilityRole="header" style={styles.stateTitle}>Unable to load unified reports.</Text><Text accessibilityLiveRegion="polite" style={styles.message}>{state.message}</Text><Pressable accessibilityLabel="Retry loading unified reports" accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Retry</Text></Pressable></View>;
    if (state.reports.length === 0) return <View style={styles.empty}><Text accessibilityRole="header" style={styles.stateTitle}>No evaluation reports yet.</Text><Text style={styles.message}>Unified reports appear when persisted QA, Accessibility, or SEO evaluations are available.</Text></View>;
    return <View>{state.reports.map((report) => <ReportCard key={report.anchorEvaluationId} report={report} onPress={() => router.push({ pathname: '/evaluation-reports/[id]', params: { id: report.anchorEvaluationId } })} />)}{state.nextCursor ? <View style={styles.loadMore}><Text accessibilityLiveRegion="polite" style={styles.error}>{state.loadMoreError}</Text><Pressable accessibilityLabel={state.loadingMore ? 'Loading more unified reports' : 'Load more unified reports'} accessibilityRole="button" accessibilityState={{ busy: state.loadingMore, disabled: state.loadingMore }} disabled={state.loadingMore} onPress={() => void loadMore()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>{state.loadingMore ? <ActivityIndicator color="#2563EB" /> : null}<Text style={styles.secondaryButtonText}>{state.loadingMore ? 'Loading...' : 'Load More'}</Text></Pressable></View> : null}</View>;
  }

  return <View accessibilityRole={'main' as never} style={styles.container}><Stack.Screen options={{ title: 'Unified Reports' }} /><ScrollView contentContainerStyle={styles.content}><Text accessibilityRole="header" style={styles.pageTitle}>Unified Reports</Text><Text style={styles.notice}>View combined QA, Accessibility, and SEO results from one persisted evaluation run. Synthetic public scans remain separate and do not appear here.</Text><View accessibilityRole={'tablist' as never} style={styles.filterRow}>{filterOptions.map(([value, label]) => <Pressable accessibilityRole={'tab' as never} accessibilityState={{ selected: sourceFilter === value }} key={value} onPress={() => { setState({ ...initialState, status: 'loading' }); setSourceFilter(value); }} style={({ pressed }) => [styles.filterChip, sourceFilter === value && styles.filterChipSelected, pressed && styles.pressed]}><Text style={[styles.filterText, sourceFilter === value && styles.filterTextSelected]}>{label}</Text></Pressable>)}</View>{renderState()}</ScrollView></View>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7FAFC', flex: 1, paddingHorizontal: 24 }, content: { alignSelf: 'center', flexGrow: 1, maxWidth: 760, paddingBottom: 40, paddingTop: 24, width: '100%' }, pageTitle: { color: '#1A202C', fontSize: 30, fontWeight: '700' }, notice: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E', borderRadius: 10, borderWidth: 1, color: '#744210', fontSize: 15, lineHeight: 23, marginTop: 18, padding: 16 }, filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }, filterChip: { borderColor: '#CBD5E0', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 }, filterChipSelected: { backgroundColor: '#EBF8FF', borderColor: '#2563EB' }, filterText: { color: '#4A5568', fontSize: 13, fontWeight: '600' }, filterTextSelected: { color: '#1D4ED8' }, center: { alignItems: 'center', justifyContent: 'center', minHeight: 280, padding: 24 }, stateTitle: { color: '#1A202C', fontSize: 22, fontWeight: '700', marginTop: 18, textAlign: 'center' }, message: { color: '#4A5568', fontSize: 16, lineHeight: 24, marginTop: 18, textAlign: 'center' }, empty: { alignItems: 'center', paddingVertical: 48 }, card: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 16, padding: 18 }, pressed: { opacity: 0.8 }, requestedUrl: { color: '#1A202C', fontSize: 19, lineHeight: 26 }, finalUrl: { color: '#4A5568', fontSize: 15, lineHeight: 23, marginTop: 4 }, provenanceBadge: { alignSelf: 'flex-start', backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 999, borderWidth: 1, color: '#2A4365', fontSize: 13, fontWeight: '700', marginTop: 10, paddingHorizontal: 10, paddingVertical: 5 }, timestamp: { color: '#4A5568', fontSize: 14, marginTop: 8 }, summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }, summaryBlock: { flexBasis: 180, flexGrow: 1 }, summaryLabel: { color: '#4A5568', fontSize: 14, fontWeight: '700' }, summaryValue: { color: '#2D3748', fontSize: 15, lineHeight: 22, marginTop: 4 }, cardAction: { color: '#2563EB', fontSize: 16, fontWeight: '700', marginTop: 18 }, loadMore: { paddingTop: 20 }, error: { color: '#C53030', fontSize: 14, lineHeight: 21, marginBottom: 8 }, primaryButton: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 10, justifyContent: 'center', marginTop: 28, minHeight: 52, paddingHorizontal: 20 }, primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, secondaryButton: { alignItems: 'center', borderColor: '#2563EB', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: 20 }, secondaryButtonText: { color: '#2563EB', fontSize: 16, fontWeight: '700' },
});
