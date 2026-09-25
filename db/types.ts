export type TimingStatus = 'ON_TIME' | 'LATE' | 'MISSED' | 'PENDING';

export type VerificationEvidence = 
  | 'ACCESS_VERIFIED' 
  | 'INGESTION_CONSISTENT' 
  | 'UNVERIFIED' 
  | 'RETRY_REQUIRED';

export type AlertType = 
  | 'MISSED_DOSE' 
  | 'LATE_DOSE' 
  | 'VERIFICATION_FAILED' 
  | 'DEVICE_OFFLINE' 
  | 'SYNC_PENDING';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type DoseSlot = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export interface DoseRecord {
  id: string;
  patientId?: string;
  date: string;
  scheduledTime: string;
  eventTime: string;
  doseSlot: DoseSlot;
  timingStatus: TimingStatus;
  verificationEvidence: VerificationEvidence;
  deviceId: string;
  alertSent: boolean;
  notes?: string;
  aiVerificationResult?: any;
  pillboxVerified?: boolean;
  aiVerified?: boolean;
}

export interface DeviceStatus {
  deviceId: string;
  esp32Status: 'Online' | 'Offline' | 'Connecting' | 'Standby';
  cameraStatus: 'Active' | 'Standby' | 'Error' | 'Disabled';
  internetStatus: 'Connected (WiFi)' | 'Cellular (4G)' | 'Disconnected';
  lastSync: string;
  batteryPercentage: number;
  firmwareVersion: string;
  compartmentCount: number;
}

export interface Patient {
  id: string;
  authPin: string;
  fullName: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  dateOfBirth: string;
  phoneNumber?: string;
  address: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  treatment: string;
  treatmentStartDate: string;
  expectedTreatmentEndDate: string;
  medicationName: string;
  dosesPerDay: number;
  prescribedTimes: string[];
  allowedDoseWindowMinutes: number;
  doctorName: string;
  treatmentCentre: string;
  pillboxId: string;
  compartments: number;
  esp32Status: 'Online' | 'Offline' | 'Testing';
  lastSync: string;
  verificationMethod: 'Smart Pillbox Access' | 'Camera-Assisted Verification' | 'Both';
  deviceStatusDetails: DeviceStatus;
  caregiverName: string;
  caregiverRelationship: string;
  whatsAppNumber: string;
  notificationPreferences: {
    doseTaken: boolean;
    doseLate: boolean;
    doseMissed: boolean;
    verificationFailed: boolean;
    deviceOffline: boolean;
  };
  consentGiven: boolean;
  assignedCareWorker: string;
  careWorkerId: string;
  adherencePercentage: number;
  currentStreakDays: number;
  status: 'On Track' | 'Late' | 'Missed Dose' | 'Requires Attention';
  todayDoses: {
    slot: DoseSlot;
    scheduledTime: string;
    takenTime?: string;
    timingStatus: TimingStatus;
    verificationEvidence: VerificationEvidence;
    pillboxVerified?: boolean;
    aiVerified?: boolean;
  }[];
  history: DoseRecord[];
}

export interface CareWorker {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  centre: string;
  avatarUrl: string;
}

export interface Alert {
  id: string;
  patientId: string;
  patientName: string;
  treatment: string;
  alertType: AlertType;
  scheduledDose: string;
  time: string;
  severity: AlertSeverity;
  whatsAppNotificationStatus: 'Sent to Caregiver' | 'Pending Delivery' | 'Failed' | 'Disabled';
  statusDescription: string;
  isReviewed: boolean;
  createdAt: string;
}

export interface DatabaseStats {
  status: string;
  storageDirectory: string;
  totalPatients: number;
  totalDoctors: number;
  totalAlerts: number;
  totalDoseRecords: number;
  lastUpdated: string;
  files: {
    name: string;
    path: string;
    sizeBytes: number;
    recordCount: number;
  }[];
}
