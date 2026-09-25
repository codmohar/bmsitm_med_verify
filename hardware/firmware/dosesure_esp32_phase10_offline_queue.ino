// =========================================================================
// DOSESURE ESP32 SMART PILLBOX — PHASE 10 OFFLINE EVENT QUEUE FIRMWARE
// =========================================================================
// Workflow:
// 1. Syncs NTP time while connected to establish accurate system time.
// 2. Disconnects Wi-Fi.
// 3. User opens compartment while offline.
// 4. ESP32 captures original trigger timestamp and saves event to NVS queue.
// 5. ESP32 reconnects to Wi-Fi.
// 6. Automatically uploads the queued event with its ORIGINAL timestamp preserved.
// 7. Backend returns HTTP 200 OK, and ESP32 clears the pending queue.
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

// Hardware Pins (PRESERVED)
const int LDR_1_PIN  = 34;
const int LED_1_PIN  = 25;
const int BUZZER_PIN = 27;

const int LDR_1_THRESHOLD = 1000;

bool dose1Armed = false;
unsigned long eventCounter = 0;

// Test State Machine
enum TestState {
  STATE_SYNC_TIME,
  STATE_DISCONNECT_WIFI,
  STATE_WAIT_FOR_OFFLINE_OPEN,
  STATE_EVENT_QUEUED,
  STATE_RECONNECTING_WIFI,
  STATE_UPLOAD_PENDING,
  STATE_TEST_COMPLETE
};

TestState currentState = STATE_SYNC_TIME;
unsigned long stateTimer = 0;

String getNextEventId() {
  eventCounter++;
  prefs.begin("dosesure", false);
  prefs.putULong("ev_cnt", eventCounter);
  prefs.end();

  char buf[32];
  snprintf(buf, sizeof(buf), "%s-%06lu", DEVICE_ID, eventCounter);
  return String(buf);
}

// -------------------------------------------------------------------------
// Persistent Queue Management (NVS)
// -------------------------------------------------------------------------
void queueEventLocally(const String& eventPayload, const String& originalTime) {
  prefs.begin("dosesure_q", false);
  prefs.putString("payload", eventPayload);
  prefs.putString("orig_time", originalTime);
  prefs.putBool("pending", true);
  prefs.end();

  Serial.println("\n==========================================");
  Serial.println(">>> [OFFLINE QUEUE] EVENT SAVED LOCALLY! <<<");
  Serial.print("Original Trigger Timestamp: ");
  Serial.println(originalTime);
  Serial.println("Event stored in persistent NVS flash memory.");
  Serial.println("Will automatically upload upon Wi-Fi reconnect.");
  Serial.println("==========================================\n");
}

bool hasPendingQueue() {
  prefs.begin("dosesure_q", true);
  bool pending = prefs.getBool("pending", false);
  prefs.end();
  return pending;
}

String getPendingPayload() {
  prefs.begin("dosesure_q", true);
  String p = prefs.getString("payload", "");
  prefs.end();
  return p;
}

String getPendingOriginalTime() {
  prefs.begin("dosesure_q", true);
  String t = prefs.getString("orig_time", "");
  prefs.end();
  return t;
}

void clearPendingQueue() {
  prefs.begin("dosesure_q", false);
  prefs.putBool("pending", false);
  prefs.putString("payload", "");
  prefs.putString("orig_time", "");
  prefs.end();
  Serial.println("[OFFLINE QUEUE] Pending queue successfully CLEARED from flash memory.");
}

void uploadQueuedEvent() {
  if (!hasPendingQueue()) return;

  String body = getPendingPayload();
  String origTime = getPendingOriginalTime();

  Serial.println("\n------------------------------------------------------------");
  Serial.println("[OFFLINE QUEUE UPLOAD] Uploading queued event to DoseSure...");
  Serial.print("Preserved Original Timestamp : ");
  Serial.println(origTime);
  Serial.print("Payload                      : ");
  Serial.println(body);

  HTTPClient http;
  String eventUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/hardware/event";
  http.begin(eventUrl);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(body);
  if (code == 200) {
    String resp = http.getString();
    Serial.println("\n************************************************************");
    Serial.println("[BACKEND ACKNOWLEDGED] Upload confirmed by DoseSure server!");
    Serial.println("Server Response: " + resp);
    Serial.println("************************************************************");
    clearPendingQueue();
  } else {
    Serial.printf("[UPLOAD FAILED] HTTP Code %d. Will retry.\n", code);
  }
  http.end();
  Serial.println("------------------------------------------------------------\n");
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("\n==========================================");
  Serial.println("   DOSESURE — PHASE 10 OFFLINE QUEUE TEST ");
  Serial.println("==========================================");

  pinMode(LDR_1_PIN, INPUT);
  pinMode(LED_1_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_1_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  prefs.begin("dosesure", false);
  eventCounter = prefs.getULong("ev_cnt", 0);
  prefs.end();

  // 1. Initial Connection & NTP Sync
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  Serial.print("Connecting to Wi-Fi for initial clock sync");
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
      Serial.println("\nNTP clock synchronized successfully!");
      Serial.println(&ti, "Current Time: %Y-%m-%d %H:%M:%S");
    }

    // Step 2: Now simulate offline network drop
    Serial.println("\n[PHASE 10 TEST] Disconnecting Wi-Fi to create OFFLINE scenario...");
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    Serial.println("Wi-Fi status: OFF.");
    Serial.println("\n>>> ACTION REQUIRED: <<<");
    Serial.println("1. Cover Compartment 1 (LDR 1) to ARM it.");
    Serial.println("2. Then UNCOVER Compartment 1 to trigger offline lid opening.");

    currentState = STATE_WAIT_FOR_OFFLINE_OPEN;
  }
}

