export interface Appointment {
  id: number;
  visit_date: string;
  visit_time: string;
  consultation_reason: string;
  observations: string;
  status: string;
  duration_minutes: number;
  patient_id: number;
  doctor_id: number;
  box_id: number;
  treatment_id?: number;
}
