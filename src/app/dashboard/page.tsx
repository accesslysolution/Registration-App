'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RegistrationWithMembers, RegistrationMember } from '@/types';
import { getFullRegistrations, getFreeEntries } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

export default function DashboardPage() {
  const [registrations, setRegistrations] = useState<RegistrationWithMembers[]>([]);
  const [freeEntriesCount, setFreeEntriesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dashboard & CSV Export Date Filter State
  const [selectedDashboardDate, setSelectedDashboardDate] = useState('all');

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
      // 1. Fetch full relational group & member registrations and free entries concurrently
      const [data, freeList] = await Promise.all([
        getFullRegistrations(),
        getFreeEntries()
      ]);
      
      setRegistrations(data);
      setFreeEntriesCount(freeList.length);

      // 2. Fetch today's attendance in one batch query
      const activeDateId = 'd4';
      const { data: todayAttendanceList, error: attError } = await supabase
        .from('attendance')
        .select('pass_no')
        .eq('event_date', activeDateId);

      if (!attError && todayAttendanceList) {
        const attendedPassNos = new Set(todayAttendanceList.map((a: any) => Number(a.pass_no)));
        
        let totalEnteredToday = 0;
        for (const group of data) {
          for (const m of group.members) {
            if (attendedPassNos.has(Number(m.pass_no))) {
              totalEnteredToday++;
            }
          }
        }
        setTodayAttendanceCount(totalEnteredToday);
      } else {
        setTodayAttendanceCount(0);
      }
    } catch (err: any) {
      console.error('Error fetching backend dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique dates (YYYY-MM-DD format) from all member creation timestamps for the filter dropdown
  const availableDates = useMemo(() => {
    const datesSet = new Set<string>();
    registrations.forEach((group) => {
      group.members.forEach((m) => {
        if (m.created_at) {
          const dateOnly = m.created_at.toString().split('T')[0];
          if (dateOnly) datesSet.add(dateOnly);
        }
      });
    });
    return Array.from(datesSet).sort().reverse();
  }, [registrations]);

  // Filter registrations based on selected dashboard date
  const filteredRegistrations = useMemo(() => {
    if (selectedDashboardDate === 'all') return registrations;
    return registrations
      .map((group) => {
        const matchingMembers = group.members.filter((m) => {
          const memberDate = m.created_at ? m.created_at.toString().split('T')[0] : '';
          return memberDate === selectedDashboardDate;
        });
        return { ...group, members: matchingMembers };
      })
      .filter((group) => group.members.length > 0);
  }, [registrations, selectedDashboardDate]);

  // Summary Metrics calculations based on filtered registrations
  const totalBookings = filteredRegistrations.length;
  const totalPasses = filteredRegistrations.reduce((acc, g) => acc + g.members.length, 0);
  
  const totalCollected = filteredRegistrations.reduce((acc, g) => {
    const paidAmt = g.paid_amount ?? (g.paid ? g.total : 0);
    return acc + paidAmt;
  }, 0);

  const pendingBookingsList = useMemo(() => {
    return filteredRegistrations.filter((g) => {
      const paidAmt = g.paid_amount ?? (g.paid ? g.total : 0);
      return paidAmt < g.total;
    });
  }, [filteredRegistrations]);

  const pendingCount = pendingBookingsList.length;

  // Flatten all members for individual pass search & listing based on filtered registrations
  const allMembersList = useMemo(() => {
    const list: { member: RegistrationMember; group: RegistrationWithMembers }[] = [];
    filteredRegistrations.forEach((group) => {
      group.members.forEach((member) => {
        list.push({ member, group });
      });
    });
    return list;
  }, [filteredRegistrations]);

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
      const { error: memberError } = await supabase
        .from('registration_members')
        .update({
          name: editingMemberPass.member.name.trim(),
          phone: editingMemberPass.member.phone.replace(/\D/g, ''),
        })
        .eq('pass_no', editingMemberPass.member.pass_no);

      if (memberError) throw memberError;

      const groupTotal = editingMemberPass.group.total;
      const isPaidFull = editingMemberPass.group.paid;
      const resolvedPaidAmt = isPaidFull ? groupTotal : (editingMemberPass.group.paid_amount ?? 0);

      const { error: groupError } = await supabase
        .from('registration_groups')
        .update({
          paid: isPaidFull,
          paid_amount: resolvedPaidAmt,
          payment_mode: editingMemberPass.group.payment_mode,
        })
        .eq('id', editingMemberPass.group.id);

      if (groupError) throw groupError;

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
        const groupCodeMap = new Map<string, string>();
        registrations.forEach((group, index) => {
          groupCodeMap.set(group.id, `G${index + 1}`);
        });

        csvContent += 'PassNumber,GroupCode,Name,Phone,PassType,PaymentMode,IsPaid,PaidAmount,BookingTotal,CreatedBy,CreatedAt\n';
        
        let exportedRowsCount = 0;
        registrations.forEach((group) => {
          const groupCode = groupCodeMap.get(group.id) || 'G1';
          const paidAmt = group.paid_amount ?? (group.paid ? group.total : 0);
          
          group.members.forEach((m) => {
            const memberDate = m.created_at ? m.created_at.toString().split('T')[0] : '';
            if (selectedDashboardDate === 'all' || memberDate === selectedDashboardDate) {
              csvContent += `${m.pass_no},${groupCode},"${m.name}","${m.phone}",${group.pass_type},${group.payment_mode},${group.paid},${paidAmt},${group.total},"${group.created_by || ''}",${m.created_at}\n`;
              exportedRowsCount++;
            }
          });
        });

        if (exportedRowsCount === 0) {
          alert(`No records found for the selected date: ${selectedDashboardDate}`);
          return;
        }

      } else if (type === 'attendance') {
        const { data: attendanceList } = await supabase.from('attendance').select('*');
        csvContent += 'PassNumber,EventDate,MarkedBy,MarkedAt\n';
        
        let exportedRowsCount = 0;
        attendanceList?.forEach((a: any) => {
          const attDate = a.marked_at ? a.marked_at.toString().split('T')[0] : '';
          if (selectedDashboardDate === 'all' || attDate === selectedDashboardDate) {
            csvContent += `${a.pass_no},${a.event_date},"${a.marked_by || ''}",${a.marked_at}\n`;
            exportedRowsCount++;
          }
        });

        if (exportedRowsCount === 0) {
          alert(`No attendance records found for the selected date: ${selectedDashboardDate}`);
          return;
        }

      } else {
        const freeList = await getFreeEntries();
        csvContent += 'ID,Name,Phone,CreatedBy,CreatedAt\n';
        
        let exportedRowsCount = 0;
        freeList.forEach((f) => {
          const freeDate = f.created_at ? f.created_at.toString().split('T')[0] : '';
          if (selectedDashboardDate === 'all' || freeDate === selectedDashboardDate) {
            csvContent += `${f.id},"${f.name}","${f.phone}","${f.created_by || ''}",${f.created_at}\n`;
            exportedRowsCount++;
          }
        });

        if (exportedRowsCount === 0) {
          alert(`No free entry records found for the selected date: ${selectedDashboardDate}`);
          return;
        }
      }

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `garba_${type}_${selectedDashboardDate}.csv`);
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
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
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

      {/* Dashboard & Export Date Filter Control */}
      <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl mb-5 shadow flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <span className="text-[10px] uppercase font-bold text-amber-400 block tracking-wider">Date Filter</span>
          <span className="text-xs font-medium text-slate-300">Filter View & Downloads</span>
        </div>
        <select
          value={selectedDashboardDate}
          onChange={(e) => setSelectedDashboardDate(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
        >
          <option value="all">Full Data (All Dates)</option>
          {availableDates.map((dateStr) => (
            <option key={dateStr} value={dateStr}>
              {dateStr}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
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

      {/* PENDING BALANCES & PARTIAL PAYMENTS SECTION */}
      {!loading && pendingBookingsList.length > 0 && (
        <div className="space-y-3 mb-5 bg-rose-950/20 border border-rose-500/30 p-4 rounded-3xl">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <span>⚠️</span> Pending Balances ({pendingBookingsList.length})
            </h2>
            <span className="text-[10px] text-slate-400">Tap to review & clear</span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {pendingBookingsList.map((group) => {
              const paidAmt = group.paid_amount ?? (group.paid ? group.total : 0);
              const dueAmt = Math.max(0, group.total - paidAmt);
              const primaryMember = group.members[0];

              return (
                <div
                  key={group.id}
                  onClick={() => {
                    if (primaryMember) {
                      setEditingMemberPass({ member: { ...primaryMember }, group: { ...group } });
                    }
                  }}
                  className="bg-slate-900 border border-rose-900/50 hover:border-rose-500 p-3 rounded-2xl flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-lg border border-rose-500/30">
                        {group.persons} {group.persons === 1 ? 'Person' : 'Persons'}
                      </span>
                      <span className="font-bold text-white text-sm">
                        {primaryMember ? primaryMember.name : 'Group Booking'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block mt-0.5 font-mono">
                      {primaryMember ? `+91 ${primaryMember.phone}` : ''} • Pass #{primaryMember?.pass_no || 'N/A'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-black text-rose-400 block">Due: ₹{dueAmt}</span>
                    <span className="text-[10px] text-slate-400 block">Paid: ₹{paidAmt} / ₹{group.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="space-y-3 mb-5">
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
            No passes found for this date.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredMembers.map(({ member, group }) => {
              const paidAmt = group.paid_amount ?? (group.paid ? group.total : 0);
              const isFullyPaid = paidAmt >= group.total;
              const statusLabel = isFullyPaid ? 'PAID' : paidAmt > 0 ? 'PARTIAL' : 'PENDING';
              const badgeColor = isFullyPaid ? 'bg-emerald-500/20 text-emerald-400' : paidAmt > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400';

              return (
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
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${badgeColor}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              );
            })}
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

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-slate-400">Paid Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 font-bold">₹</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={editingMemberPass.group.paid_amount ?? (editingMemberPass.group.paid ? editingMemberPass.group.total : 0)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const total = editingMemberPass.group.total;
                      setEditingMemberPass({
                        ...editingMemberPass,
                        group: {
                          ...editingMemberPass.group,
                          paid_amount: val,
                          paid: val >= total
                        }
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-3 text-sm text-white focus:border-amber-500 focus:outline-none font-mono font-bold"
                  />
                </div>
                <span className="text-[10px] text-slate-400 block">Total Group Booking Total: ₹{editingMemberPass.group.total}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const total = editingMemberPass.group.total;
                    const nextPaid = !editingMemberPass.group.paid;
                    setEditingMemberPass({
                      ...editingMemberPass,
                      group: {
                        ...editingMemberPass.group,
                        paid: nextPaid,
                        paid_amount: nextPaid ? total : 0
                      }
                    });
                  }}
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