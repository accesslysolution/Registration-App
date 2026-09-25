'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FreeEntry } from '@/types';
import { addFreeEntry, getFreeEntries } from '@/lib/storage';

export default function FreeEntryPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Session state for tracking entries & search
  const [entries, setEntries] = useState<FreeEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
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

  // Filtered entries based on search query
  const filteredEntries = entries.filter((entry) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return entry.name.toLowerCase().includes(q) || entry.phone.includes(q);
  });

  // Handle phone change and check for duplicate in session list (blocking)
  const handlePhoneChange = (val: string) => {
    const cleanPhone = val.replace(/\D/g, '').slice(0, 10);
    setPhone(cleanPhone);
    setSaveStatus('idle');

    if (cleanPhone.length === 10) {
      const exists = entries.some((entry) => entry.phone === cleanPhone);
      if (exists) {
        setPhoneError('⚠️ This phone number is already registered!');
        setDuplicateWarning('⚠️ This phone number is already registered as a free entry!');
      } else {
        setPhoneError(null);
        setDuplicateWarning(null);
      }
    } else {
      setPhoneError(null);
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
      // Strict uniqueness check on submit
      const exists = entries.some((entry) => entry.phone === cleanPhone);
      if (exists) {
        setPhoneError('⚠️ This phone number is already registered!');
        isValid = false;
      } else {
        setPhoneError(null);
      }
    }

    if (!isValid) {
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      return;
    }

    setSaveStatus('saving');
    setErrorMessage('');

    try {
      await addFreeEntry({
        name: name.trim(),
        phone: cleanPhone,
        created_by: staffName,
      });

      const updatedEntries = await getFreeEntries();
      setEntries(updatedEntries);

      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }

      setName('');
      setPhone('');
      setDuplicateWarning(null);
      setNameError(null);
      setPhoneError(null);
      setSaveStatus('idle');

      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 2000);

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

  // Helper function to download entries as a CSV (Excel compatible) file
  const handleDownloadExcel = () => {
    if (entries.length === 0) {
      alert('No entries available to download.');
      return;
    }

    const headers = ['Name', 'Phone Number', 'Created By', 'Created At'];
    const rows = entries.map((entry) => [
      `"${entry.name.replace(/"/g, '""')}"`,
      `"+91 ${entry.phone}"`,
      `"${(entry.created_by || 'Gate Staff').replace(/"/g, '""')}"`,
      `"${entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `free_entries_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-32 pt-4 px-4 max-w-[430px] mx-auto font-sans relative">
      
      {/* Header, Session Counter & Download Button */}
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold block">Guest Pass</span>
          <h1 className="text-xl font-black tracking-tight text-white">Free Entry</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadExcel}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/50 px-3 py-2 rounded-xl text-xs font-bold text-amber-400 flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            title="Download Excel / CSV"
          >
            <span>📥</span>
            <span>Excel</span>
          </button>
          <div className="bg-slate-900 border border-amber-500/40 px-3 py-1.5 rounded-xl text-right shadow-md">
            <span className="text-[9px] uppercase text-slate-400 block font-bold">Total</span>
            <span className="text-xl font-black text-amber-400">{entries.length}</span>
          </div>
        </div>
      </div>

      {/* SEARCH / LOOKUP BAR */}
      <div className="mb-5">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search existing guest by name or phone..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-2xl pl-10 pr-4 py-3 text-xs text-white placeholder:text-slate-500 focus:outline-none transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* REGISTRATION FORM */}
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Name Input */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-300">
            Guest Name <span className="text-rose-500">*</span>
          </label>
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
            placeholder="e.g. Amit Shah"
            disabled={saveStatus === 'saving'}
            className={`w-full bg-slate-900 border ${nameError ? 'border-rose-500' : 'border-slate-800 focus:border-amber-500'} rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-all`}
          />
          {nameError && <p className="text-[11px] text-rose-400 font-semibold">{nameError}</p>}
        </div>

        {/* Phone Number Input */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-300">
            Phone Number <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="9876543210"
              disabled={saveStatus === 'saving'}
              className={`w-full bg-slate-900 border ${phoneError ? 'border-rose-500' : 'border-slate-800 focus:border-amber-500'} rounded-2xl pl-12 pr-4 py-3 text-sm tracking-wider text-white placeholder:text-slate-600 focus:outline-none font-mono transition-all`}
            />
          </div>
          {phoneError && <p className="text-[11px] text-rose-400 font-semibold">{phoneError}</p>}
          
          {/* Duplicate Warning */}
          {duplicateWarning && !phoneError && (
            <div className="bg-amber-950/80 border border-amber-500/50 p-2.5 rounded-xl text-[11px] font-semibold text-amber-300 animate-fadeIn">
              {duplicateWarning}
            </div>
          )}
        </div>

        {/* Error Banner */}
        {saveStatus === 'error' && (
          <div className="bg-rose-950 border border-rose-500 p-3 rounded-xl flex items-center justify-between text-xs text-rose-300">
            <span>Failed: {errorMessage}</span>
            <button type="submit" className="font-bold underline uppercase">Retry</button>
          </div>
        )}

        {/* Save Button */}
        <button
          type="submit"
          disabled={saveStatus === 'saving'}
          className={`w-full font-black text-sm py-3.5 rounded-2xl shadow-lg transition-transform active:scale-[0.98] border flex items-center justify-center gap-2 mt-2 ${
            saveStatus === 'saving' 
              ? 'bg-amber-500/50 text-slate-950 border-amber-500/40 cursor-wait' 
              : 'bg-amber-500 active:bg-amber-400 text-slate-950 border-amber-400 shadow-amber-500/20'
          }`}
        >
          <span>{saveStatus === 'saving' ? 'Saving...' : 'Register Free Entry ✓'}</span>
        </button>

      </form>

      {/* ENTRIES LIST (Filtered by search query if active) */}
      <div className="mt-6 space-y-2.5">
        <div className="flex justify-between items-center">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {searchQuery ? `Search Results (${filteredEntries.length})` : 'Recent Free Entries'}
          </h2>
          <span className="text-[10px] text-slate-500 font-mono">Synced</span>
        </div>
        
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-xs bg-slate-900/30 rounded-xl border border-slate-900">
              {searchQuery ? 'No matching guest found.' : 'No entries yet.'}
            </div>
          ) : (
            filteredEntries.map((entry, idx) => (
              <div key={entry.id || idx} className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white block">{entry.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">+91 {entry.phone}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded block mb-0.5">
                    FREE PASS ✓
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {entry.created_at ? new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* TOAST NOTIFICATION */}
      {showToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 font-black px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 border border-emerald-400 text-xs animate-bounce">
          <span>✓ Registered Successfully</span>
        </div>
      )}

    </main>
  );
}