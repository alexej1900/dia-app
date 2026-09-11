import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { openDatabase } from '../db/database';
import { listProducts, Product } from '../repositories/productsRepo';
import { gramsPerW } from '../calculations/carbs';
import type { ProductsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<ProductsStackParamList, 'ProductsList'>;

export default function ProductsListScreen() {
  const navigation = useNavigation<Nav>();
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);

  const load = useCallback(async (term: string) => {
    const db = await openDatabase();
    setProducts(await listProducts(db, term));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(search);
    }, [load, search])
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search products"
        value={search}
        onChangeText={(text) => {
          setSearch(text);
          load(text);
        }}
      />
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const perW = gramsPerW(item.carbsPer100g);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('ProductForm', { productId: item.id })}
            >
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.detail}>
                {item.carbsPer100g} g carbs / 100g{perW !== null ? ` · ${perW.toFixed(0)} g = 1 W` : ''}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
      <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('ProductForm', {})}>
        <Text style={styles.addButtonText}>+ Add product</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  search: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, marginBottom: 12 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13, color: '#555' },
  addButton: { marginTop: 12, backgroundColor: '#2e7d32', borderRadius: 8, padding: 12, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
