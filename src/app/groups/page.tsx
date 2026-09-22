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
  const [clearingPayment, setClearingPayment] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Individual Member Payment State (Managed at the group financial level)
  const [editingMemberPay, setEditingMemberPay] = useState<{
    member: { pass_no: number; name: string; phone: string };
    group: RegistrationWithMembers;
  } | null>(null);
  const [memberPayStatusType, setMemberPayStatusType] = useState<'full' | 'pending'>('full');
  const [updatingMemberPay, setUpdatingMemberPay] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const data = await getFullRegistrations();
      setGroups(data);
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

  const filteredGroups = groups.filter((g) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return g.members.some(
      (m) =>
        m.pass_no.toString() === q ||
        m.name.toLowerCase().includes(q) ||
        m.phone.includes(q)
    );
  });

  // Handle adding a new member on the spot with manual vs group pricing rule check
  const handleAddMemberToGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;

    const cleanPhone = newMemberPhone.replace(/\D/g, '');

    if (!newMemberName.trim() || cleanPhone.length !== 10) {
      setErrorMsg('Enter valid name and 10-digit phone');
      return;
    }

    const isDuplicateInGroup = selectedGroup.members.some((m) => m.phone === cleanPhone);
    if (isDuplicateInGroup) {
      setErrorMsg('This phone number is already registered in this group!');
      return;
    }

    setAddingMember(true);
    setErrorMsg('');

    try {
      const nextPersonsCount = selectedGroup.persons + 1;
      let newRate = selectedGroup.rate;
      let newTotal = selectedGroup.total;

      if (selectedGroup.pass_type === 'full-season') {
        const standardTier = getRatesForGroupSize(nextPersonsCount);
        const standardGroupRate = standardTier.fullSeasonRate;

        if (selectedGroup.is_manual) {
          if (standardGroupRate < selectedGroup.rate) {
            newRate = standardGroupRate;
            newTotal = nextPersonsCount * standardGroupRate;
          } else {
            newRate = selectedGroup.rate;
            newTotal = selectedGroup.total + selectedGroup.rate;
          }
        } else {
          newRate = standardGroupRate;
          newTotal = nextPersonsCount * standardGroupRate;
        }
      } else {
        const perDayBaseRate = selectedGroup.is_manual ? selectedGroup.rate : 300;
        newTotal = selectedGroup.total + (perDayBaseRate * Math.max(1, selectedGroup.valid_dates.length));
        newRate = perDayBaseRate;
      }

      // Insert new member using ONLY schema-supported columns
      const { error: memberError } = await supabase
        .from('registration_members')
        .insert([
          {
            group_id: selectedGroup.id,
            name: newMemberName.trim(),
            phone: cleanPhone,
          },
        ]);

      if (memberError) throw memberError;

      const currentPaidAmt = selectedGroup.paid_amount ?? (selectedGroup.paid ? selectedGroup.total : 0);
      const isStillFullyPaid = currentPaidAmt >= newTotal;

      const { error: groupError } = await supabase
        .from('registration_groups')
        .update({
          persons: nextPersonsCount,
          rate: newRate,
          total: newTotal,
          paid: isStillFullyPaid,
        })
        .eq('id', selectedGroup.id);

      if (groupError) throw groupError;

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

  const handlePaymentDone = async () => {
    if (!selectedGroup) return;

    setClearingPayment(true);
    setErrorMsg('');

    try {
      const { error: groupError } = await supabase
        .from('registration_groups')
        .update({
          paid_amount: selectedGroup.total,
          paid: true,
        })
        .eq('id', selectedGroup.id);

      if (groupError) throw groupError;

      await fetchGroups();
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(60);
      }
    } catch (err: any) {
      console.error('Failed to clear payment:', err);
      setErrorMsg(err.message || 'Failed to update payment status');
    } finally {
      setClearingPayment(false);
    }
  };

  const handleSaveMemberPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMemberPay) return;

    const group = editingMemberPay.group;
    const groupTotal = group.total;
    const sharePerPerson = Math.round(groupTotal / group.persons);
    const currentPaid = group.paid_amount ?? (group.paid ? groupTotal : 0);

    // Adjust group paid amount based on individual member toggle
    let newPaidAmount = currentPaid;
    if (memberPayStatusType === 'full') {
      newPaidAmount = Math.min(groupTotal, currentPaid + sharePerPerson);
    } else {
      newPaidAmount = Math.max(0, currentPaid - sharePerPerson);
    }

    const isGroupFullyPaidOverall = newPaidAmount >= groupTotal;

    setUpdatingMemberPay(true);
    try {
      const { error: groupError } = await supabase
        .from('registration_groups')
        .update({
          paid_amount: newPaidAmount,
          paid: isGroupFullyPaidOverall,
        })
        .eq('id', group.id);

      if (groupError) throw groupError;

      await fetchGroups();
      setEditingMemberPay(null);
      if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(60);
    } catch (err: any) {
      console.error('Failed to update payment:', err);
      alert(err.message || 'Failed to update payment');
    } finally {
      setUpdatingMemberPay(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-32 pt-4 px-4 max-w-[430px] mx-auto font-sans">
      
      {/* Clean Header */}
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white">Groups & Passes</h1>
        </div>
        <div className="bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl text-right">
          <span className="text-[10px] uppercase text-slate-400 block">Total</span>
          <span className="text-xs font-bold text-amber-400">{groups.length} Groups</span>
        </div>
      </div>

      {/* Simplified Search Input */}
      <div className="mb-5">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by pass #, name, or phone..."
          className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none transition-all"
        />
      </div>

      {/* Clean Group List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm">Loading...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm bg-slate-900/40 rounded-2xl border border-slate-900">
            No groups found.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredGroups.map((group) => {
              const paidAmt = group.paid_amount ?? (group.paid ? group.total : 0);
              const dueAmt = Math.max(0, group.total - paidAmt);
              const isFullyPaid = dueAmt <= 0;
              const leadMember = group.members[0];

              return (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroup(group)}
                  className="bg-slate-900/90 border border-slate-800/80 hover:border-amber-500/40 p-3.5 rounded-2xl transition-all cursor-pointer flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-amber-400">
                        {leadMember ? `#${leadMember.pass_no}` : 'Group'}
                      </span>
                      <span className="text-xs font-bold text-white">
                        {leadMember?.name || 'Group Booking'} {group.persons > 1 ? `+ ${group.persons - 1}` : ''}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block font-mono">
                      {group.persons} {group.persons === 1 ? 'Person' : 'Persons'} • Total ₹{group.total}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                      isFullyPaid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                    }`}>
                      {isFullyPaid ? 'PAID' : `DUE ₹${dueAmt}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SIMPLIFIED GROUP DETAILS & EDIT MODAL */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-[430px] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-amber-400 block">Group Overview</span>
                <h2 className="text-lg font-black text-white">{selectedGroup.persons} Members Total</h2>
              </div>
              <button 
                onClick={() => { setSelectedGroup(null); setErrorMsg(''); }} 
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 font-bold flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            {/* Clear Financial Summary */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase text-slate-400 block">Total / Received</span>
                <span className="text-base font-black text-white">₹{selectedGroup.total}</span>
                <span className="text-xs font-bold text-emerald-400 block">
                  Received: ₹{selectedGroup.paid_amount ?? (selectedGroup.paid ? selectedGroup.total : 0)}
                </span>
                {Math.max(0, selectedGroup.total - (selectedGroup.paid_amount ?? (selectedGroup.paid ? selectedGroup.total : 0))) > 0 && (
                  <span className="text-xs font-bold text-rose-400 block">
                    Due: ₹{Math.max(0, selectedGroup.total - (selectedGroup.paid_amount ?? (selectedGroup.paid ? selectedGroup.total : 0)))}
                  </span>
                )}
              </div>

              {Math.max(0, selectedGroup.total - (selectedGroup.paid_amount ?? (selectedGroup.paid ? selectedGroup.total : 0))) > 0 && (
                <button
                  type="button"
                  onClick={handlePaymentDone}
                  disabled={clearingPayment}
                  className="bg-emerald-500 active:bg-emerald-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs shadow transition-transform active:scale-95 disabled:opacity-50"
                >
                  {clearingPayment ? '...' : 'Clear Payment ✓'}
                </button>
              )}
            </div>

            {/* Clean Members List */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Members & Passes (Tap to edit status):</span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {selectedGroup.members.map((m: any, idx: number) => {
                  const groupTotal = selectedGroup.total;
                  const groupPaid = selectedGroup.paid_amount ?? (selectedGroup.paid ? groupTotal : 0);
                  const sharePerPerson = Math.round(groupTotal / selectedGroup.persons);
                  
                  // Proportional derived payment state per member based on group paid amount
                  const paidSlots = Math.floor(groupPaid / sharePerPerson);
                  const isMemberPaid = idx < paidSlots || groupPaid >= groupTotal;

                  return (
                    <div 
                      key={m.pass_no} 
                      onClick={() => {
                        setEditingMemberPay({ member: m, group: selectedGroup });
                        setMemberPayStatusType(isMemberPaid ? 'full' : 'pending');
                      }}
                      className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center cursor-pointer hover:border-slate-700"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-mono font-bold text-xs">#{m.pass_no}</span>
                        <div>
                          <span className="text-white font-medium text-xs block">{m.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">Share: ₹{sharePerPerson}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        isMemberPaid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {isMemberPaid ? 'PAID ✓' : 'PENDING'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Add Member Form */}
            <form onSubmit={handleAddMemberToGroup} className="space-y-2.5 pt-2 border-t border-slate-800">
              <span className="text-xs font-bold text-slate-300 block">Add Member on the Spot</span>

              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Full Name"
                disabled={addingMember}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
              />

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">+91</span>
                <input
                  type="tel"
                  maxLength={10}
                  value={newMemberPhone}
                  onChange={(e) => setNewMemberPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  disabled={addingMember}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none font-mono"
                />
              </div>

              {errorMsg && <p className="text-[11px] text-rose-400 font-semibold">{errorMsg}</p>}

              <button
                type="submit"
                disabled={addingMember}
                className="w-full bg-amber-500 active:bg-amber-400 text-slate-950 font-black py-3 rounded-xl text-xs transition-transform active:scale-95 disabled:opacity-50"
              >
                {addingMember ? 'Adding...' : 'Add Member'}
              </button>
            </form>

          </div>
        </div>
      )}

      {/* MEMBER STATUS MODAL */}
      {editingMemberPay && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-[340px] rounded-3xl p-5 shadow-2xl space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <div>
                <span className="text-[10px] uppercase text-slate-400 block">Member Payment State</span>
                <h2 className="text-sm font-black text-white">{editingMemberPay.member.name}</h2>
              </div>
              <button onClick={() => setEditingMemberPay(null)} className="text-slate-400 font-bold text-xs">✕</button>
            </div>

            <form onSubmit={handleSaveMemberPayment} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMemberPayStatusType('full')}
                  className={`py-2.5 rounded-xl font-bold text-xs border transition-all ${
                    memberPayStatusType === 'full' ? 'bg-emerald-950 text-emerald-400 border-emerald-500/50' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Mark Paid ✓
                </button>
                <button
                  type="button"
                  onClick={() => setMemberPayStatusType('pending')}
                  className={`py-2.5 rounded-xl font-bold text-xs border transition-all ${
                    memberPayStatusType === 'pending' ? 'bg-rose-950 text-rose-400 border-rose-500/50' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  Mark Pending ⚠
                </button>
              </div>

              <button
                type="submit"
                disabled={updatingMemberPay}
                className="w-full bg-amber-500 active:bg-amber-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition-transform active:scale-95"
              >
                {updatingMemberPay ? 'Saving...' : 'Save Payment Status ✓'}
              </button>
            </form>

          </div>
        </div>
      )}

    </main>
  );
}