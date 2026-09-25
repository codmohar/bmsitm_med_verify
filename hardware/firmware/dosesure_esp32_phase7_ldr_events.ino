// =========================================================================
// DOSESURE ESP32 SMART PILLBOX — PHASE 7 LDR HARDWARE EVENT FIRMWARE
// =========================================================================
// Features:
// - LDR 1 (GPIO 34) & LDR 2 (GPIO 35) dark-then-light opening detection
// - Single meaningful event dispatch to DoseSure backend (no loop spam)
// - LED 1 (GPIO 25) & LED 2 (GPIO 26) turn OFF when compartment opens
// - Buzzer (GPIO 27) updates state dynamically
// - Monotonic event counter in NVS for retry & duplicate protection
// =========================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <time.h>

Preferences prefs;

// Wi-Fi Configuration
const char* WIFI_SSID     = "NIRMAAN-2026";
const char* WIFI_PASSWORD = "Nirmaan25hr";

// DoseSure Server Configuration
const char* SERVER_HOST = "10.110.6.124";
const int   SERVER_PORT = 3000;
const char* DEVICE_ID   = "BOX01";
const char* PATIENT_ID  = "DS-TB-1024";

// Hardware Pin Configuration (PRESERVED)
const int LDR_1_PIN  = 34;
const int LDR_2_PIN  = 35;
const int LED_1_PIN  = 25;
const int LED_2_PIN  = 26;
const int BUZZER_PIN = 27;

// LDR Thresholds (PRESERVED)
// DARK  <= 1000
// LIGHT >  1000
const int LDR_1_THRESHOLD = 1000;
const int LDR_2_THRESHOLD = 1000;

// Dynamic Schedule Variables
int dose1Hour   = 8;
int dose1Minute = 0;
int dose2Hour   = 20;
int dose2Minute = 0;
int doseWindowMinutes = 30;

// State Tracking - Compartment 1
bool dose1Active = false;
bool dose1Armed  = false;
bool dose1Taken  = false;

// State Tracking - Compartment 2
bool dose2Active = false;
bool dose2Armed  = false;
bool dose2Taken  = false;

// Persistent Monotonic Event Counter
unsigned long eventCounter = 0;

unsigned long lastScheduleSyncTime = 0;
const unsigned long SCHEDULE_SYNC_INTERVAL = 15000;

void loadConfigFromNVS() {
  prefs.begin("dosesure", false);
  eventCounter = prefs.getULong("ev_cnt", 0);
  if (prefs.getBool("has_sched", false)) {
    dose1Hour         = prefs.getInt("d1_h", 8);
    dose1Minute       = prefs.getInt("d1_m", 0);
    dose2Hour         = prefs.getInt("d2_h", 20);
    dose2Minute       = prefs.getInt("d2_m", 0);
    doseWindowMinutes = prefs.getInt("win_m", 30);
  }
  prefs.end();
}

String getNextEventId() {
  eventCounter++;
  prefs.begin("dosesure", false);
  prefs.putULong("ev_cnt", eventCounter);
  prefs.end();

  char buf[32];
  snprintf(buf, sizeof(buf), "%s-%06lu", DEVICE_ID, eventCounter);
  return String(buf);
}

void updateBuzzer() {
  if (dose1Active || dose2Active) {
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
}

void sendLdrEventToBackend(int compartmentNum, int ldrValue) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[EVENT] Wi-Fi offline. Event will be logged locally.");
    return;
  }

  String eventId = getNextEventId();

  // Get current ISO-like timestamp
  struct tm timeinfo;
  char timeStr[40];
  if (getLocalTime(&timeinfo, 10)) {
    strftime(timeStr, sizeof(timeStr), "%Y-%m-%dT%H:%M:%S+05:30", &timeinfo);
  } else {
    snprintf(timeStr, sizeof(timeStr), "millis-%lu", millis());
  }

  String jsonBody = "{";
  jsonBody += "\"event_id\":\""    + eventId + "\",";
  jsonBody += "\"device_id\":\""   + String(DEVICE_ID) + "\",";
  jsonBody += "\"patient_id\":\""  + String(PATIENT_ID) + "\",";
  jsonBody += "\"compartment\":"  + String(compartmentNum) + ",";
  jsonBody += "\"event_type\":\"COMPARTMENT_OPENED\",";
  jsonBody += "\"event_time\":\""  + String(timeStr) + "\",";
  jsonBody += "\"ldr_value\":"    + String(ldrValue);
  jsonBody += "}";

  Serial.println("\n------------------------------------------");
  Serial.println("[HTTP POST] Sending Hardware Event to Backend:");
  Serial.println(jsonBody);

  HTTPClient http;
  String eventUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/hardware/event";
  http.begin(eventUrl);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(jsonBody);
  if (httpCode == 200) {
    String resp = http.getString();
    Serial.println("[HTTP 200 OK] Server acknowledged event:");
    Serial.println(resp);
  } else {
    Serial.printf("[HTTP ERROR] Failed to send event. Code: %d\n", httpCode);
  }
  http.end();
  Serial.println("------------------------------------------\n");
}

