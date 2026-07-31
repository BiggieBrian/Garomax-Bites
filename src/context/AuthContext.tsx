import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { db } from '../db/kibandaDB';
import { requestSync } from '../db/sync';

interface AuthContextType {
  currentUser: User | null;
  loginWithPin: (pin: string) => Promise<boolean>;
  logout: () => void;
  updateOwnName: (name: string) => Promise<void>;
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

  const updateOwnName = async (name: string) => {
    const trimmed = name.trim();
    if (!currentUser || !trimmed) return;
    await db.users.update(currentUser.user_id, { name: trimmed, synced: false });
    requestSync();
    setCurrentUser({ ...currentUser, name: trimmed });
  };

  return (
    <AuthContext.Provider value={{ currentUser, loginWithPin, logout, updateOwnName }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};