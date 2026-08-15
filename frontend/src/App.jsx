import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { BranchProvider } from './contexts/BranchContext';
import AppRoutes from './routes/AppRoutes';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BranchProvider>
          <AppRoutes />
        </BranchProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
