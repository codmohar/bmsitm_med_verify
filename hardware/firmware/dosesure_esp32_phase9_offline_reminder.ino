// =========================================================================
// DOSESURE ESP32 SMART PILLBOX — PHASE 9 OFFLINE REMINDER TEST FIRMWARE
// =========================================================================
// Procedure:
// 1. Syncs NTP time and schedule while connected.
// 2. Intentionally disconnects Wi-Fi.
// 3. Demonstrates that offline:
//    - Clock continues ticking accurately via time.h
//    - Scheduled dose time activates LED and Buzzer
//    - LDR sensor detects opening and turns OFF LED and Buzzer
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
const int LDR_1_PIN  = 34;
const int LDR_2_PIN  = 35;
const int LED_1_PIN  = 25;
const int LED_2_PIN  = 26;
const int BUZZER_PIN = 27;

const int LDR_1_THRESHOLD = 1000;
const int LDR_2_THRESHOLD = 1000;

// Dynamic Schedule
int dose1Hour   = 0;
int dose1Minute = 0;
int dose2Hour   = 0;
int dose2Minute = 0;
int doseWindowMinutes = 15;

bool dose1Active = false;
bool dose1Armed  = false;
bool dose1Taken  = false;

bool dose2Active = false;
bool dose2Armed  = false;
bool dose2Taken  = false;

void updateBuzzer() {
  if (dose1Active || dose2Active) {
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
}

void loadScheduleFromNVS() {
  prefs.begin("dosesure", true);
  if (prefs.getBool("has_sched", false)) {
    dose1Hour         = prefs.getInt("d1_h", 8);
    dose1Minute       = prefs.getInt("d1_m", 0);
    dose2Hour         = prefs.getInt("d2_h", 20);
    dose2Minute       = prefs.getInt("d2_m", 0);
    doseWindowMinutes = prefs.getInt("win_m", 30);
  }
  prefs.end();
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("\n==========================================");
  Serial.println("  DOSESURE — PHASE 9 OFFLINE REMINDER     ");
  Serial.println("==========================================");

  pinMode(LDR_1_PIN, INPUT);
  pinMode(LDR_2_PIN, INPUT);
  pinMode(LED_1_PIN, OUTPUT);
  pinMode(LED_2_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_1_PIN, LOW);
  digitalWrite(LED_2_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  loadScheduleFromNVS();

  // 1. Initial Connection for Sync
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  Serial.print("Connecting to Wi-Fi for initial NTP sync");
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
      Serial.println("\nNTP clock synchronized!");
      Serial.println(&ti, "Current Time: %Y-%m-%d %H:%M:%S");

      // Set Compartment 1 test dose to 1 minute ahead of current clock
      dose1Hour = ti.tm_hour;
      dose1Minute = ti.tm_min + 1;
      if (dose1Minute >= 60) {
        dose1Minute = 0;
        dose1Hour = (dose1Hour + 1) % 24;
      }
      Serial.printf("Test Dose set for Compartment 1 at: %02d:%02d\n", dose1Hour, dose1Minute);
    }

    // 2. NOW DISCONNECT WI-FI COMPLETELY
    Serial.println("\n------------------------------------------------------------");
    Serial.println("[PHASE 9 TEST] NOW INTENTIONALLY DISCONNECTING WI-FI...");
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    Serial.println("Wi-Fi status: OFF (Disconnected from network)");
    Serial.println("ESP32 is now running 100% OFFLINE.");
    Serial.println("------------------------------------------------------------\n");
  } else {
    Serial.println("\nWi-Fi initial connect failed. Testing with NVS schedule.");
  }
}

void loop() {
  int ldr1 = analogRead(LDR_1_PIN);
  int ldr2 = analogRead(LDR_2_PIN);

  struct tm timeinfo;
  bool clockOk = getLocalTime(&timeinfo, 10);

  if (clockOk) {
    int curMin = timeinfo.tm_hour * 60 + timeinfo.tm_min;
    int s1Min = dose1Hour * 60 + dose1Minute;

    // Check Dose 1 Window
    if (!dose1Taken && curMin >= s1Min && curMin < (s1Min + doseWindowMinutes)) {
      if (!dose1Active) {
        dose1Active = true;
        digitalWrite(LED_1_PIN, HIGH);
        Serial.println("\n******************************************");
        Serial.println(">>> OFFLINE ALARM: DOSE 1 TIME REACHED! <<<");
        Serial.println("Wi-Fi is OFF, but internal clock triggered:");
        Serial.println("LED 1 = ON | BUZZER = ON");
        Serial.println("Open Compartment 1 (uncover LDR 1) to take dose");
        Serial.println("******************************************\n");
      }
    }
  }

  // LDR 1 Detection while OFFLINE
  if (!dose1Armed && ldr1 <= LDR_1_THRESHOLD) {
    dose1Armed = true;
    Serial.printf("[OFFLINE] LDR 1: %d <= 1000 DARK -> Compartment 1 ARMED\n", ldr1);
  }

  if (dose1Armed && ldr1 > LDR_1_THRESHOLD) {
    dose1Armed = false;
    dose1Taken = true;
    dose1Active = false;
    digitalWrite(LED_1_PIN, LOW);
    updateBuzzer();

    Serial.println("\n******************************************");
    Serial.println(">>> OFFLINE ACTION: COMPARTMENT 1 OPENED! <<<");
    Serial.printf("LDR 1 Light Detected: %d > 1000\n", ldr1);
    Serial.println("LED 1 = OFF | BUZZER = OFF");
    Serial.println("Dose successfully completed in OFFLINE mode!");
    Serial.println("******************************************\n");
  }

  updateBuzzer();

  // Print offline status heartbeat every 3 seconds
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint >= 3000) {
    lastPrint = millis();
    char timeBuf[32];
    if (clockOk) strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S", &timeinfo);
    else snprintf(timeBuf, sizeof(timeBuf), "No Clock");

    Serial.printf("[OFFLINE CLOCK: %s] | Wi-Fi: OFF | LDR 1: %4d (%s) | LED 1: %s | Buzzer: %s\n",
                  timeBuf,
                  ldr1, dose1Armed ? "ARMED" : "UNARMED",
                  dose1Active ? "ON" : "OFF",
                  (dose1Active || dose2Active) ? "ON" : "OFF");
  }

  delay(400);
}
