// =========================================================================
//                   DOSESURE SMART PILLBOX FIRMWARE
//                        COMPLETE PRODUCTION BUILD
// =========================================================================
// Hardware: ESP32 + 2x LDRs + 2x LEDs + 1x Buzzer
// Pins:
//   LDR 1 (GPIO 34)  |  LDR 2 (GPIO 35)
//   LED 1 (GPIO 25)  |  LED 2 (GPIO 26)
//   Buzzer (GPIO 27)
// Features:
//   - Dynamic schedule synchronization via HTTP GET (/api/hardware/schedule)
//   - Autonomous NTP timekeeping via <time.h> in IST (UTC+05:30)
//   - Local NVS flash persistence across reboots / offline periods
//   - Dark-then-light LDR opening detection with single-event generation
//   - Monotonic event ID counter for backend idempotency
//   - Offline event queueing preserving exact original trigger timestamp
//   - Automatic queue flush upon Wi-Fi reconnection
// =========================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <time.h>

Preferences prefs;

// =========================================================================
// CONFIGURATION
// =========================================================================

// Wi-Fi Credentials
const char* WIFI_SSID     = "NIRMAAN-2026";
const char* WIFI_PASSWORD = "Nirmaan25hr";

// DoseSure Server Endpoint
const char* SERVER_HOST   = "10.110.6.124";
const int   SERVER_PORT   = 3000;
const char* DEVICE_ID     = "BOX01";
const char* PATIENT_ID    = "DS-TB-1024";

// Pin Assignments
const int LDR_1_PIN       = 34; // Compartment 1 (Morning)
const int LDR_2_PIN       = 35; // Compartment 2 (Evening)
const int LED_1_PIN       = 25; // Indicator LED 1
const int LED_2_PIN       = 26; // Indicator LED 2
const int BUZZER_PIN      = 27; // Reminder Buzzer

// LDR Thresholds
const int LDR_1_THRESHOLD = 1000; // DARK <= 1000, LIGHT > 1000
const int LDR_2_THRESHOLD = 1000;

// India Time Offset (UTC + 05:30, No DST)
const long gmtOffset_sec     = 19800;
const int  daylightOffset_sec = 0;

// Dynamic Schedule Variables
int dose1Hour         = 8;
int dose1Minute       = 0;
int dose2Hour         = 20;
int dose2Minute       = 0;
int doseWindowMinutes = 30;
String patientName    = "Ramesh Kumar";

// Hardware States
bool dose1Active = false;
bool dose1Armed  = false;
bool dose1Taken  = false;

bool dose2Active = false;
bool dose2Armed  = false;
bool dose2Taken  = false;

int currentDayOfYear = -1;
bool timeSynced      = false;
unsigned long eventCounter = 0;

// Non-blocking Timers
unsigned long lastScheduleSync = 0;
const unsigned long SCHEDULE_SYNC_INTERVAL = 30000; // Poll schedule every 30s

unsigned long lastWifiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 15000;    // Check Wi-Fi reconnect every 15s

unsigned long lastTelemetryPrint = 0;

// =========================================================================
// NVS STORAGE (PERSISTENCE & OFFLINE QUEUE)
// =========================================================================

void loadNvsConfig() {
  prefs.begin("dosesure", false);
  eventCounter = prefs.getULong("ev_cnt", 0);
  if (prefs.getBool("has_sched", false)) {
    dose1Hour         = prefs.getInt("d1_h", 8);
    dose1Minute       = prefs.getInt("d1_m", 0);
    dose2Hour         = prefs.getInt("d2_h", 20);
    dose2Minute       = prefs.getInt("d2_m", 0);
    doseWindowMinutes = prefs.getInt("win_m", 30);
    patientName       = prefs.getString("patient", "Ramesh Kumar");
  }
  prefs.end();
}

void saveScheduleToNvs() {
  prefs.begin("dosesure", false);
  prefs.putInt("d1_h", dose1Hour);
  prefs.putInt("d1_m", dose1Minute);
  prefs.putInt("d2_h", dose2Hour);
  prefs.putInt("d2_m", dose2Minute);
  prefs.putInt("win_m", doseWindowMinutes);
  prefs.putString("patient", patientName);
  prefs.putBool("has_sched", true);
  prefs.end();
}

String generateEventId() {
  eventCounter++;
  prefs.begin("dosesure", false);
  prefs.putULong("ev_cnt", eventCounter);
  prefs.end();

  char buf[32];
  snprintf(buf, sizeof(buf), "%s-%06lu", DEVICE_ID, eventCounter);
  return String(buf);
}

