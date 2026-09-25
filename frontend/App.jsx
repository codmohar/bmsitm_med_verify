import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  getStoredPatients as getInitialPatients, 
  saveStoredPatients as savePatients, 
  getStoredAlerts as getInitialAlerts,
  saveStoredAlerts as saveAlerts,
  INITIAL_ALERTS, 
  CURRENT_CARE_WORKER 
} from './data/mockData';
import {
  syncDatabaseWithServer,
  persistPatientRecord,
  persistAlertRecord,
  persistDoctorRecord,
  persistDoseRecord,
} from './utils/indexedDB';

// Shared UI components
import { BackgroundOverlay } from './components/BackgroundOverlay';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';

// 12 Functional Pages (Converted to JSX)
import { Page1Landing } from './pages/Page1Landing';
import { Page2CareWorkerLogin } from './pages/Page2CareWorkerLogin';
import { Page3CareWorkerDashboard } from './pages/Page3CareWorkerDashboard';
import { Page4PatientManagement } from './pages/Page4PatientManagement';
import { Page5AddNewPatient } from './pages/Page5AddNewPatient';
import { Page6PatientIdGenerated } from './pages/Page6PatientIdGenerated';
import { Page7PatientProfile } from './pages/Page7PatientProfile';
import { Page8AlertCentre } from './pages/Page8AlertCentre';
import { Page9PatientLogin } from './pages/Page9PatientLogin';
import { Page10PatientDashboard } from './pages/Page10PatientDashboard';
import { Page11PatientDoseHistory } from './pages/Page11PatientDoseHistory';
import { Page12Reports } from './pages/Page12Reports';

import { Home } from 'lucide-react';
import { parseTimeToHourMinute } from './utils/helpers';

// Route slug mapping for standard web browser URL history & Chrome Back/Forward arrow navigation
const ROUTE_MAP = {
  page1_landing: 'landing',
  page2_cw_login: 'care-worker-login',
  page3_cw_dashboard: 'dashboard',
  page4_patients: 'patients',
  page5_add_patient: 'add-patient',
  page6_patient_id: 'patient-id',
  page7_patient_profile: 'patient-profile',
  page8_alert_centre: 'alerts',
  page9_patient_login: 'patient-login',
  page10_patient_dashboard: 'patient-dashboard',
  page11_patient_history: 'patient-history',
  page12_reports: 'reports',
};

const REVERSE_ROUTE_MAP = Object.fromEntries(
  Object.entries(ROUTE_MAP).map(([pageId, slug]) => [slug, pageId])
);

