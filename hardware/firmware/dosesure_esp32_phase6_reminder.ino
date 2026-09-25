// =========================================================================
// DOSESURE ESP32 SMART PILLBOX — PHASE 6 DYNAMIC REMINDER FIRMWARE
// =========================================================================
// Features:
// - NTP timekeeping (time.h) in IST (UTC+05:30)
// - Dynamic schedule fetching from DoseSure backend
// - Non-blocking periodic schedule refresh (detects backend changes)
// - Hardware alarms: LED 1 (GPIO 25), LED 2 (GPIO 26), Buzzer (GPIO 27)
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

// Hardware Pin Configuration (PRESERVED)
const int LED_1_PIN  = 25;
const int LED_2_PIN  = 26;
const int BUZZER_PIN = 27;

// Time Configuration (India IST = UTC + 5:30)
const long gmtOffset_sec     = 19800;
const int  daylightOffset_sec = 0;

// Dynamic Schedule Variables
int dose1Hour   = 8;
int dose1Minute = 0;
int dose2Hour   = 20;
int dose2Minute = 0;
int doseWindowMinutes = 30;
String patientName = "Ramesh Kumar";
long long lastScheduleVersion = 0;

// Alarm States
bool dose1Active = false;
bool dose2Active = false;
bool timeSynced  = false;

unsigned long lastScheduleSyncTime = 0;
const unsigned long SCHEDULE_SYNC_INTERVAL = 15000; // Check for schedule updates every 15s

// -------------------------------------------------------------------------
// Load / Save NVS Schedule
// -------------------------------------------------------------------------
void loadScheduleFromNVS() {
  prefs.begin("dosesure", true);
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

void saveScheduleToNVS() {
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

// -------------------------------------------------------------------------
// Parse Server JSON
// -------------------------------------------------------------------------
bool parseSchedulePayload(const String& payload) {
  int oldH1 = dose1Hour, oldM1 = dose1Minute, oldH2 = dose2Hour, oldM2 = dose2Minute;

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

  // Detect if times actually changed
  if (oldH1 != dose1Hour || oldM1 != dose1Minute || oldH2 != dose2Hour || oldM2 != dose2Minute) {
    Serial.println("\n>>> [ALERT] Dynamic Schedule UPDATED by DoseSure! <<<");
    Serial.printf("Compartment 1 -> %02d:%02d\n", dose1Hour, dose1Minute);
    Serial.printf("Compartment 2 -> %02d:%02d\n", dose2Hour, dose2Minute);
    saveScheduleToNVS();
  }

  return (c1Idx != -1 && c2Idx != -1);
}

void syncScheduleFromBackend() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String scheduleUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) 
                     + "/api/hardware/schedule?deviceId=" + String(DEVICE_ID);

  http.begin(scheduleUrl);
  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();
    parseSchedulePayload(payload);
  }
  http.end();
}

void updateBuzzer() {
  if (dose1Active || dose2Active) {
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
}

void checkReminders(struct tm &timeinfo) {
  int currentMinutes = timeinfo.tm_hour * 60 + timeinfo.tm_min;

  int sched1Minutes = dose1Hour * 60 + dose1Minute;
  int end1Minutes   = sched1Minutes + doseWindowMinutes;

  int sched2Minutes = dose2Hour * 60 + dose2Minute;
  int end2Minutes   = sched2Minutes + doseWindowMinutes;

  // Compartment 1 Check
  if (currentMinutes >= sched1Minutes && currentMinutes < end1Minutes) {
    if (!dose1Active) {
      dose1Active = true;
      digitalWrite(LED_1_PIN, HIGH);
      Serial.println("\n******************************************");
      Serial.println(">>> DOSE 1 TIME REACHED! <<<");
      Serial.println("LED 1 = ON | BUZZER = ON");
      Serial.println("******************************************");
    }
  } else {
    if (dose1Active) {
      dose1Active = false;
      digitalWrite(LED_1_PIN, LOW);
      Serial.println("\n[WINDOW EXPIRED] Dose 1 Window ended. LED 1 = OFF");
    }
  }

  // Compartment 2 Check
  if (currentMinutes >= sched2Minutes && currentMinutes < end2Minutes) {
    if (!dose2Active) {
      dose2Active = true;
      digitalWrite(LED_2_PIN, HIGH);
      Serial.println("\n******************************************");
      Serial.println(">>> DOSE 2 TIME REACHED! <<<");
      Serial.println("LED 2 = ON | BUZZER = ON");
      Serial.println("******************************************");
    }
  } else {
    if (dose2Active) {
      dose2Active = false;
      digitalWrite(LED_2_PIN, LOW);
      Serial.println("\n[WINDOW EXPIRED] Dose 2 Window ended. LED 2 = OFF");
    }
  }

  updateBuzzer();
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("\n==========================================");
  Serial.println("   DOSESURE — PHASE 6 DYNAMIC REMINDER    ");
  Serial.println("==========================================");

  // Configure Pins
  pinMode(LED_1_PIN, OUTPUT);
  pinMode(LED_2_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_1_PIN, LOW);
  digitalWrite(LED_2_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // Load last known schedule from NVS
  loadScheduleFromNVS();

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

    // Configure NTP time
    configTime(gmtOffset_sec, daylightOffset_sec, "pool.ntp.org", "time.nist.gov");
    Serial.print("Synchronizing clock with NTP");
    struct tm ti;
    int ntpAttempts = 0;
    while (!getLocalTime(&ti) && ntpAttempts < 20) {
      delay(500);
      Serial.print(".");
      ntpAttempts++;
    }
    if (getLocalTime(&ti)) {
      timeSynced = true;
      Serial.println("\nClock synchronized successfully!");
      Serial.println(&ti, "Current Time: %Y-%m-%d %H:%M:%S");
    }

    // Fetch initial schedule from backend
    syncScheduleFromBackend();
  }

  Serial.println("\nMonitoring schedule alarms...");
  Serial.printf("Comp 1: %02d:%02d | Comp 2: %02d:%02d | Window: %d min\n", 
                dose1Hour, dose1Minute, dose2Hour, dose2Minute, doseWindowMinutes);
}

void loop() {
  // 1. Check for schedule updates from backend every 15 seconds
  if (millis() - lastScheduleSyncTime >= SCHEDULE_SYNC_INTERVAL) {
    lastScheduleSyncTime = millis();
    syncScheduleFromBackend();
  }

  // 2. Check time and trigger reminders
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 10)) {
    checkReminders(timeinfo);

    // Periodic heartbeat display every 3 seconds
    static unsigned long lastPrint = 0;
    if (millis() - lastPrint >= 3000) {
      lastPrint = millis();
      char timeBuf[32];
      strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S", &timeinfo);
      Serial.printf("[TIME: %s] | Comp 1: %02d:%02d (%s) | Comp 2: %02d:%02d (%s) | Buzzer: %s\n",
                    timeBuf,
                    dose1Hour, dose1Minute, dose1Active ? "ACTIVE" : "WAITING",
                    dose2Hour, dose2Minute, dose2Active ? "ACTIVE" : "WAITING",
                    (dose1Active || dose2Active) ? "ON" : "OFF");
    }
  }

  delay(500);
}
