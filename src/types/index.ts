export type PassType = 'full-season' | 'per-day';
export type PaymentMode = 'cash' | 'upi';

export interface RegistrationGroup {
  id: string;
  pass_type: PassType;
  valid_dates: string[];
  persons: number;
  rate: number;
  total: number;
  paid_amount?: number; // Added for partial payment amount tracking
  payment_mode: PaymentMode;
  paid: boolean;
  created_by?: string;
  created_at: string;
  is_manual?: boolean; // Added for manual custom pricing tracking and accounting tallies
}

export interface RegistrationMember {
  pass_no: number;
  group_id: string;
  name: string;
  phone: string;
  created_at: string;
}

export interface RegistrationWithMembers extends RegistrationGroup {
  members: RegistrationMember[];
}

export interface AttendanceRecord {
  pass_no: number;
  event_date: string;
  marked_by?: string;
  marked_at: string;
}

export interface FreeEntry {
  id?: string;
  name: string;
  phone: string;
  created_by?: string;
  created_at: string;
}

export interface StaffMember {
  id?: string;
  name: string;
  pin: string;
}

export interface PricingTier {
  minPersons: number;
  maxPersons: number | null;
  fullSeasonRate: number;
  perDayRate: number;
}