import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { BranchProvider } from './contexts/BranchContext';
import { CartProvider } from './contexts/CartContext';
import AppRoutes from './routes/AppRoutes';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BranchProvider>
          <CartProvider>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </CartProvider>
        </BranchProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
