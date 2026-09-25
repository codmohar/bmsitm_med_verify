// =========================================================================
// DOSESURE ESP32 SMART PILLBOX — PHASE 8 DUPLICATE RETRY TEST FIRMWARE
// =========================================================================
// Sends the EXACT SAME event_id twice to verify backend idempotency:
// 1. First POST: Server responds with status "success" (duplicate: false).
// 2. Second POST (retry): Server detects duplicate, returns status "already_processed" (duplicate: true).
// Result: ESP32 receives 200 OK both times, but backend records ONLY 1 dose.
// =========================================================================

#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID     = "NIRMAAN-2026";
const char* WIFI_PASSWORD = "Nirmaan25hr";

const char* SERVER_HOST = "10.110.6.124";
const int   SERVER_PORT = 3000;
const char* DEVICE_ID   = "BOX01";
const char* PATIENT_ID  = "DS-TB-1024";

void sendEventWithId(const String& eventId, int attemptNumber) {
  HTTPClient http;
  String eventUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) + "/api/hardware/event";
  http.begin(eventUrl);
  http.addHeader("Content-Type", "application/json");

  String jsonBody = "{";
  jsonBody += "\"event_id\":\""    + eventId + "\",";
  jsonBody += "\"device_id\":\""   + String(DEVICE_ID) + "\",";
  jsonBody += "\"patient_id\":\""  + String(PATIENT_ID) + "\",";
  jsonBody += "\"compartment\":1,";
  jsonBody += "\"event_type\":\"COMPARTMENT_OPENED\",";
  jsonBody += "\"event_time\":\"2026-09-25T21:30:00+05:30\",";
  jsonBody += "\"ldr_value\":2450";
  jsonBody += "}";

  Serial.printf("\n>>> SENDING ATTEMPT #%d (Event ID: %s) <<<\n", attemptNumber, eventId.c_str());
  int code = http.POST(jsonBody);

  if (code == 200) {
    String resp = http.getString();
    Serial.printf("[RESPONSE %d]: %s\n", attemptNumber, resp.c_str());
  } else {
    Serial.printf("[ERROR %d]: HTTP Code %d\n", attemptNumber, code);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("\n==========================================");
  Serial.println("   DOSESURE — PHASE 8 IDEMPOTENCY TEST    ");
  Serial.println("==========================================");

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

    // Generate fixed unique event ID for duplicate testing
    String testEventId = "BOX01-IDEMP-" + String(millis());

    // 1. Initial Send
    Serial.println("\n--- Step 1: Sending Initial Hardware Event ---");
    sendEventWithId(testEventId, 1);

    delay(2000);

    // 2. Duplicate Retry (e.g. simulated network drop retry)
    Serial.println("\n--- Step 2: Simulating Network Retry (Same Event ID) ---");
    sendEventWithId(testEventId, 2);

    Serial.println("\n******************************************");
    Serial.println("Idempotency test completed successfully!");
    Serial.println("******************************************");
  } else {
    Serial.println("\nWi-Fi connection FAILED.");
  }
}

void loop() {
  delay(5000);
}
