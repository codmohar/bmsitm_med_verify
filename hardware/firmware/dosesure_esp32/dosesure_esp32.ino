#include "hardware_config.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <time.h>

Preferences prefs;

// =========================================================================
// FINITE STATE MACHINE DEFINITION
// =========================================================================
enum PillboxState {
  STATE_WIFI_CONNECTING,
  STATE_TIME_SYNCING,
  STATE_FETCHING_CONFIG,
  STATE_IDLE,
  STATE_WINDOW_OPEN,
  STATE_REMINDER_ACTIVE,
  STATE_ACCESS_VERIFIED,
  STATE_MISSED_DOSE,
  STATE_OFFLINE_QUEUE_SYNC
};

PillboxState systemState = STATE_WIFI_CONNECTING;

const char* stateToString(PillboxState s) {
  switch (s) {
    case STATE_WIFI_CONNECTING:    return "WIFI_CONNECTING";
    case STATE_TIME_SYNCING:       return "TIME_SYNCING";
    case STATE_FETCHING_CONFIG:    return "FETCHING_CONFIG";
    case STATE_IDLE:               return "IDLE";
    case STATE_WINDOW_OPEN:        return "WINDOW_OPEN";
    case STATE_REMINDER_ACTIVE:    return "REMINDER_ACTIVE";
    case STATE_ACCESS_VERIFIED:    return "ACCESS_VERIFIED";
    case STATE_MISSED_DOSE:        return "MISSED_DOSE";
    case STATE_OFFLINE_QUEUE_SYNC: return "OFFLINE_QUEUE_SYNC";
    default:                       return "UNKNOWN";
  }
}

// =========================================================================
// SYSTEM VARIABLES & STATES
// =========================================================================

// Dynamic Schedule Variables (Dynamically synced with currently open website page)
int dose1Hour         = -1;
int dose1Minute       = -1;
int dose2Hour         = -1;
int dose2Minute       = -1;
int doseWindowMinutes = 30;
String patientName    = "Connecting to Website...";
String patientId      = "";
long long lastScheduleVersion = 0;

// Compartment 1 Tracking
bool dose1Active       = false; // Reminder buzzer/LED active
bool dose1Armed        = false; // Armed after detecting dark
bool dose1Taken        = false; // Access verified for current cycle
bool dose1MissedReported = false;
unsigned long ldr1LightStart = 0;

// Compartment 2 Tracking
bool dose2Active       = false;
bool dose2Armed        = false;
bool dose2Taken        = false;
bool dose2MissedReported = false;
unsigned long ldr2LightStart = 0;

// Non-blocking Timers
unsigned long lastScheduleSync   = 0;
unsigned long lastWifiRetry      = 0;
unsigned long lastTelemetryPrint = 0;
unsigned long buzzerBeepTimer    = 0;
bool buzzerBeepPhase             = false;

int currentDayOfYear = -1;
bool clockSynchronized = false;
unsigned long eventCounter = 0;

// =========================================================================
// NVS FLASH PERSISTENCE & OFFLINE QUEUE
// =========================================================================

void loadPersistedConfig() {
  prefs.begin("dosesure", false);
  eventCounter = prefs.getULong("ev_cnt", 0);
  if (prefs.getBool("has_sched", false)) {
    dose1Hour           = prefs.getInt("d1_h", -1);
    dose1Minute         = prefs.getInt("d1_m", -1);
    dose2Hour           = prefs.getInt("d2_h", -1);
    dose2Minute         = prefs.getInt("d2_m", -1);
    doseWindowMinutes   = prefs.getInt("win_m", 30);
    patientName         = prefs.getString("patient", "Connecting to Website...");
    patientId           = prefs.getString("pat_id", "");
    lastScheduleVersion = atoll(prefs.getString("sched_ver", "0").c_str());
    Serial.println("[NVS] Loaded saved schedule from flash memory.");
    if (dose1Hour >= 0 && dose2Hour >= 0) {
      Serial.printf("  Patient: %s (%s) | Comp 1: %02d:%02d | Comp 2: %02d:%02d\n",
                    patientName.c_str(), patientId.c_str(), dose1Hour, dose1Minute, dose2Hour, dose2Minute);
    }
  }
  prefs.end();
}

