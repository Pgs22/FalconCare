// src/app/models/appointment.model.ts

export interface Appointment {
    id?: number;
    visitDate: string;
    visitTime: string;
    consultationReason: string;
    observations: string;
    status: string;
    durationMinutes: number;
    
    patientId: number;
    doctorId: number;
    boxId: number;
    treatmentId?: number | null;
}