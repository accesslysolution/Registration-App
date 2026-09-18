'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PRICING_TIERS } from '@/config/pricing';

interface StaffMember {
  id: string;
  name: string;
  pin: string;
}

export default function SettingsPage() {
  // Event Dates (LocalStorage or Local Config state since they are shared static event parameters)
  const [dates, setDates] = useState([
    { id: 'd1', label: 'Day 1 (Sep 22)' },
    { id: 'd2', label: 'Day 2 (Sep 23)' },
    { id: 'd3', label: 'Day 3 (Sep 24)' },
    { id: 'd4', label: 'Day 4 (Sep 25)' },
    { id: 'd5', label: 'Day 5 (Sep 26)' },
  ]);
  const [newDateLabel, setNewDateLabel] = useState('');

  // Staff list fetched from Supabase
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPin, setNewStaffPin] = useState('');
  
  // Save states for network actions
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [savingStaff, setSavingStaff] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch staff list from Supabase on mount
  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoadingStaff(true);
    try {
      const { data, error } = await supabase.from('staff').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      if (data) setStaffList(data);
    } catch (err: any) {
      console.error('Error fetching staff:', err);
    } finally {
      setLoadingStaff(false);
    }
  };

  // Add Event Date
  const handleAddDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDateLabel.trim()) return;
    const id = `d${dates.length + 1}`;
    setDates([...dates, { id, label: newDateLabel.trim() }]);
    setNewDateLabel('');
  };

  const handleRemoveDate = (id: string) => {
    setDates(dates.filter(d => d.id !== id));
  };

  // Add Staff Member to Supabase
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || newStaffPin.length !== 4) return;

    setSavingStaff(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('staff')
        .insert([
          { name: newStaffName.trim(), pin: newStaffPin }
        ])
        .select('*')
        .single();

      if (error) throw error;

      if (data) {
        setStaffList([...staffList, data]);
      }
      setNewStaffName('');
      setNewStaffPin('');
      if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    } catch (err: any) {
      console.error('Failed to add staff:', err);
      setErrorMessage(err.message || 'Failed to save staff member');
      if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } finally {
      setSavingStaff(false);
    }
  };

  // Remove Staff Member from Supabase
  const handleRemoveStaff = async (id: string) => {
    try {
      const { error } = await supabase.from('staff').delete().eq('id', id);
      if (error) throw error;

      setStaffList(staffList.filter(s => s.id !== id));
      if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    } catch (err: any) {
      console.error('Failed to remove staff:', err);
      alert('Failed to delete staff member from database.');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-32 pt-4 px-4 max-w-[430px] mx-auto font-sans space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <span className="text-xs uppercase tracking-wider text-amber-400 font-bold block">Configuration</span>
          <h1 className="text-2xl font-black tracking-tight text-white">Event Settings</h1>
        </div>
      </div>

      {/* 1. EVENT DATES MANAGEMENT */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-md">
        <h2 className="text-sm font-bold uppercase tracking-wide text-amber-400">Event Dates (Per Day Source)</h2>
        
        <form onSubmit={handleAddDate} className="flex gap-2">
          <input
            type="text"
            value={newDateLabel}
            onChange={(e) => setNewDateLabel(e.target.value)}
            placeholder="e.g. Day 6 (Sep 27)"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
          />
          <button type="submit" className="bg-amber-500 active:bg-amber-400 text-slate-950 font-black px-4 py-3 rounded-xl text-sm">
            Add
          </button>
        </form>

        <div className="space-y-2">
          {dates.map((d) => (
            <div key={d.id} className="bg-slate-950 border border-slate-800/80 px-4 py-3 rounded-xl flex items-center justify-between text-sm">
              <span className="font-bold text-white">{d.label}</span>
              <button onClick={() => handleRemoveDate(d.id)} className="text-rose-400 text-xs font-bold hover:underline">Remove</button>
            </div>
          ))}
        </div>
      </div>

      {/* 2. PRICING TABLE (Tied to shared pricing-config module) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-md">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-400">Pricing Matrix (Read-Only Config)</h2>
          <span className="text-[10px] text-slate-500 font-mono">src/config/pricing.ts</span>
        </div>
        
        <div className="space-y-2 text-xs">
          {PRICING_TIERS.map((tier, idx) => (
            <div key={idx} className="bg-slate-950 border border-slate-800/80 p-3 rounded-xl flex justify-between items-center">
              <span className="font-bold text-slate-300">
                Group Size: {tier.minPersons} {tier.maxPersons ? `– ${tier.maxPersons}` : '+'}
              </span>
              <div className="text-right">
                <span className="text-amber-400 font-bold block">Full: ₹{tier.fullSeasonRate}</span>
                <span className="text-slate-400">Per Day: ₹{tier.perDayRate}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. STAFF & PIN MANAGEMENT (Wired to Supabase) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-md">
        <h2 className="text-sm font-bold uppercase tracking-wide text-amber-400">Gate Staff & PINs (Supabase)</h2>
        
        <form onSubmit={handleAddStaff} className="space-y-3">
          <input
            type="text"
            value={newStaffName}
            onChange={(e) => setNewStaffName(e.target.value)}
            placeholder="Staff Name / Gate Location"
            disabled={savingStaff}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
          />
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="numeric"
              maxLength={4}
              value={newStaffPin}
              onChange={(e) => setNewStaffPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4-Digit PIN"
              disabled={savingStaff}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-sm text-white tracking-widest font-mono focus:outline-none focus:border-amber-500"
            />
            <button 
              type="submit" 
              disabled={savingStaff}
              className={`font-black px-5 py-3 rounded-xl text-sm ${
                savingStaff ? 'bg-amber-500/50 text-slate-950 cursor-wait' : 'bg-amber-500 active:bg-amber-400 text-slate-950'
              }`}
            >
              {savingStaff ? 'Saving...' : 'Add Staff'}
            </button>
          </div>
        </form>

        {errorMessage && (
          <div className="bg-rose-950 border border-rose-500 p-3 rounded-xl flex items-center justify-between text-xs text-rose-300">
            <span>{errorMessage}</span>
            <button onClick={handleAddStaff} className="font-bold underline uppercase">Retry</button>
          </div>
        )}

        <div className="space-y-2">
          {loadingStaff ? (
            <div className="text-center py-4 text-xs text-slate-500">Loading staff from database...</div>
          ) : staffList.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-500">No staff members found in database.</div>
          ) : (
            staffList.map((staff) => (
              <div key={staff.id} className="bg-slate-950 border border-slate-800/80 px-4 py-3 rounded-xl flex items-center justify-between text-sm">
                <div>
                  <span className="font-bold text-white block">{staff.name}</span>
                  <span className="font-mono text-xs text-amber-400">PIN: {staff.pin}</span>
                </div>
                <button onClick={() => handleRemoveStaff(staff.id)} className="text-rose-400 text-xs font-bold hover:underline">Remove</button>
              </div>
            ))
          )}
        </div>
      </div>

    </main>
  );
}