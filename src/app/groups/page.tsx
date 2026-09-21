'use client';

import React, { useState, useEffect } from 'react';
import { RegistrationWithMembers } from '@/types';
import { getFullRegistrations } from '@/lib/storage';
import { getRatesForGroupSize } from '@/config/pricing';
import { supabase } from '@/lib/supabase';

export default function GroupsPage() {
  const [groups, setGroups] = useState<RegistrationWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected group for expansion / editing
  const [selectedGroup, setSelectedGroup] = useState<RegistrationWithMembers | null>(null);

  // New member inputs
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const data = await getFullRegistrations();
      setGroups(data);
      // Keep selected group updated if open
      if (selectedGroup) {
        const updated = data.find((g) => g.id === selectedGroup.id);
        if (updated) setSelectedGroup(updated);
      }
    } catch (err) {
      console.error('Error fetching groups:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter groups by pass number, member name, or phone
  const filteredGroups = groups.filter((g) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const matchesGroup = g.members.some(
      (m) =>
        m.pass_no.toString() === q ||
        m.name.toLowerCase().includes(q) ||
        m.phone.includes(q)
    );
    return matchesGroup;
  });

  // Handle adding a new member to an existing group and recalculating tiered rates
  const handleAddMemberToGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;

    if (!newMemberName.trim() || newMemberPhone.length !== 10) {
      setErrorMsg('Enter valid name and 10-digit phone');
      return;
    }

    setAddingMember(true);
    setErrorMsg('');

    try {
      const nextPersonsCount = selectedGroup.persons + 1;

      // 1. Determine new rate and total based on pass type using shared pricing configuration
      let newRate = selectedGroup.rate;
      let newTotal = selectedGroup.total;

      if (selectedGroup.pass_type === 'full-season') {
        const newTier = getRatesForGroupSize(nextPersonsCount);
        newRate = newTier.fullSeasonRate;
        newTotal = nextPersonsCount * newRate;
      } else {
        // Per day fixed calculation
        newTotal = nextPersonsCount * 300 * Math.max(1, selectedGroup.valid_dates.length);
      }

      // 2. Insert new member into Supabase
      const { error: memberError } = await supabase
        .from('registration_members')
        .insert([
          {
            group_id: selectedGroup.id,
            name: newMemberName.trim(),
            phone: newMemberPhone.replace(/\D/g, ''),
          },
        ]);

      if (memberError) throw memberError;

      // 3. Update parent group persons count, rate, and total in Supabase
      const currentPaid = selectedGroup.paid_amount ?? (selectedGroup.paid ? selectedGroup.total : 0);
      const isStillPaid = currentPaid >= newTotal;

      const { data: updatedGroup, error: groupError } = await supabase
        .from('registration_groups')
        .update({
          persons: nextPersonsCount,
          rate: newRate,
          total: newTotal,
          paid: isStillPaid,
        })
        .eq('id', selectedGroup.id)
        .select('*')
        .single();

      if (groupError) throw groupError;

      // Refresh data
      await fetchGroups();
      setNewMemberName('');
      setNewMemberPhone('');

      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(60);
      }
    } catch (err: any) {
      console.error('Failed to add member:', err);
      setErrorMsg(err.message || 'Failed to add member to group');
    } finally {
      setAddingMember(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-32 pt-4 px-4 max-w-[430px] mx-auto font-sans">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <span className="text-xs uppercase tracking-wider text-amber-400 font-bold block">Group Management</span>
          <h1 className="text-2xl font-black tracking-tight text-white">Groups & Sizing</h1>
        </div>
        <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-right">
          <span className="text-[10px] uppercase text-slate-400 block">Total Groups</span>
          <span className="text-xs font-bold text-amber-400">{groups.length} Bookings</span>
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
            placeholder="Search group by pass #, name, or phone..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-all shadow-inner"
          />
        </div>
      </div>

      {/* Groups List */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          All Registered Groups ({filteredGroups.length})
        </h2>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm">Loading groups from database...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm bg-slate-900/40 rounded-2xl border border-slate-900">
            No groups found.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGroups.map((group) => {
              const paidAmt = group.paid_amount ?? (group.paid ? group.total : 0);
              const dueAmt = Math.max(0, group.total - paidAmt);
              const isFullyPaid = dueAmt <= 0;

              return (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroup(group)}
                  className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-4 rounded-2xl shadow-md transition-all active:scale-[0.99] cursor-pointer space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-black bg-amber-500/20 text-amber-400 px-2.5 py-1 rounded-lg border border-amber-500/30">
                        {group.persons} {group.persons === 1 ? 'Person' : 'Persons'} Group
                      </span>
                      <h3 className="font-bold text-white text-base mt-2">
                        {group.members[0]?.name || 'Group Booking'} + {group.members.length - 1} others
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-amber-400 block">₹{group.total}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isFullyPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                        {isFullyPaid ? 'PAID' : `DUE: ₹${dueAmt}`}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 flex flex-wrap gap-1 pt-1 border-t border-slate-800/80">
                    {group.members.map((m) => (
                      <span key={m.pass_no} className="bg-slate-950 px-2 py-1 rounded-lg font-mono text-[11px] text-slate-300 border border-slate-800">
                        #{m.pass_no} {m.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* GROUP DETAILS & ADD MEMBER MODAL */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-slate-900 border-t-2 sm:border-2 border-amber-500 w-full max-w-[430px] rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-amber-400">Group Management</span>
                <h2 className="text-xl font-black text-white">{selectedGroup.persons} Members Group</h2>
              </div>
              <button 
                onClick={() => { setSelectedGroup(null); setErrorMsg(''); }} 
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Financial Standings */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Total Group Amount:</span>
                <span className="font-bold text-amber-400">₹{selectedGroup.total}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Amount Paid:</span>
                <span className="font-bold text-emerald-400">₹{selectedGroup.paid_amount ?? (selectedGroup.paid ? selectedGroup.total : 0)}</span>
              </div>
              <div className="flex justify-between text-xs border-t border-slate-800 pt-2">
                <span className="text-slate-400">Remaining Balance Due:</span>
                <span className="font-black text-rose-400">₹{Math.max(0, selectedGroup.total - (selectedGroup.paid_amount ?? (selectedGroup.paid ? selectedGroup.total : 0)))}</span>
              </div>
            </div>

            {/* Existing Members */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Group Members:</span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {selectedGroup.members.map((m) => (
                  <div key={m.pass_no} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-amber-400 font-mono font-bold mr-2">#{m.pass_no}</span>
                      <span className="text-white font-medium">{m.name}</span>
                    </div>
                    <span className="text-slate-400 font-mono">+91 {m.phone}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Form to Add New Member on the Spot */}
            <form onSubmit={handleAddMemberToGroup} className="space-y-3 pt-2 border-t border-slate-800">
              <span className="text-xs font-bold uppercase text-amber-400 block">Add New Member on the Spot</span>
              <p className="text-[11px] text-slate-400">Adding a member will automatically recalculate group tiered pricing and update the remaining balance due.</p>

              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Full Name"
                disabled={addingMember}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-amber-500 focus:outline-none"
              />

              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">+91</span>
                <input
                  type="tel"
                  maxLength={10}
                  value={newMemberPhone}
                  onChange={(e) => setNewMemberPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  disabled={addingMember}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-3.5 py-3 text-sm text-white focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>

              {errorMsg && <p className="text-xs text-rose-400 font-semibold">{errorMsg}</p>}

              <button
                type="submit"
                disabled={addingMember}
                className="w-full bg-amber-500 active:bg-amber-400 text-slate-950 font-black py-3.5 rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 text-sm"
              >
                {addingMember ? 'Updating Group & Rates...' : 'Add Member & Recalculate Total ➔'}
              </button>
            </form>

          </div>
        </div>
      )}

    </main>
  );
}