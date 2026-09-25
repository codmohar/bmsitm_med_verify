/**
 * DoseSure Hardware Service Facade
 * 
 * Re-exports the canonical hardware service singleton and types
 * from the hardware subsystem to ensure a single source of truth
 * for telemetry, patient schedules, and ESP32 smart pillbox events.
 */

export * from '../../hardware/services/hardwareService.js';
export { hardwareService } from '../../hardware/services/hardwareService.js';
