import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

const destinations = [
  { label: 'Home', path: '/' },
  { label: 'Scans', path: '/scans' },
  { label: 'QA', path: '/qa-evaluations' },
  { label: 'Accessibility', path: '/accessibility-evaluations' },
] as const;

export function ProductNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <View accessibilityRole={"banner" as never} style={styles.header}>
      <View accessibilityRole={"navigation" as never} accessibilityLabel="SiteProbe navigation" style={styles.navigation}>
        {destinations.map((destination) => {
          const active = destination.path === '/'
            ? pathname === '/'
            : pathname === destination.path || pathname.startsWith(`${destination.path}/`);
          return (
            <Pressable
              accessibilityLabel={`Go to ${destination.label}`}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              key={destination.path}
              onPress={() => router.replace(destination.path)}
              style={({ pressed }) => [styles.link, active && styles.activeLink, pressed && styles.pressed]}>
              <Text style={[styles.linkText, active && styles.activeLinkText]}>{destination.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: '#FFFFFF', borderBottomColor: '#E2E8F0', borderBottomWidth: 1 },
  navigation: { alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: 1040, paddingHorizontal: 16, paddingVertical: 10, width: '100%' },
  link: { borderRadius: 8, minHeight: 38, paddingHorizontal: 12, paddingVertical: 9 },
  activeLink: { backgroundColor: '#EBF8FF' },
  linkText: { color: '#4A5568', fontSize: 14, fontWeight: '600' },
  activeLinkText: { color: '#1D4ED8' },
  pressed: { opacity: 0.7 },
});
