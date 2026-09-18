'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RegistrationWithMembers, RegistrationMember, FreeEntry } from '@/types';
import { getFullRegistrations, getAttendanceForPass, getFreeEntries } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export default function DashboardPage() {
  const [registrations, setRegistrations] = useState<RegistrationWithMembers[]>([]);
  const [freeEntriesCount, setFreeEntriesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit modal state for individual member pass
  const [editingMemberPass, setEditingMemberPass] = useState<{ member: RegistrationMember; group: RegistrationWithMembers } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Today's attendance metric state
  const [todayAttendanceCount, setTodayAttendanceCount] = useState(0);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch full relational group & member registrations from Supabase via storage layer
      const data = await getFullRegistrations();
      setRegistrations(data);

      // 2. Fetch free entries count from Supabase
      const freeList = await getFreeEntries();
      setFreeEntriesCount(freeList.length);

      // 3. Calculate today's attendance count directly from the Supabase attendance table (active event date 'd4')
      const activeDateId = 'd4';
      let totalEnteredToday = 0;
      
      for (const group of data) {
        for (const m of group.members) {
          const att = await getAttendanceForPass(m.pass_no, activeDateId);
          if (att) {
            totalEnteredToday++;
          }
        }
      }
      setTodayAttendanceCount(totalEnteredToday);
    } catch (err: any) {
      console.error('Error fetching backend dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Summary Metrics calculations
  const totalBookings = registrations.length;
  const totalPasses = registrations.reduce((acc, g) => acc + g.members.length, 0);
  const totalCollected = registrations.filter((g) => g.paid).reduce((acc, g) => acc + g.total, 0);
  const pendingCount = registrations.filter((g) => !g.paid).length;

  // Flatten all members for individual pass search & listing
  const allMembersList = useMemo(() => {
    const list: { member: RegistrationMember; group: RegistrationWithMembers }[] = [];
    registrations.forEach((group) => {
      group.members.forEach((member) => {
        list.push({ member, group });
      });
    });
    return list;
  }, [registrations]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allMembersList;
    return allMembersList.filter(
      ({ member }) =>
        member.pass_no.toString() === q ||
        member.name.toLowerCase().includes(q) ||
        member.phone.includes(q)
    );
  }, [allMembersList, searchQuery]);

  // Handle Edit Save for Individual Member Pass & Group Payment directly in Supabase Database
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMemberPass) return;

    setSaveStatus('saving');
    setErrorMessage('');

    try {
      // 1. Update member name/phone in Supabase database table
      const { error: memberError } = await supabase
        .from('registration_members')
        .update({
          name: editingMemberPass.member.name.trim(),
          phone: editingMemberPass.member.phone.replace(/\D/g, ''),
        })
        .eq('pass_no', editingMemberPass.member.pass_no);

      if (memberError) throw memberError;

      // 2. Update group payment status & mode in Supabase database table
      const { error: groupError } = await supabase
        .from('registration_groups')
        .update({
          paid: editingMemberPass.group.paid,
          payment_mode: editingMemberPass.group.payment_mode,
        })
        .eq('id', editingMemberPass.group.id);

      if (groupError) throw groupError;

      // Refresh data from backend
      await fetchDashboardData();
      setSaveStatus('idle');
      setEditingMemberPass(null);
      if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(60);
    } catch (err: any) {
      console.error('Failed to update pass in database:', err);
      setSaveStatus('error');
      setErrorMessage(err.message || 'Error while updating database');
      if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
  };

  // CSV Export utility querying Supabase directly
  const exportCSV = async (type: 'registrations' | 'attendance' | 'free') => {
    try {
      let csvContent = 'data:text/csv;charset=utf-8,';
      
      if (type === 'registrations') {
        csvContent += 'PassNumber,Name,Phone,PassType,PaymentMode,IsPaid,BookingTotal,CreatedBy,CreatedAt\n';
        registrations.forEach((group) => {
          group.members.forEach((m) => {
            csvContent += `${m.pass_no},"${m.name}",${m.phone},${group.pass_type},${group.payment_mode},${group.paid},${group.total},"${group.created_by || ''}",${m.created_at}\n`;
          });
        });
      } else if (type === 'attendance') {
        const { data: attendanceList } = await supabase.from('attendance').select('*');
        csvContent += 'PassNumber,EventDate,MarkedBy,MarkedAt\n';
        attendanceList?.forEach((a: any) => {
          csvContent += `${a.pass_no},${a.event_date},"${a.marked_by || ''}",${a.marked_at}\n`;
        });
      } else {
        const freeList = await getFreeEntries();
        csvContent += 'ID,Name,Phone,CreatedBy,CreatedAt\n';
        freeList.forEach((f) => {
          csvContent += `${f.id},"${f.name}",${f.phone},"${f.created_by || ''}",${f.created_at}\n`;
        });
      }

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `garba_${type}_export.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('CSV export failed', err);
      alert('Failed to generate export file from database.');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-32 pt-4 px-4 max-w-[430px] mx-auto font-sans">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <span className="text-xs uppercase tracking-wider text-amber-400 font-bold block">Admin Overview (Supabase Live)</span>
          <h1 className="text-2xl font-black tracking-tight text-white">Live Dashboard</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportCSV('registrations')}
            className="bg-slate-900 border border-slate-800 active:bg-slate-800 px-3 py-2 rounded-xl text-xs font-bold text-amber-400 shadow flex items-center gap-1"
            title="Export Passes CSV"
          >
            <span>📥 Passes</span>
          </button>
          <button
            onClick={() => exportCSV('attendance')}
            className="bg-slate-900 border border-slate-800 active:bg-slate-800 px-3 py-2 rounded-xl text-xs font-bold text-emerald-400 shadow flex items-center gap-1"
            title="Export Attendance CSV"
          >
            <span>📥 Att</span>
          </button>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Passes</span>
          <span className="text-2xl font-black text-white mt-1 block">
            {loading ? '...' : totalPasses} <span className="text-xs font-normal text-slate-500">({totalBookings} bookings)</span>
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-[10px] uppercase font-bold text-amber-400 block">Collected Revenue</span>
          <span className="text-2xl font-black text-amber-400 mt-1 block">
            {loading ? '...' : `₹${totalCollected}`}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-[10px] uppercase font-bold text-rose-400 block">Pending Payments</span>
          <span className="text-2xl font-black text-rose-400 mt-1 block">
            {loading ? '...' : `${pendingCount} Bookings`}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow">
          <span className="text-[10px] uppercase font-bold text-emerald-400 block">Today's Attendance</span>
          <span className="text-2xl font-black text-emerald-400 mt-1 block">
            {loading ? '...' : `${todayAttendanceCount} Passes`}
          </span>
        </div>
      </div>

      {/* Search Input */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search individual pass #, name, or phone..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Individual Passes List */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Individual Passes ({filteredMembers.length})
          </h2>
          <span className="text-[10px] text-slate-500">Tap card to edit</span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm">Loading database records...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm bg-slate-900/40 rounded-2xl border border-slate-900">
            No passes found in database.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredMembers.map(({ member, group }) => (
              <div
                key={member.pass_no}
                onClick={() => setEditingMemberPass({ member: { ...member }, group: { ...group } })}
                className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-4 rounded-2xl shadow-md transition-all active:scale-[0.99] cursor-pointer flex items-center justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-lg border border-amber-500/30">
                      #{member.pass_no}
                    </span>
                    <h3 className="font-bold text-white text-sm">{member.name}</h3>
                  </div>
                  <div className="text-xs text-slate-400 flex gap-2">
                    <span>+91 {member.phone}</span>
                    <span>•</span>
                    <span className="uppercase">{group.pass_type}</span>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <span className="text-xs font-bold text-slate-300 block">₹{group.total}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${group.paid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {group.paid ? 'PAID' : 'PENDING'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EDIT MODAL SHEET */}
      {editingMemberPass && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-slate-900 border-t-2 sm:border-2 border-amber-500 w-full max-w-[430px] rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-amber-400">Editing Database Pass</span>
                <h2 className="text-xl font-black text-white">Pass #{editingMemberPass.member.pass_no}</h2>
              </div>
              <button 
                onClick={() => { setEditingMemberPass(null); setSaveStatus('idle'); }} 
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-slate-400">Attendee Name</label>
                <input
                  type="text"
                  value={editingMemberPass.member.name}
                  onChange={(e) => setEditingMemberPass({
                    ...editingMemberPass,
                    member: { ...editingMemberPass.member, name: e.target.value }
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-slate-400">Phone</label>
                <input
                  type="tel"
                  maxLength={10}
                  value={editingMemberPass.member.phone}
                  onChange={(e) => setEditingMemberPass({
                    ...editingMemberPass,
                    member: { ...editingMemberPass.member, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingMemberPass({
                    ...editingMemberPass,
                    group: { ...editingMemberPass.group, paid: !editingMemberPass.group.paid }
                  })}
                  className={`py-3 rounded-xl font-bold text-xs border ${editingMemberPass.group.paid ? 'bg-emerald-950 text-emerald-400 border-emerald-500/40' : 'bg-rose-950 text-rose-400 border-rose-500/40'}`}
                >
                  Status: {editingMemberPass.group.paid ? 'PAID' : 'PENDING'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingMemberPass({
                    ...editingMemberPass,
                    group: { ...editingMemberPass.group, payment_mode: editingMemberPass.group.payment_mode === 'cash' ? 'upi' : 'cash' }
                  })}
                  className="py-3 bg-slate-950 border border-slate-800 text-slate-300 rounded-xl font-bold text-xs uppercase"
                >
                  Mode: {editingMemberPass.group.payment_mode}
                </button>
              </div>

              {saveStatus === 'error' && (
                <div className="bg-rose-950 border border-rose-500 p-3 rounded-xl flex items-center justify-between text-xs text-rose-300">
                  <span>{errorMessage}</span>
                  <button type="submit" className="font-bold underline uppercase">Retry</button>
                </div>
              )}

              <button
                type="submit"
                disabled={saveStatus === 'saving'}
                className={`w-full font-black py-3.5 rounded-xl shadow-lg mt-4 ${
                  saveStatus === 'saving' ? 'bg-amber-500/50 text-slate-950 cursor-wait' : 'bg-amber-500 active:bg-amber-400 text-slate-950'
                }`}
              >
                {saveStatus === 'saving' ? 'Saving to Database...' : 'Save Changes'}
              </button>
            </form>

          </div>
        </div>
      )}

    </main>
  );
}