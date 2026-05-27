import { StyleSheet, Text, View } from 'react-native';

// Settings is L5-shaped — real content is "Notification preferences, AI
// refine toggle." Keeping the screen present and routable so the tab bar
// stays in its final shape; toggles land when L5 wires the services.
export default function SettingsScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.body}>
        Notification preferences and AI refine toggle will appear here once
        Layer 5 wires up notifications and the OpenAI proxy.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  body: { color: '#6b7280', lineHeight: 22 },
});
