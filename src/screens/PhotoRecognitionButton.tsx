import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { RecognizedItem } from '../services/dishRecognition';
import { captureAndRecognizeDishPhoto, PhotoPickCancelledError } from '../services/dishPhotoCapture';

interface Props {
  onRecognized: (items: RecognizedItem[]) => void;
}

export default function PhotoRecognitionButton({ onRecognized }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFrom = async (source: 'camera' | 'gallery') => {
    setError(null);
    setLoading(true);
    try {
      const items = await captureAndRecognizeDishPhoto(source);
      onRecognized(items);
    } catch (e) {
      if (!(e instanceof PhotoPickCancelledError)) {
        setError(e instanceof Error ? e.message : 'Recognition failed. Try again or add ingredients manually.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={() => pickFrom('camera')} disabled={loading}>
          <Text style={styles.buttonText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => pickFrom('gallery')} disabled={loading}>
          <Text style={styles.buttonText}>Choose from Gallery</Text>
        </TouchableOpacity>
      </View>
      {loading && <ActivityIndicator style={styles.loading} />}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  buttonRow: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, borderWidth: 1, borderColor: '#2e7d32', borderRadius: 8, padding: 10, alignItems: 'center' },
  buttonText: { color: '#2e7d32', fontWeight: '600' },
  loading: { marginTop: 8 },
  error: { color: '#c62828', marginTop: 8 },
});
