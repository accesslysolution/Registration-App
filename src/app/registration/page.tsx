'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { PassType, PaymentMode, RegistrationWithMembers } from '@/types';
import { addRegistration, getNextPassNo } from '@/lib/storage';
import { getRatesForGroupSize } from '@/config/pricing';
import Link from 'next/link';

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';
type PaymentStatusType = 'full' | 'partial' | 'pending';

const FIXED_PER_DAY_RATE = 300;

// Event dates from Sep 27 to Oct 6 (2026) with Day and Date label
const GARBA_EVENT_DATES = [
  { id: 'd1', label: 'Sun, Sep 27' },
  { id: 'd2', label: 'Mon, Sep 28' },
  { id: 'd3', label: 'Tue, Sep 29' },
  { id: 'd4', label: 'Wed, Sep 30' },
  { id: 'd5', label: 'Thu, Oct 1' },
  { id: 'd6', label: 'Fri, Oct 2' },
  { id: 'd7', label: 'Sat, Oct 3' },
  { id: 'd8', label: 'Sun, Oct 4' },
  { id: 'd9', label: 'Mon, Oct 5' },
  { id: 'd10', label: 'Tue, Oct 6' },
];

export default function RegistrationPage() {
  const [nextPassNo, setNextPassNo] = useState<number>(1);

  // Form State
  const [persons, setPersons] = useState<number>(1);
  const [members, setMembers] = useState<{ name: string; phone: string }[]>([{ name: '', phone: '' }]);
  const [memberErrors, setMemberErrors] = useState<{ name?: string; phone?: string }[]>([]);

  const [passType, setPassType] = useState<PassType>('full-season');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  
  // Payment Status & Partial Amount State
  const [paymentStatusType, setPaymentStatusType] = useState<PaymentStatusType>('full');
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');

  // Save / Network states
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [datesError, setDatesError] = useState<string | null>(null);

  // Full-screen confirmation card state for multi-member booking
  const [confirmedBooking, setConfirmedBooking] = useState<RegistrationWithMembers | null>(null);

  const staffName = typeof window !== 'undefined' ? sessionStorage.getItem('garba_logged_staff') || 'Gate Staff' : 'Gate Staff';

  useEffect(() => {
    async function fetchNextPass() {
      const passNo = await getNextPassNo();
      setNextPassNo(passNo);
    }
    fetchNextPass();
  }, []);

  // Sync members array length and error state with 'persons' stepper
  useEffect(() => {
    setMembers((prev) => {
      if (prev.length === persons) return prev;
      if (prev.length < persons) {
        const additions = Array.from({ length: persons - prev.length }, () => ({ name: '', phone: '' }));
        return [...prev, ...additions];
      }
      return prev.slice(0, persons);
    });
    setMemberErrors((prev) => prev.slice(0, persons));
  }, [persons]);

  // Live calculations using shared config module
  const rates = useMemo(() => getRatesForGroupSize(persons), [persons]);
  
  // Current rate per person for display/storage
  const currentRatePerPerson = passType === 'full-season' ? rates.fullSeasonRate : FIXED_PER_DAY_RATE;
  
  const liveTotal = useMemo(() => {
    if (passType === 'full-season') {
      return persons * rates.fullSeasonRate;
    } else {
      // Per day: ₹300 * number of persons * number of selected dates
      return persons * FIXED_PER_DAY_RATE * Math.max(1, selectedDates.length);
    }
  }, [passType, persons, selectedDates, rates]);

  // Resolved Paid Amount & IsPaid flag based on selection type
  const resolvedPaidAmount = useMemo(() => {
    if (paymentStatusType === 'full') return liveTotal;
    if (paymentStatusType === 'pending') return 0;
    return parseFloat(paidAmountInput) || 0;
  }, [paymentStatusType, liveTotal, paidAmountInput]);

  const isFullyPaid = paymentStatusType === 'full' || resolvedPaidAmount >= liveTotal;

  // Handlers for Group Size Stepper
  const handleDecrementPersons = () => setPersons((prev) => Math.max(1, prev - 1));
  const handleIncrementPersons = () => setPersons((prev) => prev + 1);

  const handleMemberChange = (index: number, field: 'name' | 'phone', value: string) => {
    setMembers((prev) => {
      const updated = [...prev];
      if (field === 'phone') {
        updated[index][field] = value.replace(/\D/g, '').slice(0, 10);
      } else {
        updated[index][field] = value;
      }
      return updated;
    });
  };

  // Date Chip Toggle
  const toggleDate = (dateId: string) => {
    setDatesError(null);
    setSelectedDates((prev) => 
      prev.includes(dateId) ? prev.filter(d => d !== dateId) : [...prev, dateId]
    );
  };

  // Submit and Save using Supabase backend storage layer
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let isValid = true;
    const errors: { name?: string; phone?: string }[] = [];

    members.forEach((m, idx) => {
      const err: { name?: string; phone?: string } = {};
      if (!m.name.trim()) {
        err.name = 'Name required';
        isValid = false;
      }
      if (m.phone.length !== 10) {
        err.phone = '10 digits required';
        isValid = false;
      }
      errors[idx] = err;
    });

    setMemberErrors(errors);

    if (passType === 'per-day' && selectedDates.length === 0) {
      setDatesError('Select at least one date for Per Day pass');
      isValid = false;
    } else {
      setDatesError(null);
    }

    if (!isValid) return;

    setSaveStatus('saving');
    setErrorMessage('');

    try {
      const newBooking = await addRegistration(
        {
          pass_type: passType,
          valid_dates: selectedDates,
          persons,
          rate: currentRatePerPerson,
          total: liveTotal,
          paid_amount: resolvedPaidAmount,
          payment_mode: paymentMode,
          paid: isFullyPaid,
          created_by: staffName,
        },
        members
      );

      setSaveStatus('success');
      setConfirmedBooking(newBooking);

      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(80);
      }
    } catch (err: any) {
      console.error('Failed to save registration:', err);
      setSaveStatus('error');
      setErrorMessage(err.message || 'Error while saving registration');
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }
  };

  // Reset form for next entry after confirmation
  const handleResetForNext = async () => {
    setPersons(1);
    setMembers([{ name: '', phone: '' }]);
    setPassType('full-season');
    setSelectedDates([]);
    setPaymentMode('cash');
    setPaymentStatusType('full');
    setPaidAmountInput('');
    setMemberErrors([]);
    setDatesError(null);
    setSaveStatus('idle');
    setConfirmedBooking(null);
    const passNo = await getNextPassNo();
    setNextPassNo(passNo);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-32 pt-4 px-4 max-w-[430px] mx-auto font-sans selection:bg-amber-500 selection:text-black">
      
      {/* Top Header info */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <span className="text-xs uppercase tracking-wider text-amber-400 font-bold block">Gate Terminal</span>
          <h1 className="text-2xl font-black tracking-tight text-white">New Registration</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="bg-slate-900 border border-amber-500/40 px-3 py-1.5 rounded-xl text-right shadow-lg">
            <span className="text-[10px] uppercase text-slate-400 block">Starting Pass</span>
            <span className="text-xl font-black text-amber-400">#{nextPassNo}</span>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <Link 
              href="/groups" 
              className="text-[11px] font-bold text-amber-400 hover:underline flex items-center gap-0.5"
            >
              <span>View Groups</span>
              <span>↗</span>
            </Link>
            <span className="text-slate-700">•</span>
            <Link 
              href="/manual-registration" 
              className="text-[11px] font-bold text-amber-400 hover:underline flex items-center gap-0.5"
            >
              <span>Manual Pricing</span>
              <span>↗</span>
            </Link>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* 1. Number of Persons (Stepper) */}
        <div className="space-y-2 bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-bold uppercase tracking-wide text-slate-300">
              Number of Persons
            </label>
            <span className="text-xs bg-amber-500/10 text-amber-400 font-bold px-2.5 py-1 rounded-lg border border-amber-500/20">
              Rate: ₹{currentRatePerPerson}{passType === 'per-day' ? '/p/day' : '/p'}
            </span>
          </div>
          
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleDecrementPersons}
              disabled={persons <= 1 || saveStatus === 'saving'}
              className="w-16 h-14 bg-slate-800 active:bg-slate-700 disabled:opacity-30 text-white text-2xl font-black rounded-xl flex items-center justify-center transition-transform active:scale-95 shadow-md border border-slate-700"
            >
              -
            </button>
            
            <div className="text-center">
              <span className="text-3xl font-black text-white">{persons}</span>
              <span className="text-xs text-slate-400 block uppercase tracking-wider">{persons === 1 ? 'Pass' : 'Passes'}</span>
            </div>

            <button
              type="button"
              onClick={handleIncrementPersons}
              disabled={saveStatus === 'saving'}
              className="w-16 h-14 bg-slate-800 active:bg-slate-700 text-white text-2xl font-black rounded-xl flex items-center justify-center transition-transform active:scale-95 shadow-md border border-slate-700"
            >
              +
            </button>
          </div>
        </div>

        {/* 2. Dynamic Individual Attendee Details Fields */}
        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Individual Pass Details ({persons} {persons === 1 ? 'Person' : 'Persons'})
          </label>
          
          {members.map((mem, idx) => {
            const errs = memberErrors[idx] || {};
            return (
              <div key={idx} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">Person #{idx + 1}</span>
                  <span className="text-[10px] text-slate-500 font-mono">Unique Pass #{(nextPassNo + idx)}</span>
                </div>

                <div className="space-y-1">
                  <input
                    type="text"
                    value={mem.name}
                    onChange={(e) => handleMemberChange(idx, 'name', e.target.value)}
                    placeholder={`Full Name of Person ${idx + 1}`}
                    disabled={saveStatus === 'saving'}
                    className={`w-full bg-slate-950 border ${errs.name ? 'border-rose-500' : 'border-slate-800 focus:border-amber-500'} rounded-xl px-3.5 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-all`}
                  />
                  {errs.name && <p className="text-[10px] text-rose-400 font-semibold">{errs.name}</p>}
                </div>

                <div className="space-y-1">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={10}
                      value={mem.phone}
                      onChange={(e) => handleMemberChange(idx, 'phone', e.target.value)}
                      placeholder="9876543210"
                      disabled={saveStatus === 'saving'}
                      className={`w-full bg-slate-950 border ${errs.phone ? 'border-rose-500' : 'border-slate-800 focus:border-amber-500'} rounded-xl pl-12 pr-3.5 py-3 text-sm tracking-wider text-white placeholder:text-slate-600 focus:outline-none font-mono transition-all`}
                    />
                  </div>
                  {errs.phone && <p className="text-[10px] text-rose-400 font-semibold">{errs.phone}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. Pass Type Toggle */}
        <div className="space-y-2">
          <label className="block text-sm font-bold uppercase tracking-wide text-slate-300">
            Pass Type (Shared for Group)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={saveStatus === 'saving'}
              onClick={() => { setPassType('full-season'); setDatesError(null); }}
              className={`py-4 px-3 rounded-2xl font-black text-base border transition-all active:scale-95 ${
                passType === 'full-season'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              Full Season
            </button>
            <button
              type="button"
              disabled={saveStatus === 'saving'}
              onClick={() => setPassType('per-day')}
              className={`py-4 px-3 rounded-2xl font-black text-base border transition-all active:scale-95 ${
                passType === 'per-day'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              Per Day (₹300)
            </button>
          </div>
        </div>

        {/* 4. Conditional Date Chips Selector (if Per Day - Sep 27 to Oct 6) */}
        {passType === 'per-day' && (
          <div className="space-y-2 bg-slate-900/40 p-4 rounded-2xl border border-amber-500/30 animate-fadeIn">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
                Select Event Dates (Sep 27 - Oct 6) <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs text-slate-400 font-semibold">{selectedDates.length} selected</span>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {GARBA_EVENT_DATES.map((d) => {
                const isSelected = selectedDates.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={saveStatus === 'saving'}
                    onClick={() => toggleDate(d.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border active:scale-95 ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            {datesError && <p className="text-xs text-rose-400 font-semibold mt-2">{datesError}</p>}
          </div>
        )}

        {/* 5. Payment Mode & Payment Status Toggles (Full, Partial, Pending) */}
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Payment Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saveStatus === 'saving'}
                onClick={() => setPaymentMode('cash')}
                className={`py-3 rounded-xl font-bold text-sm border transition-all ${
                  paymentMode === 'cash' ? 'bg-slate-800 text-amber-400 border-amber-500/50' : 'bg-slate-900/60 text-slate-500 border-slate-800'
                }`}
              >
                Cash
              </button>
              <button
                type="button"
                disabled={saveStatus === 'saving'}
                onClick={() => setPaymentMode('upi')}
                className={`py-3 rounded-xl font-bold text-sm border transition-all ${
                  paymentMode === 'upi' ? 'bg-slate-800 text-amber-400 border-amber-500/50' : 'bg-slate-900/60 text-slate-500 border-slate-800'
                }`}
              >
                UPI
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Payment Status</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={saveStatus === 'saving'}
                onClick={() => { setPaymentStatusType('full'); setPaidAmountInput(''); }}
                className={`py-3 rounded-xl font-bold text-xs border transition-all ${
                  paymentStatusType === 'full' ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/50' : 'bg-slate-900/60 text-slate-500 border-slate-800'
                }`}
              >
                Paid (Full)
              </button>
              <button
                type="button"
                disabled={saveStatus === 'saving'}
                onClick={() => setPaymentStatusType('partial')}
                className={`py-3 rounded-xl font-bold text-xs border transition-all ${
                  paymentStatusType === 'partial' ? 'bg-amber-950/80 text-amber-400 border-amber-500/50' : 'bg-slate-900/60 text-slate-500 border-slate-800'
                }`}
              >
                Partial
              </button>
              <button
                type="button"
                disabled={saveStatus === 'saving'}
                onClick={() => { setPaymentStatusType('pending'); setPaidAmountInput(''); }}
                className={`py-3 rounded-xl font-bold text-xs border transition-all ${
                  paymentStatusType === 'pending' ? 'bg-rose-950/80 text-rose-400 border-rose-500/50' : 'bg-slate-900/60 text-slate-500 border-slate-800'
                }`}
              >
                Pending
              </button>
            </div>
          </div>

          {/* Conditional Partial Amount Input */}
          {paymentStatusType === 'partial' && (
            <div className="bg-slate-900 border border-amber-500/40 p-4 rounded-2xl space-y-2 animate-fadeIn">
              <label className="text-xs font-bold uppercase tracking-wide text-amber-400 block">
                Enter Amount Received (₹)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400 font-bold text-lg">₹</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder={`Total is ₹${liveTotal}`}
                  className="w-full bg-slate-950 border border-amber-500/60 rounded-xl pl-10 pr-4 py-3 text-lg font-black text-amber-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                <span>Total: ₹{liveTotal}</span>
                <span className="text-rose-400 font-bold">Balance Due: ₹{Math.max(0, liveTotal - resolvedPaidAmount)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Live Calculation Banner */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-xl mt-6">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Live Summary</span>
            <div className="text-xs text-slate-300 font-medium">
              {persons} {persons === 1 ? 'pass' : 'passes'} × ₹{currentRatePerPerson}
              {passType === 'per-day' ? ` × ${selectedDates.length} days` : ''}
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-amber-400">₹{liveTotal}</span>
            {paymentStatusType === 'partial' && (
              <span className="text-[10px] text-emerald-400 block font-bold">Paid: ₹{resolvedPaidAmount}</span>
            )}
          </div>
        </div>

        {/* Error Banner with Retry */}
        {saveStatus === 'error' && (
          <div className="bg-rose-950 border border-rose-500 p-3 rounded-2xl flex items-center justify-between text-xs text-rose-300">
            <span>Failed: {errorMessage}</span>
            <button type="submit" className="font-bold underline uppercase">Tap to Retry</button>
          </div>
        )}

        {/* Submit Big Action Button */}
        <button
          type="submit"
          disabled={saveStatus === 'saving'}
          className={`w-full font-black text-lg py-4 rounded-2xl shadow-xl transition-transform active:scale-[0.98] border flex items-center justify-center gap-2 mt-4 ${
            saveStatus === 'saving'
              ? 'bg-amber-500/50 text-slate-950 border-amber-500/40 cursor-wait'
              : 'bg-amber-500 active:bg-amber-400 text-slate-950 border-amber-400 shadow-amber-500/25'
          }`}
        >
          <span>{saveStatus === 'saving' ? 'Saving to Database...' : `Generate ${persons} Individual Passes`}</span>
          {saveStatus !== 'saving' && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          )}
        </button>

      </form>

      {/* FULL-SCREEN CONFIRMATION MODAL CARD */}
      {confirmedBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-amber-500 w-full max-w-[390px] rounded-3xl p-6 shadow-2xl text-center space-y-5 relative overflow-hidden max-h-[90vh] flex flex-col">
            
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-500 via-emerald-400 to-amber-500 animate-pulse"></div>

            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40 text-2xl shadow-inner shrink-0">
              ✓
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400 block mb-0.5">Registration Successful</span>
              <h2 className="text-2xl font-black text-white tracking-tight">{confirmedBooking.persons} Passes Generated</h2>
            </div>

            {/* List of assigned passes */}
            <div className="space-y-2 text-left overflow-y-auto pr-1 grow">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Pass Numbers & Wristbands:</span>
              {confirmedBooking.members.map((m) => (
                <div key={m.pass_no} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-amber-400 font-black text-base">#{m.pass_no}</span>
                    <span className="text-xs font-bold text-white block">{m.name}</span>
                  </div>
                  <span className="font-mono text-xs text-slate-400">+91 {m.phone}</span>
                </div>
              ))}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex justify-between items-center shrink-0">
              <div className="text-left">
                <span className="text-[10px] uppercase font-bold text-amber-400 block">Total: ₹{confirmedBooking.total}</span>
                <span className="text-xs font-bold text-emerald-400">Paid: ₹{confirmedBooking.paid_amount ?? (confirmedBooking.paid ? confirmedBooking.total : 0)}</span>
              </div>
              <span className="text-xl font-black text-rose-400">Due: ₹{Math.max(0, confirmedBooking.total - (confirmedBooking.paid_amount ?? (confirmedBooking.paid ? confirmedBooking.total : 0)))}</span>
            </div>

            <button
              type="button"
              onClick={handleResetForNext}
              className="w-full bg-amber-500 active:bg-amber-400 text-slate-950 font-black text-base py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 border border-amber-400 shrink-0"
            >
              Register Next Group
            </button>

          </div>
        </div>
      )}

    </main>
  );
}