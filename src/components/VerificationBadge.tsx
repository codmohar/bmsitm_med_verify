import React from 'react';
import { VerificationEvidence } from '../types';
import { CheckCircle2, Video, AlertCircle } from 'lucide-react';

export interface VerificationBadgeProps {
  evidence?: VerificationEvidence;
  isPatientView?: boolean;
  size?: 'sm' | 'md';
  pillboxVerified?: boolean;
  aiVerified?: boolean;
  onOpenAiVerification?: () => void;
  className?: string;
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  evidence = 'UNVERIFIED',
  isPatientView = false,
  size = 'md',
  pillboxVerified,
  aiVerified,
  onOpenAiVerification,
  className = '',
}) => {
  // Determine pillbox and AI verification states
  const isPillboxDone = pillboxVerified !== undefined
    ? Boolean(pillboxVerified)
    : (evidence === 'ACCESS_VERIFIED' || evidence === 'INGESTION_CONSISTENT' || evidence === 'RETRY_REQUIRED');

  const isAiDone = aiVerified !== undefined
    ? Boolean(aiVerified)
    : (evidence === 'INGESTION_CONSISTENT');

  const isRetry = evidence === 'RETRY_REQUIRED';
  const isSmall = size === 'sm';

  const boxBaseClass = isSmall
    ? 'px-2 py-0.5 text-[10px] gap-1 rounded-md'
    : 'px-2.5 py-1 text-xs gap-1.5 rounded-lg';

  const iconClass = isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {/* Box 1: Pillbox Verification */}
      <div
        className={`inline-flex items-center font-bold border transition-all shadow-xs ${boxBaseClass} ${
          isPillboxDone
            ? 'border-emerald-500/40 bg-emerald-50 text-emerald-800'
            : 'border-rose-400/50 bg-rose-50 text-rose-800'
        }`}
        title={
          isPillboxDone
            ? 'Smart pillbox lid opened & physical LDR access confirmed.'
            : 'Pillbox compartment lid closed. Waiting for physical access.'
        }
      >
        {isPillboxDone ? (
          <CheckCircle2 className={`${iconClass} text-emerald-600 shrink-0`} />
        ) : (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
        )}
        <span className="whitespace-nowrap">
          {isPillboxDone ? 'Pillbox: Verified ✓' : 'Pillbox: Pending'}
        </span>
      </div>

      {/* Box 2: AI Video Verification */}
      {onOpenAiVerification && isPillboxDone && !isAiDone ? (
        <button
          type="button"
          onClick={onOpenAiVerification}
          className={`inline-flex items-center font-bold border transition-all shadow-xs hover:scale-105 cursor-pointer ${boxBaseClass} border-rose-400 bg-rose-100 hover:bg-rose-200 text-rose-900 animate-pulse`}
          title="Pillbox opened! Click to launch 20s AI video verification now."
        >
          <Video className={`${iconClass} text-rose-700 shrink-0`} />
          <span className="whitespace-nowrap">AI Video: Verify Now 📹</span>
        </button>
      ) : (
        <div
          className={`inline-flex items-center font-bold border transition-all shadow-xs ${boxBaseClass} ${
            isAiDone
              ? 'border-emerald-500/40 bg-emerald-50 text-emerald-800'
              : isRetry
              ? 'border-amber-400/50 bg-amber-50 text-amber-800'
              : 'border-rose-400/50 bg-rose-50 text-rose-800'
          }`}
          title={
            isAiDone
              ? 'AI computer vision facial ingestion & swallow confirmed.'
              : isRetry
              ? 'AI video analysis inconclusive. Retry required.'
              : 'Awaiting AI video camera ingestion verification.'
          }
        >
          {isAiDone ? (
            <CheckCircle2 className={`${iconClass} text-emerald-600 shrink-0`} />
          ) : isRetry ? (
            <AlertCircle className={`${iconClass} text-amber-600 shrink-0`} />
          ) : (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
          )}
          <span className="whitespace-nowrap">
            {isAiDone ? 'AI Video: Verified ✓' : isRetry ? 'AI Video: Retry ⚠' : 'AI Video: Pending'}
          </span>
        </div>
      )}
    </div>
  );
};
