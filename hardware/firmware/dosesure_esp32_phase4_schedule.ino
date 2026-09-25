// =========================================================================
// DOSESURE ESP32 SMART PILLBOX — PHASE 4 DYNAMIC SCHEDULE FIRMWARE
// =========================================================================
// Connects to DoseSure backend and downloads medication schedule dynamically.
// Schedule values are NOT hardcoded — fetched directly from server!
// =========================================================================

#include <WiFi.h>
#include <HTTPClient.h>

// Wi-Fi Configuration
const char* WIFI_SSID     = "NIRMAAN-2026";
const char* WIFI_PASSWORD = "Nirmaan25hr";

// DoseSure Server Configuration
const char* SERVER_HOST = "10.110.6.124";
const int   SERVER_PORT = 3000;
const char* DEVICE_ID   = "BOX01";

// Dynamic Schedule Variables (Populated by Backend)
int dose1Hour   = 0;
int dose1Minute = 0;
int dose2Hour   = 0;
int dose2Minute = 0;
int doseWindowMinutes = 30;
String patientName = "";

// Lightweight, zero-dependency JSON parser
bool parseSchedulePayload(const String& payload) {
  // Compartment 1 (Morning)
  int c1Idx = payload.indexOf("\"compartment\":1");
  if (c1Idx == -1) c1Idx = payload.indexOf("\"compartment\": 1");
  if (c1Idx != -1) {
    int hIdx = payload.indexOf("\"hour\":", c1Idx);
    if (hIdx != -1) {
      int hEnd = payload.indexOf(",", hIdx);
      dose1Hour = payload.substring(hIdx + 7, hEnd).toInt();
    }
    int mIdx = payload.indexOf("\"minute\":", c1Idx);
    if (mIdx != -1) {
      int mEnd = payload.indexOf("}", mIdx);
      dose1Minute = payload.substring(mIdx + 9, mEnd).toInt();
    }
  }

  // Compartment 2 (Evening)
  int c2Idx = payload.indexOf("\"compartment\":2");
  if (c2Idx == -1) c2Idx = payload.indexOf("\"compartment\": 2");
  if (c2Idx != -1) {
    int hIdx = payload.indexOf("\"hour\":", c2Idx);
    if (hIdx != -1) {
      int hEnd = payload.indexOf(",", hIdx);
      dose2Hour = payload.substring(hIdx + 7, hEnd).toInt();
    }
    int mIdx = payload.indexOf("\"minute\":", c2Idx);
    if (mIdx != -1) {
      int mEnd = payload.indexOf("}", mIdx);
      dose2Minute = payload.substring(mIdx + 9, mEnd).toInt();
    }
  }

  // Dose window
  int wIdx = payload.indexOf("\"dose_window_minutes\":");
  if (wIdx != -1) {
    int wEnd = payload.indexOf(",", wIdx);
    doseWindowMinutes = payload.substring(wIdx + 22, wEnd).toInt();
  }

  // Patient name
  int nameIdx = payload.indexOf("\"patient_name\":\"");
  if (nameIdx != -1) {
    int nameEnd = payload.indexOf("\"", nameIdx + 16);
    patientName = payload.substring(nameIdx + 16, nameEnd);
  }

  return (c1Idx != -1 && c2Idx != -1);
}

void syncScheduleFromBackend() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ERROR] Wi-Fi not connected. Cannot fetch schedule.");
    return;
  }

  HTTPClient http;
  String scheduleUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) 
                     + "/api/hardware/schedule?deviceId=" + String(DEVICE_ID);

  Serial.println();
  Serial.print("Fetching dynamic schedule from: ");
  Serial.println(scheduleUrl);

  http.begin(scheduleUrl);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    Serial.println("[DEBUG] Server JSON received: " + payload);

    if (parseSchedulePayload(payload)) {
      Serial.println();
      Serial.println("******************************************");
      Serial.println("Schedule synchronized");
      Serial.println();
      if (patientName.length() > 0) {
        Serial.print("Patient: ");
        Serial.println(patientName);
      }
      Serial.print("Compartment 1:\n");
      if (dose1Hour < 10) Serial.print("0");
      Serial.print(dose1Hour);
      Serial.print(":");
      if (dose1Minute < 10) Serial.print("0");
      Serial.println(dose1Minute);

      Serial.println();
      Serial.print("Compartment 2:\n");
      if (dose2Hour < 10) Serial.print("0");
      Serial.print(dose2Hour);
      Serial.print(":");
      if (dose2Minute < 10) Serial.print("0");
      Serial.println(dose2Minute);

      Serial.println();
      Serial.print("Dose Window: ");
      Serial.print(doseWindowMinutes);
      Serial.println(" minutes");
      Serial.println("******************************************");
    } else {
      Serial.println("[ERROR] Failed to parse schedule JSON.");
    }
  } else {
    Serial.print("[ERROR] HTTP GET failed. Code: ");
    Serial.println(httpCode);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("==========================================");
  Serial.println("  DOSESURE — PHASE 4 DYNAMIC SCHEDULE     ");
  Serial.println("==========================================");

  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("Wi-Fi connected successfully!");
    Serial.print("ESP32 Local IP: ");
    Serial.println(WiFi.localIP());

    // Execute Phase 4 Dynamic Schedule Fetch
    syncScheduleFromBackend();
  } else {
    Serial.println("\nWi-Fi connection FAILED.");
  }
}

void loop() {
  // Idle in Phase 4 test
  delay(5000);
}