void savePersistedConfig() {
  prefs.begin("dosesure", false);
  prefs.putInt("d1_h", dose1Hour);
  prefs.putInt("d1_m", dose1Minute);
  prefs.putInt("d2_h", dose2Hour);
  prefs.putInt("d2_m", dose2Minute);
  prefs.putInt("win_m", doseWindowMinutes);
  prefs.putString("patient", patientName);
  prefs.putString("pat_id", patientId);
  char verBuf[32];
  snprintf(verBuf, sizeof(verBuf), "%lld", lastScheduleVersion);
  prefs.putString("sched_ver", verBuf);
  prefs.putBool("has_sched", true);
  prefs.end();
  Serial.println("[NVS] Configuration saved to flash memory.");
}

String getNextUniqueEventId() {
  eventCounter++;
  prefs.begin("dosesure", false);
  prefs.putULong("ev_cnt", eventCounter);
  prefs.end();

  char buf[32];
  snprintf(buf, sizeof(buf), "%s-%06lu", DEVICE_ID, eventCounter);
  return String(buf);
}

void queueOfflineEvent(const String& payload, const String& originalTime) {
  prefs.begin("dosesure_q", false);
  prefs.putString("payload", payload);
  prefs.putString("orig_time", originalTime);
  prefs.putBool("pending", true);
  prefs.end();

  Serial.println("\n[OFFLINE QUEUE] Network unavailable. Event queued in persistent flash.");
  Serial.println("  Preserved Original Timestamp: " + originalTime);
}

bool hasOfflineQueue() {
  prefs.begin("dosesure_q", true);
  bool pending = prefs.getBool("pending", false);
  prefs.end();
  return pending;
}

void clearOfflineQueue() {
  prefs.begin("dosesure_q", false);
  prefs.putBool("pending", false);
  prefs.putString("payload", "");
  prefs.putString("orig_time", "");
  prefs.end();
  Serial.println("[OFFLINE QUEUE] Pending queue cleared.");
}

void flushOfflineQueue() {
  if (WiFi.status() != WL_CONNECTED || !hasOfflineQueue()) return;

  prefs.begin("dosesure_q", true);
  String payload  = prefs.getString("payload", "");
  String origTime = prefs.getString("orig_time", "");
  prefs.end();

  if (payload.length() == 0) {
    clearOfflineQueue();
    return;
  }

  Serial.println("\n[OFFLINE QUEUE FLUSH] Uploading pending event...");
  Serial.println("  Preserved Trigger Timestamp: " + origTime);

  HTTPClient http;
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/hardware/event";
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(payload);
  if (code == 200) {
    Serial.println("[OFFLINE QUEUE ACK] Server acknowledged upload: " + http.getString());
    clearOfflineQueue();
  } else {
    Serial.printf("[OFFLINE QUEUE RETRY] Upload failed (HTTP %d). Will retry.\n", code);
  }
  http.end();
}

// =========================================================================
// NON-BLOCKING BUZZER DRIVER (Active & Passive Support)
// =========================================================================

void soundBuzzerPulse(bool enable) {
  if (!enable) {
    digitalWrite(BUZZER_PIN, LOW);
#if !BUZZER_IS_ACTIVE
    noTone(BUZZER_PIN);
#endif
    buzzerBeepPhase = false;
    return;
  }

  // Intermittent beep pattern using millis()
  unsigned long now = millis();
  unsigned long interval = buzzerBeepPhase ? BUZZER_BEEP_ON_MS : BUZZER_BEEP_OFF_MS;

  if (now - buzzerBeepTimer >= interval) {
    buzzerBeepTimer = now;
    buzzerBeepPhase = !buzzerBeepPhase;

    if (buzzerBeepPhase) {
#if BUZZER_IS_ACTIVE
      digitalWrite(BUZZER_PIN, HIGH);
#else
      tone(BUZZER_PIN, BUZZER_FREQUENCY);
#endif
    } else {
#if BUZZER_IS_ACTIVE
      digitalWrite(BUZZER_PIN, LOW);
#else
      noTone(BUZZER_PIN);
#endif
    }
  }
}

void updateAlarms() {
  digitalWrite(LED_1_PIN, dose1Active ? HIGH : LOW);
  digitalWrite(LED_2_PIN, dose2Active ? HIGH : LOW);
  soundBuzzerPulse(dose1Active || dose2Active);
}

// =========================================================================
// BACKEND EVENT DISPATCH
// =========================================================================

