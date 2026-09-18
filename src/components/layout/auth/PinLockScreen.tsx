'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface StaffMember {
  id: string;
  name: string;
  pin: string;
}

interface PinLockScreenProps {
  onLoginSuccess: (staff: StaffMember) => void;
}

export default function PinLockScreen({ onLoginSuccess }: PinLockScreenProps) {
  const [enteredPin, setEnteredPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleDigit = (digit: string) => {
    if (enteredPin.length < 4 && !loading) {
      const nextPin = enteredPin + digit;
      setEnteredPin(nextPin);
      setError(false);
      setErrorMessage('');

      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    if (!loading) {
      setEnteredPin((prev) => prev.slice(0, -1));
      setError(false);
      setErrorMessage('');
    }
  };

  const verifyPin = async (pin: string) => {
    setLoading(true);
    setError(false);
    setErrorMessage('');

    try {
      // Query the live Supabase staff table for a matching PIN
      const { data, error: dbError } = await supabase
        .from('staff')
        .select('*')
        .eq('pin', pin)
        .single();

      if (dbError || !data) {
        throw new Error('Incorrect PIN');
      }

      // Successful verification
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(60);
      }
      
      // Store staff session info
      sessionStorage.setItem('garba_logged_staff', data.name);
      onLoginSuccess(data);
    } catch (err: any) {
      console.error('PIN verification failed:', err);
      setError(true);
      setErrorMessage('Incorrect PIN. Please try again.');
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      setTimeout(() => {
        setEnteredPin('');
        setLoading(false);
      }, 600);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-6 max-w-[430px] mx-auto text-slate-100 font-sans">
      <div className="text-center space-y-2 mb-8">
        <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-3xl flex items-center justify-center mx-auto text-2xl shadow-lg">
          🔐
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white">Gate Staff Login</h1>
        <p className="text-xs text-slate-400">Enter your 4-digit staff PIN to unlock terminal</p>
      </div>

      {/* PIN Dots Display */}
      <div className="flex gap-4 mb-8">
        {[0, 1, 2, 3].map((index) => {
          const isFilled = index < enteredPin.length;
          return (
            <div
              key={index}
              className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center transition-all ${
                error
                  ? 'border-rose-500 bg-rose-500/10 text-rose-400'
                  : isFilled
                  ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                  : 'border-slate-800 bg-slate-900'
              }`}
            >
              {isFilled && <span className="w-3.5 h-3.5 rounded-full bg-amber-400"></span>}
            </div>
          );
        })}
      </div>

      {loading && <p className="text-xs font-bold text-amber-400 mb-4 animate-pulse">Verifying PIN with database...</p>}
      {error && <p className="text-xs font-bold text-rose-400 mb-4 animate-shake">{errorMessage || 'Incorrect PIN'}</p>}

      {/* Mobile Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            disabled={loading}
            className="h-16 bg-slate-900 active:bg-slate-800 disabled:opacity-50 border border-slate-800 rounded-2xl text-2xl font-black text-white shadow-md active:scale-95 transition-transform"
          >
            {digit}
          </button>
        ))}
        <div /> {/* Empty spacer */}
        <button
          type="button"
          onClick={() => handleDigit('0')}
          disabled={loading}
          className="h-16 bg-slate-900 active:bg-slate-800 disabled:opacity-50 border border-slate-800 rounded-2xl text-2xl font-black text-white shadow-md active:scale-95 transition-transform"
        >
          0
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="h-16 bg-slate-900/60 active:bg-slate-800 disabled:opacity-50 border border-slate-800/80 rounded-2xl text-sm font-bold text-slate-400 shadow-md active:scale-95 transition-transform flex items-center justify-center"
        >
          ⌫
        </button>
      </div>

      <div className="mt-8 text-[10px] font-mono text-slate-600">
        Secured via Supabase <span className="text-amber-500">staff</span> table lookup
      </div>
    </div>
  );
}