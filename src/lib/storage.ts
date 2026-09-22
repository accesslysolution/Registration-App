import { supabase } from '@/lib/supabase';
import { RegistrationGroup, RegistrationMember, RegistrationWithMembers, AttendanceRecord, FreeEntry, StaffMember, PricingTier } from '@/types';
import { PRICING_TIERS } from '@/config/pricing';

export async function getRegistrationGroups(): Promise<RegistrationGroup[]> {
  const { data, error } = await supabase.from('registration_groups').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching registration groups:', error);
    return [];
  }
  return data || [];
}

export async function getRegistrationMembers(): Promise<RegistrationMember[]> {
  const { data, error } = await supabase.from('registration_members').select('*');
  if (error) {
    console.error('Error fetching registration members:', error);
    return [];
  }
  return data || [];
}

export async function getFullRegistrations(): Promise<RegistrationWithMembers[]> {
  const groups = await getRegistrationGroups();
  const members = await getRegistrationMembers();
  return groups.map((g) => ({
    ...g,
    members: members.filter((m) => m.group_id === g.id),
  }));
}

export async function getNextPassNo(): Promise<number> {
  const { data, error } = await supabase
    .from('registration_members')
    .select('pass_no')
    .order('pass_no', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return 1;
  return Number(data[0].pass_no) + 1;
}

export async function addRegistration(
  groupData: Omit<RegistrationGroup, 'id' | 'created_at'>,
  memberInputs: { name: string; phone: string; paid_amount?: number; paid?: boolean }[]
): Promise<RegistrationWithMembers> {
  // 1. Insert Group Booking record
  const { data: groupResult, error: groupError } = await supabase
    .from('registration_groups')
    .insert([
      {
        pass_type: groupData.pass_type,
        valid_dates: groupData.valid_dates,
        persons: groupData.persons,
        rate: groupData.rate,
        total: groupData.total,
        paid_amount: groupData.paid_amount ?? 0,
        payment_mode: groupData.payment_mode,
        paid: groupData.paid,
        created_by: groupData.created_by,
        is_manual: groupData.is_manual ?? false,
      },
    ])
    .select('*')
    .single();

  if (groupError || !groupResult) {
    throw new Error(groupError?.message || 'Failed to create group registration');
  }

  const groupId = groupResult.id;

  // 2. Prepare members payload with individual payment support
  const membersPayload = memberInputs.map((m) => ({
    group_id: groupId,
    name: m.name.trim(),
    phone: m.phone.replace(/\D/g, ''),
    paid_amount: m.paid_amount ?? 0,
    paid: m.paid ?? false,
  }));

  // 3. Insert individual members
  const { data: membersResult, error: membersError } = await supabase
    .from('registration_members')
    .insert(membersPayload)
    .select('*');

  if (membersError || !membersResult) {
    await supabase.from('registration_groups').delete().eq('id', groupId);
    throw new Error(membersError?.message || 'Failed to create individual pass members');
  }

  return {
    ...groupResult,
    members: membersResult,
  };
}

export async function getAttendanceForPass(passNo: number, date: string): Promise<AttendanceRecord | null> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('pass_no', passNo)
    .eq('event_date', date)
    .single();

  if (error || !data) return null;
  return data;
}

export async function markAttendance(
  passNo: number, 
  date: string, 
  staffName: string
): Promise<{ success: boolean; message?: string }> {
  const { data, error } = await supabase.rpc('mark_attendance', {
    p_pass_no: passNo,
    p_event_date: date,
    p_marked_by: staffName,
  });

  if (error) {
    console.error('RPC mark_attendance error:', error);
    return { success: false, message: error.message };
  }

  return data;
}

export async function getFreeEntries(): Promise<FreeEntry[]> {
  const { data, error } = await supabase.from('free_entries').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching free entries:', error);
    return [];
  }
  return data || [];
}

export async function addFreeEntry(data: Omit<FreeEntry, 'id' | 'created_at'>): Promise<FreeEntry> {
  const { data: result, error } = await supabase
    .from('free_entries')
    .insert([
      {
        name: data.name.trim(),
        phone: data.phone.replace(/\D/g, ''),
        created_by: data.created_by,
      },
    ])
    .select('*')
    .single();

  if (error || !result) {
    throw new Error(error?.message || 'Failed to save free entry');
  }
  return result;
}

export function getEventDates() {
  return [
    { id: 'd1', label: 'Day 1 (Sep 22)' },
    { id: 'd2', label: 'Day 2 (Sep 23)' },
    { id: 'd3', label: 'Day 3 (Sep 24)' },
    { id: 'd4', label: 'Day 4 (Sep 25)' },
    { id: 'd5', label: 'Day 5 (Sep 26)' },
  ];
}

export function getPricingConfig(): PricingTier[] {
  return PRICING_TIERS;
}

export async function getStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase.from('staff').select('*');
  if (error || !data || data.length === 0) {
    return [
      { id: 's1', name: 'Gate Alpha (Rajesh)', pin: '1234' },
      { id: 's2', name: 'Gate Beta (Suresh)', pin: '5678' },
    ];
  }
  return data;
}