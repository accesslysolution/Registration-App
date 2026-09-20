'use client';

import React, { useState, useRef, useEffect } from 'react';
import { RegistrationMember, PassType, RegistrationGroup } from '@/types';
import { getRegistrationMembers, getRegistrationGroups, getAttendanceForPass, markAttendance } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

type AttendanceStatusType = 
  | 'NOT_FOUND' 
  | 'INVALID_DATE' 
  | 'READY' 
  | 'ALREADY_INSIDE';

interface ScanEvaluation {
  status: AttendanceStatusType;
  member?: RegistrationMember;
  group?: RegistrationGroup;
  passType?: PassType;
  validDates?: string[];
  lastEntryTime?: string | null;
}

export default function AttendancePage() {
  const [searchInput, setSearchInput] = useState('');
  const [evalResult, setEvalResult] = useState<ScanEvaluation | null>(null);
  const [groupMembers, setGroupMembers] = useState<RegistrationMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [clearingPayment, setClearingPayment] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const staffName = typeof window !== 'undefined' ? sessionStorage.getItem('garba_logged_staff') || 'Gate Staff' : 'Gate Staff';

  // Automatically determine today's event date string (Format: YYYY-MM-DD ensures daily reset/isolation)
  const todayEventDateId = new Date().toISOString().split('T')[0];

  const formattedDisplayDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle Lookup Check against Supabase Database Layer (Pass # or Phone #)
  const handleCheckPass = async (e?: React.FormEvent, overridePassNo?: number) => {
    if (e) e.preventDefault();
    const query = overridePassNo !== undefined ? overridePassNo.toString() : searchInput.trim();
    
    if (!query) return;

    setLoading(true);
    setActionStatus('idle');
    setErrorMessage('');

    try {
      const members = await getRegistrationMembers();
      const groups = await getRegistrationGroups();

      let member: RegistrationMember | undefined;

      // Check if query is a pass number or phone number
      const isNumeric = /^\d+$/.test(query);
      if (isNumeric && query.length <= 5) {
        // Search by exact pass number
        const passNo = parseInt(query, 10);
        member = members.find((m) => m.pass_no === passNo);
      } else {
        // Search by phone number (or partial phone match)
        const cleanQuery = query.replace(/\D/g, '');
        member = members.find((m) => m.phone.includes(cleanQuery));
      }

      if (!member) {
        setEvalResult({ status: 'NOT_FOUND' });
        setGroupMembers([]);
        triggerVibration('error');
        setLoading(false);
        return;
      }

      // Fetch parent booking group
      const group = groups.find((g) => g.id === member.group_id);
      const passType = group ? group.pass_type : 'full-season';
      const validDates = group ? group.valid_dates : [];

      // Fetch all members belonging to this same group for group payment visibility
      const relatedMembers = members.filter((m) => m.group_id === member.group_id);
      setGroupMembers(relatedMembers);

      // Validate Per-Day pass for today's event date if applicable
      if (passType === 'per-day' && validDates && validDates.length > 0) {
        const isDateAllowed = validDates.includes(todayEventDateId) || validDates.some(d => todayEventDateId.includes(d));
        if (!isDateAllowed) {
          setEvalResult({
            status: 'INVALID_DATE',
            member,
            group,
            passType,
            validDates,
          });
          triggerVibration('error');
          setLoading(false);
          return;
        }
      }

      // Check live attendance table in Supabase for TODAY'S entry specifically
      const attendanceLog = await getAttendanceForPass(member.pass_no, todayEventDateId);
      
      if (attendanceLog) {
        const lastEntryTime = new Date(attendanceLog.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setEvalResult({
          status: 'ALREADY_INSIDE',
          member,
          group,
          passType,
          lastEntryTime,
        });
      } else {
        setEvalResult({
          status: 'READY',
          member,
          group,
          passType,
        });
      }

      triggerVibration('success');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error checking pass with database');
    } finally {
      setLoading(false);
    }
  };

  // Handle Instant Payment Clearance for the entire group
  const handleClearPayment = async () => {
    if (!evalResult || !evalResult.group) return;
    const groupId = evalResult.group.id;
    const totalAmount = evalResult.group.total;

    setClearingPayment(true);
    try {
      const { data, error } = await supabase
        .from('registration_groups')
        .update({
          paid_amount: totalAmount,
          paid: true,
        })
        .eq('id', groupId)
        .select('*')
        .single();

      if (error) throw error;

      // Update local evaluation state with the newly cleared group data
      setEvalResult((prev) => prev ? { ...prev, group: data } : null);
      triggerVibration('success');
    } catch (err: any) {
      console.error('Failed to clear payment:', err);
      alert(err.message || 'Failed to update payment status');
      triggerVibration('error');
    } finally {
      setClearingPayment(false);
    }
  };

  // Handle Marking Daily Attendance in Supabase Database
  const handleMarkPresent = async () => {
    if (!evalResult || !evalResult.member) return;
    const passNo = evalResult.member.pass_no;

    setActionStatus('saving');
    setErrorMessage('');

    try {
      // Passes current dynamic daily date ID so entries reset automatically on date change
      const res = await markAttendance(passNo, todayEventDateId, staffName);

      if (!res.success) {
        setActionStatus('error');
        setErrorMessage(res.message || 'Entry rejected by database.');
        triggerVibration('error');
        return;
      }

      setActionStatus('idle');
      triggerVibration('success');

      // Reset input, clear evaluation, and refocus immediately for the next staff scan
      setSearchInput('');
      setEvalResult(null);
      setGroupMembers([]);
      inputRef.current?.focus();
    } catch (err: any) {
      console.error(err);
      setActionStatus('error');
      setErrorMessage(err.message || 'Failed to save attendance to database');
      triggerVibration('error');
    }
  };

  // Handle Unmarking / Undoing Today's Attendance Entry
  const handleUnmarkPresent = async () => {
    if (!evalResult || !evalResult.member) return;
    const passNo = evalResult.member.pass_no;

    setActionStatus('saving');
    setErrorMessage('');

    try {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('pass_no', passNo)
        .eq('event_date', todayEventDateId);

      if (error) throw error;

      triggerVibration('success');

      // Re-run check pass to immediately update screen back to "READY" state from database
      await handleCheckPass(undefined, passNo);
      setActionStatus('idle');
    } catch (err: any) {
      console.error(err);
      setActionStatus('error');
      setErrorMessage('Failed to unmark attendance in database');
      triggerVibration('error');
    }
  };

  const triggerVibration = (type: 'success' | 'error') => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      if (type === 'error') {
        navigator.vibrate([120, 60, 120]);
      } else {
        navigator.vibrate(60);
      }
    }
  };

  const handleResetScan = () => {
    setSearchInput('');
    setEvalResult(null);
    setGroupMembers([]);
    setActionStatus('idle');
    setErrorMessage('');
    inputRef.current?.focus();
  };

  // Calculate Group Payment details
  const groupTotal = evalResult?.group?.total ?? 0;
  const groupPaidAmount = evalResult?.group?.paid_amount ?? (evalResult?.group?.paid ? groupTotal : 0);
  const groupPendingAmount = Math.max(0, groupTotal - groupPaidAmount);
  const isGroupFullyPaid = groupPendingAmount <= 0 || (evalResult?.group?.paid ?? false);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-32 pt-4 px-4 max-w-[430px] mx-auto font-sans">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <span className="text-xs uppercase tracking-wider text-amber-400 font-bold block">Gate Terminal & Pass Desk</span>
          <h1 className="text-2xl font-black tracking-tight text-white">Live Attendance</h1>
        </div>
        <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-right">
          <span className="text-[10px] uppercase text-slate-400 block">Today's Date</span>
          <span className="text-xs font-bold text-amber-400">{formattedDisplayDate}</span>
        </div>
      </div>

      {/* Search Input Form (Pass # or Phone #) */}
      <form onSubmit={(e) => handleCheckPass(e)} className="space-y-4 mb-6">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400 font-black text-xl">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Pass # or 10-Digit Phone"
            disabled={loading}
            className="w-full bg-slate-900 border-2 border-slate-800 focus:border-amber-500 rounded-2xl pl-12 pr-28 py-4 text-lg font-bold tracking-wider text-white placeholder:text-slate-600 focus:outline-none transition-all shadow-inner"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-amber-500 active:bg-amber-400 disabled:opacity-50 text-slate-950 font-black px-5 py-3 rounded-xl text-sm transition-transform active:scale-95 shadow-md"
          >
            {loading ? '...' : 'Search'}
          </button>
        </div>
      </form>

      {/* DYNAMIC RESULT STATES */}
      
      {/* 1. NOT FOUND STATE (RED) */}
      {evalResult?.status === 'NOT_FOUND' && (
        <div className="bg-rose-950/90 border-2 border-rose-500 rounded-3xl p-6 text-center space-y-4 animate-fadeIn shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/40 text-3xl">
            ✕
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-rose-400 block mb-1">Gate Alert</span>
            <h2 className="text-2xl font-black text-white">Registration Not Found</h2>
            <p className="text-xs text-rose-200 mt-1">No pass or phone number matching <strong className="text-white font-mono">"{searchInput}"</strong> was found.</p>
          </div>
          <button
            onClick={handleResetScan}
            className="w-full bg-rose-600 active:bg-rose-500 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg"
          >
            Search Again
          </button>
        </div>
      )}

      {/* 2. INVALID DATE STATE (RED) */}
      {evalResult?.status === 'INVALID_DATE' && evalResult.member && (
        <div className="bg-rose-950/90 border-2 border-rose-500 rounded-3xl p-6 text-center space-y-4 animate-fadeIn shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/40 text-3xl">
            📅
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-rose-400 block mb-1">Pass Not Valid Today</span>
            <h2 className="text-2xl font-black text-white">{evalResult.member.name}</h2>
            <p className="text-xs text-rose-200 mt-1">Pass #{evalResult.member.pass_no} is a Per Day pass not booked for today.</p>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-2xl border border-rose-900 text-left">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Valid Booked Dates for this Pass:</span>
            <div className="flex flex-wrap gap-1.5">
              {evalResult.validDates?.map((d) => (
                <span key={d} className="bg-rose-500/20 text-rose-300 px-2 py-1 rounded-lg text-xs font-bold border border-rose-500/30">
                  {d.toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={handleResetScan}
            className="w-full bg-rose-600 active:bg-rose-500 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg"
          >
            Search Again
          </button>
        </div>
      )}

      {/* 3. READY / FOUND (GREEN ACTIVE STATE WITH PAYMENT STATUS & CLEAR BUTTON) */}
      {evalResult?.status === 'READY' && evalResult.member && (
        <div className="bg-slate-900 border-2 border-emerald-500 rounded-3xl p-6 space-y-5 animate-fadeIn shadow-2xl">
          
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                Valid Database Pass
              </span>
              <h2 className="text-3xl font-black text-white mt-2">#{evalResult.member.pass_no}</h2>
              <p className="text-2xl font-bold text-amber-400">{evalResult.member.name}</p>
            </div>
            <span className="text-xs font-mono bg-slate-800 px-2.5 py-1 rounded-xl text-slate-300 border border-slate-700">
              +91 {evalResult.member.phone}
            </span>
          </div>

          {/* GROUP PAYMENT STATUS BANNER */}
          <div className={`p-4 rounded-2xl border space-y-3 ${
            isGroupFullyPaid ? 'bg-emerald-950/40 border-emerald-500/40' : 'bg-rose-950/40 border-rose-500/40'
          }`}>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Group Payment Status</span>
                <span className={`text-base font-black ${isGroupFullyPaid ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isGroupFullyPaid ? '✓ Full Payment Cleared' : '⚠ Pending Balance Due'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase text-slate-400 block">Total Group Amount</span>
                <span className="text-lg font-black text-white">₹{groupTotal}</span>
              </div>
            </div>

            {!isGroupFullyPaid && (
              <div className="bg-slate-950 p-3 rounded-xl border border-rose-900/60 flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-400 block">Paid: <strong className="text-emerald-400 font-mono">₹{groupPaidAmount}</strong></span>
                  <span className="text-slate-400 block">Pending: <strong className="text-rose-400 font-mono">₹{groupPendingAmount}</strong></span>
                </div>
                <button
                  onClick={handleClearPayment}
                  disabled={clearingPayment}
                  className="bg-emerald-500 active:bg-emerald-400 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition-transform active:scale-95 disabled:opacity-50"
                >
                  {clearingPayment ? 'Clearing...' : 'Mark Payment Cleared ✓'}
                </button>
              </div>
            )}
          </div>

          {/* Group Members Overview */}
          {groupMembers.length > 1 && (
            <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Other Members in this Group ({groupMembers.length}):</span>
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {groupMembers.map((m) => (
                  <div key={m.pass_no} className="flex justify-between items-center text-xs bg-slate-900 px-3 py-2 rounded-xl">
                    <span className="text-amber-400 font-mono font-bold">#{m.pass_no}</span>
                    <span className="text-white font-medium">{m.name}</span>
                    <span className="text-slate-400 font-mono">{m.phone}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save Status / Error Banner */}
          {actionStatus === 'error' && (
            <div className="bg-rose-950/90 border border-rose-500 p-3 rounded-xl flex items-center justify-between text-xs text-rose-300">
              <span>{errorMessage || 'Failed to save.'}</span>
              <button onClick={handleMarkPresent} className="font-bold underline uppercase">Tap to Retry</button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleResetScan}
              disabled={actionStatus === 'saving'}
              className="bg-slate-800 active:bg-slate-700 text-slate-300 font-bold py-4 rounded-2xl transition-all text-sm border border-slate-700"
            >
              Cancel / Back
            </button>
            <button
              onClick={handleMarkPresent}
              disabled={actionStatus === 'saving'}
              className={`font-black py-4 rounded-2xl transition-transform active:scale-95 shadow-xl text-slate-950 text-base ${
                actionStatus === 'saving' ? 'opacity-50 cursor-wait bg-emerald-400' : 'bg-emerald-400 hover:bg-emerald-300'
              }`}
            >
              {actionStatus === 'saving' ? 'Saving...' : 'Mark Present ✓'}
            </button>
          </div>

        </div>
      )}

      {/* 4. ALREADY INSIDE STATE (ORANGE WARNING WITH UNMARK / UNDO BUTTON) */}
      {evalResult?.status === 'ALREADY_INSIDE' && evalResult.member && (
        <div className="bg-amber-950/90 border-2 border-amber-500 rounded-3xl p-6 text-center space-y-4 animate-fadeIn shadow-2xl">
          <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-500/40 text-3xl">
            ⚠️
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400 block mb-1">Already Entered Today</span>
            <h2 className="text-3xl font-black text-white">#{evalResult.member.pass_no}</h2>
            <p className="text-xl font-bold text-amber-400 mt-1">{evalResult.member.name}</p>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-2xl border border-amber-900/60 text-xs text-slate-300">
            Checked in today at <strong className="text-amber-400 font-mono">{evalResult.lastEntryTime}</strong>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleUnmarkPresent}
              disabled={actionStatus === 'saving'}
              className="bg-rose-600 active:bg-rose-500 text-white font-bold py-3.5 rounded-2xl transition-all text-xs border border-rose-500 shadow-md"
            >
              {actionStatus === 'saving' ? 'Undoing...' : '↺ Unmark (Undo)'}
            </button>
            <button
              onClick={handleResetScan}
              disabled={actionStatus === 'saving'}
              className="bg-amber-500 active:bg-amber-400 text-slate-950 font-black py-3.5 rounded-2xl transition-all text-sm shadow-lg"
            >
              Search Next
            </button>
          </div>
        </div>
      )}

    </main>
  );
}