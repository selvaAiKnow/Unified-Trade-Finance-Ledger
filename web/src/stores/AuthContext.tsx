import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { AuthStore } from './AuthStore';

export const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new AuthStore());

  useEffect(() => {
    store.hydrate();
  }, [store]);

  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
}

export function useAuthStore(): AuthStore {
  const store = useContext(AuthContext);
  if (!store) {
    throw new Error('useAuthStore must be used within an AuthProvider');
  }
  return store;
}
