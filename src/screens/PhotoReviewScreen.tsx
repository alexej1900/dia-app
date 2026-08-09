import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { openDatabase } from '../db/database';
import { getProductByName, Product } from '../repositories/productsRepo';
import type { DishesStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<DishesStackParamList, 'PhotoReview'>;
type Route = RouteProp<DishesStackParamList, 'PhotoReview'>;

interface ReviewRow {
  name: string;
  product: Product | null;
  checked: boolean;
}

export default function PhotoReviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { items, onConfirm } = route.params;

  const [rows, setRows] = useState<ReviewRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const db = await openDatabase();
      const resolved = await Promise.all(
        items.map(async (item) => {
          const product = item.matchedProductName ? await getProductByName(db, item.matchedProductName) : null;
          return { name: item.name, product, checked: true };
        })
      );
      setRows(resolved);
    })();
  }, [items]);

  const toggle = (index: number) => {
    setRows((prev) => (prev ? prev.map((row, i) => (i === index ? { ...row, checked: !row.checked } : row)) : prev));
  };

  const handleConfirm = () => {
    if (!rows) return;
    const matchedProducts = rows.filter((r) => r.checked && r.product).map((r) => r.product as Product);
    const unmatchedNames = rows.filter((r) => r.checked && !r.product).map((r) => r.name);
    onConfirm({ matchedProducts, unmatchedNames });
    navigation.goBack();
  };

  if (rows === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Text>No ingredients recognized.</Text>
        <TouchableOpacity style={styles.saveButton} onPress={() => navigation.goBack()}>
          <Text style={styles.saveButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Recognized ingredients</Text>
      {rows.map((row, index) => (
        <TouchableOpacity key={`${row.name}-${index}`} style={styles.row} onPress={() => toggle(index)}>
          <Text style={styles.checkbox}>{row.checked ? '\u2611' : '\u2610'}</Text>
          <Text style={styles.rowText}>{row.product ? row.product.name : `New: ${row.name}`}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.saveButton} onPress={handleConfirm}>
        <Text style={styles.saveButtonText}>Add to dish</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, color: '#555', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  checkbox: { fontSize: 20, marginRight: 12 },
  rowText: { fontSize: 16 },
  saveButton: { marginTop: 20, backgroundColor: '#2e7d32', borderRadius: 8, padding: 12, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '600' },
});
