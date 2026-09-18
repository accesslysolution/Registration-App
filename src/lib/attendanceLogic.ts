export type PassType = 'full_season' | 'per_day';

export interface RegistrationRecord {
  passNumber: number;
  name: string;
  phone: string;
  persons: number;
  passType: PassType;
  selectedDates: string[]; // e.g., ['d1', 'd2']
}

export interface AttendanceRecord {
  passNumber: number;
  enteredCount: number;
  lastEntryTime: string | null;
}

export type AttendanceStatusType = 
  | 'NOT_FOUND' 
  | 'INVALID_DATE' 
  | 'READY_TO_MARK' 
  | 'PARTIAL_ENTERED' 
  | 'ALREADY_INSIDE';

export interface AttendanceEvaluation {
  status: AttendanceStatusType;
  registration?: RegistrationRecord;
  enteredSoFar: number;
  remainingPersons: number;
  validDates?: string[];
  lastEntryTime?: string | null;
}

// Mock Database (Simulating existing registered passes)
export const MOCK_REGISTRATIONS: RegistrationRecord[] = [
  { passNumber: 1, name: 'Aarav Sharma', phone: '9876543210', persons: 4, passType: 'full_season', selectedDates: [] },
  { passNumber: 2, name: 'Priya Patel', phone: '9123456789', persons: 2, passType: 'per_day', selectedDates: ['d4', 'd5'] },
  { passNumber: 3, name: 'Rohan Mehta', phone: '9988776655', persons: 1, passType: 'full_season', selectedDates: [] },
  { passNumber: 4, name: 'Neha Gupta', phone: '9811223344', persons: 5, passType: 'per_day', selectedDates: ['d1'] }, // Note: d1 is not today
];

// Mock Today's Active Date ID for the event
export const CURRENT_EVENT_DATE_ID = 'd4';

/**
 * Pure evaluation function for gate check. 
 * Swap this implementation with a Supabase query later.
 */
export function evaluateAttendance(
  passNumber: number,
  registrations: RegistrationRecord[],
  attendanceLogs: Record<number, AttendanceRecord>,
  currentDateId: string
): AttendanceEvaluation {
  const registration = registrations.find((r) => r.passNumber === passNumber);

  // 1. Not Found
  if (!registration) {
    return { status: 'NOT_FOUND', enteredSoFar: 0, remainingPersons: 0 };
  }

  // 2. Per Day Pass validation for today
  if (registration.passType === 'per_day' && !registration.selectedDates.includes(currentDateId)) {
    return {
      status: 'INVALID_DATE',
      registration,
      enteredSoFar: 0,
      remainingPersons: 0,
      validDates: registration.selectedDates,
    };
  }

  const log = attendanceLogs[passNumber] || { enteredCount: 0, lastEntryTime: null };
  const enteredSoFar = log.enteredCount;
  const remainingPersons = registration.persons - enteredSoFar;

  // 3. Fully inside
  if (enteredSoFar >= registration.persons) {
    return {
      status: 'ALREADY_INSIDE',
      registration,
      enteredSoFar,
      remainingPersons: 0,
      lastEntryTime: log.lastEntryTime,
    };
  }

  // 4. Partially entered
  if (enteredSoFar > 0) {
    return {
      status: 'PARTIAL_ENTERED',
      registration,
      enteredSoFar,
      remainingPersons,
    };
  }

  // 5. Ready to mark (0 entered yet)
  return {
    status: 'READY_TO_MARK',
    registration,
    enteredSoFar: 0,
    remainingPersons: registration.persons,
  };
}