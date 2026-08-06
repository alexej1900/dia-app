import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
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
import type { ProductsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<ProductsStackParamList, 'ProductForm'>;
type Route = RouteProp<ProductsStackParamList, 'ProductForm'>;

export default function ProductFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const productId = route.params?.productId;

  const [name, setName] = useState('');
  const [carbsText, setCarbsText] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    const db = await openDatabase();
    if (productId) {
      await updateProduct(db, productId, { name: name.trim(), carbsPer100g: carbsValue });
    } else {
      await createProduct(db, { name: name.trim(), carbsPer100g: carbsValue });
    }
    navigation.goBack();
  };

  const handleDelete = async () => {
    if (!productId) return;
    const db = await openDatabase();
    try {
      await deleteProduct(db, productId);
      navigation.goBack();
    } catch (e) {
      if (e instanceof ProductInUseError) {
        Alert.alert('Cannot delete product', e.message);
      } else {
        throw e;
      }
    }
  };

  return (
    <View style={styles.container}>
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

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save</Text>
      </TouchableOpacity>

      {productId && (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { fontSize: 13, color: '#555', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, marginTop: 4 },
  preview: { marginTop: 6, color: '#2e7d32', fontWeight: '600' },
  error: { color: '#c62828', marginTop: 12 },
  saveButton: { marginTop: 20, backgroundColor: '#2e7d32', borderRadius: 8, padding: 12, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '600' },
  deleteButton: {
    marginTop: 12,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c62828',
  },
  deleteButtonText: { color: '#c62828', fontWeight: '600' },
});
