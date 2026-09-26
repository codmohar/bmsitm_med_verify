import React, { useState } from 'react';
import { Patient, ActivePage } from '../types';
import { StatusBadge } from './StatusBadge';
import { VerificationBadge } from './VerificationBadge';
import { Search, Plus, Filter, User, ArrowUpRight, AlertTriangle, Shield, Trash2, CheckCircle2, X } from 'lucide-react';

interface PatientTableProps {
  patients: Patient[];
  onSelectPatient: (patient: Patient) => void;
  onAddNewPatient: () => void;
  onDeletePatient?: (patientId: string, reason?: string) => void;
}

export const PatientTable: React.FC<PatientTableProps> = ({
  patients,
  onSelectPatient,
  onAddNewPatient,
  onDeletePatient,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'On Track' | 'Late' | 'Missed Dose' | 'Requires Attention'>('All');
  const [patientToDischarge, setPatientToDischarge] = useState<Patient | null>(null);
  const [dischargeReason, setDischargeReason] = useState('Medicare / DOTS Treatment Completed (Cured)');
  const [confirmChecked, setConfirmChecked] = useState(false);

  const patientList = Array.isArray(patients) ? patients : [];

  const filteredPatients = patientList.filter((patient) => {
    const matchesSearch = 
      (patient?.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (patient?.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (patient?.treatment || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedFilter === 'All') return true;
    return (patient?.status || 'On Track') === selectedFilter;
  });

  return (
    <div className="space-y-4">
      {/* Header & Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Patient Registry
          </h2>
          <p className="text-xs text-slate-500">
            Real-time monitoring of enrolled patients on verified DOTS therapy
          </p>
        </div>

        <button
          id="btn-add-patient-header"
          onClick={onAddNewPatient}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-md shadow-teal-700/25 transition-all hover:scale-[1.02]"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add New Patient</span>
        </button>
      </div>

      {/* Search and Filters Glass Card */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-white/70">
        
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="input-patient-search"
            type="text"
            placeholder="Search by Patient Name or Patient ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl glass-input placeholder:text-slate-400 focus:outline-none"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filter:
          </span>
          {(['All', 'On Track', 'Late', 'Missed Dose', 'Requires Attention'] as const).map((filter) => {
            const count = filter === 'All' 
              ? patients.length 
              : patients.filter(p => p.status === filter).length;

            return (
              <button
                key={filter}
                id={`filter-${filter.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => setSelectedFilter(filter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  selectedFilter === filter
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900 border border-slate-200/60'
                }`}
              >
                <span>{filter}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedFilter === filter ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Patient Table Glass Panel */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/70 shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Patient ID</th>
                <th className="py-3.5 px-4">Patient Name</th>
                <th className="py-3.5 px-3">Age</th>
                <th className="py-3.5 px-4">Treatment</th>
                <th className="py-3.5 px-4">Assigned Care Worker</th>
                <th className="py-3.5 px-4 text-center">Adherence %</th>
                <th className="py-3.5 px-4">Last Dose</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertTriangle className="w-8 h-8 text-amber-500" />
                      <p className="font-semibold text-sm">No patients found</p>
                      <p className="text-xs text-slate-400">Try adjusting your search criteria or filter options</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => {
                  const latestDose = (patient.history && patient.history[0]) || (patient.todayDoses && patient.todayDoses[0] ? {
                    timingStatus: patient.todayDoses[0].timingStatus,
                    verificationEvidence: patient.todayDoses[0].verificationEvidence,
                    scheduledTime: patient.todayDoses[0].scheduledTime,
                  } : null);

                  return (
                    <tr
                      key={patient.id}
                      className="hover:bg-teal-50/40 transition-colors group cursor-pointer"
                      onClick={() => onSelectPatient(patient)}
                    >
                      {/* Patient ID */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                          {patient.id}
                        </span>
                      </td>

                      {/* Patient Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs uppercase">
                            {(patient?.fullName || 'P').charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                              {patient?.fullName || 'Patient'}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {patient?.gender || 'Patient'} • {patient?.phoneNumber || 'No phone'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Age */}
                      <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">
                        {patient.age} yrs
                      </td>

                      {/* Treatment */}
                      <td className="py-3.5 px-4 text-slate-800">
                        <div className="max-w-[200px] truncate font-medium" title={patient.treatment}>
                          {patient.treatment}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {patient.medicationName}
                        </div>
                      </td>

                      {/* Assigned Care Worker */}
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                        {patient.assignedCareWorker}
                      </td>

                      {/* Adherence % */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <div className="w-12 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                patient.adherencePercentage >= 90
                                  ? 'bg-emerald-500'
                                  : patient.adherencePercentage >= 75
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                              style={{ width: `${patient.adherencePercentage}%` }}
                            />
                          </div>
                          <span className="font-bold font-mono text-slate-800">
                            {patient.adherencePercentage}%
                          </span>
                        </div>
                      </td>

                      {/* Last Dose */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {latestDose ? (
                          <div className="flex flex-col gap-1 items-start">
                            <StatusBadge status={latestDose.timingStatus} size="sm" />
                            <VerificationBadge evidence={latestDose.verificationEvidence} size="sm" />
                          </div>
                        ) : (
                          <span className="text-slate-400">No events</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          patient.status === 'On Track'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : patient.status === 'Late'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : patient.status === 'Missed Dose'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}>
                          {patient.status}
                        </span>
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            id={`btn-view-profile-${patient.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectPatient(patient);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-white hover:bg-teal-600 text-teal-700 hover:text-white border border-teal-200 shadow-xs transition-colors cursor-pointer"
                          >
                            <span>View Profile</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>

                          {onDeletePatient && (
                            <button
                              id={`btn-discharge-patient-${patient.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPatientToDischarge(patient);
                                setConfirmChecked(false);
                                setDischargeReason('Medicare / DOTS Treatment Completed (Cured)');
                              }}
                              className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/60 hover:border-rose-200 transition-colors cursor-pointer"
                              title="Discharge / Delete Patient (Medicare Done)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Discharge / Medicare Completed Confirmation Modal */}
      {patientToDischarge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="glass-panel max-w-lg w-full p-6 rounded-3xl shadow-2xl border border-white space-y-4 relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Discharge Patient & Remove Registry</h3>
                  <p className="text-[11px] text-slate-500">Medicare / DOTS Treatment Completion Protocol</p>
                </div>
              </div>
              <button 
                onClick={() => setPatientToDischarge(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs space-y-1.5">
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-slate-500">Patient:</span>
                <span className="font-bold">{patientToDischarge.fullName} ({patientToDischarge.id})</span>
              </div>
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-slate-500">Treatment:</span>
                <span className="font-medium truncate max-w-[240px]">{patientToDischarge.treatment}</span>
              </div>
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-slate-500">Adherence Score:</span>
                <span className="font-mono font-bold text-emerald-700">{patientToDischarge.adherencePercentage}%</span>
              </div>
              <div className="flex justify-between items-center text-slate-800">
                <span className="text-slate-500">Assigned Hardware:</span>
                <span className="font-mono font-bold text-teal-800">{patientToDischarge.pillboxId} (Will be unassigned)</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Clinical Reason for Discharge / Removal:
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

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
              />
              <span className="text-xs text-slate-700">
                I verify that this patient's medicare/treatment is finished, and confirm discharging this patient and freeing Smart Pillbox <strong className="font-mono">{patientToDischarge.pillboxId}</strong>.
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPatientToDischarge(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-discharge-table"
                disabled={!confirmChecked}
                onClick={() => {
                  if (onDeletePatient) {
                    onDeletePatient(patientToDischarge.id, dischargeReason);
                  }
                  setPatientToDischarge(null);
                }}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all ${
                  confirmChecked
                    ? 'bg-rose-600 hover:bg-rose-700 cursor-pointer'
                    : 'bg-slate-300 cursor-not-allowed opacity-60'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Discharge & Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