void sendBackendEvent(int compNum, const char* eventType, int ldrVal, const String& timeStr) {
  String eventId = getNextUniqueEventId();

  String payload = "{";
  payload += "\"event_id\":\""    + eventId + "\",";
  payload += "\"device_id\":\""   + String(DEVICE_ID) + "\",";
  payload += "\"patient_id\":\""  + patientId + "\",";
  payload += "\"compartment\":"  + String(compNum) + ",";
  payload += "\"event_type\":\""  + String(eventType) + "\",";
  payload += "\"event_time\":\""  + timeStr + "\",";
  payload += "\"ldr_value\":"    + String(ldrVal);
  payload += "}";

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[EVENT DISPATCH] %s (Comp %d) -> Sending to Backend...\n", eventType, compNum);
    Serial.println("  Payload: " + payload);

    HTTPClient http;
    String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/hardware/event";
    http.begin(url);
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");

    int code = http.POST(payload);
    if (code == 200) {
      Serial.println("[EVENT ACK] Server response: " + http.getString());
    } else {
      Serial.printf("[EVENT ERROR] HTTP %d. Saving to offline queue.\n", code);
      queueOfflineEvent(payload, timeStr);
    }
    http.end();
  } else {
    queueOfflineEvent(payload, timeStr);
  }
}

// =========================================================================
// SCHEDULE SYNCHRONIZATION
// =========================================================================

bool parseScheduleJson(const String& json) {
  int oldH1 = dose1Hour, oldM1 = dose1Minute, oldH2 = dose2Hour, oldM2 = dose2Minute;
  int oldWin = doseWindowMinutes;
  String oldPatientId = patientId;
  long long oldVersion = lastScheduleVersion;

  // Compartment 1
  int c1 = json.indexOf("\"compartment\":1");
  if (c1 == -1) c1 = json.indexOf("\"compartment\": 1");
  if (c1 != -1) {
    int h = json.indexOf("\"hour\":", c1);
    if (h != -1) dose1Hour = json.substring(h + 7, json.indexOf(",", h)).toInt();
    int m = json.indexOf("\"minute\":", c1);
    if (m != -1) dose1Minute = json.substring(m + 9, json.indexOf("}", m)).toInt();
  } else {
    int d1h = json.indexOf("\"dose1Hour\":");
    if (d1h != -1) {
      dose1Hour = json.substring(d1h + 12, json.indexOf(",", d1h)).toInt();
    }
    int d1m = json.indexOf("\"dose1Minute\":");
    if (d1m != -1) {
      dose1Minute = json.substring(d1m + 14, json.indexOf(",", d1m)).toInt();
    }
  }

  // Compartment 2
  int c2 = json.indexOf("\"compartment\":2");
  if (c2 == -1) c2 = json.indexOf("\"compartment\": 2");
  if (c2 != -1) {
    int h = json.indexOf("\"hour\":", c2);
    if (h != -1) dose2Hour = json.substring(h + 7, json.indexOf(",", h)).toInt();
    int m = json.indexOf("\"minute\":", c2);
    if (m != -1) dose2Minute = json.substring(m + 9, json.indexOf("}", m)).toInt();
  } else {
    int d2h = json.indexOf("\"dose2Hour\":");
    if (d2h != -1) {
      dose2Hour = json.substring(d2h + 12, json.indexOf(",", d2h)).toInt();
    }
    int d2m = json.indexOf("\"dose2Minute\":");
    if (d2m != -1) {
      dose2Minute = json.substring(d2m + 14, json.indexOf(",", d2m)).toInt();
    }
  }

  // Dose Window
  int w = json.indexOf("\"windowMinutes\":");
  if (w == -1) w = json.indexOf("\"dose_window_minutes\":");
  if (w != -1) {
    int colon = json.indexOf(":", w);
    int end = json.indexOf(",", colon);
    if (end == -1) end = json.indexOf("}", colon);
    doseWindowMinutes = json.substring(colon + 1, end).toInt();
  }

  // Patient Name
  int n = json.indexOf("\"patientName\":\"");
  if (n == -1) n = json.indexOf("\"patient_name\":\"");
  if (n != -1) {
    int start = json.indexOf("\"", n + 13) + 1;
    int end = json.indexOf("\"", start);
    patientName = json.substring(start, end);
  }

  // Patient ID
  int pid = json.indexOf("\"patientId\":\"");
  if (pid == -1) pid = json.indexOf("\"patient_id\":\"");
  if (pid != -1) {
    int start = json.indexOf("\"", pid + 11) + 1;
    int end = json.indexOf("\"", start);
    patientId = json.substring(start, end);
  }

  // Schedule Version
  int sv = json.indexOf("\"scheduleVersion\":");
  if (sv == -1) sv = json.indexOf("\"schedule_version\":");
  if (sv != -1) {
    int colon = json.indexOf(":", sv);
    int end = json.indexOf(",", colon);
    if (end == -1) end = json.indexOf("}", colon);
    lastScheduleVersion = atoll(json.substring(colon + 1, end).c_str());
  }

  // Check if schedule or patient changed
  bool scheduleChanged = (oldVersion != lastScheduleVersion ||
                          oldPatientId != patientId ||
                          oldH1 != dose1Hour || oldM1 != dose1Minute ||
                          oldH2 != dose2Hour || oldM2 != dose2Minute ||
                          oldWin != doseWindowMinutes);

  if (scheduleChanged) {
    Serial.println("\n=======================================================");
    Serial.println(">>> [WEBSITE PAGE SYNC] Hardware following open patient! <<<");
    Serial.printf("  Active Patient: %s (%s)\n", patientName.c_str(), patientId.c_str());
    Serial.printf("  Comp 1 Dose   : %02d:%02d\n", dose1Hour, dose1Minute);
    Serial.printf("  Comp 2 Dose   : %02d:%02d\n", dose2Hour, dose2Minute);
    Serial.printf("  Dose Window   : %d minutes\n", doseWindowMinutes);
    Serial.println("=======================================================");

    dose1Taken = false;
    dose2Taken = false;
    dose1MissedReported = false;
    dose2MissedReported = false;

    dose1Active = false;
    dose2Active = false;
    updateAlarms();

    savePersistedConfig();
  }

  return true;
}

