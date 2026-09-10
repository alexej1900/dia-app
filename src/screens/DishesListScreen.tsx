import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { openDatabase } from '../db/database';
import { listDishes, DishSummary } from '../repositories/dishesRepo';
import type { DishesStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<DishesStackParamList, 'DishesList'>;

export default function DishesListScreen() {
  const navigation = useNavigation<Nav>();
  const [search, setSearch] = useState('');
  const [dishes, setDishes] = useState<DishSummary[]>([]);

  const load = useCallback(async (term: string) => {
    const db = await openDatabase();
    setDishes(await listDishes(db, term));
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
        placeholder="Search dishes"
        value={search}
        onChangeText={(text) => {
          setSearch(text);
          load(text);
        }}
      />
      <FlatList
        data={dishes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('DishForm', { dishId: item.id })}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.detail}>
              {item.totalWeight} g · {item.totalCarbs.toFixed(1)} g carbs · {item.totalW.toFixed(1)} W
            </Text>
            {item.hasEstimatedItems && <Text style={styles.estimatedFlag}>⚠ includes unverified estimates</Text>}
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('DishForm', {})}>
        <Text style={styles.addButtonText}>+ Add dish</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.photoButton}
        onPress={() => navigation.navigate('DishForm', { autoTriggerPhoto: true })}
      >
        <Text style={styles.photoButtonText}>📷 Photograph a dish</Text>
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
  addButtonText: { color: '#fff', fontWeight: '600' },
  photoButton: { marginTop: 8, backgroundColor: '#2e7d32', borderRadius: 8, padding: 12, alignItems: 'center' },
  photoButtonText: { color: '#fff', fontWeight: '600' },
  estimatedFlag: { fontSize: 12, color: '#b26a00', marginTop: 2 },
});
