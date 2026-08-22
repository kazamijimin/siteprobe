import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  qaEvaluationIdParamsSchema,
  type ControlledQaEvaluationPublicResponse,
  type QaEvidence,
  type QaFinding,
} from '@siteprobe/contracts';
import { getQaEvaluation } from '@/features/evaluations/qa-evaluation-api';
import {
  formatEvaluationTimestamp,
  formatEvaluationTimestampForAccessibility,
  formatEvaluationProvenance,
  formatEvaluationProvenanceDescription,
  formatEvidenceCount,
  formatQaCategory,
  formatQaSeverity,
  formatQaStatus,
  formatTruncatedEvidenceCount,
} from '@/features/evaluations/presentation';
import { ApiError } from '@/services/api/client';

type ResultState =
  | { status: 'loading' }
  | { status: 'success'; evaluation: ControlledQaEvaluationPublicResponse }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

type DetailRowProps = {
  label: string;
  value: string;
  selectable?: boolean;
  accessibilityValue?: string;
};

function DetailRow({ label, value, selectable = false, accessibilityValue }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text accessibilityLabel={accessibilityValue} selectable={selectable} style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function renderEvidence(evidence: QaEvidence) {
  if (evidence.kind === 'navigation') {
    return (
      <View style={styles.evidenceContent}>
        <DetailRow label="Navigation succeeded" value={evidence.navigationSucceeded ? 'Yes' : 'No'} />
        <DetailRow label="Failure code" value={evidence.failureCode ?? 'None'} />
        <DetailRow label="Duration" value={`${evidence.navigationDurationMs} ms`} />
        <DetailRow label="Requested URL" value={evidence.requestedUrl} selectable />
        <DetailRow label="Final URL" value={evidence.finalUrl ?? 'Not available'} selectable />
      </View>
    );
  }

  if (evidence.kind === 'httpStatus') {
    return <DetailRow label="HTTP status" value={evidence.value === null ? 'Not available' : String(evidence.value)} />;
  }

  if (evidence.kind === 'title') {
    return (
      <View style={styles.evidenceContent}>
        <DetailRow label="Title present" value={evidence.present ? 'Yes' : 'No'} />
        <DetailRow label="Character count" value={String(evidence.characterCount)} />
      </View>
    );
  }

  return <DiagnosticEvidence evidence={evidence} />;
}

function DiagnosticEvidence({ evidence }: { evidence: Extract<QaEvidence, { kind: 'messages' | 'failedRequests' }> }) {
  const [expanded, setExpanded] = useState(false);
  const samples = evidence.kind === 'messages'
    ? evidence.samples.map((sample, index) => ({ key: `message-${index}`, content: sample }))
    : evidence.samples.map((sample, index) => ({
      key: `request-${index}`,
      content: `${sample.method}\n${sample.resourceType}\n${sample.url}\n${sample.failureReason}${sample.attribution ? `\nAttribution: ${sample.attribution}` : ''}`,
    }));
  return (
    <View style={styles.evidenceContent}>
      <Text style={styles.detailValue}>{formatEvidenceCount(evidence.kind, evidence.recordedCount)}</Text>
      {evidence.kind === 'failedRequests' ? <Text style={styles.evidenceNote}>Target failures: {evidence.targetFailureCount ?? evidence.recordedCount} · Scanner policy blocks: {evidence.scannerPolicyBlockCount ?? 0}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.technicalToggle, pressed && styles.buttonPressed]}>
        <Text style={styles.technicalToggleText}>{expanded ? 'Hide technical details' : 'Show technical details'}</Text>
      </Pressable>
      {expanded ? (samples.length > 0 ? <View style={styles.sampleList}>{samples.map((sample) => <Text selectable key={sample.key} style={styles.evidenceSample}>{sample.content}</Text>)}</View> : <Text style={styles.evidenceSample}>No samples recorded.</Text>) : null}
      {expanded && evidence.samplesTruncated ? <Text style={styles.evidenceNote}>{formatTruncatedEvidenceCount(evidence.kind, samples.length, evidence.recordedCount)}</Text> : null}
    </View>
  );
}

function FindingCard({ finding }: { finding: QaFinding }) {
  return (
    <View style={styles.findingCard}>
      <Text accessibilityRole="header" style={styles.findingTitle}>{finding.title}</Text>
      <View style={styles.findingMeta}>
        <Text style={[styles.status, statusColors[finding.status]]}>Status: {formatQaStatus(finding.status)}</Text>
        <Text style={[styles.severity, severityColors[finding.severity]]}>Severity: {formatQaSeverity(finding.severity)}</Text>
      </View>
      <Text style={styles.category}>Category: {formatQaCategory(finding.category)}</Text>
      <Text style={styles.description}>{finding.description}</Text>
      <Text accessibilityRole="header" style={styles.evidenceTitle}>Evidence</Text>
      {renderEvidence(finding.evidence)}
    </View>
  );
}