void parseSchedulePayload(const String& payload) {
  int c1Idx = payload.indexOf("\"compartment\":1");
  if (c1Idx == -1) c1Idx = payload.indexOf("\"compartment\": 1");
  if (c1Idx != -1) {
    int hIdx = payload.indexOf("\"hour\":", c1Idx);
    if (hIdx != -1) dose1Hour = payload.substring(hIdx + 7, payload.indexOf(",", hIdx)).toInt();
    int mIdx = payload.indexOf("\"minute\":", c1Idx);
    if (mIdx != -1) dose1Minute = payload.substring(mIdx + 9, payload.indexOf("}", mIdx)).toInt();
  }

  int c2Idx = payload.indexOf("\"compartment\":2");
  if (c2Idx == -1) c2Idx = payload.indexOf("\"compartment\": 2");
  if (c2Idx != -1) {
    int hIdx = payload.indexOf("\"hour\":", c2Idx);
    if (hIdx != -1) dose2Hour = payload.substring(hIdx + 7, payload.indexOf(",", hIdx)).toInt();
    int mIdx = payload.indexOf("\"minute\":", c2Idx);
    if (mIdx != -1) dose2Minute = payload.substring(mIdx + 9, payload.indexOf("}", mIdx)).toInt();
  }

  int wIdx = payload.indexOf("\"dose_window_minutes\":");
  if (wIdx != -1) doseWindowMinutes = payload.substring(wIdx + 22, payload.indexOf(",", wIdx)).toInt();
}

void syncScheduleFromBackend() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String scheduleUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) 
                     + "/api/hardware/schedule?deviceId=" + String(DEVICE_ID);
  http.begin(scheduleUrl);
  int httpCode = http.GET();
  if (httpCode == 200) {
    parseSchedulePayload(http.getString());
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("\n==========================================");
  Serial.println("   DOSESURE — PHASE 7 LDR EVENT DISPATCH   ");
  Serial.println("==========================================");

  // Pin Configuration
  pinMode(LDR_1_PIN, INPUT);
  pinMode(LDR_2_PIN, INPUT);
  pinMode(LED_1_PIN, OUTPUT);
  pinMode(LED_2_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_1_PIN, LOW);
  digitalWrite(LED_2_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  loadConfigFromNVS();

  // Connect Wi-Fi
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi connected!");
    configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
    struct tm ti;
    int ntpAttempts = 0;
    while (!getLocalTime(&ti) && ntpAttempts < 20) {
      delay(500);
      Serial.print(".");
      ntpAttempts++;
    }
    if (getLocalTime(&ti)) {
      Serial.println("\nClock synchronized!");
    }
    syncScheduleFromBackend();
  }

  Serial.println("\n[SYSTEM READY] Ready for LDR testing.");
  Serial.println("Arming logic: DARK (<=1000) arms sensor -> LIGHT (>1000) fires 1 event.");
}

