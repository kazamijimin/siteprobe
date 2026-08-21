import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { accessibilityEvaluationIdParamsSchema, type AccessibilityEvaluationPublicResponse, type AccessibilityCompletedEvaluation, type AccessibilityRuleResult } from '@siteprobe/contracts';
import { getAccessibilityEvaluation } from '@/features/accessibility-evaluations/accessibility-evaluation-api';
import { accessibilityStatusMessage, formatAccessibilityImpact, formatAccessibilityProvenance, formatAccessibilityProvenanceDescription, formatAccessibilityTimestamp, truncationMessage } from '@/features/accessibility-evaluations/presentation';
import { ApiError } from '@/services/api/client';

type DetailState =
  | { status: 'loading' }
  | { status: 'success'; evaluation: AccessibilityEvaluationPublicResponse }
  | { status: 'notFound' }
  | { status: 'error' };

function DetailRow({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text selectable={selectable} style={styles.detailValue}>{value}</Text></View>;
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.summaryCell}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

function RuleCard({ rule }: { rule: AccessibilityRuleResult }) {
  const [expanded, setExpanded] = useState(false);
  const remediation = rule.ruleId === 'color-contrast'
    ? 'Review the reported foreground/background pair and raise the contrast ratio to the threshold shown in the failure details. Image-backed areas still require manual review.'
    : 'Review the affected elements against the rule guidance shown above.';
  return (
    <View style={styles.ruleCard}>
      <Text accessibilityRole="header" style={styles.ruleTitle}>{rule.help}</Text>
      <Text style={styles.ruleMeta}>Rule: {rule.ruleId}</Text>
      <Text style={styles.ruleMeta}>Impact: {formatAccessibilityImpact(rule.impact)}</Text>
      <Text style={styles.ruleMeta}>Affected nodes: {rule.affectedNodeCount}{rule.affectedNodeCountCapped ? ' (reporting cap reached)' : ''}</Text>
      <Text style={styles.remediation}>Next step: {remediation}</Text>
      {rule.samples.length > 0 ? (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.technicalToggle, pressed && styles.pressed]}><Text style={styles.technicalToggleText}>{expanded ? 'Hide technical samples' : 'Show technical samples'}</Text></Pressable>
          {expanded ? <View style={styles.sampleList}>{rule.samples.map((sample, index) => <Text selectable key={`${rule.ruleId}-${index}`} style={styles.sample}>{`Target: ${sample.target.length > 0 ? sample.target.join(' >>> ') : 'Not available'}\nFailure: ${sample.failureSummary ?? 'Not available'}`}</Text>)}</View> : null}
        </>
      ) : <Text style={styles.muted}>No normalized samples recorded.</Text>}
      {rule.samplesTruncated ? <Text style={styles.note}>Only a subset of affected nodes is shown.</Text> : null}
    </View>
  );
}

