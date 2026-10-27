export interface SchedulePolicy {
  workingDays: number[];
  startTime: string;
  endTime: string;
  bufferMinutes: number;
  requireApproval: boolean;
  breaks: { startTime: string; endTime: string }[];
  unavailableDates: string[];
}
export interface SchedulingAppointment {
  id?: string;
  executiveId: string;
  date: string;
  startTime: string;
  duration: number;
  status?: string;
}
export interface SlotAvailability {
  available: boolean;
  code: string | null;
  reason: string | null;
  status: number;
  conflictId?: string;
}
export const scheduleDefaults: SchedulePolicy;
export function minute(time: string): number;
export function businessDate(now?: number): string;
export function appointmentEndTime(appointment: Pick<SchedulingAppointment, 'date' | 'startTime' | 'duration'>): number;
export function canCompleteAppointment(appointment: Pick<SchedulingAppointment, 'date' | 'startTime' | 'duration' | 'status'>, now?: number): boolean;
export function scheduleRestriction(appointment: SchedulingAppointment, policy: SchedulePolicy): SlotAvailability | null;
export function checkSchedule(appointment: SchedulingAppointment, policy: SchedulePolicy): void;
export function slotAvailability(appointment: SchedulingAppointment, policy: SchedulePolicy, appointments: readonly SchedulingAppointment[], options?: { now?: number; excludeId?: string; allowPast?: boolean }): SlotAvailability;
