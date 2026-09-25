// =========================================================================
// DOSESURE BUZZER DIAGNOSTIC & HARDWARE TEST
// =========================================================================
// Tests GPIO 27 with both Active Buzzer mode (HIGH) and Passive Buzzer mode (tone)
// to immediately identify the hardware cause.
// =========================================================================

#include <Arduino.h>

const int BUZZER_PIN = 27;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==========================================");
  Serial.println("     DOSESURE — BUZZER HARDWARE TEST      ");
  Serial.println("==========================================");
  Serial.println("Testing Buzzer on GPIO 27...");

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
}

void loop() {
  // Test 1: Direct DC HIGH (for Active Buzzers)
  Serial.println("\n[TEST 1] Sending continuous HIGH (3.3V) to GPIO 27 for 2 seconds...");
  digitalWrite(BUZZER_PIN, HIGH);
  delay(2000);
  digitalWrite(BUZZER_PIN, LOW);
  delay(1000);

  // Test 2: Rapid Beep (Pulse HIGH/LOW)
  Serial.println("[TEST 2] Pulsing GPIO 27 (Beep-Beep-Beep)...");
  for (int i = 0; i < 5; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(150);
    digitalWrite(BUZZER_PIN, LOW);
    delay(150);
  }
  delay(1000);

  // Test 3: Audio Tone 2kHz (for Passive Buzzers)
  Serial.println("[TEST 3] Generating 2000Hz Tone (for Passive Piezo Buzzers)...");
  tone(BUZZER_PIN, 2000, 1500); // 2000 Hz for 1.5 seconds
  delay(2000);
  noTone(BUZZER_PIN);

  Serial.println("\n--- Pause 3 seconds before repeating ---");
  delay(3000);
}