function StateScreen({ heading, message, onBack, onRetry }: { heading: string; message?: string; onBack: () => void; onRetry?: () => void }) {
  return (
    <View accessibilityRole={"main" as never} style={styles.container}>
      <Stack.Screen options={{ title: 'Controlled Accessibility Evaluation' }} />
      <View style={styles.stateContent}>
        <Text accessibilityRole="header" style={styles.pageTitle}>{heading}</Text>
        {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
        {onRetry ? <Pressable accessibilityLabel="Retry loading controlled accessibility evaluation" accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Retry</Text></Pressable> : null}
        <Pressable accessibilityLabel="Back to Home" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Back to Home</Text></Pressable>
      </View>
    </View>
  );
}

function CompletedContent({ evaluation }: { evaluation: AccessibilityEvaluationPublicResponse }) {
  if (evaluation.evaluation.status !== 'completed') return null;
  const result: AccessibilityCompletedEvaluation = evaluation.evaluation;
  const warning = truncationMessage(result);
  return (
    <>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Summary</Text>
      <View style={styles.summaryGrid}>
        <SummaryCell label="Violation rules" value={result.summary.violationRules} />
        <SummaryCell label="Affected nodes" value={result.summary.violationNodes} />
        <SummaryCell label="Critical" value={result.summary.critical} />
        <SummaryCell label="Serious" value={result.summary.serious} />
        <SummaryCell label="Moderate" value={result.summary.moderate} />
        <SummaryCell label="Minor" value={result.summary.minor} />
        <SummaryCell label="Unknown impact" value={result.summary.unknownImpact} />
        <SummaryCell label="Needs-review rules" value={result.summary.needsReviewRules} />
        <SummaryCell label="Needs-review nodes" value={result.summary.needsReviewNodes} />
      </View>
      {warning ? <Text accessibilityLiveRegion="polite" style={styles.warning}>{warning}</Text> : null}
      <Text accessibilityRole="header" style={styles.sectionTitle}>Violations</Text>
      {result.violations.length === 0 ? <Text style={styles.message}>{accessibilityStatusMessage(result)}</Text> : result.violations.map((rule) => <RuleCard key={rule.ruleId} rule={rule} />)}
      <Text accessibilityRole="header" style={styles.sectionTitle}>Needs Review</Text>
      <Text style={styles.supportingText}>These automated checks could not determine a definitive result and may require human review.</Text>
      {result.needsReview.length === 0 ? <Text style={styles.muted}>No needs-review checks were recorded.</Text> : result.needsReview.map((rule) => <RuleCard key={`review-${rule.ruleId}`} rule={rule} />)}
    </>
  );
}

export default function AccessibilityEvaluationDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const parsedId = rawId ? accessibilityEvaluationIdParamsSchema.safeParse({ id: rawId }) : null;
  const evaluationId = parsedId?.success ? parsedId.data.id : undefined;
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);

  const load = useCallback(async (id: string, signal: AbortSignal) => {
    try {
      const evaluation = await getAccessibilityEvaluation(id, signal);
      if (!signal.aborted) setState({ status: 'success', evaluation });
    } catch (error) {
      if (signal.aborted) return;
      setState({ status: error instanceof ApiError && error.code === 'NOT_FOUND' ? 'notFound' : 'error' });
    }
  }, []);

  useEffect(() => {
    if (!evaluationId) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load(evaluationId, controller.signal);
      return undefined;
    });
    return () => controller.abort();
  }, [evaluationId, load, retryCount]);

  const goHome = () => router.replace('/');
  const retry = () => { setState({ status: 'loading' }); setRetryCount((count) => count + 1); };
  if (!rawId || !parsedId?.success) return <StateScreen heading="Controlled accessibility evaluation ID is invalid." onBack={goHome} />;
  if (state.status === 'loading') return <View accessibilityRole={"main" as never} style={styles.container}><Stack.Screen options={{ title: 'Controlled Accessibility Evaluation' }} /><View accessibilityLiveRegion="polite" style={styles.stateContent}><ActivityIndicator color="#2563EB" size="large" /><Text accessibilityRole="header" style={styles.pageTitle}>Loading controlled accessibility evaluation...</Text></View></View>;
  if (state.status === 'notFound') return <StateScreen heading="Controlled accessibility evaluation not found." onBack={goHome} />;
  if (state.status === 'error') return <StateScreen heading="Unable to load controlled accessibility evaluation." message="Please try again." onBack={goHome} onRetry={retry} />;

  const { evaluation } = state;
  const analysisStatus = evaluation.evaluation.status === 'notApplicable'
    ? 'Not applicable — navigation failed'
    : 'Completed';
  return (
    <View accessibilityRole={"main" as never} style={styles.container}>
      <Stack.Screen options={{ title: 'Controlled Accessibility Evaluation' }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.pageTitle}>Controlled Accessibility Evaluation</Text>
          <Text style={styles.provenanceBadge}>{formatAccessibilityProvenance(evaluation.provenance)}</Text>
          <Text style={styles.provenanceNotice}>{formatAccessibilityProvenanceDescription(evaluation.provenance)}{"\n"}It is separate from SiteProbe&apos;s current synthetic public scan workflow.</Text>
          <Text style={styles.disclaimer}>Automated accessibility checks are not equivalent to full WCAG conformance testing.</Text>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Target information</Text>
          <View style={styles.sectionCard}><DetailRow label="Requested URL" value={evaluation.requestedUrl} selectable /><DetailRow label="Final URL" value={evaluation.finalUrl ?? 'Not available'} selectable /></View>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Analysis status</Text>
          <Text accessibilityLiveRegion="polite" style={styles.statusText}>{analysisStatus}</Text>
          {evaluation.evaluation.status === 'notApplicable' ? <Text style={styles.message}>Accessibility analysis was not performed because navigation failed.</Text> : <CompletedContent evaluation={evaluation} />}
          <Text accessibilityRole="header" style={styles.sectionTitle}>Engine and ruleset</Text>
          <View style={styles.sectionCard}><DetailRow label="Engine" value={`${evaluation.engine.engine} ${evaluation.engine.engineVersion}`} /><DetailRow label="Adapter" value={`${evaluation.engine.adapter} ${evaluation.engine.adapterVersion}`} /><DetailRow label="Ruleset tags" value={evaluation.engine.rulesetTags.join(', ')} /></View>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Technical details</Text>
          <View style={styles.sectionCard}><DetailRow label="Accessibility Evaluation ID" value={evaluation.id} selectable /><DetailRow label="Schema" value={`v${evaluation.schemaVersion}`} /><DetailRow label="Evaluator" value={`v${evaluation.evaluatorVersion}`} /><DetailRow label="Scanned" value={formatAccessibilityTimestamp(evaluation.scannedAt)} /><DetailRow label="Persisted" value={formatAccessibilityTimestamp(evaluation.createdAt)} /></View>
          {evaluation.relatedQaEvaluationId ? <Pressable accessibilityLabel="View Core QA Evaluation" accessibilityRole="button" onPress={() => router.push({ pathname: '/qa-evaluations/[id]', params: { id: evaluation.relatedQaEvaluationId! } })} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>View Core QA Evaluation</Text></Pressable> : null}
          <Pressable accessibilityLabel="Back to Home" accessibilityRole="button" onPress={goHome} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Back to Home</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7FAFC', flex: 1, paddingHorizontal: 24 },
  scrollContent: { flexGrow: 1, paddingVertical: 24 },
  content: { alignSelf: 'center', maxWidth: 520, paddingBottom: 24, width: '100%' },
  stateContent: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  pageTitle: { color: '#1A202C', fontSize: 30, fontWeight: '700' },
  provenanceNotice: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E', borderRadius: 10, borderWidth: 1, color: '#744210', fontSize: 15, lineHeight: 23, marginTop: 18, padding: 16 },
  provenanceBadge: { alignSelf: 'flex-start', backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 999, borderWidth: 1, color: '#2A4365', fontSize: 14, fontWeight: '700', marginTop: 14, paddingHorizontal: 12, paddingVertical: 6 },
  disclaimer: { backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 10, borderWidth: 1, color: '#2A4365', fontSize: 15, lineHeight: 23, marginTop: 12, padding: 16 },
  sectionTitle: { color: '#1A202C', fontSize: 22, fontWeight: '700', marginTop: 28 },
  sectionCard: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 18 },
  detailRow: { marginTop: 12 }, detailLabel: { color: '#4A5568', fontSize: 14, fontWeight: '600' }, detailValue: { color: '#1A202C', fontSize: 16, lineHeight: 24, marginTop: 5 },
  statusText: { color: '#2B6CB0', fontSize: 17, fontWeight: '700', marginTop: 12 }, message: { color: '#4A5568', fontSize: 16, lineHeight: 24, marginTop: 14 }, supportingText: { color: '#4A5568', fontSize: 16, lineHeight: 24, marginTop: 12 }, muted: { color: '#4A5568', fontSize: 15, lineHeight: 23, marginTop: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, summaryCell: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 10, borderWidth: 1, flexBasis: '30%', flexGrow: 1, minHeight: 82, padding: 14 }, summaryLabel: { color: '#4A5568', fontSize: 14, fontWeight: '600' }, summaryValue: { color: '#1A202C', fontSize: 26, fontWeight: '700', marginTop: 6 }, warning: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E', borderRadius: 8, borderWidth: 1, color: '#744210', fontSize: 15, lineHeight: 23, marginTop: 14, padding: 12 },
  ruleCard: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 14, padding: 18 }, ruleTitle: { color: '#1A202C', fontSize: 18, fontWeight: '700', lineHeight: 25 }, ruleMeta: { color: '#2D3748', fontSize: 15, lineHeight: 23, marginTop: 8 }, remediation: { backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 8, borderWidth: 1, color: '#2A4365', fontSize: 14, lineHeight: 21, marginTop: 14, padding: 10 }, sampleList: { gap: 10, marginTop: 14 }, sample: { backgroundColor: '#F7FAFC', borderRadius: 6, color: '#1A202C', fontFamily: 'monospace', fontSize: 14, lineHeight: 23, padding: 10 }, note: { color: '#4A5568', fontSize: 14, lineHeight: 21, marginTop: 12 }, technicalToggle: { alignSelf: 'flex-start', borderColor: '#CBD5E0', borderRadius: 8, borderWidth: 1, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8 }, technicalToggleText: { color: '#1D4ED8', fontSize: 14, fontWeight: '700' },
  primaryButton: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 10, justifyContent: 'center', marginTop: 28, minHeight: 52, paddingHorizontal: 20 }, primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }, secondaryButton: { alignItems: 'center', borderColor: '#2563EB', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 52, paddingHorizontal: 20 }, secondaryButtonText: { color: '#2563EB', fontSize: 16, fontWeight: '700' }, pressed: { opacity: 0.8 },
});
