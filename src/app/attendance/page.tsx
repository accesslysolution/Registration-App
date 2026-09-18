'use client';

import React, { useState, useRef, useEffect } from 'react';
import { RegistrationMember, PassType } from '@/types';
import { getRegistrationMembers, getRegistrationGroups, getAttendanceForPass, markAttendance } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

// Active event date ID for today's scans (matches settings/storage)
const CURRENT_EVENT_DATE_ID = 'd4';

type AttendanceStatusType = 
  | 'NOT_FOUND' 
  | 'INVALID_DATE' 
  | 'READY' 
  | 'ALREADY_INSIDE';

interface ScanEvaluation {
  status: AttendanceStatusType;
  member?: RegistrationMember;
  passType?: PassType;
  validDates?: string[];
  lastEntryTime?: string | null;
}

export default function AttendancePage() {
  const [passInput, setPassInput] = useState('');
  const [evalResult, setEvalResult] = useState<ScanEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const staffName = typeof window !== 'undefined' ? sessionStorage.getItem('garba_logged_staff') || 'Gate Staff' : 'Gate Staff';

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle Pass Lookup Check against Supabase Database Layer
  const handleCheckPass = async (e?: React.FormEvent, overridePassNo?: number) => {
    if (e) e.preventDefault();
    const targetPassNo = overridePassNo !== undefined ? overridePassNo : parseInt(passInput.trim(), 10);
    
    if (isNaN(targetPassNo)) return;

    setLoading(true);
    setActionStatus('idle');
    setErrorMessage('');

    try {
      // 1. Fetch individual member by unique pass number directly from Supabase via storage helper
      const members = await getRegistrationMembers();
      const member = members.find((m) => m.pass_no === targetPassNo);

      if (!member) {
        setEvalResult({ status: 'NOT_FOUND' });
        triggerVibration('error');
        setLoading(false);
        return;
      }

      // 2. Fetch parent booking group for pass type & valid dates from Supabase
      const groups = await getRegistrationGroups();
      const group = groups.find((g) => g.id === member.group_id);
      const passType = group ? group.pass_type : 'full-season';
      const validDates = group ? group.valid_dates : [];

      // 3. Validate Per-Day pass for today's event date
      if (passType === 'per-day' && (!validDates || !validDates.includes(CURRENT_EVENT_DATE_ID))) {
        setEvalResult({
          status: 'INVALID_DATE',
          member,
          passType,
          validDates,
        });
        triggerVibration('error');
        setLoading(false);
        return;
      }

      // 4. Check live attendance table in Supabase for today's entry
      const attendanceLog = await getAttendanceForPass(targetPassNo, CURRENT_EVENT_DATE_ID);
      
      if (attendanceLog) {
        const lastEntryTime = new Date(attendanceLog.marked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setEvalResult({
          status: 'ALREADY_INSIDE',
          member,
          passType,
          lastEntryTime,
        });
      } else {
        setEvalResult({
          status: 'READY',
          member,
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

  // Handle Marking Attendance in Supabase Database (1 Pass = 1 Person)
  const handleMarkPresent = async () => {
    if (!evalResult || !evalResult.member) return;
    const passNo = evalResult.member.pass_no;

    setActionStatus('saving');
    setErrorMessage('');

    try {
      const res = await markAttendance(passNo, CURRENT_EVENT_DATE_ID, staffName);

      if (!res.success) {
        setActionStatus('error');
        setErrorMessage(res.message || 'Entry rejected by database.');
        triggerVibration('error');
        return;
      }

      setActionStatus('idle');
      triggerVibration('success');

      // Reset input, clear evaluation, and refocus immediately for the next staff scan
      setPassInput('');
      setEvalResult(null);
      inputRef.current?.focus();
    } catch (err: any) {
      console.error(err);
      setActionStatus('error');
      setErrorMessage(err.message || 'Failed to save attendance to database');
      triggerVibration('error');
    }
  };

  // Handle Unmarking / Undoing Attendance Entry directly in Supabase Database
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
        .eq('event_date', CURRENT_EVENT_DATE_ID);

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
    setPassInput('');
    setEvalResult(null);
    setActionStatus('idle');
    setErrorMessage('');
    inputRef.current?.focus();
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-32 pt-4 px-4 max-w-[430px] mx-auto font-sans">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <span className="text-xs uppercase tracking-wider text-amber-400 font-bold block">Gate Scanner (Supabase Live)</span>
          <h1 className="text-2xl font-black tracking-tight text-white">Live Attendance</h1>
        </div>
        <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-right">
          <span className="text-[10px] uppercase text-slate-400 block">Event Date</span>
          <span className="text-xs font-bold text-amber-400">Day 4 (Sep 25)</span>
        </div>
      </div>

      {/* Search Input Form */}
      <form onSubmit={(e) => handleCheckPass(e)} className="space-y-4 mb-6">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400 font-black text-2xl">#</span>
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            value={passInput}
            onChange={(e) => setPassInput(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter Individual Pass #"
            disabled={loading}
            className="w-full bg-slate-900 border-2 border-slate-800 focus:border-amber-500 rounded-2xl pl-12 pr-28 py-4 text-2xl font-black tracking-wider text-white placeholder:text-slate-600 focus:outline-none transition-all shadow-inner"
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-amber-500 active:bg-amber-400 disabled:opacity-50 text-slate-950 font-black px-5 py-3 rounded-xl text-sm transition-transform active:scale-95 shadow-md"
          >
            {loading ? '...' : 'Check'}
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
            <h2 className="text-2xl font-black text-white">Registration Does Not Exist</h2>
            <p className="text-xs text-rose-200 mt-1">Pass number <strong className="text-white font-mono">#{passInput}</strong> was not found in the database.</p>
          </div>
          <button
            onClick={handleResetScan}
            className="w-full bg-rose-600 active:bg-rose-500 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg"
          >
            Scan Another Pass
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
            Scan Another Pass
          </button>
        </div>
      )}

      {/* 3. READY TO MARK (GREEN ACTIVE STATE) */}
      {evalResult?.status === 'READY' && evalResult.member && (
        <div className="bg-slate-900 border-2 border-emerald-500 rounded-3xl p-6 space-y-5 animate-fadeIn shadow-2xl">
          
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              Valid Database Pass • Ready
            </span>
            <h2 className="text-3xl font-black text-white mt-2">#{evalResult.member.pass_no}</h2>
            <p className="text-2xl font-bold text-amber-400">{evalResult.member.name}</p>
          </div>

          <div className="bg-slate-950/80 rounded-2xl p-4 space-y-2 border border-slate-800 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Phone</span>
              <span className="font-mono font-bold text-white">+91 {evalResult.member.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Pass Type</span>
              <span className="font-bold text-white uppercase">{evalResult.passType?.replace('-', ' ')}</span>
            </div>
          </div>

          {/* Save Status / Error Banner */}
          {actionStatus === 'error' && (
            <div className="bg-rose-950/90 border border-rose-500 p-3 rounded-xl flex items-center justify-between text-xs text-rose-300">
              <span>{errorMessage || 'Failed to save.'}</span>
              <button onClick={handleMarkPresent} className="font-bold underline uppercase">Tap to Retry</button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleResetScan}
              disabled={actionStatus === 'saving'}
              className="bg-slate-800 active:bg-slate-700 text-slate-300 font-bold py-4 rounded-2xl transition-all text-sm border border-slate-700"
            >
              Cancel
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
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400 block mb-1">Already Inside</span>
            <h2 className="text-3xl font-black text-white">#{evalResult.member.pass_no}</h2>
            <p className="text-xl font-bold text-amber-400 mt-1">{evalResult.member.name}</p>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-2xl border border-amber-900/60 text-xs text-slate-300">
            Already entered today at <strong className="text-amber-400 font-mono">{evalResult.lastEntryTime}</strong>
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
              Scan Next
            </button>
          </div>
        </div>
      )}

    </main>
  );
}