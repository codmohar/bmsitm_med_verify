import React, { useState } from 'react';
import { 
  User, 
  KeyRound, 
  ArrowRight, 
  Pill, 
  ShieldCheck, 
  ArrowLeft, 
  HelpCircle, 
  Search, 
  CheckCircle2, 
  Sparkles,
  Clock,
  LogIn
} from 'lucide-react';

export const Page9PatientLogin = ({
  patients = [],
  onNavigate,
  onPatientLoginSuccess,
}) => {
  const [patientId, setPatientId] = useState(patients[0]?.id || 'DS-TB-1024');
  const [pinOrDob, setPinOrDob] = useState(patients[0]?.authPin || '1234');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError('');

    const trimmedId = patientId.trim().toUpperCase();
    const matched = patients.find(
      (p) => p.id?.toUpperCase() === trimmedId
    );

    if (!matched) {
      setError(`Patient ID "${patientId}" not found in health centre records. Please verify your ID.`);
      return;
    }

    // Check PIN or date of birth match
    const validPin = matched.authPin || '1234';
    const entered = pinOrDob.trim();
    if (entered !== validPin && entered !== matched.dateOfBirth && entered !== '1234') {
      setError(`Incorrect PIN. Assigned PIN for ${matched.fullName} is "${validPin}" (or use Date of Birth).`);
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onPatientLoginSuccess(matched);
      onNavigate('page10_patient_dashboard');
    }, 300);
  };

  const handleSelectPatient = (targetPatient, autoSubmit = false) => {
    setPatientId(targetPatient.id);
    setPinOrDob(targetPatient.authPin || '1234');
    setError('');

    if (autoSubmit) {
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        onPatientLoginSuccess(targetPatient);
        onNavigate('page10_patient_dashboard');
      }, 300);
    }
  };

  const filteredPatients = patients.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.id?.toLowerCase().includes(q) ||
      p.fullName?.toLowerCase().includes(q) ||
      p.pillboxId?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-8">
      <div className="max-w-2xl w-full mx-auto space-y-6">
        
        {/* Back Link */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate('page1_landing')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950 transition-colors glass-panel-subtle px-3.5 py-2 rounded-full cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Role Selection</span>
          </button>

          <span className="text-xs text-slate-500 font-semibold bg-white/70 px-3 py-1 rounded-full border border-slate-200">
            {patients.length} Registered {patients.length === 1 ? 'Patient' : 'Patients'} Active
          </span>
        </div>

        {/* Patient Login Card on Glass */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl shadow-2xl border border-white/80 space-y-6">
          
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-600 to-cyan-600 text-white mx-auto flex items-center justify-center shadow-lg shadow-teal-700/20">
              <Pill className="w-7 h-7 -rotate-45" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Patient Portal Access
            </h2>
            <p className="text-xs text-slate-600 font-medium">
              Log in with your custom Patient ID or 1-click select any registered patient
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Patient ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Patient ID
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="input-patient-id"
                    type="text"
                    required
                    placeholder="e.g. DS-TB-1024 or custom ID"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl glass-input placeholder:text-slate-400 focus:outline-none font-mono font-bold tracking-wider uppercase text-slate-900"
                  />
                </div>
              </div>

              {/* Access PIN / Date of Birth */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Access PIN / DOB
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Default: 1234</span>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="input-patient-pin"
                    type="password"
                    required
                    placeholder="Enter 4-digit PIN"
                    value={pinOrDob}
                    onChange={(e) => setPinOrDob(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl glass-input placeholder:text-slate-400 focus:outline-none font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Helper text required by prompt */}
            <div className="p-3 rounded-xl bg-slate-50/90 border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <span>
                “Your Patient ID was assigned by your health centre doctor. Enter your assigned PIN or choose from the list of registered patients below.”
              </span>
            </div>

            {/* Submit Button */}
            <button
              id="btn-patient-login-submit"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-[0.98] text-white font-bold text-xs shadow-md shadow-teal-700/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Access DoseSure Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* DYNAMIC REGISTERED PATIENTS SELECTOR (Shows all patients added by doctor) */}
          <div className="pt-5 border-t border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 tracking-tight block">
                  All Registered Patients ({patients.length})
                </span>
                <span className="text-[11px] text-slate-500">
                  Select any patient to populate their credentials or log in with 1 click:
                </span>
              </div>
            </div>

            {/* Quick search filter if 3+ patients */}
            {patients.length > 2 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by Patient Name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-teal-500 text-slate-800 placeholder:text-slate-400"
                />
              </div>
            )}

            {/* Scrollable list of patients */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredPatients.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                  No registered patient matched "{searchQuery}"
                </div>
              ) : (
                filteredPatients.map((p, idx) => {
                  const isCurrentSelection = patientId.toUpperCase() === p.id?.toUpperCase();
                  return (
                    <div
                      key={p.id || idx}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isCurrentSelection
                          ? 'bg-teal-50/90 border-teal-400 ring-2 ring-teal-500/20 shadow-sm'
                          : 'bg-white hover:bg-slate-50/80 border-slate-200/80'
                      }`}
                    >
                      <div 
                        onClick={() => handleSelectPatient(p, false)}
                        className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                      >
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-700 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                          {p.fullName ? p.fullName.charAt(0).toUpperCase() : 'P'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {p.fullName}
                            </span>
                            {idx === 0 && (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 uppercase tracking-wider">
                                Active / Latest
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                            <span className="font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                              ID: {p.id}
                            </span>
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                              PIN: {p.authPin || '1234'}
                            </span>
                            {p.pillboxId && (
                              <span className="text-slate-400 hidden sm:inline">
                                Box: {p.pillboxId}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSelectPatient(p, false)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                            isCurrentSelection
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isCurrentSelection ? 'Selected' : 'Fill Form'}
                        </button>

                        <button
                          type="button"
                          id={`btn-quick-login-${p.id}`}
                          onClick={() => handleSelectPatient(p, true)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                          title={`Instantly log in as ${p.fullName}`}
                        >
                          <span>Log In</span>
                          <LogIn className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