export default function QaEvaluationDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const parsedId = rawId ? qaEvaluationIdParamsSchema.safeParse({ id: rawId }) : null;
  const evaluationId = parsedId?.success ? parsedId.data.id : undefined;
  const [state, setState] = useState<ResultState>({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);

  const loadEvaluation = useCallback(async (id: string, signal: AbortSignal) => {
    try {
      const evaluation = await getQaEvaluation(id, signal);
      if (!signal.aborted) setState({ status: 'success', evaluation });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && error.code === 'NOT_FOUND') {
        setState({ status: 'notFound' });
        return;
      }
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong while contacting SiteProbe API.',
      });
    }
  }, []);

  useEffect(() => {
    if (!evaluationId) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return loadEvaluation(evaluationId, controller.signal);
      return undefined;
    });
    return () => controller.abort();
  }, [evaluationId, loadEvaluation, retryCount]);

  function goHome() {
    router.replace('/');
  }

  function retry() {
    setState({ status: 'loading' });
    setRetryCount((count) => count + 1);
  }

  const routeInvalid = !rawId || !parsedId?.success;
  if (routeInvalid) {
    return (
      <StateScreen title="Controlled QA Evaluation" heading="Controlled QA evaluation ID is invalid." onBack={goHome} />
    );
  }

  if (state.status === 'loading') {
    return (
      <View accessibilityRole={"main" as never} style={styles.container}>
        <Stack.Screen options={{ title: 'Controlled QA Evaluation' }} />
        <View accessibilityLiveRegion="polite" style={styles.centerContent}>
          <ActivityIndicator color="#2563EB" size="large" />
          <Text accessibilityRole="header" style={styles.pageTitle}>Loading controlled QA evaluation...</Text>
        </View>
      </View>
    );
  }

  if (state.status === 'notFound') {
    return (
      <StateScreen title="Controlled QA Evaluation" heading="Controlled QA evaluation not found." onBack={goHome} />
    );
  }

  if (state.status === 'error') {
    return (
      <StateScreen
        title="Controlled QA Evaluation"
        heading="Unable to load controlled QA evaluation."
        message={state.message}
        onBack={goHome}
        onRetry={retry}
      />
    );
  }

  const { evaluation } = state;
  const scannedAt = formatEvaluationTimestamp(evaluation.scannedAt);
  const persistedAt = formatEvaluationTimestamp(evaluation.createdAt);
  const accessibleScannedAt = formatEvaluationTimestampForAccessibility(evaluation.scannedAt);
  const accessiblePersistedAt = formatEvaluationTimestampForAccessibility(evaluation.createdAt);

  return (
    <View accessibilityRole={"main" as never} style={styles.container}>
      <Stack.Screen options={{ title: 'Controlled QA Evaluation' }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.pageTitle}>Controlled QA Evaluation</Text>
          <Text style={styles.provenanceBadge}>{formatEvaluationProvenance(evaluation.provenance)}</Text>
          <Text style={styles.provenanceNotice}>
            {formatEvaluationProvenanceDescription(evaluation.provenance)}{"\n"}
            It is separate from SiteProbe&apos;s current synthetic public scan workflow.
          </Text>

          <Text accessibilityRole="header" style={styles.sectionTitle}>Target</Text>
          <View style={styles.sectionCard}>
            <DetailRow label="Requested URL" value={evaluation.requestedUrl} selectable />
            <DetailRow label="Final URL" value={evaluation.finalUrl ?? 'Not available'} selectable />
          </View>

          <Text accessibilityRole="header" style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summaryGrid}>
            {([
              ['Critical', evaluation.evaluation.summary.critical],
              ['Warnings', evaluation.evaluation.summary.warnings],
              ['Passed', evaluation.evaluation.summary.passed],
              ['Not applicable', evaluation.evaluation.summary.notApplicable],
            ] as const).map(([label, value]) => (
              <View accessible accessibilityLabel={`${label}: ${value}`} key={label} style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>{label}</Text>
                <Text style={styles.summaryValue}>{value}</Text>
              </View>
            ))}
          </View>

          <Text accessibilityRole="header" style={styles.sectionTitle}>Findings</Text>
          {evaluation.evaluation.findings.map((finding) => (
            <FindingCard finding={finding} key={finding.ruleId} />
          ))}

          <Text accessibilityRole="header" style={styles.sectionTitle}>Technical details</Text>
          <View style={styles.sectionCard}>
            <DetailRow label="Evaluation ID" value={evaluation.id} selectable />
            <DetailRow accessibilityValue={`Scanned ${accessibleScannedAt}`} label="Scanned" value={scannedAt} />
            <DetailRow accessibilityValue={`Persisted ${accessiblePersistedAt}`} label="Persisted" value={persistedAt} />
            <DetailRow label="Evaluator" value={`v${evaluation.evaluatorVersion}`} />
            <DetailRow label="Schema" value={`v${evaluation.schemaVersion}`} />
          </View>

          {evaluation.relatedAccessibilityEvaluationId ? (
            <Pressable
              accessibilityLabel="View Accessibility Evaluation"
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/accessibility-evaluations/[id]', params: { id: evaluation.relatedAccessibilityEvaluationId! } })}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.secondaryButtonText}>View Accessibility Evaluation</Text>
            </Pressable>
          ) : null}

          {evaluation.relatedSeoEvaluationId ? (
            <Pressable
              accessibilityLabel="View SEO Evaluation"
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/seo-evaluations/[id]', params: { id: evaluation.relatedSeoEvaluationId! } })}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.secondaryButtonText}>View SEO Evaluation</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityLabel="View Unified Report"
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/evaluation-reports/[id]', params: { id: evaluation.id } })}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.secondaryButtonText}>View Unified Report</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Back to Home"
            accessibilityRole="button"
            onPress={goHome}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>Back to Home</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

type StateScreenProps = {
  title: string;
  heading: string;
  message?: string;
  onBack: () => void;
  onRetry?: () => void;
};

function StateScreen({ title, heading, message, onBack, onRetry }: StateScreenProps) {
  return (
    <View accessibilityRole={"main" as never} style={styles.container}>
      <Stack.Screen options={{ title }} />
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.pageTitle}>{heading}</Text>
        {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
        {onRetry ? (
          <Pressable
            accessibilityLabel="Retry loading controlled QA evaluation"
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Back to Home"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7FAFC', flex: 1, paddingHorizontal: 24 },
  scrollContent: { flexGrow: 1, paddingVertical: 24 },
  content: { alignSelf: 'center', maxWidth: 520, paddingBottom: 24, width: '100%' },
  centerContent: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  pageTitle: { color: '#1A202C', fontSize: 30, fontWeight: '700' },
  provenanceNotice: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E', borderRadius: 10, borderWidth: 1, color: '#744210', fontSize: 15, lineHeight: 23, marginTop: 18, padding: 16 },
  provenanceBadge: { alignSelf: 'flex-start', backgroundColor: '#EBF8FF', borderColor: '#90CDF4', borderRadius: 999, borderWidth: 1, color: '#2A4365', fontSize: 14, fontWeight: '700', marginTop: 14, paddingHorizontal: 12, paddingVertical: 6 },
  sectionTitle: { color: '#1A202C', fontSize: 22, fontWeight: '700', marginTop: 28 },
  sectionCard: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 18 },
  detailRow: { marginTop: 12 },
  detailLabel: { color: '#4A5568', fontSize: 14, fontWeight: '600' },
  detailValue: { color: '#1A202C', fontSize: 16, lineHeight: 23, marginTop: 5 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  summaryCell: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 10, borderWidth: 1, flexBasis: '48%', flexGrow: 1, minHeight: 82, padding: 14 },
  summaryLabel: { color: '#4A5568', fontSize: 14, fontWeight: '600' },
  summaryValue: { color: '#1A202C', fontSize: 26, fontWeight: '700', marginTop: 6 },
  findingCard: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 14, padding: 18 },
  findingTitle: { color: '#1A202C', fontSize: 19, fontWeight: '700' },
  findingMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  status: { fontSize: 15, fontWeight: '700' },
  statusPassed: { color: '#276749' },
  statusFailed: { color: '#C53030' },
  statusNotApplicable: { color: '#4A5568' },
  severity: { fontSize: 15, fontWeight: '700' },
  severityInfo: { color: '#2B6CB0' },
  severityWarning: { color: '#744210' },
  severityCritical: { color: '#C53030' },
  category: { color: '#4A5568', fontSize: 14, marginTop: 10 },
  description: { color: '#2D3748', fontSize: 16, lineHeight: 24, marginTop: 12 },
  evidenceTitle: { color: '#1A202C', fontSize: 16, fontWeight: '700', marginTop: 18 },
  evidenceContent: { marginTop: 2 },
  sampleList: { gap: 10, marginTop: 12 },
  evidenceSample: { backgroundColor: '#F7FAFC', borderRadius: 6, color: '#1A202C', fontFamily: 'monospace', fontSize: 14, lineHeight: 21, padding: 10 },
  evidenceNote: { color: '#4A5568', fontSize: 14, lineHeight: 21, marginTop: 12 },
  technicalToggle: { alignSelf: 'flex-start', borderColor: '#CBD5E0', borderRadius: 8, borderWidth: 1, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8 },
  technicalToggleText: { color: '#1D4ED8', fontSize: 14, fontWeight: '700' },
  message: { color: '#4A5568', fontSize: 16, lineHeight: 24, marginTop: 20 },
  button: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 10, justifyContent: 'center', marginTop: 28, minHeight: 52, paddingHorizontal: 20 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: '#2563EB', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 52, paddingHorizontal: 20 },
  secondaryButtonText: { color: '#2563EB', fontSize: 16, fontWeight: '700' },
});

const statusColors = {
  passed: styles.statusPassed,
  failed: styles.statusFailed,
  notApplicable: styles.statusNotApplicable,
} as const;

const severityColors = {
  info: styles.severityInfo,
  warning: styles.severityWarning,
  critical: styles.severityCritical,
} as const;
