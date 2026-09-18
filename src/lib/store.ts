export interface RegistrationItem {
  passNumber: number;
  name: string;
  phone: string;
  persons: number;
  passType: 'full_season' | 'per_day';
  selectedDates: string[];
  paymentMode: 'cash' | 'upi';
  isPaid: boolean;
  totalAmount: number;
}

export interface StaffMember {
  id: string;
  name: string;
  pin: string; // 4-digit PIN
}

// Initial Mock Registrations
export const INITIAL_REGISTRATIONS: RegistrationItem[] = [
  { passNumber: 1, name: 'Aarav Sharma', phone: '9876543210', persons: 4, passType: 'full_season', selectedDates: [], paymentMode: 'upi', isPaid: true, totalAmount: 6800 },
  { passNumber: 2, name: 'Priya Patel', phone: '9123456789', persons: 2, passType: 'per_day', selectedDates: ['d4', 'd5'], paymentMode: 'cash', isPaid: true, totalAmount: 720 },
  { passNumber: 3, name: 'Rohan Mehta', phone: '9988776655', persons: 1, passType: 'full_season', selectedDates: [], paymentMode: 'cash', isPaid: false, totalAmount: 1800 },
  { passNumber: 4, name: 'Neha Gupta', phone: '9811223344', persons: 5, passType: 'per_day', selectedDates: ['d4'], paymentMode: 'upi', isPaid: true, totalAmount: 800 },
];

export const INITIAL_DATES = [
  { id: 'd1', label: 'Day 1 (Sep 22)' },
  { id: 'd2', label: 'Day 2 (Sep 23)' },
  { id: 'd3', label: 'Day 3 (Sep 24)' },
  { id: 'd4', label: 'Day 4 (Sep 25)' },
  { id: 'd5', label: 'Day 5 (Sep 26)' },
];

export const INITIAL_STAFF: StaffMember[] = [
  { id: 's1', name: 'Gate Alpha (Rajesh)', pin: '1234' },
  { id: 's2', name: 'Gate Beta (Suresh)', pin: '5678' },
];