import React, { useState } from 'react';
import { Stethoscope, Lock, Mail, Eye, EyeOff, ArrowRight, ShieldCheck, ArrowLeft, UserCheck, Sparkles } from 'lucide-react';
import { CURRENT_CARE_WORKER } from '../data/mockData';

const CLINICAL_DOCTORS = [
  {
    id: 'CW-408',
    name: 'Dr. Ananya Sharma',
    role: 'Senior TB Medical Officer & NTEP Coordinator',
    department: 'Division of Pulmonary Medicine & DOTS Clinic',
    email: 'ananya.sharma@health.gov.in',
    phone: '+91 98765 43210',
    centre: 'Metro District Tuberculosis Centre (DTC-04)',
    avatarUrl: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=300&q=80',
  },
  {
    id: 'CW-409',
    name: 'Dr. Rajesh Deshmukh',
    role: 'Consultant Pulmonologist & Adherence Specialist',
    department: 'Department of Chest & Respiratory Diseases',
    email: 'rajesh.deshmukh@health.gov.in',
    phone: '+91 98765 43219',
    centre: 'Metro District Tuberculosis Centre (DTC-04)',
    avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=300&q=80',
  },
];

export const Page2CareWorkerLogin = ({
  onNavigate,
  onLoginSuccess,
}) => {
  const [identifier, setIdentifier] = useState('CW-408');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const resolveDoctor = (targetId) => {
    const raw = (targetId || '').trim().toLowerCase();
    if (raw.includes('409') || raw.includes('rajesh') || raw.includes('deshmukh')) {
      return CLINICAL_DOCTORS[1];
    }
    return CLINICAL_DOCTORS[0];
  };

  const executeLogin = (doctor) => {
    setIsLoading(true);
    setError('');
    setTimeout(() => {
      setIsLoading(false);
      if (onLoginSuccess) {
        onLoginSuccess(doctor);
      }
      onNavigate('page3_cw_dashboard');
    }, 250);
  };

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your Care Worker ID or Institutional Email');
      return;
    }
    const matchedDoctor = resolveDoctor(identifier);
    executeLogin(matchedDoctor);
  };

  const handleInstantDemoLogin = (doctor) => {
    setIdentifier(doctor.id);
    setPassword('clinicalPass2026!');
    executeLogin(doctor);
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full mx-auto space-y-6">
        
        {/* Back Link */}
        <button
          onClick={() => onNavigate('page1_landing')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950 transition-colors glass-panel-subtle px-3 py-1.5 rounded-full cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Role Selection</span>
        </button>

        {/* Login Card on Glass */}
        <div className="glass-panel p-8 sm:p-10 rounded-3xl shadow-2xl border border-white/80 space-y-6">
          
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white mx-auto flex items-center justify-center shadow-lg shadow-teal-700/20">
              <Stethoscope className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Care Worker Portal
            </h2>
            <p className="text-xs text-slate-600">
              Authorized clinical personnel & TB treatment supervisors
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ID or Email */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Care Worker ID / Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="input-cw-id"
                  type="text"
                  required
                  placeholder="e.g. CW-408 or CW-409"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl glass-input placeholder:text-slate-400 focus:outline-none font-medium"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  Clinical Password
                </label>
                <span className="text-[11px] font-semibold text-teal-700">
                  Demo auto-authenticated
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="input-cw-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter clinical password or use 1-click below"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl glass-input placeholder:text-slate-400 focus:outline-none font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              id="btn-cw-login-submit"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-[0.98] text-white font-bold text-xs shadow-md shadow-teal-700/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Login to Clinical Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick 1-Click Demo Logins */}
          <div className="pt-4 border-t border-slate-200/70 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-2.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Instant 1-Click Clinical Login
              </span>
            </div>
            
            <div className="flex flex-col gap-2">
              <button
                type="button"
                id="btn-demo-ananya"
                onClick={() => handleInstantDemoLogin(CLINICAL_DOCTORS[0])}
                className="w-full py-2 px-3 rounded-xl bg-teal-50/90 hover:bg-teal-100 text-teal-900 text-[11px] font-semibold border border-teal-200/80 flex items-center justify-between transition-all cursor-pointer hover:shadow-xs group"
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-3.5 h-3.5 text-teal-700 group-hover:scale-110 transition-transform" />
                  <span className="font-bold">Dr. Ananya Sharma</span>
                  <span className="text-slate-500 font-normal text-[10px] hidden sm:inline">(Lead MO)</span>
                </div>
                <span className="font-mono text-[10px] bg-teal-200/80 px-2 py-0.5 rounded font-bold text-teal-900">
                  CW-408 →
                </span>
              </button>

              <button
                type="button"
                id="btn-demo-rajesh"
                onClick={() => handleInstantDemoLogin(CLINICAL_DOCTORS[1])}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-[11px] font-semibold border border-slate-200 flex items-center justify-between transition-all cursor-pointer hover:shadow-xs group"
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-3.5 h-3.5 text-slate-600 group-hover:scale-110 transition-transform" />
                  <span className="font-bold">Dr. Rajesh Deshmukh</span>
                  <span className="text-slate-500 font-normal text-[10px] hidden sm:inline">(Pulmonologist)</span>
                </div>
                <span className="font-mono text-[10px] bg-slate-200 px-2 py-0.5 rounded font-bold text-slate-800">
                  CW-409 →
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