void queueEventLocally(const String& payload, const String& originalTime) {
  prefs.begin("dosesure_q", false);
  prefs.putString("payload", payload);
  prefs.putString("orig_time", originalTime);
  prefs.putBool("pending", true);
  prefs.end();

  Serial.println("\n[OFFLINE QUEUE] Network unavailable. Event saved to NVS flash memory.");
  Serial.print("Preserved Original Timestamp: ");
  Serial.println(originalTime);
}

bool hasPendingQueue() {
  prefs.begin("dosesure_q", true);
  bool p = prefs.getBool("pending", false);
  prefs.end();
  return p;
}

void clearPendingQueue() {
  prefs.begin("dosesure_q", false);
  prefs.putBool("pending", false);
  prefs.putString("payload", "");
  prefs.putString("orig_time", "");
  prefs.end();
  Serial.println("[OFFLINE QUEUE] Pending queue successfully flushed and cleared.");
}

void flushOfflineQueue() {
  if (WiFi.status() != WL_CONNECTED || !hasPendingQueue()) return;

  prefs.begin("dosesure_q", true);
  String payload = prefs.getString("payload", "");
  String origTime = prefs.getString("orig_time", "");
  prefs.end();

  if (payload.length() == 0) {
    clearPendingQueue();
    return;
  }

  Serial.println("\n[OFFLINE QUEUE FLUSH] Uploading previously queued event...");
  Serial.print("Original Trigger Timestamp: ");
  Serial.println(origTime);

  HTTPClient http;
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/hardware/event";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(payload);
  if (code == 200) {
    String resp = http.getString();
    Serial.println("[OFFLINE QUEUE ACK] Server acknowledged upload: " + resp);
    clearPendingQueue();
  } else {
    Serial.printf("[OFFLINE QUEUE RETRY] Upload failed (HTTP %d). Will retry.\n", code);
  }
  http.end();
}

// =========================================================================
// SCHEDULE SYNCHRONIZATION
// =========================================================================

bool parseScheduleJson(const String& json) {
  int oldH1 = dose1Hour, oldM1 = dose1Minute, oldH2 = dose2Hour, oldM2 = dose2Minute;

  int c1 = json.indexOf("\"compartment\":1");
  if (c1 == -1) c1 = json.indexOf("\"compartment\": 1");
  if (c1 != -1) {
    int h = json.indexOf("\"hour\":", c1);
    if (h != -1) dose1Hour = json.substring(h + 7, json.indexOf(",", h)).toInt();
    int m = json.indexOf("\"minute\":", c1);
    if (m != -1) dose1Minute = json.substring(m + 9, json.indexOf("}", m)).toInt();
  }

  int c2 = json.indexOf("\"compartment\":2");
  if (c2 == -1) c2 = json.indexOf("\"compartment\": 2");
  if (c2 != -1) {
    int h = json.indexOf("\"hour\":", c2);
    if (h != -1) dose2Hour = json.substring(h + 7, json.indexOf(",", h)).toInt();
    int m = json.indexOf("\"minute\":", c2);
    if (m != -1) dose2Minute = json.substring(m + 9, json.indexOf("}", m)).toInt();
  }

  int w = json.indexOf("\"dose_window_minutes\":");
  if (w != -1) doseWindowMinutes = json.substring(w + 22, json.indexOf(",", w)).toInt();

  int n = json.indexOf("\"patient_name\":\"");
  if (n != -1) patientName = json.substring(n + 16, json.indexOf("\"", n + 16));

  if (oldH1 != dose1Hour || oldM1 != dose1Minute || oldH2 != dose2Hour || oldM2 != dose2Minute) {
    Serial.println("\n>>> [SCHEDULE UPDATE] Dynamic schedule refreshed from DoseSure! <<<");
    Serial.printf("Patient: %s | Comp 1: %02d:%02d | Comp 2: %02d:%02d | Window: %d min\n",
                  patientName.c_str(), dose1Hour, dose1Minute, dose2Hour, dose2Minute, doseWindowMinutes);
    dose1Taken = false;
    dose2Taken = false;
    saveScheduleToNvs();
  }

  return (c1 != -1 && c2 != -1);
}

void syncSchedule() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) 
             + "/api/hardware/schedule?deviceId=" + String(DEVICE_ID);

  http.begin(url);
  int code = http.GET();
  if (code == 200) {
    parseScheduleJson(http.getString());
  }
  http.end();
}

// =========================================================================
// EVENT REPORTING
// =========================================================================

