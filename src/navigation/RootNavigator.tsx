import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProductsListScreen from '../screens/ProductsListScreen';
import ProductFormScreen from '../screens/ProductFormScreen';
import DishesListScreen from '../screens/DishesListScreen';
import DishFormScreen from '../screens/DishFormScreen';
import PhotoReviewScreen from '../screens/PhotoReviewScreen';
import type { Product } from '../repositories/productsRepo';
import type { RecognizedItem } from '../services/dishRecognition';

export type ProductFormParams = {
  productId?: string;
  prefillName?: string;
  onCreated?: (product: Product) => void;
};

export type ProductsStackParamList = {
  ProductsList: undefined;
  ProductForm: ProductFormParams;
};

export type PhotoReviewParams = {
  items: RecognizedItem[];
  onConfirm: (result: {
    matchedProducts: { product: Product; estimatedGrams: number | null }[];
    unmatchedNames: { name: string; estimatedGrams: number | null }[];
  }) => void;
};

export type DishesStackParamList = {
  DishesList: undefined;
  DishForm: { dishId?: string };
  PhotoReview: PhotoReviewParams;
  ProductForm: ProductFormParams;
};

const ProductsStack = createNativeStackNavigator<ProductsStackParamList>();
const DishesStack = createNativeStackNavigator<DishesStackParamList>();
const Tab = createBottomTabNavigator();

function ProductsStackNavigator() {
  return (
    <ProductsStack.Navigator>
      <ProductsStack.Screen name="ProductsList" component={ProductsListScreen} options={{ title: 'Products' }} />
      <ProductsStack.Screen name="ProductForm" component={ProductFormScreen} options={{ title: 'Product' }} />
    </ProductsStack.Navigator>
  );
}

function DishesStackNavigator() {
  return (
    <DishesStack.Navigator>
      <DishesStack.Screen name="DishesList" component={DishesListScreen} options={{ title: 'Dishes' }} />
      <DishesStack.Screen name="DishForm" component={DishFormScreen} options={{ title: 'Dish' }} />
      <DishesStack.Screen
        name="PhotoReview"
        component={PhotoReviewScreen}
        options={{ title: 'Recognized Ingredients' }}
      />
      <DishesStack.Screen name="ProductForm" component={ProductFormScreen} options={{ title: 'Product' }} />
    </DishesStack.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="ProductsTab" component={ProductsStackNavigator} options={{ title: 'Products' }} />
        <Tab.Screen name="DishesTab" component={DishesStackNavigator} options={{ title: 'Dishes' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
