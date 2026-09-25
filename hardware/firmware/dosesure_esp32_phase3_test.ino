// =========================================================================
// DOSESURE ESP32 SMART PILLBOX — PHASE 3 CONNECTIVITY TEST FIRMWARE
// =========================================================================
// Network: NIRMAAN-2026 (Case-sensitive uppercase with hyphen)
// DoseSure Backend: 10.110.6.124:3000
// =========================================================================

#include <WiFi.h>
#include <HTTPClient.h>

// Wi-Fi Configuration — EXACT SSID from network scan
const char* WIFI_SSID     = "NIRMAAN-2026";
const char* WIFI_PASSWORD = "Nirmaan25hr";

// DoseSure Server Configuration
const char* SERVER_HOST = "10.110.6.124";
const int   SERVER_PORT = 3000;
const char* DEVICE_ID   = "BOX01";

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("==========================================");
  Serial.println("   DOSESURE — PHASE 3 CONNECTIVITY TEST   ");
  Serial.println("==========================================");
  Serial.print("Connecting to Wi-Fi SSID: [");
  Serial.print(WIFI_SSID);
  Serial.println("]");

  // Clean radio reset
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // keep Wi-Fi radio active at full power
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
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
    Serial.print("Signal Strength (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    // Phase 3 Connectivity Test Request
    HTTPClient http;
    String pingUrl = "http://" + String(SERVER_HOST) + ":" + String(SERVER_PORT) 
                   + "/api/hardware/ping?deviceId=" + String(DEVICE_ID);
    
    Serial.println();
    Serial.print("Sending Ping to DoseSure Backend: ");
    Serial.println(pingUrl);

    http.begin(pingUrl);
    int httpCode = http.GET();

    if (httpCode == 200) {
      String response = http.getString();
      Serial.println();
      Serial.println("******************************************");
      Serial.println("Backend connection successful.");
      Serial.print("Server Response: ");
      Serial.println(response);
      Serial.println("******************************************");
    } else {
      Serial.println();
      Serial.print("Backend connection FAILED. HTTP Code: ");
      Serial.println(httpCode);
    }
    http.end();
  } else {
    Serial.println();
    Serial.println("Wi-Fi connection FAILED.");
    Serial.print("WiFi Status code: ");
    Serial.println(WiFi.status());
    Serial.println("(Status 1=NO_SSID, 4=CONNECT_FAILED, 6=DISCONNECTED)");
  }
}

void loop() {
  delay(5000);
}
