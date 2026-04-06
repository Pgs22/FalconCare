export interface Appointment {
  id: number;
  time: string;
  duration: number;
  cleaningTime: number;
  totalBlockTime: number;
  status: string;       
  patientName: string;
  doctorName: string;   
  box: string;
  reason: string;
  color: string;
  isUrgency: boolean;
  isFirstVisit: boolean;
  treatmentId?: number;
  pathologyId?: number;
}