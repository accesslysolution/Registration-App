'use client';

import React from 'react';

interface HeaderProps {
  staffName: string;
  onLogout: () => void;
}

export default function Header({ staffName, onLogout }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 max-w-[430px] mx-auto bg-slate-950/95 backdrop-blur-md border-b border-slate-800 z-40 px-4 h-16 flex items-center justify-between pt-safe">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Staff: {staffName}</span>
          <span className="text-xs font-black text-amber-400">Day 4 (Sep 25)</span>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="bg-slate-900 border border-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 shadow"
      >
        Logout
      </button>
    </header>
  );
}