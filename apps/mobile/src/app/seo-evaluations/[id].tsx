import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { seoEvaluationIdParamsSchema, type SeoEvaluationPublicResponse, type SeoEvidence, type SeoFinding } from '@siteprobe/contracts';
import { getSeoEvaluation } from '@/features/seo-evaluations/seo-evaluation-api';
import { formatSeoProvenance, formatSeoProvenanceDescription, formatSeoSeverity, formatSeoStatus, formatSeoTimestamp, seoEvidenceSummary, seoRemediation, seoRuleTitle } from '@/features/seo-evaluations/presentation';
import { ApiError } from '@/services/api/client';

type DetailState = { status: 'loading' } | { status: 'success'; evaluation: SeoEvaluationPublicResponse } | { status: 'notFound' } | { status: 'error' };

function DetailRow({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text selectable={selectable} style={styles.detailValue}>{value}</Text></View>;
}

function EvidenceDetails({ evidence }: { evidence: SeoEvidence }) {
  const rows: [string, string][] = [];
  if (evidence.kind === 'title' || evidence.kind === 'description') rows.push(['Value', evidence.value ?? 'Not available'], ['Character count', String(evidence.characterCount)], ['Truncated', evidence.truncated ? 'Yes' : 'No']);
  if (evidence.kind === 'canonical' || evidence.kind === 'htmlLang' || evidence.kind === 'viewport') rows.push(['Value', evidence.value ?? 'Not available'], ['Truncated', evidence.truncated ? 'Yes' : 'No']);
  if (evidence.kind === 'headings') rows.push(['H1 count', String(evidence.h1Count)], ['Heading counts', Object.entries(evidence.headingCounts).map(([key, value]) => `${key}: ${value}`).join(' · ')]);
  if (evidence.kind === 'images') rows.push(['Image count', String(evidence.imageCount)], ['Missing alt count', String(evidence.missingAltCount)], ['Samples', evidence.samples.length ? evidence.samples.join(' · ') : 'None']);
  return <View style={styles.evidenceDetails}>{rows.map(([label, value]) => <DetailRow key={label} label={label} value={value} selectable />)}</View>;
}

function FindingCard({ finding }: { finding: SeoFinding }) {
  const [expanded, setExpanded] = useState(false);
  const remediation = seoRemediation(finding);
  return <View style={[styles.findingCard, finding.status === 'failed' && styles.findingWarning]}>
    <Text accessibilityRole="header" style={styles.findingTitle}>{seoRuleTitle(finding.ruleId)}</Text>
    <Text style={[styles.findingStatus, finding.status === 'failed' && styles.warningText]}>Status: {formatSeoStatus(finding.status)} · {formatSeoSeverity(finding.severity)}</Text>
    <Text style={styles.description}>{finding.description}</Text>
    <Text style={styles.evidenceSummary}>{seoEvidenceSummary(finding.evidence)}</Text>
    {remediation ? <Text style={styles.remediation}>Next step: {remediation}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.technicalToggle, pressed && styles.pressed]}><Text style={styles.technicalToggleText}>{expanded ? 'Hide technical details' : 'Show technical details'}</Text></Pressable>
    {expanded ? <EvidenceDetails evidence={finding.evidence} /> : null}
  </View>;
}

function StateScreen({ heading, message, onBack, onRetry }: { heading: string; message?: string; onBack: () => void; onRetry?: () => void }) {
  return <View accessibilityRole={"main" as never} style={styles.container}><Stack.Screen options={{ title: 'SEO Evaluation' }} /><View style={styles.stateContent}><Text accessibilityRole="header" style={styles.pageTitle}>{heading}</Text>{message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}{onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Retry</Text></Pressable> : null}<Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Back to Home</Text></Pressable></View></View>;
}

