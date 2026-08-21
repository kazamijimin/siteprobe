import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { createScan } from '@/features/scans/scan-api';
import { getUserFacingErrorMessage } from '@/services/api/errors';

export default function HomeScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => () => {
    isMounted.current = false;
  }, []);

  async function handleScan() {
    if (isSubmitting) {
      return;
    }

    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      setError('Enter a website URL to continue.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const scan = await createScan(trimmedUrl);
      if (isMounted.current) {
        router.push({
          pathname: '/scans/[id]',
          params: { id: scan.id },
        });
      }
    } catch (requestError) {
      if (isMounted.current) {
        setError(getUserFacingErrorMessage(requestError));
      }
    } finally {
      if (isMounted.current) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          SiteProbe
        </Text>
        <Text style={styles.subtitle}>Automated Website QA</Text>

        <View style={styles.form}>
          <Text nativeID="website-url-label" style={styles.label}>
            Website URL
          </Text>
          <TextInput
            accessibilityLabel="Website URL"
            accessibilityHint="Enter the website you want to check"
            accessibilityLabelledBy="website-url-label"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setUrl}
            onSubmitEditing={handleScan}
            placeholder="https://example.com"
            placeholderTextColor="#718096"
            returnKeyType="go"
            style={[styles.input, error && styles.inputError]}
            value={url}
          />
          {error ? (
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel="Scan Website"
            accessibilityRole="button"
            accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
            disabled={isSubmitting}
            onPress={handleScan}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : null}
            <Text style={styles.buttonText}>{isSubmitting ? 'Scanning...' : 'Scan Website'}</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="View Scan History"
            accessibilityRole="button"
            onPress={() => router.push('/scans')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.secondaryButtonText}>View Scan History</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="View Controlled QA Evaluations"
            accessibilityRole="button"
            onPress={() => router.push('./qa-evaluations')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.secondaryButtonText}>View Controlled QA Evaluations</Text>
            <Text style={styles.secondaryButtonHint}>Controlled development</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="View Controlled Accessibility Evaluations"
            accessibilityRole="button"
            onPress={() => router.push('./accessibility-evaluations')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
            <Text style={styles.secondaryButtonText}>View Controlled Accessibility Evaluations</Text>
            <Text style={styles.secondaryButtonHint}>Controlled development</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  title: {
    color: '#1A202C',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#4A5568',
    fontSize: 18,
    marginTop: 8,
  },
  form: {
    marginTop: 40,
  },
  label: {
    color: '#2D3748',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E0',
    borderRadius: 10,
    borderWidth: 1,
    color: '#1A202C',
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  inputError: {
    borderColor: '#C53030',
  },
  error: {
    color: '#C53030',
    fontSize: 14,
    marginTop: 8,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 20,
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
  secondaryButtonHint: {
    color: '#4A5568',
    fontSize: 12,
    marginTop: 3,
  },
});
