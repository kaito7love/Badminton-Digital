import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { BranchProvider } from './contexts/BranchContext';
import AppRoutes from './routes/AppRoutes';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BranchProvider>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </BranchProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