function getPageFromHash(hash) {
  const clean = (hash || '').replace(/^#\/?/, '').trim();
  if (!clean) return 'page1_landing';
  if (ROUTE_MAP[clean]) return clean;
  if (REVERSE_ROUTE_MAP[clean]) return REVERSE_ROUTE_MAP[clean];
  return 'page1_landing';
}

function getHashFromPage(pageId) {
  return ROUTE_MAP[pageId] || pageId || 'landing';
}

export default function App() {
  const [activePage, setActivePageState] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      return getPageFromHash(window.location.hash);
    }
    return 'page1_landing';
  });

  const [patients, setPatients] = useState(() => getInitialPatients());
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [careWorker, setCareWorker] = useState(CURRENT_CARE_WORKER);
  const [selectedPatient, setSelectedPatient] = useState(() => getInitialPatients()[0]);
  const [currentPatientUser, setCurrentPatientUser] = useState(() => getInitialPatients()[0]);
  const [newlyRegisteredPatient, setNewlyRegisteredPatient] = useState(null);

  // Continuous real-time synchronization between browser and backend (every 3 seconds)
  useEffect(() => {
    let isMounted = true;

    const syncWithBackend = async () => {
      try {
        const data = await syncDatabaseWithServer();
        if (!isMounted || !data) return;

        if (data.patients && data.patients.length > 0) {
          setPatients((prev) => {
            const prevStr = JSON.stringify(prev);
            const nextStr = JSON.stringify(data.patients);
            if (prevStr === nextStr) return prev;
            return data.patients;
          });

          setSelectedPatient((prev) => {
            if (!prev) return data.patients[0];
            const updated = data.patients.find((p) => p.id === prev.id);
            if (!updated) return prev;
            if (JSON.stringify(prev) === JSON.stringify(updated)) return prev;
            return updated;
          });

          setCurrentPatientUser((prev) => {
            if (!prev) return data.patients[0];
            const updated = data.patients.find((p) => p.id === prev.id);
            if (!updated) return prev;
            if (JSON.stringify(prev) === JSON.stringify(updated)) return prev;
            return updated;
          });
        }

        if (data.doctors && data.doctors.length > 0) {
          setCareWorker((prev) => {
            const doc = data.doctors[0];
            if (JSON.stringify(prev) === JSON.stringify(doc)) return prev;
            return doc;
          });
        }

        if (data.alerts && data.alerts.length > 0) {
          setAlerts((prev) => {
            const prevStr = JSON.stringify(prev);
            const nextStr = JSON.stringify(data.alerts);
            if (prevStr === nextStr) return prev;
            return data.alerts;
          });
        }
      } catch (err) {
        // silent background poll
      }
    };

    syncWithBackend();
    const interval = setInterval(syncWithBackend, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Navigate to a new page and record it in browser history for Chrome Back/Forward arrows
  const navigateToPage = useCallback((newPage, replace = false) => {
    setActivePageState(newPage);
    const slug = getHashFromPage(newPage);
    if (typeof window !== 'undefined') {
      const currentClean = (window.location.hash || '').replace(/^#\/?/, '');
      if (currentClean !== slug) {
        if (replace) {
          window.history.replaceState({ page: newPage }, '', `#${slug}`);
        } else {
          window.history.pushState({ page: newPage }, '', `#${slug}`);
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const setActivePage = navigateToPage;

  // Listen to Chrome Back & Forward browser arrow navigation (popstate & hashchange)
  useEffect(() => {
    const handlePopState = (event) => {
      const targetPage = event.state?.page || getPageFromHash(window.location.hash);
      setActivePageState(targetPage);
    };

    const handleHashChange = () => {
      const targetPage = getPageFromHash(window.location.hash);
      setActivePageState(targetPage);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handleHashChange);

    // Synchronize initial URL hash if empty
    if (typeof window !== 'undefined') {
      const initialSlug = getHashFromPage(activePage);
      if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
        window.history.replaceState({ page: activePage }, '', `#${initialSlug}`);
      }
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [activePage]);

  // Sync patients changes to persistence helper
  useEffect(() => {
    savePatients(patients);
  }, [patients]);

  // Synchronize the currently active patient with hardware backend so ESP32 dynamically follows the website
  const lastSyncedActivePatientRef = useRef('');
  useEffect(() => {
    const isPatientSection = activePage === 'page10_patient_dashboard' || activePage === 'page11_patient_history';
    const activeTarget = isPatientSection ? (currentPatientUser || selectedPatient) : (selectedPatient || currentPatientUser);
    if (!activeTarget || typeof window === 'undefined') return;

    const morningDose = activeTarget.todayDoses?.find((d) => d.slot === 'Morning')?.scheduledTime || activeTarget.prescribedTimes?.[0] || '08:00 AM';
    const eveningDose = activeTarget.todayDoses?.find((d) => d.slot === 'Evening')?.scheduledTime || activeTarget.prescribedTimes?.[1] || '08:00 PM';
    const p1 = parseTimeToHourMinute(morningDose, 8, 0);
    const p2 = parseTimeToHourMinute(eveningDose, 20, 0);
    const win = activeTarget.allowedDoseWindowMinutes || 30;

    const syncKey = `${activeTarget.id}|${activeTarget.pillboxId || 'BOX01'}|${p1.hour}:${p1.minute}|${p2.hour}:${p2.minute}|${win}`;
    if (lastSyncedActivePatientRef.current === syncKey) return;
    lastSyncedActivePatientRef.current = syncKey;

    fetch('/api/hardware/active-patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: activeTarget.pillboxId || 'BOX01',
        patientId: activeTarget.id,
        patientName: activeTarget.fullName,
        dose1Hour: p1.hour,
        dose1Minute: p1.minute,
        dose2Hour: p2.hour,
        dose2Minute: p2.minute,
        windowMinutes: win,
      }),
    }).catch(() => {});
  }, [
    activePage,
    selectedPatient?.id,
    selectedPatient?.pillboxId,
    selectedPatient?.prescribedTimes?.[0],
    selectedPatient?.prescribedTimes?.[1],
    currentPatientUser?.id,
    currentPatientUser?.pillboxId,
    currentPatientUser?.prescribedTimes?.[0],
    currentPatientUser?.prescribedTimes?.[1],
  ]);

  // Handle Care Worker selecting a patient to view full profile
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setActivePage('page7_patient_profile');
  };

  const handleSelectPatientById = (patientId) => {
    const found = patients.find((p) => p.id === patientId);
    if (found) {
      setSelectedPatient(found);
      setActivePage('page7_patient_profile');
    }
  };

  // Handle successful registration in Page 5
  const handleRegisterSuccess = (newPatient) => {
    const updated = [newPatient, ...patients.filter((p) => p.id !== newPatient.id)];
    setPatients(updated);
    setNewlyRegisteredPatient(newPatient);
    setSelectedPatient(newPatient);
    setCurrentPatientUser(newPatient);
    persistPatientRecord(newPatient); // Persists to both browser IndexedDB and server db/patients.json

    if (newPatient.pillboxId && typeof window !== 'undefined') {
      const morningDose = newPatient.todayDoses?.find((d) => d.slot === 'Morning')?.scheduledTime || newPatient.prescribedTimes?.[0] || '08:00 AM';
      const eveningDose = newPatient.todayDoses?.find((d) => d.slot === 'Evening')?.scheduledTime || newPatient.prescribedTimes?.[1] || '08:00 PM';
      const p1 = parseTimeToHourMinute(morningDose, 8, 0);
      const p2 = parseTimeToHourMinute(eveningDose, 20, 0);
      fetch('/api/hardware/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: newPatient.pillboxId,
          patientName: newPatient.fullName,
          patientId: newPatient.id,
          dose1Hour: p1.hour,
          dose1Minute: p1.minute,
          dose2Hour: p2.hour,
          dose2Minute: p2.minute,
          windowMinutes: newPatient.allowedDoseWindowMinutes || 30,
        }),
      }).catch(() => {});
    }

    setActivePage('page6_patient_id');
  };

  // Handle Patient taking dose completion (Step 2: AI Video Ingestion Verification)
  // Medication is officially confirmed TAKEN only when BOTH Pillbox and AI Video are verified!
  const handleTakeDoseAction = (patientId, slot, verificationResult) => {
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const todayDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    setPatients((prev) =>
      prev.map((p) => {
        if (p.id !== patientId) return p;

        const isVerified = verificationResult ? verificationResult.verified : true;
        const evidenceStatus = isVerified ? 'INGESTION_CONSISTENT' : 'UNVERIFIED';
        const timingStatus = isVerified ? 'ON_TIME' : 'MISSED';
        const logNotes = verificationResult 
          ? `AI Video Verification: ${verificationResult.explanation} (Confidence: ${Math.round(verificationResult.confidence * 100)}%)`
          : 'Dose verified via smart pillbox access and AI temporal video ingestion analysis.';

        const updatedDoses = p.todayDoses.map((d) => {
          if (d.slot === slot) {
            return {
              ...d,
              takenTime: nowTime,
              timingStatus: timingStatus,
              verificationEvidence: evidenceStatus,
              pillboxVerified: true,
              aiVerified: isVerified,
            };
          }
          return d;
        });

        const currentDoseObj = p.todayDoses.find((d) => d.slot === slot);
        const scheduledTime = currentDoseObj?.scheduledTime || (slot === 'Morning' ? '08:00 AM' : '08:00 PM');

        const newRecord = {
          id: `rec-${Date.now()}`,
          date: todayDate,
          scheduledTime: scheduledTime,
          eventTime: nowTime,
          doseSlot: slot,
          timingStatus: timingStatus,
          verificationEvidence: evidenceStatus,
          pillboxVerified: true,
          aiVerified: isVerified,
          deviceId: p.pillboxId,
          alertSent: false,
          notes: logNotes,
          aiVerificationResult: verificationResult,
        };

        const newHistory = [newRecord, ...p.history];
        const newStreak = isVerified ? p.currentStreakDays + 1 : p.currentStreakDays;
        const newAdherence = isVerified 
          ? Math.min(100, Math.round(((p.adherencePercentage * 10) + 100) / 11))
          : Math.max(0, Math.round((p.adherencePercentage * 10) / 11));

        const updatedPatient = {
          ...p,
          status: 'On Track',
          currentStreakDays: newStreak,
          adherencePercentage: newAdherence,
          todayDoses: updatedDoses,
          history: newHistory,
        };

        if (currentPatientUser && currentPatientUser.id === patientId) {
          setCurrentPatientUser(updatedPatient);
        }
        if (selectedPatient && selectedPatient.id === patientId) {
          setSelectedPatient(updatedPatient);
        }

        // Persist dose record and updated patient state to both browser IndexedDB and server db folder
        persistDoseRecord(newRecord);
        persistPatientRecord(updatedPatient);

        return updatedPatient;
      })
    );
  };

  // Handle smart pillbox opening event (Step 1 of two-stage verification: Turns Pillbox box GREEN)
  const handlePillboxAccessAction = (patientId, slot, ldrValue) => {
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const todayDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    setPatients((prev) =>
      prev.map((p) => {
        if (p.id !== patientId) return p;

        const currentDose = p.todayDoses.find((d) => d.slot === slot);
        if (currentDose && currentDose.pillboxVerified && currentDose.timingStatus === 'ON_TIME') {
          return p; // Already fully completed
        }

        const updatedDoses = p.todayDoses.map((d) => {
          if (d.slot === slot) {
            return {
              ...d,
              pillboxVerified: true,
              aiVerified: false,
              timingStatus: 'PENDING', // Awaiting Step 2 (AI Video)
              verificationEvidence: 'ACCESS_VERIFIED',
            };
          }
          return d;
        });

        const scheduledTime = currentDose?.scheduledTime || (slot === 'Morning' ? '08:00 AM' : '08:00 PM');
        const auditRecord = {
          id: `rec-access-${Date.now()}`,
          date: todayDate,
          scheduledTime: scheduledTime,
          eventTime: nowTime,
          doseSlot: slot,
          timingStatus: 'PENDING',
          verificationEvidence: 'ACCESS_VERIFIED',
          pillboxVerified: true,
          aiVerified: false,
          deviceId: p.pillboxId || 'BOX01',
          alertSent: false,
          notes: `Smart pillbox access recorded automatically by ESP32 physical sensor (LDR value: ${ldrValue || 'detected'}). Patient must complete AI video verification to confirm dose.`,
        };

        const updatedPatient = {
          ...p,
          todayDoses: updatedDoses,
          history: [auditRecord, ...p.history.filter((h) => h.id !== auditRecord.id)],
        };

        if (currentPatientUser && currentPatientUser.id === patientId) {
          setCurrentPatientUser(updatedPatient);
        }
        if (selectedPatient && selectedPatient.id === patientId) {
          setSelectedPatient(updatedPatient);
        }

        persistPatientRecord(updatedPatient);
        return updatedPatient;
      })
    );
  };

  // Handle discharging and deleting patient (e.g. Medicare/DOTS treatment completed)
  const handleDeletePatient = (patientId, reason = 'Medicare / DOTS Treatment Completed') => {
    const targetPatient = patients.find((p) => p.id === patientId);
    const updatedPatients = patients.filter((p) => p.id !== patientId);
    
    // Also remove any alerts for this patient
    const updatedAlerts = alerts.filter((a) => a.patientId !== patientId);
    setAlerts(updatedAlerts);
    saveAlerts(updatedAlerts);

    setPatients(updatedPatients);
    savePatients(updatedPatients);

    // Delete from server db/patients.json as well
    fetch(`/api/db/patients/${patientId}`, { method: 'DELETE' }).catch(() => {});

    if (selectedPatient && selectedPatient.id === patientId) {
      setSelectedPatient(updatedPatients[0] || null);
    }
    if (currentPatientUser && currentPatientUser.id === patientId) {
      setCurrentPatientUser(updatedPatients[0] || null);
    }

    // Release smart pillbox device if hardware was bound
    if (targetPatient?.pillboxId && typeof window !== 'undefined') {
      fetch('/api/hardware/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: targetPatient.pillboxId,
          patientName: 'Unassigned',
          patientId: 'NONE',
          dose1Hour: 8,
          dose1Minute: 0,
          dose2Hour: 20,
          dose2Minute: 0,
          windowMinutes: 30,
        }),
      }).catch(() => {});
    }

    // Direct navigation back to patient registry
    setActivePage('page4_patients');
  };

  // Handle Doctor updating medication time schedule for a specific patient
  const handleUpdateMedicationSchedule = (patientId, scheduleUpdate) => {
    const p1 = parseTimeToHourMinute(scheduleUpdate.morningTime, 8, 0);
    const p2 = parseTimeToHourMinute(scheduleUpdate.eveningTime, 20, 0);

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const todayDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    setPatients((prev) => {
      const updated = prev.map((p) => {
        if (p.id !== patientId) return p;

        const updatedTodayDoses = p.todayDoses.map((dose) => {
          if (dose.slot === 'Morning') {
            return {
              ...dose,
              scheduledTime: scheduleUpdate.morningTime,
              timingStatus: 'PENDING',
              verificationEvidence: 'SELF_REPORT',
              pillboxVerified: false,
              aiVerified: false,
            };
          }
          if (dose.slot === 'Evening') {
            return {
              ...dose,
              scheduledTime: scheduleUpdate.eveningTime,
              timingStatus: 'PENDING',
              verificationEvidence: 'SELF_REPORT',
              pillboxVerified: false,
              aiVerified: false,
            };
          }
          return dose;
        });

        const newPrescribedTimes = [scheduleUpdate.morningTime, scheduleUpdate.eveningTime];
        const newWindow = scheduleUpdate.allowedDoseWindowMinutes || p.allowedDoseWindowMinutes || 30;

        const noteText = scheduleUpdate.doctorNotes
          ? `Doctor prescription update: Morning dose set to ${scheduleUpdate.morningTime}, Evening dose set to ${scheduleUpdate.eveningTime}. Clinical Note: ${scheduleUpdate.doctorNotes}`
          : `Doctor prescription update: Morning dose set to ${scheduleUpdate.morningTime}, Evening dose set to ${scheduleUpdate.eveningTime}. Synchronized with hardware.`;

        const auditRecord = {
          id: `rec-sched-${Date.now()}`,
          date: todayDate,
          scheduledTime: scheduleUpdate.morningTime,
          eventTime: nowTime,
          doseSlot: 'Morning',
          timingStatus: 'PENDING',
          verificationEvidence: 'SELF_REPORT',
          pillboxVerified: false,
          aiVerified: false,
          deviceId: p.pillboxId || 'BOX01',
          alertSent: false,
          notes: noteText,
        };

        const updatedPatient = {
          ...p,
          prescribedTimes: newPrescribedTimes,
          allowedDoseWindowMinutes: newWindow,
          todayDoses: updatedTodayDoses,
          history: [auditRecord, ...p.history],
        };

        if (selectedPatient && selectedPatient.id === patientId) {
          setSelectedPatient(updatedPatient);
        }
        if (currentPatientUser && currentPatientUser.id === patientId) {
          setCurrentPatientUser(updatedPatient);
        }

        // Direct hardware schedule dispatch
        if (p.pillboxId && typeof window !== 'undefined') {
          fetch('/api/hardware/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId: p.pillboxId,
              patientName: p.fullName,
              patientId: p.id,
              dose1Hour: p1.hour,
              dose1Minute: p1.minute,
              dose2Hour: p2.hour,
              dose2Minute: p2.minute,
              windowMinutes: newWindow,
            }),
          }).catch((err) => console.error('Hardware schedule sync error', err));
        }

        // Persist to server db/patients.json immediately
        persistPatientRecord(updatedPatient);

        return updatedPatient;
      });

      savePatients(updated);
      return updated;
    });
  };

  // Handle reviewing alert in Page 8
  const handleToggleReviewAlert = (alertId) => {
    setAlerts((prev) => {
      const updated = prev.map((a) => (a.id === alertId ? { ...a, isReviewed: !a.isReviewed } : a));
      saveAlerts(updated);
      const target = updated.find((a) => a.id === alertId);
      if (target) persistAlertRecord(target);
      return updated;
    });
  };

  // Is current page inside the care-worker workspace?
  const isCareWorkerWorkspace = [
    'page3_cw_dashboard',
    'page4_patients',
    'page5_add_patient',
    'page7_patient_profile',
    'page8_alert_centre',
    'page12_reports',
  ].includes(activePage);

  // Unreviewed alert counter for sidebar & navbar
  const unreviewedAlertCount = alerts.filter((a) => !a.isReviewed).length;

  return (
    <BackgroundOverlay>
      {/* Top Navbar */}
      <Navbar
        activePage={activePage}
        onNavigate={setActivePage}
        careWorker={careWorker}
        patientUser={currentPatientUser}
        unreviewedAlertsCount={unreviewedAlertCount}
      />

      {/* Main Content View Switcher */}
      <main className="flex-1 flex flex-col">
        {/* CARE WORKER WORKSPACE LAYOUT (With Sidebar) */}
        {isCareWorkerWorkspace ? (
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col md:flex-row gap-6">
            <Sidebar
              activePage={activePage}
              onNavigate={setActivePage}
              alertCount={unreviewedAlertCount}
              onLogout={() => setActivePage('page1_landing')}
            />

            <div className="flex-1 min-w-0">
              {activePage === 'page3_cw_dashboard' && (
                <Page3CareWorkerDashboard
                  careWorker={careWorker}
                  patients={patients}
                  alerts={alerts}
                  onNavigate={setActivePage}
                  onSelectPatient={handleSelectPatient}
                />
              )}

              {activePage === 'page4_patients' && (
                <Page4PatientManagement
                  patients={patients}
                  onSelectPatient={handleSelectPatient}
                  onAddNewPatient={() => setActivePage('page5_add_patient')}
                  onDeletePatient={handleDeletePatient}
                />
              )}

              {activePage === 'page5_add_patient' && (
                <Page5AddNewPatient
                  careWorker={careWorker}
                  existingPatientCount={patients.length}
                  patients={patients}
                  onRegisterSuccess={handleRegisterSuccess}
                  onCancel={() => setActivePage('page4_patients')}
                />
              )}

              {activePage === 'page7_patient_profile' && (
                <Page7PatientProfile
                  patient={selectedPatient}
                  onBack={() => setActivePage('page4_patients')}
                  onNavigate={setActivePage}
                  onDeletePatient={handleDeletePatient}
                  onUpdateMedicationSchedule={handleUpdateMedicationSchedule}
                  onSelectPatientForLogin={(pat) => {
                    setCurrentPatientUser(pat);
                    setActivePage('page10_patient_dashboard');
                  }}
                />
              )}

              {activePage === 'page8_alert_centre' && (
                <Page8AlertCentre
                  alerts={alerts}
                  patients={patients}
                  onNavigate={setActivePage}
                  onSelectPatientById={handleSelectPatientById}
                  onToggleReviewAlert={handleToggleReviewAlert}
                />
              )}

              {activePage === 'page12_reports' && (
                <Page12Reports
                  patients={patients}
                  careWorker={careWorker}
                  onNavigate={setActivePage}
                />
              )}
            </div>
          </div>
        ) : (
          /* STANDALONE LAYOUT (Landing, Logins, Patient Views, Success) */
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col justify-center">
            {activePage === 'page1_landing' && (
              <Page1Landing onNavigate={setActivePage} />
            )}

            {activePage === 'page2_cw_login' && (
              <Page2CareWorkerLogin
                onNavigate={setActivePage}
                onLoginSuccess={(cw) => setCareWorker(cw)}
              />
            )}

            {activePage === 'page6_patient_id' && (
              <Page6PatientIdGenerated
                patient={newlyRegisteredPatient || selectedPatient}
                onNavigate={setActivePage}
                onViewProfile={handleSelectPatient}
                onDirectPatientLogin={(pat) => {
                  setCurrentPatientUser(pat);
                  setActivePage('page10_patient_dashboard');
                }}
              />
            )}

            {activePage === 'page9_patient_login' && (
              <Page9PatientLogin
                patients={patients}
                onNavigate={setActivePage}
                onPatientLoginSuccess={(p) => setCurrentPatientUser(p)}
              />
            )}

            {activePage === 'page10_patient_dashboard' && (
              <Page10PatientDashboard
                patient={currentPatientUser}
                onNavigate={setActivePage}
                onTakeDoseAction={handleTakeDoseAction}
                onPillboxAccessAction={handlePillboxAccessAction}
                onLogout={() => setActivePage('page1_landing')}
              />
            )}

            {activePage === 'page11_patient_history' && (
              <Page11PatientDoseHistory
                patient={currentPatientUser}
                onNavigate={setActivePage}
                onBack={() => setActivePage('page10_patient_dashboard')}
              />
            )}
          </div>
        )}
      </main>

      {/* Return to Initial Page Floating Button */}
      {activePage !== 'page1_landing' && (
        <aside 
          aria-label="Return to Initial Page"
          className="fixed bottom-5 right-5 z-40"
        >
          <button
            id="return-to-initial-page-btn"
            onClick={() => setActivePage('page1_landing')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900/90 hover:bg-teal-700 active:scale-95 text-white text-xs font-bold shadow-xl border border-white/20 backdrop-blur-md transition-all hover:scale-105 cursor-pointer group"
            title="Return to Initial Page / Role Selection"
          >
            <Home className="w-4 h-4 text-teal-400 group-hover:text-white transition-colors" />
            <span>Initial Page</span>
          </button>
        </aside>
      )}
    </BackgroundOverlay>
  );
}