export default function SeoEvaluationDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const parsedId = rawId ? seoEvaluationIdParamsSchema.safeParse({ id: rawId }) : null;
  const evaluationId = parsedId?.success ? parsedId.data.id : undefined;
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);
  const load = useCallback(async (id: string, signal: AbortSignal) => {
    try { const evaluation = await getSeoEvaluation(id, signal); if (!signal.aborted) setState({ status: 'success', evaluation }); }
    catch (error) { if (!signal.aborted) setState({ status: error instanceof ApiError && error.code === 'NOT_FOUND' ? 'notFound' : 'error' }); }
  }, []);
  useEffect(() => { if (!evaluationId) return; const controller = new AbortController(); void Promise.resolve().then(() => load(evaluationId, controller.signal)); return () => controller.abort(); }, [evaluationId, load, retryCount]);
  const goHome = () => router.replace('/');
  const retry = () => { setState({ status: 'loading' }); setRetryCount((count) => count + 1); };
  if (!rawId || !parsedId?.success) return <StateScreen heading="SEO evaluation ID is invalid." onBack={goHome} />;
  if (state.status === 'loading') return <View accessibilityRole={"main" as never} style={styles.container}><Stack.Screen options={{ title: 'SEO Evaluation' }} /><View style={styles.stateContent}><ActivityIndicator color="#2563EB" size="large" /><Text accessibilityRole="header" style={styles.pageTitle}>Loading SEO evaluation...</Text></View></View>;
  if (state.status === 'notFound') return <StateScreen heading="SEO evaluation not found." onBack={goHome} />;
  if (state.status === 'error') return <StateScreen heading="Unable to load SEO evaluation." message="Please try again." onBack={goHome} onRetry={retry} />;
  const { evaluation } = state;
  const result = evaluation.evaluation;
  return <View accessibilityRole={"main" as never} style={styles.container}><Stack.Screen options={{ title: 'SEO Evaluation' }} /><ScrollView contentContainerStyle={styles.scrollContent}><View style={styles.content}>
    <Text accessibilityRole="header" style={styles.pageTitle}>SEO Evaluation</Text>
    <Text style={styles.provenanceBadge}>{formatSeoProvenance(evaluation.provenance)}</Text>
    <Text style={styles.notice}>{formatSeoProvenanceDescription(evaluation.provenance)}{"\n"}It is separate from SiteProbe&apos;s current synthetic public scan workflow.</Text>
    <Text accessibilityRole="header" style={styles.sectionTitle}>Target information</Text>
    <View style={styles.sectionCard}><DetailRow label="Requested URL" value={evaluation.requestedUrl} selectable /><DetailRow label="Final URL" value={evaluation.finalUrl ?? 'Not available'} selectable /></View>
    <Text accessibilityRole="header" style={styles.sectionTitle}>Summary</Text>
    <View style={styles.summaryGrid}><SummaryCell label="Passed" value={result.summary.passed} /><SummaryCell label="Warnings" value={result.summary.warnings} warning={result.summary.warnings > 0} /><SummaryCell label="Not applicable" value={result.summary.notApplicable} /></View>
    {result.status === 'notApplicable' ? <Text style={styles.message}>SEO analysis was not performed because navigation failed.</Text> : null}
    <Text accessibilityRole="header" style={styles.sectionTitle}>Findings</Text>
    <Text style={styles.message}>Each finding explains what happened and why it matters. Technical evidence is expandable.</Text>
    {result.findings.map((finding) => <FindingCard finding={finding} key={finding.ruleId} />)}
    <Text accessibilityRole="header" style={styles.sectionTitle}>Technical details</Text>
    <View style={styles.sectionCard}><DetailRow label="SEO Evaluation ID" value={evaluation.id} selectable /><DetailRow label="Schema" value={`v${evaluation.schemaVersion}`} /><DetailRow label="Evaluator" value={`v${evaluation.evaluatorVersion}`} /><DetailRow label="Scanned" value={formatSeoTimestamp(evaluation.scannedAt)} /><DetailRow label="Persisted" value={formatSeoTimestamp(evaluation.createdAt)} /></View>
    {evaluation.relatedQaEvaluationId ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/qa-evaluations/[id]', params: { id: evaluation.relatedQaEvaluationId! } })} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>View Core QA Evaluation</Text></Pressable> : null}
    {evaluation.relatedAccessibilityEvaluationId ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/accessibility-evaluations/[id]', params: { id: evaluation.relatedAccessibilityEvaluationId! } })} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>View Accessibility Evaluation</Text></Pressable> : null}
    <Pressable accessibilityRole="button" onPress={goHome} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Back to Home</Text></Pressable>
  </View></ScrollView></View>;
}

function SummaryCell({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) { return <View accessible accessibilityLabel={`${label}: ${value}`} style={[styles.summaryCell, warning && styles.summaryWarning]}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7FAFC', flex: 1, paddingHorizontal: 24 }, scrollContent: { flexGrow: 1, paddingVertical: 24 }, content: { alignSelf: 'center', maxWidth: 520, paddingBottom: 24, width: '100%' }, stateContent: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }, pageTitle: { color: '#1A202C', fontSize: 30, fontWeight: '700' }, provenanceBadge: { alignSelf: 'flex-start', backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 999, borderWidth: 1, color: '#2A4365', fontSize: 14, fontWeight: '700', marginTop: 14, paddingHorizontal: 12, paddingVertical: 6 }, notice: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E', borderRadius: 10, borderWidth: 1, color: '#744210', fontSize: 15, lineHeight: 23, marginTop: 18, padding: 16 }, sectionTitle: { color: '#1A202C', fontSize: 22, fontWeight: '700', marginTop: 28 }, sectionCard: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 18 }, detailRow: { marginTop: 12 }, detailLabel: { color: '#4A5568', fontSize: 14, fontWeight: '600' }, detailValue: { color: '#1A202C', fontSize: 16, lineHeight: 24, marginTop: 5 }, summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, summaryCell: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 10, borderWidth: 1, flexBasis: '30%', flexGrow: 1, minHeight: 82, padding: 14 }, summaryWarning: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E' }, summaryLabel: { color: '#4A5568', fontSize: 14, fontWeight: '600' }, summaryValue: { color: '#1A202C', fontSize: 26, fontWeight: '700', marginTop: 6 }, message: { color: '#4A5568', fontSize: 16, lineHeight: 24, marginTop: 14 }, findingCard: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 14, padding: 18 }, findingWarning: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E' }, findingTitle: { color: '#1A202C', fontSize: 18, fontWeight: '700', lineHeight: 25 }, findingStatus: { color: '#2B6CB0', fontSize: 15, fontWeight: '700', marginTop: 8 }, warningText: { color: '#9B2C2C' }, description: { color: '#2D3748', fontSize: 16, lineHeight: 24, marginTop: 10 }, evidenceSummary: { color: '#4A5568', fontSize: 15, lineHeight: 23, marginTop: 10 }, remediation: { backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 8, borderWidth: 1, color: '#2A4365', fontSize: 14, lineHeight: 21, marginTop: 14, padding: 10 }, technicalToggle: { alignSelf: 'flex-start', borderColor: '#CBD5E0', borderRadius: 8, borderWidth: 1, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8 }, technicalToggleText: { color: '#1D4ED8', fontSize: 14, fontWeight: '700' }, evidenceDetails: { marginTop: 8 }, evidenceDetailsText: { color: '#1A202C', fontSize: 14, lineHeight: 21, marginTop: 8 }, primaryButton: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 10, justifyContent: 'center', marginTop: 28, minHeight: 52, paddingHorizontal: 20 }, primaryButtonText: { color: '#FFFFFF', fontWeight: '700' }, secondaryButton: { alignItems: 'center', borderColor: '#2563EB', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 52, paddingHorizontal: 20 }, secondaryButtonText: { color: '#2563EB', fontSize: 16, fontWeight: '700' }, pressed: { opacity: 0.8 },
});
