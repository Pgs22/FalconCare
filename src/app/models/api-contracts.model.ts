export interface PatientApi {
  id: number;
  identityDocument: string;
  firstName: string;
  lastName: string;
  ssNumber?: string | null;
  phone: string;
  email: string;
  address: string;
  consultationReason: string;
  familyHistory: string;
  healthStatus: string;
  lifestyleHabits: string;
  registrationDate?: string | null;
  medicationAllergies?: string | null;
  medication_allergies?: string | null;
  allergiesBitmask?: number;
  allergies_bitmask?: number;
  selectedAllergies?: number[];
  selected_allergies?: number[];
  profile_image?: string | null;
  profile_image_url?: string | null;
  profileImage?: string | null;
  profileImageUrl?: string | null;
}

export interface AppointmentAgendaItem {
  id: number;
  date?: string;
  time: string;
  duration?: number;
  cleaningTime?: number;
  cleaning_time?: number;
  cleaningMinutes?: number;
  totalBlockTime?: number;
  patientName?: string;
  patientId?: number | null;
  doctorName?: string;
  doctorId?: number | null;
  boxId?: number | null;
  box?: string;
  reason?: string;
  status?: string;
  color?: string;
  isUrgency?: boolean;
  isFirstVisit?: boolean;
}
