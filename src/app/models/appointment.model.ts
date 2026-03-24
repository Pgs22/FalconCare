export interface Appointment {
  id: number;
  time: string;
  duration: number;
  status: string;       
  patientName: string;
  doctorName: string;   
  box: string;
  reason: string;
}