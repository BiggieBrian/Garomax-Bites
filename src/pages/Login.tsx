import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Flame, Delete } from 'lucide-react';

export const Login: React.FC = () => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const { loginWithPin } = useAuth();

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin.length !== 4) {
      setError('Please enter a 4-digit PIN');
      return;
    }

    const success = await loginWithPin(pin);
    if (!success) {
      setError('Invalid PIN code. Try again.');
      setPin('');
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 font-sans flex flex-col items-center justify-center p-4 selection:bg-orange-500 selection:text-white">
      <div className="w-full max-w-sm relative bg-[#0f1117] border border-zinc-800/80 rounded-3xl p-6 shadow-2xl text-center">
        {/* Corner Accents — matches ticket styling used across the app */}
        <div className="absolute top-2 left-2 w-1.5 h-1.5 border-t border-l border-orange-500/60" />
        <div className="absolute top-2 right-2 w-1.5 h-1.5 border-t border-r border-orange-500/60" />
        <div className="absolute bottom-2 left-2 w-1.5 h-1.5 border-b border-l border-zinc-700" />
        <div className="absolute bottom-2 right-2 w-1.5 h-1.5 border-b border-r border-zinc-700" />

        {/* Brand Header */}
        <div className="flex justify-center mb-3">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
            <Flame className="w-7 h-7 text-orange-500" />
          </div>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">Garomax Bites</h1>
        <p className="text-zinc-500 text-[11px] font-mono uppercase tracking-widest mt-1 mb-6">
          Enter Staff PIN To Unlock Terminal
        </p>

        {/* PIN Indicators */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                pin.length > index
                  ? 'bg-orange-500 border-orange-400 scale-110 shadow-lg shadow-orange-500/30'
                  : 'border-zinc-700 bg-zinc-900'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-[11px] font-mono font-semibold mb-4 bg-red-500/10 py-2 rounded-xl border border-red-500/20">
            {error}
          </p>
        )}

        {/* Touch Keypad Grid */}
        <div className="grid grid-cols-3 gap-3 mb-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              className="h-14 text-lg font-mono font-bold rounded-2xl bg-zinc-900/60 hover:bg-zinc-800 active:scale-95 transition-all text-white border border-zinc-800/80"
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleDelete}
            className="h-14 flex items-center justify-center rounded-2xl bg-zinc-900/40 hover:bg-zinc-800 active:scale-95 transition-all text-zinc-500 hover:text-zinc-300 border border-zinc-800/60"
          >
            <Delete className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleKeyPress('0')}
            className="h-14 text-lg font-mono font-bold rounded-2xl bg-zinc-900/60 hover:bg-zinc-800 active:scale-95 transition-all text-white border border-zinc-800/80"
          >
            0
          </button>
          <button
            onClick={() => handleLogin()}
            className="h-14 rounded-2xl bg-orange-500 hover:bg-orange-400 text-zinc-950 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-orange-500/20"
          >
            <Lock className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};