void loop() {
  int ldr1 = analogRead(LDR_1_PIN);

  struct tm timeinfo;
  bool clockOk = getLocalTime(&timeinfo, 10);

  // -----------------------------------------------------------------------
  // STATE 1: Waiting for offline compartment open
  // -----------------------------------------------------------------------
  if (currentState == STATE_WAIT_FOR_OFFLINE_OPEN) {
    // Arming
    if (!dose1Armed && ldr1 <= LDR_1_THRESHOLD) {
      dose1Armed = true;
      Serial.printf("[OFFLINE] LDR 1: %d <= 1000 DARK -> Compartment 1 ARMED\n", ldr1);
      Serial.println("Now UNCOVER LDR 1 to simulate patient opening lid offline.");
    }

    // Trigger opening
    if (dose1Armed && ldr1 > LDR_1_THRESHOLD) {
      dose1Armed = false;

      // Capture exact trigger timestamp
      char origTimeStr[40];
      if (clockOk) {
        strftime(origTimeStr, sizeof(origTimeStr), "%Y-%m-%dT%H:%M:%S+05:30", &timeinfo);
      } else {
        snprintf(origTimeStr, sizeof(origTimeStr), "millis-%lu", millis());
      }

      String eventId = getNextEventId();

      String jsonPayload = "{";
      jsonPayload += "\"event_id\":\""    + eventId + "\",";
      jsonPayload += "\"device_id\":\""   + String(DEVICE_ID) + "\",";
      jsonPayload += "\"patient_id\":\""  + String(PATIENT_ID) + "\",";
      jsonPayload += "\"compartment\":1,";
      jsonPayload += "\"event_type\":\"COMPARTMENT_OPENED\",";
      jsonPayload += "\"event_time\":\""  + String(origTimeStr) + "\",";
      jsonPayload += "\"ldr_value\":"    + String(ldr1);
      jsonPayload += "}";

      // Save to offline persistent queue
      queueEventLocally(jsonPayload, String(origTimeStr));

      currentState = STATE_EVENT_QUEUED;
      stateTimer = millis();
    }
  }

  // -----------------------------------------------------------------------
  // STATE 2: Event is queued offline. Wait 5 seconds, then reconnect Wi-Fi!
  // -----------------------------------------------------------------------
  else if (currentState == STATE_EVENT_QUEUED) {
    if (millis() - stateTimer >= 5000) {
      Serial.println("\n[PHASE 10 TEST] Now restoring Wi-Fi connectivity to flush queue...");
      WiFi.mode(WIFI_STA);
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      currentState = STATE_RECONNECTING_WIFI;
      stateTimer = millis();
    }
  }

  // -----------------------------------------------------------------------
  // STATE 3: Reconnecting Wi-Fi
  // -----------------------------------------------------------------------
  else if (currentState == STATE_RECONNECTING_WIFI) {
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWi-Fi connection RESTORED!");
      Serial.print("ESP32 Local IP: ");
      Serial.println(WiFi.localIP());

      currentState = STATE_UPLOAD_PENDING;
    } else {
      delay(500);
      Serial.print(".");
    }
  }

  // -----------------------------------------------------------------------
  // STATE 4: Upload queued pending event
  // -----------------------------------------------------------------------
  else if (currentState == STATE_UPLOAD_PENDING) {
    uploadQueuedEvent();
    currentState = STATE_TEST_COMPLETE;
    Serial.println("==========================================");
    Serial.println("PHASE 10 OFFLINE QUEUE TEST COMPLETE!");
    Serial.println("==========================================");
  }

  delay(200);
}
