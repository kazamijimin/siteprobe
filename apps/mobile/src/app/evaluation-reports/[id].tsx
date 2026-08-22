import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { EvaluationReportAttentionItem, EvaluationReportPublicResponse } from '@siteprobe/contracts';
import { getEvaluationReport } from '@/features/evaluation-reports/evaluation-report-api';
import { formatSeoProvenance, formatSeoProvenanceDescription } from '@/features/seo-evaluations/presentation';
import { ApiError } from '@/services/api/client';

type ReportState = { status: 'loading' } | { status: 'success'; report: EvaluationReportPublicResponse } | { status: 'notFound' } | { status: 'error' };

function unavailableLabel(reason: 'not-produced' | 'public-access-disabled') {
  return reason === 'public-access-disabled' ? 'Public access disabled' : 'Not produced for this run';
}

function DomainCard({ title, domain, summaryLines, onPress }: { title: string; domain: { available: boolean; evaluationId?: string; reason?: 'not-produced' | 'public-access-disabled' }; summaryLines?: string[]; onPress?: () => void }) {
  return <View style={[styles.domainCard, !domain.available && styles.domainUnavailable]}>
    <Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text>
    {domain.available ? <>{(summaryLines ?? []).map((line) => <Text key={line} style={styles.summaryLine}>{line}</Text>)}<Pressable accessibilityLabel={`View ${title} details`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.cardButton, pressed && styles.pressed]}><Text style={styles.cardButtonText}>View {title} Details</Text></Pressable></> : <Text style={styles.unavailableText}>{unavailableLabel(domain.reason!)}</Text>}
  </View>;
}

function attentionLabel(item: EvaluationReportAttentionItem) {
  if (item.source === 'accessibility' && item.severity === 'needsReview') return 'Needs review';
  if (item.source === 'accessibility') return item.impact ? `${item.impact[0].toUpperCase()}${item.impact.slice(1)}` : 'Accessibility';
  return item.severity === 'critical' ? 'Critical' : 'Warning';
}

function AttentionItem({ item }: { item: EvaluationReportAttentionItem }) {
  return <View style={styles.attentionItem}><View style={styles.attentionHeader}><Text style={styles.attentionSource}>{item.source === 'qa' ? 'Core QA' : item.source === 'accessibility' ? 'Accessibility' : 'SEO'}</Text><Text style={[styles.attentionSeverity, item.severity === 'critical' || item.severity === 'serious' ? styles.dangerText : item.severity === 'needsReview' ? styles.reviewText : styles.warningText]}>{attentionLabel(item)}</Text></View><Text style={styles.attentionTitle}>{item.title}</Text><Text style={styles.attentionDescription}>{item.description}</Text>{item.remediation ? <Text style={styles.attentionRemediation}>Next step: {item.remediation}</Text> : null}</View>;
}

function StateScreen({ heading, message, onBack, onRetry }: { heading: string; message?: string; onBack: () => void; onRetry?: () => void }) {
  return <View accessibilityRole={'main' as never} style={styles.container}><Stack.Screen options={{ title: 'Evaluation Report' }} /><View style={styles.stateContent}><Text accessibilityRole="header" style={styles.pageTitle}>{heading}</Text>{message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}{onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Retry</Text></Pressable> : null}<Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Back to Home</Text></Pressable></View></View>;
}

