import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Utensils } from 'lucide-react';

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
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center">
        
        {/* Brand Header */}
        <div className="flex justify-center mb-3 text-amber-500">
          <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
            <Utensils className="w-9 h-9 text-amber-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Garomax Bites</h1>
        <p className="text-slate-400 text-sm mt-1 mb-6">Enter staff PIN to unlock terminal</p>

        {/* PIN Indicators */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                pin.length > index
                  ? 'bg-amber-400 border-amber-400 scale-110 shadow-lg shadow-amber-500/50'
                  : 'border-slate-700 bg-slate-800'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-xs font-semibold mb-4 bg-red-950/50 py-2 rounded-xl border border-red-800/60">
            {error}
          </p>
        )}

        {/* Touch Keypad Grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              className="h-14 text-xl font-bold rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-white shadow-sm border border-slate-700/50"
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleDelete}
            className="h-14 text-xs font-bold uppercase tracking-wider rounded-2xl bg-slate-800/50 hover:bg-slate-800 active:scale-95 text-slate-400 border border-slate-800"
          >
            Clear
          </button>
          <button
            onClick={() => handleKeyPress('0')}
            className="h-14 text-xl font-bold rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-white shadow-sm border border-slate-700/50"
          >
            0
          </button>
          <button
            onClick={() => handleLogin()}
            className="h-14 text-sm font-bold rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-amber-500/20"
          >
            <Lock className="w-5 h-5" />
          </button>
        </div>

        {/* Demo PIN Reference */}
        <div className="text-left text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-slate-400">
          <p className="font-semibold text-slate-300 mb-1">Default Demo PINs:</p>
          <div className="grid grid-cols-3 gap-1 font-mono text-[11px]">
            <div>Admin: <span className="text-amber-400">0000</span></div>
            <div>Cook: <span className="text-amber-400">1111</span></div>
            <div>Waiter: <span className="text-amber-400">2222</span></div>
          </div>
        </div>

      </div>
    </div>
  );
};