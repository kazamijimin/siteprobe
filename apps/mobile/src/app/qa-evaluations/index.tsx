import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { ControlledQaEvaluationListItem } from '@siteprobe/contracts';
import { ApiError } from '@/services/api/client';
import { listQaEvaluations } from '@/features/evaluations/qa-evaluation-api';
import {
  formatEvaluationSource,
  formatEvaluationSummary,
  formatEvaluationTimestamp,
} from '@/features/evaluations/presentation';
import { getUserFacingErrorMessage } from '@/services/api/errors';

const PAGE_SIZE = 20;

type IndexStatus = 'loading' | 'success' | 'unavailable' | 'error';

type IndexState = {
  status: IndexStatus;
  evaluations: ControlledQaEvaluationListItem[];
  nextCursor: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
  message: string | null;
};

const initialState: IndexState = {
  status: 'loading',
  evaluations: [],
  nextCursor: null,
  loadingMore: false,
  loadMoreError: null,
  message: null,
};

function appendUnique(
  current: ControlledQaEvaluationListItem[],
  incoming: ControlledQaEvaluationListItem[],
): ControlledQaEvaluationListItem[] {
  const existingIds = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !existingIds.has(item.id))];
}

function getListError(error: unknown): { status: 'unavailable' | 'error'; message: string } {
  if (error instanceof ApiError && error.status === 404) {
    return {
      status: 'unavailable',
      message: 'Controlled QA evaluations are unavailable. This controlled development feature is not enabled on the SiteProbe API.',
    };
  }
  return { status: 'error', message: getUserFacingErrorMessage(error) };
}

