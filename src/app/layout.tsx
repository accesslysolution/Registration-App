'use client';

import React, { useState, useEffect } from 'react';
import { getStaff } from '@/lib/storage';
import { StaffMember } from '@/types';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [loggedStaff, setLoggedStaff] = useState<StaffMember | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [error, setError] = useState(false);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);

  useEffect(() => {
    async function loadStaff() {
      const staff = await getStaff();
      setStaffList(staff);
    }
    loadStaff();

    const savedName = sessionStorage.getItem('garba_logged_staff');
    if (savedName) {
      setLoggedStaff({ name: savedName, pin: '' });
    }
  }, []);

  const handlePinDigit = (digit: string) => {
    if (enteredPin.length < 4) {
      const nextPin = enteredPin + digit;
      setEnteredPin(nextPin);
      setError(false);

      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handlePinDelete = () => {
    setEnteredPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  const verifyPin = (pin: string) => {
    const matched = staffList.find((s) => s.pin === pin);
    if (matched) {
      if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(60);
      sessionStorage.setItem('garba_logged_staff', matched.name);
      setLoggedStaff(matched);
    } else {
      setError(true);
      if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate([100, 50, 100]);
      setTimeout(() => setEnteredPin(''), 500);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('garba_logged_staff');
    setLoggedStaff(null);
    setEnteredPin('');
  };

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
        <title>Garba Gate Entry</title>
      </head>
      <body className="bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-black overscroll-none">
        
        {!loggedStaff ? (
          <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-6 max-w-[430px] mx-auto">
            <div className="text-center space-y-2 mb-8">
              <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-3xl flex items-center justify-center mx-auto text-2xl shadow-lg">
                🔐
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white">Gate Staff Login</h1>
              <p className="text-xs text-slate-400">Enter your 4-digit staff PIN to unlock terminal</p>
            </div>

            <div className="flex gap-4 mb-8">
              {[0, 1, 2, 3].map((index) => {
                const isFilled = index < enteredPin.length;
                return (
                  <div
                    key={index}
                    className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center transition-all ${
                      error ? 'border-rose-500 bg-rose-500/10' : isFilled ? 'border-amber-500 bg-amber-500/20' : 'border-slate-800 bg-slate-900'
                    }`}
                  >
                    {isFilled && <span className="w-3.5 h-3.5 rounded-full bg-amber-400"></span>}
                  </div>
                );
              })}
            </div>

            {error && <p className="text-xs font-bold text-rose-400 mb-4 animate-shake">Incorrect PIN. Try 1234 or 5678</p>}

            <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handlePinDigit(digit)}
                  className="h-16 bg-slate-900 active:bg-slate-800 border border-slate-800 rounded-2xl text-2xl font-black text-white shadow-md active:scale-95 transition-transform"
                >
                  {digit}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => handlePinDigit('0')}
                className="h-16 bg-slate-900 active:bg-slate-800 border border-slate-800 rounded-2xl text-2xl font-black text-white shadow-md active:scale-95 transition-transform"
              >
                0
              </button>
              <button
                type="button"
                onClick={handlePinDelete}
                className="h-16 bg-slate-900/60 active:bg-slate-800 border border-slate-800/80 rounded-2xl text-sm font-bold text-slate-400 shadow-md active:scale-95 transition-transform flex items-center justify-center"
              >
                ⌫
              </button>
            </div>
            <div className="mt-8 text-[10px] font-mono text-slate-600">Default PINs: 1234 / 5678</div>
          </div>
        ) : (
          <div className="min-h-screen flex flex-col max-w-[430px] mx-auto bg-slate-950 relative pb-safe">
            <Header staffName={loggedStaff.name} onLogout={handleLogout} />
            <div className="flex-1 pt-16 pb-20">{children}</div>
          </div>
        )}

      </body>
    </html>
  );
}