import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { openDatabase } from '../db/database';
import { listProducts, Product } from '../repositories/productsRepo';
import { createDish, updateDish, deleteDish, getDish } from '../repositories/dishesRepo';
import { dishTotals } from '../calculations/carbs';
import PhotoRecognitionButton from './PhotoRecognitionButton';
import type { RecognizedItem } from '../services/dishRecognition';
import type { DishesStackParamList } from '../navigation/RootNavigator';
import { buildIngredientRow, applyGramsEdit, IngredientRow } from './dishFormHelpers';
import { captureAndRecognizeDishPhoto, PhotoPickCancelledError } from '../services/dishPhotoCapture';
import { ESTIMATED_ITEMS_WARNING, ESTIMATE_WARNING_COLOR } from '../constants/estimateWarning';

type Nav = NativeStackNavigationProp<DishesStackParamList, 'DishForm'>;
type Route = RouteProp<DishesStackParamList, 'DishForm'>;

export default function DishFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const dishId = route.params?.dishId;

  const [name, setName] = useState('');
  const [items, setItems] = useState<IngredientRow[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [matches, setMatches] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [pendingUnmatchedNames, setPendingUnmatchedNames] = useState<
    { name: string; estimatedGrams: number | null }[]
  >([]);

  const handleRecognized = (recognizedItems: RecognizedItem[]) => {
    navigation.navigate('PhotoReview', {
      items: recognizedItems,
      onConfirm: (result) => {
        result.matchedProducts.forEach(({ product, estimatedGrams }) => addIngredient(product, estimatedGrams));
        setPendingUnmatchedNames(result.unmatchedNames);
      },
    });
  };

  const [autoCaptureLoading, setAutoCaptureLoading] = useState(false);
  const [autoCaptureError, setAutoCaptureError] = useState<string | null>(null);

  const runAutoCapture = async (source: 'camera' | 'gallery') => {
    setAutoCaptureError(null);
    setAutoCaptureLoading(true);
    try {
      const recognizedItems = await captureAndRecognizeDishPhoto(source);
      handleRecognized(recognizedItems);
    } catch (e) {
      if (!(e instanceof PhotoPickCancelledError)) {
        setAutoCaptureError(
          e instanceof Error ? e.message : 'Recognition failed. Try again or add ingredients manually.'
        );
      }
    } finally {
      setAutoCaptureLoading(false);
    }
  };

  useEffect(() => {
    if (!route.params?.autoTriggerPhoto) return;
    Alert.alert('Photograph a dish', undefined, [
      { text: 'Take Photo', onPress: () => runAutoCapture('camera') },
      { text: 'Choose from Gallery', onPress: () => runAutoCapture('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ]);
    // Only ever auto-fire once, on this screen instance's initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingUnmatchedNames.length === 0) return;
    const next = pendingUnmatchedNames[0];
    navigation.navigate('ProductForm', {
      prefillName: next.name,
      onCreated: (product) => {
        addIngredient(product, next.estimatedGrams);
        setPendingUnmatchedNames((prev) => prev.slice(1));
      },
    });
  }, [pendingUnmatchedNames]);

  useEffect(() => {
    if (!dishId) return;
    (async () => {
      const db = await openDatabase();
      const dish = await getDish(db, dishId);
      if (dish) {
        setName(dish.name);
        setItems(
          dish.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            carbsPer100g: item.carbsPer100g,
            gramsText: String(item.grams),
            isEstimated: item.isEstimated,
          }))
        );
      }
    })();
  }, [dishId]);

  useEffect(() => {
    if (productSearch.trim() === '') {
      setMatches([]);
      return;
    }
    (async () => {
      const db = await openDatabase();
      setMatches(await listProducts(db, productSearch));
    })();
  }, [productSearch]);

  const addIngredient = (product: Product, estimatedGrams: number | null = null) => {
    setItems((prev) => {
      if (prev.some((item) => item.productId === product.id)) {
        setError('Already added');
        return prev;
      }
      return [...prev, buildIngredientRow(product, estimatedGrams)];
    });
    setProductSearch('');
    setMatches([]);
  };

  const removeIngredient = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const setGrams = (index: number, gramsText: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? applyGramsEdit(item, gramsText) : item)));
  };

  const parsedItems = items.map((item) => ({ ...item, grams: Number(item.gramsText) }));
  const totals = dishTotals(
    parsedItems
      .filter((item) => !Number.isNaN(item.grams) && item.grams > 0)
      .map((item) => ({ carbsPer100g: item.carbsPer100g, grams: item.grams, isEstimated: item.isEstimated }))
  );

  const handleSave = async () => {
    if (name.trim() === '') {
      setError('Name is required');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one ingredient');
      return;
    }
    for (const item of parsedItems) {
      if (Number.isNaN(item.grams) || item.grams <= 0) {
        setError(`Enter a valid weight for ${item.productName}`);
        return;
      }
    }
    setError(null);
    try {
      const db = await openDatabase();
      const input = {
        name: name.trim(),
        items: parsedItems.map((item) => ({
          productId: item.productId,
          grams: item.grams,
          isEstimated: item.isEstimated,
        })),
      };
      if (dishId) {
        await updateDish(db, dishId, input);
      } else {
        await createDish(db, input);
      }
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save dish');
    }
  };

  const handleDelete = () => {
    if (!dishId) return;
    Alert.alert('Delete dish', 'Are you sure you want to delete this dish? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const db = await openDatabase();
          await deleteDish(db, dishId);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container}>
        {autoCaptureLoading && <ActivityIndicator style={styles.autoCaptureLoading} />}
        {autoCaptureError && <Text style={styles.error}>{autoCaptureError}</Text>}

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Rice bowl" />

        <Text style={styles.label}>Ingredients</Text>
        <PhotoRecognitionButton onRecognized={handleRecognized} />
        {items.map((item, index) => (
          <View key={`${item.productId}-${index}`} style={styles.ingredientRow}>
            <Text style={styles.ingredientName}>{item.productName}</Text>
            <TextInput
              style={[styles.gramsInput, item.isEstimated && styles.gramsInputEstimated]}
              value={item.gramsText}
              onChangeText={(text) => setGrams(index, text)}
              placeholder="g"
              keyboardType="numeric"
            />
            {item.isEstimated && <Text style={styles.estimatedLabel}>(estimated)</Text>}
            <TouchableOpacity onPress={() => removeIngredient(index)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TextInput
          style={styles.input}
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="Search products to add"
        />
        {matches.length > 0 && (
          <View style={styles.matchList}>
            {matches.map((item) => (
              <TouchableOpacity key={item.id} style={styles.matchRow} onPress={() => addIngredient(item)}>
                <Text>{item.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.totals}>
          Total: {totals.totalWeight} g · {totals.totalCarbs.toFixed(1)} g carbs · {totals.totalW.toFixed(1)} W
        </Text>
        {totals.hasEstimatedItems && <Text style={styles.estimatedWarning}>{ESTIMATED_ITEMS_WARNING}</Text>}

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>

        {dishId && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16 },
  label: { fontSize: 13, color: '#555', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, marginTop: 4 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  ingredientName: { flex: 1 },
  gramsInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, width: 60, marginRight: 8 },
  gramsInputEstimated: { fontStyle: 'italic', color: '#777' },
  estimatedLabel: { fontSize: 11, color: '#777', marginRight: 8 },
  removeText: { color: '#c62828' },
  matchList: { borderWidth: 1, borderColor: '#eee', marginTop: 4 },
  matchRow: { padding: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  totals: { marginTop: 16, fontWeight: '600' },
  autoCaptureLoading: { marginBottom: 12 },
  estimatedWarning: { color: ESTIMATE_WARNING_COLOR, marginTop: 4, fontSize: 13 },
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
});