void reportCompartmentEvent(int compartmentNum, int ldrVal, const String& timeStr) {
  String eventId = generateEventId();

  String payload = "{";
  payload += "\"event_id\":\""    + eventId + "\",";
  payload += "\"device_id\":\""   + String(DEVICE_ID) + "\",";
  payload += "\"patient_id\":\""  + String(PATIENT_ID) + "\",";
  payload += "\"compartment\":"  + String(compartmentNum) + ",";
  payload += "\"event_type\":\"COMPARTMENT_OPENED\",";
  payload += "\"event_time\":\""  + timeStr + "\",";
  payload += "\"ldr_value\":"    + String(ldrVal);
  payload += "}";

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[EVENT DISPATCH] Sending to DoseSure: " + payload);
    HTTPClient http;
    String url = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/hardware/event";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    int code = http.POST(payload);
    if (code == 200) {
      Serial.println("[EVENT ACK] Server response: " + http.getString());
    } else {
      Serial.printf("[EVENT ERROR] HTTP %d. Saving to offline queue.\n", code);
      queueEventLocally(payload, timeStr);
    }
    http.end();
  } else {
    queueEventLocally(payload, timeStr);
  }
}

// =========================================================================
// BUZZER & REMINDER CONTROLS
// =========================================================================

void updateBuzzer() {
  if (dose1Active || dose2Active) {
    digitalWrite(BUZZER_PIN, HIGH);
    tone(BUZZER_PIN, 2000); // 2kHz tone for passive buzzers + HIGH for active buzzers
  } else {
    digitalWrite(BUZZER_PIN, LOW);
    noTone(BUZZER_PIN);
  }
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

  loadNvsConfig();

  // Connect to Wi-Fi
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to Wi-Fi [");
  Serial.print(WIFI_SSID);
  Serial.print("]");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi Connected! IP: " + WiFi.localIP().toString());

    // Sync NTP Time
    configTime(gmtOffset_sec, daylightOffset_sec, "pool.ntp.org", "time.nist.gov");
    Serial.print("Synchronizing NTP time");
    struct tm ti;
    int ntpAttempts = 0;
    while (!getLocalTime(&ti) && ntpAttempts < 20) {
      delay(500);
      Serial.print(".");
      ntpAttempts++;
    }
    if (getLocalTime(&ti)) {
      timeSynced = true;
      currentDayOfYear = ti.tm_yday;
      Serial.println("\nTime Synchronized!");
      Serial.println(&ti, "Current Time: %Y-%m-%d %H:%M:%S IST");
    }

    // Ping DoseSure backend
    String pingUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) 
                   + "/api/hardware/ping?deviceId=" + String(DEVICE_ID);
    HTTPClient http;
    http.begin(pingUrl);
    http.GET();
    http.end();

    // Fetch latest schedule
    syncSchedule();

    // Flush any pending offline queue
    flushOfflineQueue();
  } else {
    Serial.println("\nWi-Fi connection failed. Operating from local NVS memory.");
  }

  Serial.println("\nSystem Ready. Sensor monitoring active.");
}

// =========================================================================
// MAIN LOOP
// =========================================================================

