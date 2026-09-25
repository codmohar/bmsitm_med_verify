import React from 'react';
import { TimingStatus, VerificationEvidence, DoseSlot } from '../types';
import { StatusBadge } from './StatusBadge';
import { VerificationBadge } from './VerificationBadge';
import { Sun, Sunset, Moon, Clock, CheckCircle2, AlertCircle, Video, ShieldCheck } from 'lucide-react';

interface DoseCardProps {
  slot: DoseSlot;
  scheduledTime: string;
  takenTime?: string;
  timingStatus: TimingStatus;
  verificationEvidence: VerificationEvidence;
  pillboxVerified?: boolean;
  aiVerified?: boolean;
  isPatientView?: boolean;
  onTakeDose?: () => void;
  onOpenAiVerification?: () => void;
}

export const DoseCard: React.FC<DoseCardProps> = ({
  slot,
  scheduledTime,
  takenTime,
  timingStatus,
  verificationEvidence,
  pillboxVerified,
  aiVerified,
  isPatientView = false,
  onTakeDose,
  onOpenAiVerification,
}) => {
  const getSlotIcon = () => {
    switch (slot) {
      case 'Morning':
        return <Sun className="w-5 h-5 text-amber-500" />;
      case 'Afternoon':
        return <Sun className="w-5 h-5 text-orange-500" />;
      case 'Evening':
      case 'Night':
      default:
        return <Sunset className="w-5 h-5 text-indigo-500" />;
    }
  };

  // Determine two-stage verification states
  const isPillboxDone = pillboxVerified !== undefined
    ? Boolean(pillboxVerified)
    : (verificationEvidence === 'ACCESS_VERIFIED' || verificationEvidence === 'INGESTION_CONSISTENT' || verificationEvidence === 'RETRY_REQUIRED');

  const isAiDone = aiVerified !== undefined
    ? Boolean(aiVerified)
    : (verificationEvidence === 'INGESTION_CONSISTENT');

  // CRITICAL RULE: Dose is ONLY considered TAKEN when BOTH Pillbox and AI Video are verified!
  const isFullyTaken = isPillboxDone && isAiDone && (timingStatus === 'ON_TIME' || timingStatus === 'LATE');
  const isAwaitingAi = isPillboxDone && !isAiDone;

  const handleAiAction = onOpenAiVerification || onTakeDose;

  return (
    <div className={`glass-panel rounded-2xl p-4 sm:p-5 border transition-all ${
      isFullyTaken
        ? 'border-emerald-300 bg-emerald-50/40 shadow-sm'
        : isAwaitingAi
        ? 'border-amber-300 bg-amber-50/40 shadow-sm ring-1 ring-amber-400/30'
        : timingStatus === 'MISSED'
        ? 'border-rose-200 bg-rose-50/30'
        : 'border-slate-200/80 bg-white/80'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-white shadow-xs border border-slate-200/80">
            {getSlotIcon()}
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm">{slot} Dose</h4>
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              Scheduled: {scheduledTime}
            </span>
          </div>
        </div>

        {/* Status Badge: Only Taken when BOTH are verified */}
        {isFullyTaken ? (
          <StatusBadge status={timingStatus} size="sm" />
        ) : isAwaitingAi ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Awaiting AI Video
          </span>
        ) : (
          <StatusBadge status={timingStatus} size="sm" />
        )}
      </div>

      <div className="py-2 border-y border-slate-200/60 my-2 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          {isFullyTaken ? 'Event Recorded at:' : 'Current Status:'}
        </span>
        <span className="font-bold text-slate-800">
          {isFullyTaken
            ? `✓ Taken & Double-Verified at ${takenTime || 'Scheduled Time'}`
            : isAwaitingAi
            ? '🟡 Pillbox Opened — Complete AI Video to confirm'
            : timingStatus === 'PENDING'
            ? 'Upcoming / Scheduled (Pillbox & AI Pending)'
            : 'No Access Detected'}
        </span>
      </div>

      {/* Two-Stage Verification Evidence: Side-by-Side Boxes */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2 pt-1 text-xs">
        <span className="text-slate-500 text-[11px] font-medium shrink-0">
          {isPatientView ? 'Two-Stage Verification:' : 'Telemetry & AI Verification:'}
        </span>
        <VerificationBadge 
          evidence={verificationEvidence} 
          pillboxVerified={isPillboxDone}
          aiVerified={isAiDone}
          isPatientView={isPatientView} 
          size="sm" 
          onOpenAiVerification={handleAiAction}
        />
      </div>

      {/* Action for Patient if dose is not yet fully taken */}
      {isPatientView && !isFullyTaken && handleAiAction && (
        isAwaitingAi ? (
          <button
            onClick={handleAiAction}
            className="w-full mt-3 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-md transition-all hover:scale-[1.01] flex items-center justify-center gap-2 animate-bounce cursor-pointer"
          >
            <Video className="w-4 h-4" />
            <span>Step 2: Record 20s AI Ingestion Video (Confirm Dose)</span>
          </button>
        ) : (
          <button
            onClick={handleAiAction}
            className="w-full mt-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-sm transition-all hover:scale-[1.01] flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>Open Verification (Pillbox + AI Video)</span>
          </button>
        )
      )}
    </div>
  );
};