export default function EvaluationReportDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const validId = rawId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId) ? rawId : undefined;
  const [state, setState] = useState<ReportState>({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);
  const load = useCallback(async (id: string, signal: AbortSignal) => {
    try { const report = await getEvaluationReport(id, signal); if (!signal.aborted) setState({ status: 'success', report }); }
    catch (error) { if (!signal.aborted) setState({ status: error instanceof ApiError && error.code === 'NOT_FOUND' ? 'notFound' : 'error' }); }
  }, []);
  useEffect(() => { if (!validId) return; const controller = new AbortController(); void Promise.resolve().then(() => load(validId, controller.signal)); return () => controller.abort(); }, [load, retryCount, validId]);
  const goHome = () => router.replace('/');
  const retry = () => { setState({ status: 'loading' }); setRetryCount((count) => count + 1); };
  if (!validId) return <StateScreen heading="Evaluation report ID is invalid." onBack={goHome} />;
  if (state.status === 'loading') return <View accessibilityRole={'main' as never} style={styles.container}><Stack.Screen options={{ title: 'Evaluation Report' }} /><View style={styles.stateContent}><ActivityIndicator color="#2563EB" size="large" /><Text accessibilityRole="header" style={styles.pageTitle}>Loading evaluation report...</Text></View></View>;
  if (state.status === 'notFound') return <StateScreen heading="Evaluation report not found." message="The evaluation may be unavailable or its public read gate may be disabled." onBack={goHome} />;
  if (state.status === 'error') return <StateScreen heading="Unable to load evaluation report." message="Please try again." onBack={goHome} onRetry={retry} />;
  const { report } = state;
  const qaSummary = report.qa.available ? report.qa.summary : undefined;
  const accessibilitySummary = report.accessibility.available ? report.accessibility.summary : undefined;
  const seoSummary = report.seo.available ? report.seo.summary : undefined;
  return <View accessibilityRole={'main' as never} style={styles.container}><Stack.Screen options={{ title: 'Evaluation Report' }} /><ScrollView contentContainerStyle={styles.scrollContent}><View style={styles.content}>
    <Text accessibilityRole="header" style={styles.pageTitle}>Evaluation Report</Text>
    <Text style={styles.provenanceBadge}>{formatSeoProvenance(report.provenance)}</Text>
    <Text style={styles.notice}>{formatSeoProvenanceDescription(report.provenance)}{"\n"}This report aggregates persisted evaluations from one scanner run and does not start a scan.</Text>
    <Text accessibilityRole="header" style={styles.sectionTitle}>Target</Text>
    <View style={styles.sectionCard}><Text style={styles.detailLabel}>Requested URL</Text><Text selectable style={styles.detailValue}>{report.requestedUrl}</Text><Text style={styles.detailLabel}>Final URL</Text><Text selectable style={styles.detailValue}>{report.finalUrl ?? 'Not available'}</Text><Text style={styles.detailLabel}>Scanned</Text><Text style={styles.detailValue}>{new Date(report.scannedAt).toLocaleString()}</Text></View>
    <Text accessibilityRole="header" style={styles.sectionTitle}>Evaluation Overview</Text>
    <View style={styles.domainGrid}>
      <DomainCard title="QA" domain={report.qa} summaryLines={qaSummary ? [`Critical: ${qaSummary.critical}`, `Warnings: ${qaSummary.warnings}`, `Passed: ${qaSummary.passed}`, `Not applicable: ${qaSummary.notApplicable}`] : undefined} onPress={() => report.qa.available && router.push({ pathname: '/qa-evaluations/[id]', params: { id: report.qa.evaluationId } })} />
      <DomainCard title="Accessibility" domain={report.accessibility} summaryLines={accessibilitySummary ? [`Violation rules: ${accessibilitySummary.violationRules}`, `Affected nodes: ${accessibilitySummary.violationNodes}`, `Critical: ${accessibilitySummary.critical}`, `Serious: ${accessibilitySummary.serious}`, `Needs review: ${accessibilitySummary.needsReviewRules}`] : undefined} onPress={() => report.accessibility.available && router.push({ pathname: '/accessibility-evaluations/[id]', params: { id: report.accessibility.evaluationId } })} />
      <DomainCard title="SEO" domain={report.seo} summaryLines={seoSummary ? [`Passed: ${seoSummary.passed}`, `Warnings: ${seoSummary.warnings}`, `Not applicable: ${seoSummary.notApplicable}`] : undefined} onPress={() => report.seo.available && router.push({ pathname: '/seo-evaluations/[id]', params: { id: report.seo.evaluationId } })} />
    </View>
    <Text accessibilityRole="header" style={styles.sectionTitle}>Issues Requiring Attention</Text>
    {report.attentionItems.length ? report.attentionItems.map((item, index) => <AttentionItem item={item} key={`${item.source}-${item.ruleId}-${index}`} />) : <View style={styles.sectionCard}><Text style={styles.message}>No available evaluation reported an issue requiring attention.</Text></View>}
    <Text style={styles.disclaimer}>Automated accessibility checks are not equivalent to full WCAG conformance testing.</Text>
  </View></ScrollView></View>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7FAFC', flex: 1, paddingHorizontal: 24 }, scrollContent: { flexGrow: 1, paddingVertical: 24 }, content: { alignSelf: 'center', maxWidth: 1080, paddingBottom: 32, width: '100%' }, stateContent: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }, pageTitle: { color: '#1A202C', fontSize: 30, fontWeight: '700' }, provenanceBadge: { alignSelf: 'flex-start', backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 999, borderWidth: 1, color: '#2A4365', fontSize: 14, fontWeight: '700', marginTop: 14, paddingHorizontal: 12, paddingVertical: 6 }, notice: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E', borderRadius: 10, borderWidth: 1, color: '#744210', fontSize: 15, lineHeight: 23, marginTop: 18, padding: 16 }, sectionTitle: { color: '#1A202C', fontSize: 22, fontWeight: '700', marginTop: 28 }, sectionCard: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 18 }, detailLabel: { color: '#4A5568', fontSize: 14, fontWeight: '600', marginTop: 10 }, detailValue: { color: '#1A202C', fontSize: 16, lineHeight: 24, marginTop: 4 }, domainGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 }, domainCard: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, flexBasis: 300, flexGrow: 1, padding: 18 }, domainUnavailable: { backgroundColor: '#EDF2F7' }, cardTitle: { color: '#1A202C', fontSize: 20, fontWeight: '700' }, summaryLine: { color: '#2D3748', fontSize: 15, lineHeight: 23, marginTop: 8 }, unavailableText: { color: '#4A5568', fontSize: 15, lineHeight: 23, marginTop: 10 }, cardButton: { alignSelf: 'flex-start', borderColor: '#2563EB', borderRadius: 8, borderWidth: 1, marginTop: 16, paddingHorizontal: 12, paddingVertical: 9 }, cardButtonText: { color: '#1D4ED8', fontSize: 14, fontWeight: '700' }, attentionItem: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 10, borderWidth: 1, marginTop: 12, padding: 16 }, attentionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, attentionSource: { color: '#4A5568', fontSize: 13, fontWeight: '700' }, attentionSeverity: { fontSize: 13, fontWeight: '700' }, attentionTitle: { color: '#1A202C', fontSize: 17, fontWeight: '700', lineHeight: 24, marginTop: 8 }, attentionDescription: { color: '#2D3748', fontSize: 15, lineHeight: 22, marginTop: 6 }, attentionMeta: { color: '#4A5568', fontSize: 14, marginTop: 8 }, attentionRemediation: { backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 8, borderWidth: 1, color: '#2A4365', fontSize: 14, lineHeight: 21, marginTop: 10, padding: 10 }, disclaimer: { color: '#4A5568', fontSize: 14, lineHeight: 21, marginTop: 20 }, message: { color: '#4A5568', fontSize: 16, lineHeight: 24 }, primaryButton: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 10, justifyContent: 'center', marginTop: 28, minHeight: 52, paddingHorizontal: 20 }, primaryButtonText: { color: '#FFFFFF', fontWeight: '700' }, secondaryButton: { alignItems: 'center', borderColor: '#2563EB', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 52, paddingHorizontal: 20 }, secondaryButtonText: { color: '#2563EB', fontSize: 16, fontWeight: '700' }, pressed: { opacity: 0.8 }, warningText: { color: '#9B2C2C' }, dangerText: { color: '#9B2C2C' }, reviewText: { color: '#805AD5' },
});
