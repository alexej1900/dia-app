import React from 'react';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <RootNavigator />
    </ErrorBoundary>
  );
}
