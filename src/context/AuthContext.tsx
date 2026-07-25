import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { db } from '../db/kibandaDB';

interface AuthContextType {
  currentUser: User | null;
  loginWithPin: (pin: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('garomax_active_user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('garomax_active_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('garomax_active_user');
    }
  }, [currentUser]);

  const loginWithPin = async (pin: string): Promise<boolean> => {
    const user = await db.users.where('pin_code').equals(pin).first();
    if (user) {
      setCurrentUser(user);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loginWithPin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};