'use client';

import React, { useState } from 'react';
import RegistrationPage from '@/app/registration/page';
import AttendancePage from '@/app/attendance/page';
import FreeEntryPage from '@/app/free-entry/page';
import DashboardPage from '@/app/dashboard/page';
import BottomNav from '@/components/layout/BottomNav';

export type ActiveTab = 'registration' | 'attendance' | 'free-entry' | 'dashboard';

export default function HomePage() {
  const [currentTab, setCurrentTab] = useState<ActiveTab>('attendance');

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <div className="flex-1">
        {currentTab === 'registration' && <RegistrationPage />}
        {currentTab === 'attendance' && <AttendancePage />}
        {currentTab === 'free-entry' && <FreeEntryPage />}
        {currentTab === 'dashboard' && <DashboardPage />}
      </div>
      <BottomNav activeTab={currentTab} onTabChange={setCurrentTab} />
    </div>
  );
}