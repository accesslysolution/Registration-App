'use client';

import React from 'react';
import { ActiveTab } from '@/app/page';

interface BottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: 'registration' as ActiveTab, label: 'Register', icon: '🎟️' },
    { id: 'attendance' as ActiveTab, label: 'Attendance', icon: '🚪' },
    { id: 'free-entry' as ActiveTab, label: 'Free Entry', icon: '⭐' },
    { id: 'dashboard' as ActiveTab, label: 'Dashboard', icon: '📊' },
  ];

  return (
    <nav aria-label="Bottom Navigation" className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-slate-950/95 backdrop-blur-md border-t border-slate-800 z-40 pb-safe">
      <div className="grid grid-cols-4 h-16">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                onTabChange(tab.id);
                if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
              }}
              className={`flex flex-col items-center justify-center transition-all select-none active:scale-95 ${
                isActive ? 'text-amber-400 font-black' : 'text-slate-400 font-semibold hover:text-slate-200'
              }`}
            >
              <span className="text-xl mb-0.5">{tab.icon}</span>
              <span className="text-[10px] uppercase tracking-wider">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}