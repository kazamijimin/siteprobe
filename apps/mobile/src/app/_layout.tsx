import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="scans/index" options={{ title: 'Scan History' }} />
      <Stack.Screen name="scans/[id]" options={{ title: 'Scan Result' }} />
      <Stack.Screen name="qa-evaluations/index" options={{ title: 'Controlled QA Evaluations' }} />
      <Stack.Screen name="qa-evaluations/[id]" options={{ title: 'Controlled QA Evaluation' }} />
      <Stack.Screen name="accessibility-evaluations/[id]" options={{ title: 'Controlled Accessibility Evaluation' }} />
    </Stack>
  );
}