void loop() {
  int ldr1 = analogRead(LDR_1_PIN);
  int ldr2 = analogRead(LDR_2_PIN);

  struct tm ti;
  bool clockOk = getLocalTime(&ti, 10);

  char timeStr[40] = "TIME_UNSYNCED";
  if (clockOk) {
    strftime(timeStr, sizeof(timeStr), "%Y-%m-%dT%H:%M:%S+05:30", &ti);

    // Midnight Reset for New Day
    if (ti.tm_yday != currentDayOfYear) {
      currentDayOfYear = ti.tm_yday;
      dose1Taken  = false;
      dose1Active = false;
      dose1Armed  = false;
      dose2Taken  = false;
      dose2Active = false;
      dose2Armed  = false;
      digitalWrite(LED_1_PIN, LOW);
      digitalWrite(LED_2_PIN, LOW);
      updateBuzzer();
      Serial.println("\n[MIDNIGHT RESET] New day started. Dose states reset to pending.");
    }

    int curMin = ti.tm_hour * 60 + ti.tm_min;
    int s1Min  = dose1Hour * 60 + dose1Minute;
    int s2Min  = dose2Hour * 60 + dose2Minute;

    // Compartment 1 Dose Window
    if (!dose1Taken && curMin >= s1Min && curMin < (s1Min + doseWindowMinutes)) {
      if (!dose1Active) {
        dose1Active = true;
        digitalWrite(LED_1_PIN, HIGH);
        Serial.println("\n>>> DOSE 1 ACTIVE! Please open Compartment 1 <<<");
      }
    } else if (curMin >= (s1Min + doseWindowMinutes)) {
      if (dose1Active) {
        dose1Active = false;
        digitalWrite(LED_1_PIN, LOW);
        Serial.println("\n[WINDOW EXPIRED] Compartment 1 dose window ended.");
      }
    }

    // Compartment 2 Dose Window
    if (!dose2Taken && curMin >= s2Min && curMin < (s2Min + doseWindowMinutes)) {
      if (!dose2Active) {
        dose2Active = true;
        digitalWrite(LED_2_PIN, HIGH);
        Serial.println("\n>>> DOSE 2 ACTIVE! Please open Compartment 2 <<<");
      }
    } else if (curMin >= (s2Min + doseWindowMinutes)) {
      if (dose2Active) {
        dose2Active = false;
        digitalWrite(LED_2_PIN, LOW);
        Serial.println("\n[WINDOW EXPIRED] Compartment 2 dose window ended.");
      }
    }
  }

  // -----------------------------------------------------------------------
  // COMPARTMENT 1 LDR LOGIC: DARK -> ARMED -> LIGHT -> OPENED EVENT
  // -----------------------------------------------------------------------
  if (!dose1Armed && ldr1 <= LDR_1_THRESHOLD) {
    dose1Armed = true;
    Serial.printf("[ARMED] Compartment 1 lid closed (LDR 1: %d <= 1000 DARK)\n", ldr1);
  }

  if (dose1Armed && ldr1 > LDR_1_THRESHOLD) {
    dose1Armed = false; // Prevent repeat spam
    dose1Taken = true;
    dose1Active = false;
    digitalWrite(LED_1_PIN, LOW);
    updateBuzzer();

    Serial.println("\n*******************************************************");
    Serial.printf(">>> COMPARTMENT 1 OPENED! (LDR: %d > 1000 LIGHT) <<<\n", ldr1);
    Serial.println("LED 1 = OFF | Recalculating Buzzer");
    Serial.println("*******************************************************");

    reportCompartmentEvent(1, ldr1, String(timeStr));
  }

  // -----------------------------------------------------------------------
  // COMPARTMENT 2 LDR LOGIC: DARK -> ARMED -> LIGHT -> OPENED EVENT
  // -----------------------------------------------------------------------
  if (!dose2Armed && ldr2 <= LDR_2_THRESHOLD) {
    dose2Armed = true;
    Serial.printf("[ARMED] Compartment 2 lid closed (LDR 2: %d <= 1000 DARK)\n", ldr2);
  }

  if (dose2Armed && ldr2 > LDR_2_THRESHOLD) {
    dose2Armed = false; // Prevent repeat spam
    dose2Taken = true;
    dose2Active = false;
    digitalWrite(LED_2_PIN, LOW);
    updateBuzzer();

    Serial.println("\n*******************************************************");
    Serial.printf(">>> COMPARTMENT 2 OPENED! (LDR: %d > 1000 LIGHT) <<<\n", ldr2);
    Serial.println("LED 2 = OFF | Recalculating Buzzer");
    Serial.println("*******************************************************");

    reportCompartmentEvent(2, ldr2, String(timeStr));
  }

  updateBuzzer();

  // -----------------------------------------------------------------------
  // BACKGROUND TIMERS (NON-BLOCKING)
  // -----------------------------------------------------------------------

  // Periodic Telemetry Heartbeat (every 3 seconds)
  if (millis() - lastTelemetryPrint >= 3000) {
    lastTelemetryPrint = millis();
    char timeOnly[16] = "--:--:--";
    if (clockOk) strftime(timeOnly, sizeof(timeOnly), "%H:%M:%S", &ti);

    Serial.printf("[%s] LDR1: %4d (%s) | LDR2: %4d (%s) | LED1: %s | LED2: %s | Buzzer: %s | WiFi: %s\n",
                  timeOnly,
                  ldr1, dose1Armed ? "ARMED" : (dose1Taken ? "TAKEN" : "IDLE"),
                  ldr2, dose2Armed ? "ARMED" : (dose2Taken ? "TAKEN" : "IDLE"),
                  dose1Active ? "ON" : "OFF",
                  dose2Active ? "ON" : "OFF",
                  (dose1Active || dose2Active) ? "ON" : "OFF",
                  WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE");
  }

  // Periodic Schedule Refresh (every 30s)
  if (millis() - lastScheduleSync >= SCHEDULE_SYNC_INTERVAL) {
    lastScheduleSync = millis();
    syncSchedule();
  }

  // Wi-Fi Reconnect & Offline Queue Flush (every 15s)
  if (millis() - lastWifiCheck >= WIFI_CHECK_INTERVAL) {
    lastWifiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.reconnect();
    } else {
      flushOfflineQueue();
    }
  }

  delay(300);
}
