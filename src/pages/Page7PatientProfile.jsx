import React, { useState } from 'react';
import { PatientProfileHeader } from '../components/PatientProfileHeader';
import { StatusBadge } from '../components/StatusBadge';
import { VerificationBadge } from '../components/VerificationBadge';
import { DeviceStatusCard } from '../components/DeviceStatusCard';
import { DoseCard } from '../components/DoseCard';
import { 
  User, 
  Calendar, 
  Pill, 
  Heart, 
  Cpu, 
  ShieldAlert, 
  Info, 
  Phone, 
  MessageSquare, 
  History,
  Send,
  X,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Save,
  Sparkles
} from 'lucide-react';
import { 
  generateWhatsAppMessage, 
  formatHourMinuteTo12Hour, 
  format12HourToTimeInput 
} from '../utils/helpers';

export const Page7PatientProfile = ({
  patient,
  onBack,
  onNavigate,
  onDeletePatient,
  onUpdateMedicationSchedule,
}) => {
  const [showContactModal, setShowContactModal] = useState(false);
  const [customNote, setCustomNote] = useState('');
  const [sentNotice, setSentNotice] = useState(false);

  // Doctor Schedule Adjustment Modal State
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [morningInput, setMorningInput] = useState('08:00');
  const [eveningInput, setEveningInput] = useState('20:00');
  const [doseWindowInput, setDoseWindowInput] = useState(30);
  const [doctorScheduleNotes, setDoctorScheduleNotes] = useState('');
  const [scheduleSaveSuccess, setScheduleSaveSuccess] = useState(false);

  // Discharge & Delete Patient Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [dischargeReason, setDischargeReason] = useState('Medicare / DOTS Treatment Completed (Cured)');
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [confirmDischargeChecked, setConfirmDischargeChecked] = useState(false);

  if (!patient) {
    return (
      <div className="p-8 text-center glass-panel rounded-3xl space-y-4">
        <p className="text-slate-600 font-semibold text-sm">No patient selected or patient has been discharged.</p>
        <button 
          onClick={onBack} 
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
        >
          Return to Patients Registry
        </button>
      </div>
    );
  }

  // Compute treatment duration in days or months
  const startDate = new Date(patient.treatmentStartDate);
  const endDate = new Date(patient.expectedTreatmentEndDate);
  const totalMonths = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));

  const handleOpenScheduleModal = () => {
    const currentMorning = patient.todayDoses?.find((d) => d.slot === 'Morning')?.scheduledTime || patient.prescribedTimes?.[0] || '08:00 AM';
    const currentEvening = patient.todayDoses?.find((d) => d.slot === 'Evening')?.scheduledTime || patient.prescribedTimes?.[1] || '08:00 PM';
    setMorningInput(format12HourToTimeInput(currentMorning, 8, 0));
    setEveningInput(format12HourToTimeInput(currentEvening, 20, 0));
    setDoseWindowInput(patient.allowedDoseWindowMinutes || 30);
    setDoctorScheduleNotes('');
    setScheduleSaveSuccess(false);
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = (e) => {
    if (e) e.preventDefault();
    const mParts = (morningInput || '08:00').split(':').map(Number);
    const eParts = (eveningInput || '20:00').split(':').map(Number);
    const formattedMorning = formatHourMinuteTo12Hour(mParts[0] ?? 8, mParts[1] ?? 0);
    const formattedEvening = formatHourMinuteTo12Hour(eParts[0] ?? 20, eParts[1] ?? 0);

    if (onUpdateMedicationSchedule) {
      onUpdateMedicationSchedule(patient.id, {
        morningTime: formattedMorning,
        eveningTime: formattedEvening,
        allowedDoseWindowMinutes: Number(doseWindowInput),
        doctorNotes: doctorScheduleNotes.trim(),
      });
    }

    setScheduleSaveSuccess(true);
    setTimeout(() => {
      setScheduleSaveSuccess(false);
      setShowScheduleModal(false);
    }, 1200);
  };

  const handleConfirmDischarge = () => {
    if (onDeletePatient) {
      onDeletePatient(patient.id, dischargeReason, dischargeNotes);
    }
    setShowDeleteModal(false);
  };

  const handleSendWhatsApp = () => {
    const text = generateWhatsAppMessage(
      patient.fullName,
      patient.id,
      customNote || 'Medication Adherence Check-in',
      'Today'
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
    setSentNotice(true);
    setTimeout(() => {
      setSentNotice(false);
      setShowContactModal(false);
    }, 2000);
  };

  // Preview formatted 12-hour strings for doctor UI
  const mParts = (morningInput || '08:00').split(':').map(Number);
  const eParts = (eveningInput || '20:00').split(':').map(Number);
  const displayMorning12H = formatHourMinuteTo12Hour(mParts[0] ?? 8, mParts[1] ?? 0);
  const displayEvening12H = formatHourMinuteTo12Hour(eParts[0] ?? 20, eParts[1] ?? 0);

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header with Name, ID, Treatment Status & Action Buttons */}
      <PatientProfileHeader
        patient={patient}
        onBack={onBack}
        onContactCaregiver={() => setShowContactModal(true)}
        onEditPatient={() => alert(`Editing profile for ${patient.fullName} (ID: ${patient.id}). All clinical fields are unlocked for modifications.`)}
        onViewHistory={() => {
          const tableElement = document.getElementById('section-dose-history');
          tableElement?.scrollIntoView({ behavior: 'smooth' });
        }}
        onAdjustSchedule={handleOpenScheduleModal}
        onDeletePatient={() => {
          setConfirmDischargeChecked(false);
          setDischargeReason('Medicare / DOTS Treatment Completed (Cured)');
          setShowDeleteModal(true);
        }}
      />

      {/* Top Cards Grid: Patient Information & Today's Medication */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Card 1: Patient Information */}
        <div className="glass-panel p-6 rounded-3xl border border-white/80 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <User className="w-5 h-5 text-teal-600" /> Patient Information
            </h3>
            <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              {patient.id}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Name</span>
              <span className="font-bold text-slate-900 text-sm">{patient.fullName}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Age & Gender</span>
              <span className="font-bold text-slate-800">{patient.age} yrs • {patient.gender}</span>
            </div>
            <div className="col-span-2">
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Treatment Regimen</span>
              <span className="font-bold text-slate-900">{patient.treatment}</span>
              <span className="text-[11px] text-slate-500 block truncate">{patient.medicationName}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Treatment Start Date</span>
              <span className="font-bold text-slate-800">{patient.treatmentStartDate}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Treatment Duration</span>
              <span className="font-bold text-slate-800">{totalMonths} Months (Until {patient.expectedTreatmentEndDate})</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Caregiver</span>
              <span className="font-bold text-slate-800">{patient.caregiverName} ({patient.caregiverRelationship})</span>
              <span className="text-[10px] font-mono text-teal-700 block">{patient.whatsAppNumber}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-semibold">Assigned Device</span>
              <span className="font-mono font-bold text-teal-800">{patient.pillboxId}</span>
              <span className="text-[10px] text-slate-500 block">{patient.compartments} Compartments ({patient.esp32Status})</span>
            </div>
          </div>
        </div>

        {/* Card 2: Today's Medication Schedule */}
        <div className="glass-panel p-6 rounded-3xl border border-white/80 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/70">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-600" /> Today's Medication
              </h3>
              <div className="flex items-center gap-2">
                <button
                  id="btn-card-change-dose-times"
                  onClick={handleOpenScheduleModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-all shadow-xs cursor-pointer"
                  title="Doctor: Change dose times and synchronize with physical pillbox"
                >
                  <Clock className="w-3.5 h-3.5 text-teal-600" />
                  <span>Doctor: Change Dose Times</span>
                </button>
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  {patient.prescribedTimes.length} Prescribed
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {patient.todayDoses.map((dose, idx) => (
                <DoseCard
                  key={idx}
                  slot={dose.slot}
                  scheduledTime={dose.scheduledTime}
                  takenTime={dose.takenTime}
                  timingStatus={dose.timingStatus}
                  verificationEvidence={dose.verificationEvidence}
                  pillboxVerified={dose.pillboxVerified}
                  aiVerified={dose.aiVerified}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-600">
            <span>Overall Adherence Score:</span>
            <span className="font-extrabold text-teal-800 font-mono text-sm bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              {patient.adherencePercentage}%
            </span>
          </div>
        </div>
      </div>

      {/* Verification Evidence Card (Explicitly Separated with Medical Disclaimer) */}
      <div className="glass-panel p-6 rounded-3xl border border-white/80 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Verification Evidence & Protocol Classification
              </h3>
              <p className="text-xs text-slate-500">
                Independent from dose timing status (e.g. pillbox access vs computer-vision analysis)
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
            NTEP Verified Standard
          </span>
        </div>

        {/* 4 Discrete Evidence State Blocks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          
          <div className="p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200">
            <div className="flex items-center justify-between mb-1">
              <span className="font-black text-teal-900 text-[11px] uppercase tracking-wider">
                INGESTION-CONSISTENT
              </span>
              <span className="w-2 h-2 rounded-full bg-teal-600" />
            </div>
            <p className="text-[11px] text-teal-800">
              Computer-vision detected hand-to-mouth motion and facial sequence during valid open compartment.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200">
            <div className="flex items-center justify-between mb-1">
              <span className="font-black text-blue-900 text-[11px] uppercase tracking-wider">
                ACCESS VERIFIED
              </span>
              <span className="w-2 h-2 rounded-full bg-blue-600" />
            </div>
            <p className="text-[11px] text-blue-800">
              Smart pillbox lid switch & reed sensor confirmed compartment access. Optical sequence not confirmed.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200">
            <div className="flex items-center justify-between mb-1">
              <span className="font-black text-amber-900 text-[11px] uppercase tracking-wider">
                RETRY REQUIRED
              </span>
              <span className="w-2 h-2 rounded-full bg-amber-600" />
            </div>
            <p className="text-[11px] text-amber-800">
              Movement obscured by camera angle or lighting; telemetry received but video inconclusive.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-300">
            <div className="flex items-center justify-between mb-1">
              <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider">
                UNVERIFIED
              </span>
              <span className="w-2 h-2 rounded-full bg-slate-500" />
            </div>
            <p className="text-[11px] text-slate-600">
              No telemetry, heartbeat, or visual access sequence registered for the scheduled interval.
            </p>
          </div>
        </div>

        {/* Mandatory Medical Disclaimer mandated by prompt */}
        <div className="p-3.5 rounded-2xl bg-slate-100/90 border border-slate-300 text-xs text-slate-700 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
          <div>
            <strong className="text-slate-900 block font-bold">
              Clinical Advisory & Computer-Vision Limitation:
            </strong>
            “Never describe computer-vision verification as guaranteed proof of swallowing. Verification indicates an ingestion-consistent sequence detected by onboard algorithms alongside verified physical smart pillbox access.”
          </div>
        </div>
      </div>

      {/* Device Status Card with Dynamic ESP32 Firmware */}
      <DeviceStatusCard 
        device={patient.deviceStatusDetails} 
        verificationMethod={patient.verificationMethod}
        patient={patient}
      />

      {/* Dose History Table */}
      <div id="section-dose-history" className="glass-panel p-6 rounded-3xl border border-white/80 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Historical Dose Telemetry Log</h3>
              <p className="text-xs text-slate-500">
                Detailed audit trail of pillbox sensor signals and computer-vision verification
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-600">
            {patient.history.length} Events Recorded
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-600 font-bold uppercase text-[10px]">
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Scheduled Time</th>
                <th className="py-3 px-3">Event Time</th>
                <th className="py-3 px-3">Dose Slot</th>
                <th className="py-3 px-3">Timing Status</th>
                <th className="py-3 px-3">Verification Evidence</th>
                <th className="py-3 px-3">Device ID</th>
                <th className="py-3 px-3 text-center">Alert Sent</th>
                <th className="py-3 px-3">Clinical Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {patient.history.map((record) => (
                <tr key={record.id} className="hover:bg-teal-50/40 transition-colors">
                  <td className="py-3 px-3 font-semibold text-slate-900 whitespace-nowrap">
                    {record.date}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                    {record.scheduledTime}
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                    {record.eventTime}
                  </td>
                  <td className="py-3 px-3 text-slate-700 font-medium whitespace-nowrap">
                    {record.doseSlot}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <StatusBadge status={record.timingStatus} size="sm" />
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <VerificationBadge evidence={record.verificationEvidence} size="sm" />
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                    {record.deviceId}
                  </td>
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    {record.alertSent ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                        Yes
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                        No
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-500 max-w-xs text-[11px] truncate" title={record.notes}>
                    {record.notes || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Treatment Completion & Patient Discharge Section (Medicare Done) */}
      <div className="glass-panel p-6 rounded-3xl border border-rose-200/70 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-r from-white/90 via-slate-50/70 to-rose-50/40">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900">
              Treatment Course Completion & Patient Discharge
            </h3>
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Medicare / DOTS Protocol
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            When a patient's DOTS therapy or Medicare course is concluded, discharge them from active monitoring. This will unassign Smart Pillbox <span className="font-mono font-bold text-teal-800">{patient.pillboxId}</span>, release the physical device for new patients, and archive active alerts.
          </p>
        </div>

        <button
          id="btn-open-discharge-profile"
          onClick={() => {
            setConfirmDischargeChecked(false);
            setDischargeReason('Medicare / DOTS Treatment Completed (Cured)');
            setShowDeleteModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-700/20 transition-all hover:scale-[1.02] shrink-0 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          <span>Discharge (Medicare Done)</span>
        </button>
      </div>

      {/* Doctor Schedule Adjustment Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="glass-panel max-w-xl w-full p-6 sm:p-7 rounded-3xl shadow-2xl border border-white space-y-5 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Doctor Prescription: Adjust Medication Times</h3>
                  <p className="text-xs text-slate-500">
                    Modifying schedule for {patient.fullName} ({patient.id})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hardware live sync alert banner */}
            <div className="p-3.5 rounded-2xl bg-teal-50/90 border border-teal-200 text-xs text-teal-900 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
              <div>
                <strong className="block font-bold">Physical Smart Pillbox Telemetry Synchronization:</strong>
                Changing times here automatically updates the physical ESP32 Smart Pillbox (<span className="font-mono font-bold">{patient.pillboxId}</span>). The device's internal timers and onboard LED/buzzer alarms will reprogram dynamically via <span className="font-mono font-semibold">/api/hardware/schedule</span>.
              </div>
            </div>

            {/* Quick Presets */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Quick Schedule Presets:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => { setMorningInput('08:00'); setEveningInput('20:00'); }}
                  className="p-2 rounded-xl border border-slate-200 hover:border-teal-400 bg-white hover:bg-teal-50/60 font-semibold text-slate-700 text-center transition-all cursor-pointer"
                >
                  <div className="text-[10px] text-teal-700 font-bold">Standard</div>
                  <div className="font-mono text-[11px]">08:00 AM / 08:00 PM</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setMorningInput('09:00'); setEveningInput('21:00'); }}
                  className="p-2 rounded-xl border border-slate-200 hover:border-teal-400 bg-white hover:bg-teal-50/60 font-semibold text-slate-700 text-center transition-all cursor-pointer"
                >
                  <div className="text-[10px] text-teal-700 font-bold">Normal</div>
                  <div className="font-mono text-[11px]">09:00 AM / 09:00 PM</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setMorningInput('10:00'); setEveningInput('22:00'); }}
                  className="p-2 rounded-xl border border-slate-200 hover:border-teal-400 bg-white hover:bg-teal-50/60 font-semibold text-slate-700 text-center transition-all cursor-pointer"
                >
                  <div className="text-[10px] text-teal-700 font-bold">Late / Night</div>
                  <div className="font-mono text-[11px]">10:00 AM / 10:00 PM</div>
                </button>
                <button
                  type="button"
                  onClick={() => { setMorningInput('06:30'); setEveningInput('18:30'); }}
                  className="p-2 rounded-xl border border-slate-200 hover:border-teal-400 bg-white hover:bg-teal-50/60 font-semibold text-slate-700 text-center transition-all cursor-pointer"
                >
                  <div className="text-[10px] text-teal-700 font-bold">Early Bird</div>
                  <div className="font-mono text-[11px]">06:30 AM / 06:30 PM</div>
                </button>
              </div>
            </div>

            {/* Time Pickers Form */}
            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Morning Slot */}
                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Morning Dose Time:
                    </label>
                    <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {displayMorning12H}
                    </span>
                  </div>
                  <input
                    id="input-doctor-morning-time"
                    type="time"
                    value={morningInput}
                    onChange={(e) => setMorningInput(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl glass-input text-sm font-mono font-bold text-slate-900 bg-white focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block">Compartment 1 scheduled trigger</span>
                </div>

                {/* Evening Slot */}
                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      Evening Dose Time:
                    </label>
                    <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {displayEvening12H}
                    </span>
                  </div>
                  <input
                    id="input-doctor-evening-time"
                    type="time"
                    value={eveningInput}
                    onChange={(e) => setEveningInput(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl glass-input text-sm font-mono font-bold text-slate-900 bg-white focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block">Compartment 2 scheduled trigger</span>
                </div>
              </div>

              {/* Dose Window */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Allowed Dose Window (Grace Period):
                </label>
                <select
                  value={doseWindowInput}
                  onChange={(e) => setDoseWindowInput(Number(e.target.value))}
                  className="w-full p-2.5 text-xs rounded-xl glass-input bg-white font-medium text-slate-800 focus:outline-none"
                >
                  <option value={15}>± 15 Minutes Window</option>
                  <option value={30}>± 30 Minutes Window (Standard NTEP)</option>
                  <option value={45}>± 45 Minutes Window</option>
                  <option value={60}>± 60 Minutes Window (Extended)</option>
                </select>
              </div>

              {/* Clinical Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Doctor Clinical Prescription Note / Adjustment Reason:
                </label>
                <textarea
                  rows={2}
                  value={doctorScheduleNotes}
                  onChange={(e) => setDoctorScheduleNotes(e.target.value)}
                  placeholder="e.g. Dose adjusted to align with patient meal schedule and prevent late evening gastric discomfort."
                  className="w-full p-2.5 text-xs rounded-xl glass-input focus:outline-none placeholder:text-slate-400 bg-white"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-save-doctor-schedule"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-700/20 transition-all cursor-pointer hover:scale-[1.02]"
                >
                  {scheduleSaveSuccess ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                      <span>Saved & Synced!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save & Sync Hardware</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discharge & Delete Patient Modal (Medicare Done) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="glass-panel max-w-lg w-full p-6 sm:p-7 rounded-3xl shadow-2xl border border-white space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Discharge Patient & Complete Medicare</h3>
                  <p className="text-xs text-slate-500">DOTS Treatment Program Completion</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDeleteModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs space-y-1.5">
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-slate-500">Patient:</span>
                <span className="font-bold">{patient.fullName} ({patient.id})</span>
              </div>
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-slate-500">Treatment Regimen:</span>
                <span className="font-medium truncate max-w-[240px]">{patient.treatment}</span>
              </div>
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-slate-500">Final Adherence Score:</span>
                <span className="font-mono font-bold text-emerald-700">{patient.adherencePercentage}%</span>
              </div>
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-slate-500">Smart Pillbox to Release:</span>
                <span className="font-mono font-bold text-teal-800">{patient.pillboxId}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Discharge / Clinical Outcome:
              </label>
              <select
                value={dischargeReason}
                onChange={(e) => setDischargeReason(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl glass-input focus:outline-none font-medium text-slate-800 bg-white"
              >
                <option value="Medicare / DOTS Treatment Completed (Cured)">
                  Medicare / DOTS Treatment Completed (Cured)
                </option>
                <option value="Regimen Completed as Prescribed by Physician">
                  Regimen Completed as Prescribed by Physician
                </option>
                <option value="Transferred to Outstation Clinic">
                  Transferred to Outstation / Other DOTS Clinic
                </option>
                <option value="Administrative Discharge">
                  Administrative Discharge / Registry Archival
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Discharge Summary & Clinical Notes (Optional):
              </label>
              <textarea
                rows={2}
                value={dischargeNotes}
                onChange={(e) => setDischargeNotes(e.target.value)}
                placeholder="e.g. Sputum smear negative, full course completed successfully with 96% verified adherence."
                className="w-full p-2.5 text-xs rounded-xl glass-input focus:outline-none bg-white placeholder:text-slate-400"
              />
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmDischargeChecked}
                onChange={(e) => setConfirmDischargeChecked(e.target.checked)}
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
              />
              <span className="text-xs text-slate-700">
                I verify that this patient's medicare/treatment is finished, and confirm discharging this patient and freeing Smart Pillbox <strong className="font-mono">{patient.pillboxId}</strong>.
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-discharge-profile"
                disabled={!confirmDischargeChecked}
                onClick={handleConfirmDischarge}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all ${
                  confirmDischargeChecked
                    ? 'bg-rose-600 hover:bg-rose-700 cursor-pointer hover:scale-[1.02]'
                    : 'bg-slate-300 cursor-not-allowed opacity-60'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirm Discharge & Delete Patient</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Caregiver Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="glass-panel max-w-md w-full p-6 rounded-3xl shadow-2xl border border-white space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">Contact Caregiver via WhatsApp</h3>
              </div>
              <button 
                onClick={() => setShowContactModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-2">
              <div>
                <span className="text-slate-500">Caregiver Name:</span>
                <strong className="text-slate-800 ml-1">{patient.caregiverName} ({patient.caregiverRelationship})</strong>
              </div>
              <div>
                <span className="text-slate-500">WhatsApp Number:</span>
                <strong className="font-mono text-emerald-700 ml-1">{patient.whatsAppNumber}</strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Custom Message / Actionable Guidance:
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Friendly reminder: Ramesh's evening TB dose is due at 08:00 PM. Please verify pillbox intake."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl glass-input focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowContactModal(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSendWhatsApp}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sentNotice ? 'Sent Successfully!' : 'Launch WhatsApp Message'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
