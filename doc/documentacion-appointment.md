# Documentacion Appointment

Esta documentacion resume el contrato que la agenda de Angular consume del backend Symfony para listar citas, crear citas, cerrar citas y pintar alergias y limpieza de box.

## 1) Estado del backend

La agenda consume el controlador/servicio de citas del backend y una respuesta normalizada para pintar la vista diaria, por box y la limpieza posterior a cada cita.

## 2) Endpoints vigentes

- `GET /api/appointment/index?date=YYYY-MM-DD`
- `GET /api/appointment/setup-appointment-form?date=YYYY-MM-DD`
- `POST /api/appointment/new`
- `POST /api/appointment/{id}/close`

Endpoints auxiliares usados desde la agenda:

- `GET /api/patients`
- `POST /api/patients/new` actualmente sigue usado por el flujo rapido de agenda en frontend, aunque el backend documentado ya no lo expone como contrato principal.
- `GET /api/treatments/patient/{patientId}`

## 3) Contrato de cita que pinta la agenda

La UI de agenda consume citas con estos campos principales:

- `id`
- `time`
- `duration`
- `cleaningTime`
- `totalBlockTime`
- `status`
- `patientName`
- `doctorName`
- `boxId`
- `box`
- `reason`
- `color`
- `isUrgency`
- `isFirstVisit`

Reglas visuales:

- `color` llega desde Symfony y define el borde/estado.
- `cleaningTime` representa los minutos de limpieza de box despues de la cita.
- La vista del dia pinta cada cita segun su hora y duracion.
- La limpieza se pinta como bloque independiente justo despues de la cita.

## 4) Vista del día en Angular

La agenda diaria usa:

- `hourSlotHeightPx` para escalar visualmente el tiempo.
- `dayHours` para mostrar el eje horario.
- `getAppointmentTopPx()` y `getAppointmentHeightPx()` para posicionar cada cita.
- `getCleaningTopPx()` y `getCleaningHeightPx()` para posicionar la limpieza.
- `dayAllergySummary` para mostrar la tabla de alergias unicas del dia.

### 4.1 Tabla de alergias del día

La vista del día muestra una tabla con:

- Al·lèrgia
- Pacients
- Llista de pacients

Reglas:

- No repite alergias.
- Agrupa por nombre de alergia.
- Calcula los pacientes citados ese dia que comparten cada alergia.

### 4.2 Alerta clínica de paciente con alergias

Si el paciente seleccionado tiene alergias, la agenda muestra:

- `iMPORTANT: Pacient amb alergies! Es recomana cita a última hora`

Y tambien muestra el texto de alergias en rojo.

## 5) Flujo de alta de paciente desde la agenda

En la agenda, el boton de nuevo paciente abre:

- `/patient-register?returnUrl=/appointments`

En el formulario de alta de paciente:

- Se pueden marcar alergias con checkboxes.
- Se guarda `selectedAllergies` + `allergiesBitmask`.
- Al volver, el boton de regreso usa `returnUrl` para retornar a citas.

## 6) Reglas funcionales clave

1. El resumen diario de alergias debe derivarse de las citas cargadas del dia.
2. El flujo de alta de paciente desde citas no debe dejar el formulario de cita en un estado intermedio.
3. Las alergias seleccionadas deben ser legibles tanto en texto como por bitmask.
4. La agenda debe poder obtener pacientes y tratamientos para el alta rapida.

## 7) Fuentes en el frontend

- `src/app/pages/appointment/appointment.ts`
- `src/app/pages/appointment/appointment.html`
- `src/app/pages/appointment/appointment.css`
- `src/app/services/appointment.service.ts`
- `src/app/models/appointment-api.util.ts`
- `src/app/interceptors/auth.interceptor.ts`

## 8) Checklist rapido

1. Appointment debe seguir devolviendo el campo `color` por cita.
2. Appointment debe seguir devolviendo `cleaningTime` para pintar la neteja.
3. La agenda debe poder listar citas por fecha y por dia.
4. El boton de nuevo paciente debe llevar al formulario de alta con `returnUrl`.