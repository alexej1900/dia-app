import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { openDatabase } from '../db/database';
import { listProducts } from '../repositories/productsRepo';
import { recognizeDish, RecognizedItem, DishRecognitionError } from '../services/dishRecognition';

interface Props {
  onRecognized: (items: RecognizedItem[]) => void;
}

// 1x1 transparent PNG — a valid placeholder source so the manipulator hook
// always has something to bind to before the user has picked a real photo.
const PLACEHOLDER_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

export default function PhotoRecognitionButton({ onRecognized }: Props) {
  const [pickedPhoto, setPickedPhoto] = useState<PickedPhoto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manipulatorContext = useImageManipulator(pickedPhoto?.uri ?? PLACEHOLDER_URI);

  useEffect(() => {
    if (!pickedPhoto) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Cap the longest edge at ~1024px, scaling the other dimension
        // proportionally, regardless of orientation.
        const resizeOptions =
          pickedPhoto.width >= pickedPhoto.height
            ? { width: 1024, height: null }
            : { width: null, height: 1024 };
        const rendered = await manipulatorContext.resize(resizeOptions).renderAsync();
        const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
        if (!saved.base64) {
          throw new DishRecognitionError('Could not process the photo.');
        }
        const db = await openDatabase();
        const productNames = (await listProducts(db, '')).map((p) => p.name);
        const items = await recognizeDish(saved.base64, productNames);
        onRecognized(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Recognition failed. Try again or add ingredients manually.');
      } finally {
        setLoading(false);
        setPickedPhoto(null);
      }
    })();
    // manipulatorContext is derived from pickedPhoto each render; re-running
    // this effect only on pickedPhoto change is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedPhoto]);

  const pickFrom = async (source: 'camera' | 'gallery') => {
    setError(null);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Camera/photo access is needed for this feature.');
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setPickedPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
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
