import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
  FlatList,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { openDatabase } from '../db/database';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  ProductInUseError,
} from '../repositories/productsRepo';
import { gramsPerW } from '../calculations/carbs';
import { searchCarbsByName, OpenFoodFactsMatch, OpenFoodFactsError } from '../services/openFoodFacts';
import type { ProductsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<ProductsStackParamList, 'ProductForm'>;
type Route = RouteProp<ProductsStackParamList, 'ProductForm'>;

export default function ProductFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const productId = route.params?.productId;
  const prefillName = route.params?.prefillName;

  const [name, setName] = useState(prefillName ?? '');
  const [carbsText, setCarbsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [lookupVisible, setLookupVisible] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResults, setLookupResults] = useState<OpenFoodFactsMatch[]>([]);

  useEffect(() => {
    if (!productId) return;
    (async () => {
      const db = await openDatabase();
      const product = await getProduct(db, productId);
      if (product) {
        setName(product.name);
        setCarbsText(String(product.carbsPer100g));
      }
    })();
  }, [productId]);

  const carbsValue = Number(carbsText);
  const perW = carbsText !== '' && !Number.isNaN(carbsValue) ? gramsPerW(carbsValue) : null;

  const handleSave = async () => {
    if (name.trim() === '') {
      setError('Name is required');
      return;
    }
    if (carbsText === '' || Number.isNaN(carbsValue) || carbsValue < 0) {
      setError('Carbs per 100g must be a number of 0 or more');
      return;
    }
    setError(null);
    try {
      const db = await openDatabase();
      if (productId) {
        await updateProduct(db, productId, { name: name.trim(), carbsPer100g: carbsValue });
      } else {
        const created = await createProduct(db, { name: name.trim(), carbsPer100g: carbsValue });
        route.params?.onCreated?.(created);
      }
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save product');
    }
  };

  const handleDelete = async () => {
    if (!productId) return;
    try {
      const db = await openDatabase();
      await deleteProduct(db, productId);
      navigation.goBack();
    } catch (e) {
      if (e instanceof ProductInUseError) {
        Alert.alert('Cannot delete product', e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Failed to delete product');
      }
    }
  };

  const handleLookup = async () => {
    if (name.trim() === '') {
      setLookupResults([]);
      setLookupError('Enter a product name first');
      setLookupVisible(true);
      return;
    }
    setLookupVisible(true);
    setLookupLoading(true);
    setLookupError(null);
    try {
      const results = await searchCarbsByName(name.trim());
      setLookupResults(results);
      if (results.length === 0) {
        setLookupError('Nothing found, enter manually');
      }
    } catch (e) {
      setLookupResults([]);
      setLookupError(e instanceof OpenFoodFactsError ? e.message : 'Lookup failed, enter manually');
    } finally {
      setLookupLoading(false);
    }
  };

  const applyLookupResult = (match: OpenFoodFactsMatch) => {
    setCarbsText(String(match.carbsPer100g));
    setLookupVisible(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.formContainer}>
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Rice" />

        <Text style={styles.label}>Carbs per 100g</Text>
        <TextInput
          style={styles.input}
          value={carbsText}
          onChangeText={setCarbsText}
          placeholder="e.g. 28"
          keyboardType="numeric"
        />
        <Text style={styles.preview}>{perW !== null ? `${perW.toFixed(0)} g = 1 W` : '—'}</Text>

        <TouchableOpacity style={styles.lookupButton} onPress={handleLookup}>
          <Text style={styles.lookupButtonText}>Look up carbs</Text>
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>

        {productId && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={lookupVisible} animationType="slide" onRequestClose={() => setLookupVisible(false)}>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <Text style={styles.label}>Results for &quot;{name}&quot;</Text>
          {lookupLoading && <ActivityIndicator style={{ marginTop: 20 }} />}
          {!lookupLoading && lookupError && <Text style={styles.error}>{lookupError}</Text>}
          {!lookupLoading && (
            <FlatList
              data={lookupResults}
              keyExtractor={(_, index) => String(index)}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.matchRow} onPress={() => applyLookupResult(item)}>
                  <Text style={styles.name}>
                    {item.name}
                    {item.brand ? ` (${item.brand})` : ''}
                  </Text>
                  <Text style={styles.detail}>{item.carbsPer100g} g carbs / 100g</Text>
                </TouchableOpacity>
              )}
            />
          )}
          <TouchableOpacity style={styles.deleteButton} onPress={() => setLookupVisible(false)}>
            <Text style={styles.deleteButtonText}>Close</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  formContainer: { padding: 16 },
  container: { flex: 1, padding: 16 },
  label: { fontSize: 13, color: '#555', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, marginTop: 4 },
  preview: { marginTop: 6, color: '#2e7d32', fontWeight: '600' },
  error: { color: '#c62828', marginTop: 12 },
  saveButton: { marginTop: 20, backgroundColor: '#2e7d32', borderRadius: 8, padding: 12, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  deleteButton: {
    marginTop: 12,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c62828',
  },
  deleteButtonText: { color: '#c62828', fontWeight: '600', fontSize: 16 },
  lookupButton: {
    marginTop: 8,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2e7d32',
  },
  lookupButtonText: { color: '#2e7d32', fontWeight: '600', fontSize: 16 },
  matchRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13, color: '#555' },
});