void syncScheduleFromBackend() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) 
             + "/api/hardware/schedule?deviceId=" + String(DEVICE_ID);

  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  int code = http.GET();
  if (code == 200) {
    parseScheduleJson(http.getString());
  }
  http.end();
}

// =========================================================================
// SETUP
// =========================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("         DOSESURE SMART PILLBOX — PRODUCTION           ");
  Serial.println("=======================================================");

  pinMode(LDR_1_PIN, INPUT);
  pinMode(LDR_2_PIN, INPUT);
  pinMode(LED_1_PIN, OUTPUT);
  pinMode(LED_2_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_1_PIN, LOW);
  digitalWrite(LED_2_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  loadPersistedConfig();

  systemState = STATE_WIFI_CONNECTING;
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to Wi-Fi [");
  Serial.print(WIFI_SSID);
  Serial.print("]");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  // Auto-fallback between hyphenated and spaced SSID
  if (WiFi.status() != WL_CONNECTED) {
    const char* altSsid = (strcmp(WIFI_SSID, "NIRMAAN 2026") == 0) ? "NIRMAAN-2026" : "NIRMAAN 2026";
    Serial.print("\nRetrying alternative SSID [");
    Serial.print(altSsid);
    Serial.print("]");
    WiFi.disconnect(true);
    delay(200);
    WiFi.begin(altSsid, WIFI_PASSWORD);
    attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi Connected! IP: " + WiFi.localIP().toString());

    systemState = STATE_TIME_SYNCING;
    configTime(TIMEZONE_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
    Serial.print("Synchronizing NTP time");

    struct tm ti;
    int ntpAttempts = 0;
    while (!getLocalTime(&ti) && ntpAttempts < 20) {
      delay(500);
      Serial.print(".");
      ntpAttempts++;
    }

    if (getLocalTime(&ti)) {
      clockSynchronized = true;
      currentDayOfYear = ti.tm_yday;
      Serial.println("\nTime Synchronized!");
      Serial.println(&ti, "Current Time: %Y-%m-%d %H:%M:%S IST");
    }

    String pingUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) 
                   + "/api/hardware/ping?deviceId=" + String(DEVICE_ID);
    HTTPClient http;
    http.begin(pingUrl);
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.GET();
    http.end();

    systemState = STATE_FETCHING_CONFIG;
    syncScheduleFromBackend();

    systemState = STATE_OFFLINE_QUEUE_SYNC;
    flushOfflineQueue();
  } else {
    Serial.println("\nWi-Fi connection failed. Continuing from local NVS memory.");
  }

  systemState = STATE_IDLE;
  Serial.println("\n[SYSTEM READY] Pillbox monitoring started.");
}

// =========================================================================
// MAIN LOOP
// =========================================================================

void loop() {
  int rawLdr1 = analogRead(LDR_1_PIN);
  int rawLdr2 = analogRead(LDR_2_PIN);

  struct tm ti;
  bool clockOk = getLocalTime(&ti, 10);

  char timeStr[40] = "TIME_UNSYNCED";
  int curMin = -1;

  if (clockOk) {
    strftime(timeStr, sizeof(timeStr), "%Y-%m-%dT%H:%M:%S+05:30", &ti);
    curMin = ti.tm_hour * 60 + ti.tm_min;

    if (ti.tm_yday != currentDayOfYear) {
      currentDayOfYear = ti.tm_yday;
      dose1Taken = false;
      dose1Active = false;
      dose1Armed = false;
      dose1MissedReported = false;
      dose2Taken = false;
      dose2Active = false;
      dose2Armed = false;
      dose2MissedReported = false;
      updateAlarms();
      Serial.println("\n[MIDNIGHT RESET] New day started. All dose states reset.");
    }
  }

  bool inWindow1 = false;
  bool inWindow2 = false;

  if (curMin >= 0 && dose1Hour >= 0 && dose2Hour >= 0) {
    int s1Min = dose1Hour * 60 + dose1Minute;
    int win1Start = s1Min;                          // Strictly start AT doctor prescribed time
    int win1End   = s1Min + doseWindowMinutes;      // Allowed intake window

    int s2Min = dose2Hour * 60 + dose2Minute;
    int win2Start = s2Min;                          // Strictly start AT doctor prescribed time
    int win2End   = s2Min + doseWindowMinutes;      // Allowed intake window

    // --- COMPARTMENT 1 WINDOW ---
    if (!dose1Taken) {
      if (curMin >= win1Start && curMin < win1End) {
        inWindow1 = true;
        if (!dose1Active) {
          dose1Active = true;
          dose2Active = false; // Strictly ensure Dose 2 is OFF
          systemState = STATE_REMINDER_ACTIVE;
          updateAlarms();
          Serial.println("\n*******************************************************");
          Serial.printf(">>> DOSE 1 REMINDER ACTIVE! Scheduled: %02d:%02d <<<\n", dose1Hour, dose1Minute);
          Serial.println("  LED 1 = ON | LED 2 = OFF | Buzzer = PULSING");
          Serial.println("*******************************************************");
        }
      } else {
        if (dose1Active) {
          dose1Active = false;
          updateAlarms();
        }
        if (curMin >= win1End && !dose1MissedReported) {
          dose1MissedReported = true;
          dose1Active = false;
          updateAlarms();
          systemState = STATE_MISSED_DOSE;
          Serial.println("\n[WINDOW EXPIRED] Dose 1 window elapsed without box access.");
          sendBackendEvent(1, "WINDOW_EXPIRED", rawLdr1, String(timeStr));
        }
      }
    }

    // --- COMPARTMENT 2 WINDOW ---
    if (!dose2Taken) {
      if (curMin >= win2Start && curMin < win2End) {
        inWindow2 = true;
        if (!dose2Active) {
          dose2Active = true;
          dose1Active = false; // Strictly ensure Dose 1 is OFF
          systemState = STATE_REMINDER_ACTIVE;
          updateAlarms();
          Serial.println("\n*******************************************************");
          Serial.printf(">>> DOSE 2 REMINDER ACTIVE! Scheduled: %02d:%02d <<<\n", dose2Hour, dose2Minute);
          Serial.println("  LED 1 = OFF | LED 2 = ON | Buzzer = PULSING");
          Serial.println("*******************************************************");
        }
      } else {
        if (dose2Active) {
          dose2Active = false;
          updateAlarms();
        }
        if (curMin >= win2End && !dose2MissedReported) {
          dose2MissedReported = true;
          dose2Active = false;
          updateAlarms();
          systemState = STATE_MISSED_DOSE;
          Serial.println("\n[WINDOW EXPIRED] Dose 2 window elapsed without box access.");
          sendBackendEvent(2, "WINDOW_EXPIRED", rawLdr2, String(timeStr));
        }
      }
    }
  }

  // --- LDR 1 DETECTION ---
  if (!dose1Armed && rawLdr1 <= (LDR_DARK_BASELINE - LDR_HYSTERESIS)) {
    dose1Armed = true;
    Serial.printf("[LDR 1 ARMED] Lid closed confirmed (ADC: %d <= %d)\n", rawLdr1, LDR_DARK_BASELINE);
  }

  if (dose1Armed) {
    if (rawLdr1 > (LDR_LIGHT_THRESH + LDR_HYSTERESIS)) {
      if (ldr1LightStart == 0) {
        ldr1LightStart = millis();
      } else if (millis() - ldr1LightStart >= LDR_DEBOUNCE_MS) {
        dose1Armed = false;
        ldr1LightStart = 0;

        if (inWindow1) {
          dose1Active = false;
          dose1Taken = true;
          updateAlarms(); // LED 1 turns OFF immediately, Buzzer turns OFF immediately!

          systemState = STATE_ACCESS_VERIFIED;
          Serial.println("\n*******************************************************");
          Serial.printf(">>> COMPARTMENT 1 OPENED ON TIME! (LDR: %d > %d) <<<\n", rawLdr1, LDR_LIGHT_THRESH);
          Serial.println("  LED 1 = OFF | LED 2 = OFF | BUZZER = OFF");
          Serial.println("  Status: ACCESS_VERIFIED | Buzzer: STOPPED");
          Serial.println("*******************************************************");
          sendBackendEvent(1, "COMPARTMENT_OPENED", rawLdr1, String(timeStr));
        } else {
          Serial.println("\n[OUT-OF-WINDOW ACCESS] Compartment 1 opened outside valid schedule.");
          Serial.printf("  LDR 1: %d | Time: %s | Sched: %02d:%02d\n", rawLdr1, timeStr, dose1Hour, dose1Minute);
          sendBackendEvent(1, "OUT_OF_WINDOW_OPEN", rawLdr1, String(timeStr));
        }
      }
    } else {
      ldr1LightStart = 0;
    }
  }

  // --- LDR 2 DETECTION ---
  if (!dose2Armed && rawLdr2 <= (LDR_DARK_BASELINE - LDR_HYSTERESIS)) {
    dose2Armed = true;
    Serial.printf("[LDR 2 ARMED] Lid closed confirmed (ADC: %d <= %d)\n", rawLdr2, LDR_DARK_BASELINE);
  }

  if (dose2Armed) {
    if (rawLdr2 > (LDR_LIGHT_THRESH + LDR_HYSTERESIS)) {
      if (ldr2LightStart == 0) {
        ldr2LightStart = millis();
      } else if (millis() - ldr2LightStart >= LDR_DEBOUNCE_MS) {
        dose2Armed = false;
        ldr2LightStart = 0;

        if (inWindow2) {
          dose2Active = false;
          dose2Taken = true;
          updateAlarms(); // LED 2 turns OFF immediately, Buzzer turns OFF immediately!

          systemState = STATE_ACCESS_VERIFIED;
          Serial.println("\n*******************************************************");
          Serial.printf(">>> COMPARTMENT 2 OPENED ON TIME! (LDR: %d > %d) <<<\n", rawLdr2, LDR_LIGHT_THRESH);
          Serial.println("  LED 1 = OFF | LED 2 = OFF | BUZZER = OFF");
          Serial.println("  Status: ACCESS_VERIFIED | Buzzer: STOPPED");
          Serial.println("*******************************************************");
          sendBackendEvent(2, "COMPARTMENT_OPENED", rawLdr2, String(timeStr));
        } else {
          Serial.println("\n[OUT-OF-WINDOW ACCESS] Compartment 2 opened outside valid schedule.");
          Serial.printf("  LDR 2: %d | Time: %s | Sched: %02d:%02d\n", rawLdr2, timeStr, dose2Hour, dose2Minute);
          sendBackendEvent(2, "OUT_OF_WINDOW_OPEN", rawLdr2, String(timeStr));
        }
      }
    } else {
      ldr2LightStart = 0;
    }
  }

  updateAlarms();

  if (!dose1Active && !dose2Active && systemState == STATE_REMINDER_ACTIVE) {
    systemState = STATE_IDLE;
  }

  // Periodic Telemetry Diagnostic (every 3 seconds)
  if (millis() - lastTelemetryPrint >= 3000) {
    lastTelemetryPrint = millis();
    char timeOnly[16] = "--:--:--";
    if (clockOk) strftime(timeOnly, sizeof(timeOnly), "%H:%M:%S", &ti);

    char d1Str[32], d2Str[32];
    if (dose1Hour >= 0) snprintf(d1Str, sizeof(d1Str), "%02d:%02d (%s)", dose1Hour, dose1Minute, dose1Active ? "ACTIVE" : (dose1Taken ? "TAKEN" : "WAIT"));
    else snprintf(d1Str, sizeof(d1Str), "--:-- (WAIT_WEB)");
    if (dose2Hour >= 0) snprintf(d2Str, sizeof(d2Str), "%02d:%02d (%s)", dose2Hour, dose2Minute, dose2Active ? "ACTIVE" : (dose2Taken ? "TAKEN" : "WAIT"));
    else snprintf(d2Str, sizeof(d2Str), "--:-- (WAIT_WEB)");

    Serial.printf("[%s] Patient: %-15s | LDR1: %4d | LDR2: %4d | D1: %s | D2: %s | Buzzer: %s | WiFi: %s\n",
                  timeOnly,
                  patientName.c_str(),
                  rawLdr1,
                  rawLdr2,
                  d1Str, d2Str,
                  (dose1Active || dose2Active) ? "ON" : "OFF",
                  WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE");

    // Real-Time Telemetry Stream to DoseSure Server
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient httpTelem;
      String telemUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/hardware/telemetry";
      httpTelem.begin(telemUrl);
      httpTelem.setTimeout(500);
      httpTelem.addHeader("Content-Type", "application/json");

      char logBuf[160];
      snprintf(logBuf, sizeof(logBuf), "[%s] LDR1: %4d | LDR2: %4d | D1: %s | D2: %s | Buzzer: %s",
               timeOnly, rawLdr1, rawLdr2, d1Str, d2Str, (dose1Active || dose2Active) ? "ON" : "OFF");

      String telemPayload = "{";
      telemPayload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
      telemPayload += "\"patient_id\":\"" + patientId + "\",";
      telemPayload += "\"ldr1\":" + String(rawLdr1) + ",";
      telemPayload += "\"ldr2\":" + String(rawLdr2) + ",";
      telemPayload += "\"comp1_opened\":" + String((rawLdr1 > LDR_LIGHT_THRESH) ? "true" : "false") + ",";
      telemPayload += "\"comp2_opened\":" + String((rawLdr2 > LDR_LIGHT_THRESH) ? "true" : "false") + ",";
      telemPayload += "\"comp1_armed\":" + String(dose1Armed ? "true" : "false") + ",";
      telemPayload += "\"comp2_armed\":" + String(dose2Armed ? "true" : "false") + ",";
      telemPayload += "\"dose1_taken\":" + String(dose1Taken ? "true" : "false") + ",";
      telemPayload += "\"dose2_taken\":" + String(dose2Taken ? "true" : "false") + ",";
      telemPayload += "\"led1\":" + String(dose1Active ? "true" : "false") + ",";
      telemPayload += "\"led2\":" + String(dose2Active ? "true" : "false") + ",";
      telemPayload += "\"buzzer\":" + String((dose1Active || dose2Active) ? "true" : "false") + ",";
      telemPayload += "\"wifi_ssid\":\"" + String(WIFI_SSID) + "\",";
      telemPayload += "\"log_line\":\"" + String(logBuf) + "\"";
      telemPayload += "}";

      httpTelem.POST(telemPayload);
      httpTelem.end();
    }
  }

  // Periodic Near-Real-Time Schedule Sync (every 5 seconds)
  if (millis() - lastScheduleSync >= SCHEDULE_POLL_INTERVAL_MS) {
    lastScheduleSync = millis();
    syncScheduleFromBackend();
  }

  // Wi-Fi Reconnect & Offline Queue Flush (every 10 seconds)
  if (millis() - lastWifiRetry >= WIFI_RETRY_INTERVAL_MS) {
    lastWifiRetry = millis();
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.reconnect();
    } else {
      flushOfflineQueue();
    }
  }

  delay(50);
}
