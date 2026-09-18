'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FreeEntry } from '@/types';
import { addFreeEntry, getFreeEntries } from '@/lib/storage';

export default function FreeEntryPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Session state for tracking entries & counter
  const [entries, setEntries] = useState<FreeEntry[]>([]);
  
  // Validation and UI feedback states
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  
  // Save states for backend network handling
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const staffName = typeof window !== 'undefined' ? sessionStorage.getItem('garba_logged_staff') || 'Gate Staff' : 'Gate Staff';

  // Load initial entries from Supabase on mount
  useEffect(() => {
    async function loadEntries() {
      const data = await getFreeEntries();
      setEntries(data);
    }
    loadEntries();
  }, []);

  // Handle phone change and check for duplicate in session list (non-blocking)
  const handlePhoneChange = (val: string) => {
    const cleanPhone = val.replace(/\D/g, '').slice(0, 10);
    setPhone(cleanPhone);
    setPhoneError(null);
    setSaveStatus('idle');

    if (cleanPhone.length === 10) {
      const exists = entries.some((entry) => entry.phone === cleanPhone);
      if (exists) {
        setDuplicateWarning('⚠️ This phone number was already registered in this session!');
      } else {
        setDuplicateWarning(null);
      }
    } else {
      setDuplicateWarning(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let isValid = true;

    if (!name.trim()) {
      setNameError('Name is required');
      isValid = false;
    } else {
      setNameError(null);
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setPhoneError('Enter a valid 10-digit phone number');
      isValid = false;
    } else {
      setPhoneError(null);
    }

    if (!isValid) return;

    setSaveStatus('saving');
    setErrorMessage('');

    try {
      // Save directly using async storage data layer helper
      await addFreeEntry({
        name: name.trim(),
        phone: cleanPhone,
        created_by: staffName,
      });

      // Refresh session entries list from Supabase
      const updatedEntries = await getFreeEntries();
      setEntries(updatedEntries);

      // Haptic feedback if supported
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }

      // Reset form instantly for fast entry of the next person
      setName('');
      setPhone('');
      setDuplicateWarning(null);
      setNameError(null);
      setPhoneError(null);
      setSaveStatus('idle');

      // Show temporary toast notification
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 2000);

      // Refocus name field
      nameInputRef.current?.focus();
    } catch (err: any) {
      console.error('Failed to save free entry:', err);
      setSaveStatus('error');
      setErrorMessage(err.message || 'Network error');
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-32 pt-4 px-4 max-w-[430px] mx-auto font-sans relative">
      
      {/* Header & Session Counter */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <span className="text-xs uppercase tracking-wider text-amber-400 font-bold block">Guest Pass</span>
          <h1 className="text-2xl font-black tracking-tight text-white">Free Entry</h1>
        </div>
        <div className="bg-slate-900 border border-amber-500/40 px-3.5 py-2 rounded-2xl text-right shadow-lg">
          <span className="text-[10px] uppercase text-slate-400 block font-bold">Total Entries</span>
          <span className="text-2xl font-black text-amber-400">{entries.length}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Name Input */}
        <div className="space-y-2">
          <label className="block text-sm font-bold uppercase tracking-wide text-slate-300">
            Guest Name <span className="text-rose-500">*</span>
          </label>
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
            placeholder="e.g. Amit Shah"
            disabled={saveStatus === 'saving'}
            className={`w-full bg-slate-900 border ${nameError ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-800 focus:border-amber-500'} rounded-2xl px-4 py-4 text-lg text-white placeholder:text-slate-600 focus:outline-none transition-all`}
          />
          {nameError && <p className="text-xs text-rose-400 font-semibold mt-1">{nameError}</p>}
        </div>

        {/* Phone Number Input (numeric keypad auto-open) */}
        <div className="space-y-2">
          <label className="block text-sm font-bold uppercase tracking-wide text-slate-300">
            Phone Number <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-lg">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="9876543210"
              disabled={saveStatus === 'saving'}
              className={`w-full bg-slate-900 border ${phoneError ? 'border-rose-500 ring-1 ring-rose-500' : duplicateWarning ? 'border-amber-500/80' : 'border-slate-800 focus:border-amber-500'} rounded-2xl pl-14 pr-4 py-4 text-lg tracking-wider text-white placeholder:text-slate-600 focus:outline-none transition-all`}
            />
          </div>
          {phoneError && <p className="text-xs text-rose-400 font-semibold mt-1">{phoneError}</p>}
          
          {/* Non-blocking duplicate warning banner */}
          {duplicateWarning && (
            <div className="bg-amber-950/80 border border-amber-500/50 p-3 rounded-xl text-xs font-semibold text-amber-300 animate-fadeIn flex items-center justify-between">
              <span>{duplicateWarning}</span>
            </div>
          )}
        </div>

        {/* Error Banner with Retry */}
        {saveStatus === 'error' && (
          <div className="bg-rose-950 border border-rose-500 p-3 rounded-2xl flex items-center justify-between text-xs text-rose-300">
            <span>Failed: {errorMessage}</span>
            <button type="submit" className="font-bold underline uppercase">Tap to Retry</button>
          </div>
        )}

        {/* Save Button */}
        <button
          type="submit"
          disabled={saveStatus === 'saving'}
          className={`w-full font-black text-lg py-4 rounded-2xl shadow-xl transition-transform active:scale-[0.98] border flex items-center justify-center gap-2 mt-4 ${
            saveStatus === 'saving' 
              ? 'bg-amber-500/50 text-slate-950 border-amber-500/40 cursor-wait' 
              : 'bg-amber-500 active:bg-amber-400 text-slate-950 border-amber-400 shadow-amber-500/25'
          }`}
        >
          <span>{saveStatus === 'saving' ? 'Saving to Database...' : 'Save Free Entry'}</span>
          {saveStatus !== 'saving' && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

      </form>

      {/* Recent Session List Preview */}
      {entries.length > 0 && (
        <div className="mt-8 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Free Entries</h2>
            <span className="text-xs text-slate-500 font-mono">Database synced</span>
          </div>
          
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {entries.slice(0, 5).map((entry, idx) => (
              <div key={entry.id || idx} className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-bold text-white block">{entry.name}</span>
                  <span className="font-mono text-xs text-slate-400">+91 {entry.phone}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {entry.created_at ? new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION POPUP */}
      {showToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 font-black px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 border border-emerald-400 animate-bounce">
          <span>✓ Saved Successfully</span>
        </div>
      )}

    </main>
  );
}