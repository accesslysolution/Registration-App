import { RegistrationGroup, RegistrationMember, RegistrationWithMembers, AttendanceRecord, FreeEntry, StaffMember, PricingTier } from '@/types';
import { PRICING_TIERS } from '@/config/pricing';

const STORAGE_KEYS = {
  GROUPS: 'garba_registration_groups',
  MEMBERS: 'garba_registration_members',
  ATTENDANCE: 'garba_attendance',
  FREE_ENTRIES: 'garba_free_entries',
  STAFF: 'garba_staff',
  DATES: 'garba_event_dates',
  MAX_PASS: 'garba_max_pass_no',
};

export function getRegistrationGroups(): RegistrationGroup[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.GROUPS);
  return data ? JSON.parse(data) : [];
}

export function getRegistrationMembers(): RegistrationMember[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.MEMBERS);
  return data ? JSON.parse(data) : [];
}

export function getFullRegistrations(): RegistrationWithMembers[] {
  const groups = getRegistrationGroups();
  const members = getRegistrationMembers();
  return groups.map(g => ({
    ...g,
    members: members.filter(m => m.group_id === g.id)
  }));
}

export function reserveNextPassNumbers(count: number): number[] {
  if (typeof window === 'undefined') return [];
  let currentMax = parseInt(localStorage.getItem(STORAGE_KEYS.MAX_PASS) || '0', 10);
  const start = currentMax + 1;
  const assigned: number[] = [];
  for (let i = 0; i < count; i++) {
    assigned.push(start + i);
  }
  localStorage.setItem(STORAGE_KEYS.MAX_PASS, (currentMax + count).toString());
  return assigned;
}

export function getNextPassNo(): number {
  if (typeof window === 'undefined') return 1;
  const currentMax = parseInt(localStorage.getItem(STORAGE_KEYS.MAX_PASS) || '0', 10);
  return currentMax + 1;
}

export function addRegistration(
  groupData: Omit<RegistrationGroup, 'id' | 'created_at'>,
  memberInputs: { name: string; phone: string }[]
): RegistrationWithMembers {
  const groups = getRegistrationGroups();
  const members = getRegistrationMembers();

  const groupId = Math.random().toString(36).substring(2, 11);
  const createdAt = new Date().toISOString();

  const newGroup: RegistrationGroup = {
    id: groupId,
    ...groupData,
    created_at: createdAt,
  };

  const passNumbers = reserveNextPassNumbers(memberInputs.length);
  const newMembers: RegistrationMember[] = memberInputs.map((input, idx) => ({
    pass_no: passNumbers[idx],
    group_id: groupId,
    name: input.name.trim(),
    phone: input.phone.replace(/\D/g, ''),
    created_at: createdAt,
  }));

  groups.unshift(newGroup);
  members.unshift(...newMembers);

  localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groups));
  localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(members));

  return { ...newGroup, members: newMembers };
}

export function getAttendanceForPass(passNo: number, date: string): AttendanceRecord | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
  const attendance: AttendanceRecord[] = data ? JSON.parse(data) : [];
  return attendance.find(a => a.pass_no === passNo && a.event_date === date) || null;
}

export function markAttendance(passNo: number, date: string, staffName: string): { success: boolean; message?: string } {
  const members = getRegistrationMembers();
  const member = members.find(m => m.pass_no === passNo);
  if (!member) return { success: false, message: 'Registration does not exist' };

  const groups = getRegistrationGroups();
  const group = groups.find(g => g.id === member.group_id);

  if (group && group.pass_type === 'per-day' && !group.valid_dates.includes(date)) {
    return { success: false, message: 'Pass not valid today' };
  }

  const existing = getAttendanceForPass(passNo, date);
  if (existing) {
    return { success: false, message: 'Pass already marked present today' };
  }

  if (typeof window === 'undefined') return { success: false };
  const data = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
  const attendance: AttendanceRecord[] = data ? JSON.parse(data) : [];

  const newRecord: AttendanceRecord = {
    pass_no: passNo,
    event_date: date,
    marked_by: staffName,
    marked_at: new Date().toISOString(),
  };

  attendance.push(newRecord);
  localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendance));
  return { success: true };
}

export function getFreeEntries(): FreeEntry[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.FREE_ENTRIES);
  return data ? JSON.parse(data) : [];
}

export function addFreeEntry(data: Omit<FreeEntry, 'id' | 'created_at'>): FreeEntry {
  const entries = getFreeEntries();
  const newEntry: FreeEntry = {
    id: Math.random().toString(36).substring(2, 9),
    ...data,
    created_at: new Date().toISOString(),
  };
  entries.unshift(newEntry);
  localStorage.setItem(STORAGE_KEYS.FREE_ENTRIES, JSON.stringify(entries));
  return newEntry;
}

export function getEventDates() {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.DATES);
  if (data) return JSON.parse(data);
  const defaultDates = [
    { id: 'd1', label: 'Day 1 (Sep 22)' },
    { id: 'd2', label: 'Day 2 (Sep 23)' },
    { id: 'd3', label: 'Day 3 (Sep 24)' },
    { id: 'd4', label: 'Day 4 (Sep 25)' },
    { id: 'd5', label: 'Day 5 (Sep 26)' },
  ];
  localStorage.setItem(STORAGE_KEYS.DATES, JSON.stringify(defaultDates));
  return defaultDates;
}

export function getPricingConfig(): PricingTier[] {
  return PRICING_TIERS;
}

export function getStaff(): StaffMember[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.STAFF);
  if (data) return JSON.parse(data);
  const defaultStaff: StaffMember[] = [
    { id: 's1', name: 'Gate Alpha (Rajesh)', pin: '1234' },
    { id: 's2', name: 'Gate Beta (Suresh)', pin: '5678' },
  ];
  localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(defaultStaff));
  return defaultStaff;
}