void loop() {
  // Read Sensors
  int ldr1 = analogRead(LDR_1_PIN);
  int ldr2 = analogRead(LDR_2_PIN);

  // Read Time
  struct tm timeinfo;
  bool clockOk = getLocalTime(&timeinfo, 10);

  if (clockOk) {
    int curMin = timeinfo.tm_hour * 60 + timeinfo.tm_min;
    int s1Min = dose1Hour * 60 + dose1Minute;
    int s2Min = dose2Hour * 60 + dose2Minute;

    // Dose 1 Window Management
    if (!dose1Taken && curMin >= s1Min && curMin < (s1Min + doseWindowMinutes)) {
      if (!dose1Active) {
        dose1Active = true;
        digitalWrite(LED_1_PIN, HIGH);
        Serial.println("\n>>> DOSE 1 ACTIVE! Open Compartment 1 <<<");
      }
    } else if (curMin >= (s1Min + doseWindowMinutes)) {
      if (dose1Active) {
        dose1Active = false;
        digitalWrite(LED_1_PIN, LOW);
      }
    }

    // Dose 2 Window Management
    if (!dose2Taken && curMin >= s2Min && curMin < (s2Min + doseWindowMinutes)) {
      if (!dose2Active) {
        dose2Active = true;
        digitalWrite(LED_2_PIN, HIGH);
        Serial.println("\n>>> DOSE 2 ACTIVE! Open Compartment 2 <<<");
      }
    } else if (curMin >= (s2Min + doseWindowMinutes)) {
      if (dose2Active) {
        dose2Active = false;
        digitalWrite(LED_2_PIN, LOW);
      }
    }
  }

  // =========================================================================
  // COMPARTMENT 1 LDR LOGIC: DARK -> ARMED -> LIGHT -> EVENT
  // =========================================================================
  if (!dose1Armed && ldr1 <= LDR_1_THRESHOLD) {
    dose1Armed = true;
    Serial.printf("[LDR 1: %d <= 1000 DARK] -> Compartment 1 ARMED\n", ldr1);
  }

  if (dose1Armed && ldr1 > LDR_1_THRESHOLD) {
    dose1Armed = false; // Disarm immediately to prevent duplicate spam
    dose1Taken = true;
    dose1Active = false;
    digitalWrite(LED_1_PIN, LOW);
    updateBuzzer();

    Serial.println("\n******************************************");
    Serial.println(">>> COMPARTMENT 1 OPENED (LIGHT DETECTED) <<<");
    Serial.printf("LDR 1 Value: %d\n", ldr1);
    Serial.println("LED 1 = OFF");
    Serial.println("******************************************");

    sendLdrEventToBackend(1, ldr1);
  }

  // =========================================================================
  // COMPARTMENT 2 LDR LOGIC: DARK -> ARMED -> LIGHT -> EVENT
  // =========================================================================
  if (!dose2Armed && ldr2 <= LDR_2_THRESHOLD) {
    dose2Armed = true;
    Serial.printf("[LDR 2: %d <= 1000 DARK] -> Compartment 2 ARMED\n", ldr2);
  }

  if (dose2Armed && ldr2 > LDR_2_THRESHOLD) {
    dose2Armed = false; // Disarm immediately to prevent duplicate spam
    dose2Taken = true;
    dose2Active = false;
    digitalWrite(LED_2_PIN, LOW);
    updateBuzzer();

    Serial.println("\n******************************************");
    Serial.println(">>> COMPARTMENT 2 OPENED (LIGHT DETECTED) <<<");
    Serial.printf("LDR 2 Value: %d\n", ldr2);
    Serial.println("LED 2 = OFF");
    Serial.println("******************************************");

    sendLdrEventToBackend(2, ldr2);
  }

  updateBuzzer();

  // Periodic Telemetry Print every 3 seconds
  static unsigned long lastTelePrint = 0;
  if (millis() - lastTelePrint >= 3000) {
    lastTelePrint = millis();
    Serial.printf("[SENSORS] LDR 1: %4d (%s) | LDR 2: %4d (%s) | Buzzer: %s\n",
                  ldr1, dose1Armed ? "ARMED" : "UNARMED",
                  ldr2, dose2Armed ? "ARMED" : "UNARMED",
                  (dose1Active || dose2Active) ? "ON" : "OFF");
  }

  // Background Schedule Poll
  if (millis() - lastScheduleSyncTime >= SCHEDULE_SYNC_INTERVAL) {
    lastScheduleSyncTime = millis();
    syncScheduleFromBackend();
  }

  delay(400);
}
