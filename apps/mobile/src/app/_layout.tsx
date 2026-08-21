import { Stack } from 'expo-router';
import { ProductNavigation } from '@/components/ProductNavigation';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ header: () => <ProductNavigation /> }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="scans/index" options={{ title: 'Scan History' }} />
      <Stack.Screen name="scans/[id]" options={{ title: 'Scan Result' }} />
      <Stack.Screen name="qa-evaluations/index" options={{ title: 'Controlled QA Evaluations' }} />
      <Stack.Screen name="qa-evaluations/[id]" options={{ title: 'Controlled QA Evaluation' }} />
      <Stack.Screen name="accessibility-evaluations/index" options={{ title: 'Controlled Accessibility Evaluations' }} />
      <Stack.Screen name="accessibility-evaluations/[id]" options={{ title: 'Controlled Accessibility Evaluation' }} />
      <Stack.Screen name="seo-evaluations/index" options={{ title: 'SEO Evaluations' }} />
      <Stack.Screen name="seo-evaluations/[id]" options={{ title: 'SEO Evaluation' }} />
    </Stack>
  );
}