function EvaluationCard({
  evaluation,
  onPress,
}: {
  evaluation: ControlledQaEvaluationListItem;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint="Opens this controlled QA evaluation"
      accessibilityLabel={`${evaluation.requestedUrl}, ${formatEvaluationSource(evaluation)}, ${formatEvaluationSummary(evaluation.summary)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <Text selectable style={styles.requestedUrl}>{evaluation.requestedUrl}</Text>
      <Text style={styles.source}>{formatEvaluationSource(evaluation)}</Text>
      <Text style={styles.timestamp}>Scanned: {formatEvaluationTimestamp(evaluation.scannedAt)}</Text>
      <Text style={styles.timestamp}>Persisted: {formatEvaluationTimestamp(evaluation.createdAt)}</Text>
      <Text style={styles.summary}>{formatEvaluationSummary(evaluation.summary)}</Text>
      <Text style={styles.cardAction}>View evaluation</Text>
    </Pressable>
  );
}

export default function QaEvaluationIndexScreen() {
  const router = useRouter();
  const [state, setState] = useState<IndexState>(initialState);
  const [retryCount, setRetryCount] = useState(0);
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    const activeControllers = controllers.current;
    const controller = new AbortController();
    activeControllers.add(controller);

    void listQaEvaluations({ limit: PAGE_SIZE, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'success',
          evaluations: page.evaluations,
          nextCursor: page.nextCursor,
          loadingMore: false,
          loadMoreError: null,
          message: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const result = getListError(error);
        setState({
          ...initialState,
          status: result.status,
          message: result.message,
        });
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
      const page = await listQaEvaluations({ limit: PAGE_SIZE, cursor, signal: controller.signal });
      if (controller.signal.aborted) return;
      setState((current) => current.status === 'success'
        ? {
            ...current,
            evaluations: appendUnique(current.evaluations, page.evaluations),
            nextCursor: page.nextCursor,
            loadingMore: false,
            loadMoreError: null,
          }
        : current);
    } catch {
      if (controller.signal.aborted) return;
      setState((current) => current.status === 'success'
        ? { ...current, loadingMore: false, loadMoreError: 'Unable to load more controlled QA evaluations.' }
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

  function goHome() {
    router.replace('/');
  }

  function renderState() {
    if (state.status === 'loading') {
      return (
        <View accessibilityLiveRegion="polite" style={styles.centerContent}>
          <ActivityIndicator color="#2563EB" size="large" />
          <Text accessibilityRole="header" style={styles.stateTitle}>Loading controlled QA evaluations...</Text>
        </View>
      );
    }

    if (state.status === 'unavailable') {
      return (
        <View style={styles.centerContent}>
          <Text accessibilityRole="header" style={styles.stateTitle}>Controlled QA evaluations are unavailable.</Text>
          <Text accessibilityLiveRegion="polite" style={styles.message}>{state.message}</Text>
          <Pressable
            accessibilityLabel="Retry loading controlled QA evaluations"
            accessibilityRole="button"
            onPress={retry}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (state.status === 'error') {
      return (
        <View style={styles.centerContent}>
          <Text accessibilityRole="header" style={styles.stateTitle}>Unable to load controlled QA evaluations.</Text>
          <Text accessibilityLiveRegion="polite" style={styles.message}>{state.message}</Text>
          <Pressable
            accessibilityLabel="Retry loading controlled QA evaluations"
            accessibilityRole="button"
            onPress={retry}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (state.evaluations.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>No controlled QA evaluations yet.</Text>
          <Text style={styles.message}>Persist a controlled evaluation through the authenticated internal workflow first.</Text>
        </View>
      );
    }

    return (
      <View>
        {state.evaluations.map((evaluation) => (
          <EvaluationCard
            evaluation={evaluation}
            key={evaluation.id}
            onPress={() => router.push({ pathname: '/qa-evaluations/[id]', params: { id: evaluation.id } })}
          />
        ))}
        {state.nextCursor ? (
          <View style={styles.loadMoreContainer}>
            {state.loadMoreError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{state.loadMoreError}</Text> : null}
            <Pressable
              accessibilityLabel={state.loadingMore ? 'Loading more controlled QA evaluations' : 'Load more controlled QA evaluations'}
              accessibilityRole="button"
              accessibilityState={{ busy: state.loadingMore, disabled: state.loadingMore }}
              disabled={state.loadingMore}
              onPress={() => void loadMore()}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
              {state.loadingMore ? <ActivityIndicator color="#2563EB" /> : null}
              <Text style={styles.secondaryButtonText}>{state.loadingMore ? 'Loading...' : 'Load More'}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Controlled QA Evaluations' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.pageTitle}>Controlled QA Evaluations</Text>
        <Text style={styles.provenanceNotice}>
          These are controlled QA evaluation snapshots.{"\n"}
          They are separate from SiteProbe&apos;s synthetic public scan history.{"\n"}
          Viewing them does not start a scan.
        </Text>
        {renderState()}
        <Pressable
          accessibilityLabel="Back to Home"
          accessibilityRole="button"
          onPress={goHome}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F7FAFC', flex: 1, paddingHorizontal: 24 },
  content: { alignSelf: 'center', flexGrow: 1, maxWidth: 520, paddingBottom: 40, paddingTop: 24, width: '100%' },
  pageTitle: { color: '#1A202C', fontSize: 30, fontWeight: '700' },
  provenanceNotice: { backgroundColor: '#FFFBEB', borderColor: '#F6E05E', borderRadius: 10, borderWidth: 1, color: '#744210', fontSize: 15, lineHeight: 23, marginTop: 18, padding: 16 },
  centerContent: { alignItems: 'center', justifyContent: 'center', minHeight: 280, padding: 24 },
  stateTitle: { color: '#1A202C', fontSize: 22, fontWeight: '700', marginTop: 18, textAlign: 'center' },
  message: { color: '#4A5568', fontSize: 16, lineHeight: 24, marginTop: 18, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E0', borderRadius: 12, borderWidth: 1, marginTop: 16, padding: 18 },
  cardPressed: { opacity: 0.8 },
  requestedUrl: { color: '#1A202C', fontSize: 18, lineHeight: 25 },
  source: { color: '#2B6CB0', fontSize: 15, fontWeight: '700', marginTop: 12 },
  timestamp: { color: '#4A5568', fontSize: 14, marginTop: 8 },
  summary: { color: '#2D3748', fontSize: 14, lineHeight: 22, marginTop: 12 },
  cardAction: { color: '#2563EB', fontSize: 16, fontWeight: '700', marginTop: 16 },
  loadMoreContainer: { paddingTop: 20 },
  error: { color: '#C53030', fontSize: 14, lineHeight: 21, marginBottom: 8 },
  button: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 10, justifyContent: 'center', marginTop: 28, minHeight: 52, paddingHorizontal: 20 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: '#2563EB', borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 52, paddingHorizontal: 20 },
  secondaryButtonText: { color: '#2563EB', fontSize: 16, fontWeight: '700' },
});
