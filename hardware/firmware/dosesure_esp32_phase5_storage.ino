// =========================================================================
// DOSESURE ESP32 SMART PILLBOX — PHASE 5 LOCAL SCHEDULE STORAGE (NVS)
// =========================================================================
// Saves last valid schedule to non-volatile flash (Preferences).
// If backend or Wi-Fi is lost, ESP32 continues using the stored schedule.
// =========================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>

Preferences prefs;

// Wi-Fi Configuration
const char* WIFI_SSID     = "NIRMAAN-2026";
const char* WIFI_PASSWORD = "Nirmaan25hr";

// DoseSure Server Configuration
const char* SERVER_HOST = "10.110.6.124";
const int   SERVER_PORT = 3000;
const char* DEVICE_ID   = "BOX01";

// In-Memory Schedule Variables
int dose1Hour   = 0;
int dose1Minute = 0;
int dose2Hour   = 0;
int dose2Minute = 0;
int doseWindowMinutes = 30;
String patientName = "";
bool hasSchedule = false;

// -------------------------------------------------------------------------
// Load Schedule from ESP32 Flash (NVS)
// -------------------------------------------------------------------------
bool loadScheduleFromNVS() {
  prefs.begin("dosesure", true); // read-only mode
  bool exists = prefs.getBool("has_sched", false);
  if (exists) {
    dose1Hour         = prefs.getInt("d1_h", 8);
    dose1Minute       = prefs.getInt("d1_m", 0);
    dose2Hour         = prefs.getInt("d2_h", 20);
    dose2Minute       = prefs.getInt("d2_m", 0);
    doseWindowMinutes = prefs.getInt("win_m", 30);
    patientName       = prefs.getString("patient", "Ramesh Kumar");
    hasSchedule       = true;
  }
  prefs.end();
  return exists;
}

// -------------------------------------------------------------------------
// Save Schedule to ESP32 Flash (NVS)
// -------------------------------------------------------------------------
void saveScheduleToNVS() {
  prefs.begin("dosesure", false); // read-write mode
  prefs.putInt("d1_h", dose1Hour);
  prefs.putInt("d1_m", dose1Minute);
  prefs.putInt("d2_h", dose2Hour);
  prefs.putInt("d2_m", dose2Minute);
  prefs.putInt("win_m", doseWindowMinutes);
  prefs.putString("patient", patientName);
  prefs.putBool("has_sched", true);
  prefs.end();
  Serial.println("[NVS] Schedule persistently saved to ESP32 flash memory.");
}

// -------------------------------------------------------------------------
// Parse Server JSON
// -------------------------------------------------------------------------
bool parseSchedulePayload(const String& payload) {
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

  int nameIdx = payload.indexOf("\"patient_name\":\"");
  if (nameIdx != -1) {
    int nameEnd = payload.indexOf("\"", nameIdx + 16);
    patientName = payload.substring(nameIdx + 16, nameEnd);
  }

  return (c1Idx != -1 && c2Idx != -1);
}

void printActiveSchedule(const char* sourceDescription) {
  Serial.println();
  Serial.println("******************************************");
  Serial.print("Schedule Source: ");
  Serial.println(sourceDescription);
  if (patientName.length() > 0) {
    Serial.print("Patient        : ");
    Serial.println(patientName);
  }
  Serial.print("Compartment 1  : ");
  if (dose1Hour < 10) Serial.print("0");
  Serial.print(dose1Hour);
  Serial.print(":");
  if (dose1Minute < 10) Serial.print("0");
  Serial.println(dose1Minute);

  Serial.print("Compartment 2  : ");
  if (dose2Hour < 10) Serial.print("0");
  Serial.print(dose2Hour);
  Serial.print(":");
  if (dose2Minute < 10) Serial.print("0");
  Serial.println(dose2Minute);

  Serial.print("Dose Window    : ");
  Serial.print(doseWindowMinutes);
  Serial.println(" minutes");
  Serial.println("******************************************");
}

void syncScheduleFromBackend() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN] Wi-Fi unavailable. Checking local NVS flash storage...");
    if (hasSchedule) {
      printActiveSchedule("LOCAL FLASH STORAGE (OFFLINE FALLBACK)");
    } else {
      Serial.println("[WARN] No schedule saved locally yet.");
    }
    return;
  }

  HTTPClient http;
  String scheduleUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) 
                     + "/api/hardware/schedule?deviceId=" + String(DEVICE_ID);

  Serial.println();
  Serial.print("Synchronizing with backend: ");
  Serial.println(scheduleUrl);

  http.begin(scheduleUrl);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    if (parseSchedulePayload(payload)) {
      hasSchedule = true;
      printActiveSchedule("BACKEND SYNCHRONIZATION (LIVE)");
      // Persist to flash
      saveScheduleToNVS();
    }
  } else {
    Serial.print("[WARN] Backend returned HTTP ");
    Serial.println(httpCode);
    if (hasSchedule) {
      printActiveSchedule("LOCAL FLASH STORAGE (BACKEND OFFLINE)");
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("==========================================");
  Serial.println("   DOSESURE — PHASE 5 NVS FLASH STORAGE   ");
  Serial.println("==========================================");

  // 1. Initial check of local flash memory
  if (loadScheduleFromNVS()) {
    Serial.println("[NVS] Stored schedule found in flash memory.");
    printActiveSchedule("PRE-BOOT LOCAL FLASH");
  } else {
    Serial.println("[NVS] No prior schedule found in flash. Will download fresh copy.");
  }

  // 2. Connect Wi-Fi
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
    Serial.println();
    Serial.println("Wi-Fi connected successfully!");
    syncScheduleFromBackend();
  } else {
    Serial.println("\nWi-Fi connection FAILED.");
    if (hasSchedule) {
      printActiveSchedule("OFFLINE BOOT (RUNNING FROM FLASH NVS)");
    }
  }
}

void loop() {
  delay(5000);
}
