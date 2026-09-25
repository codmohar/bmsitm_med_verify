#ifndef HARDWARE_CONFIG_H
#define HARDWARE_CONFIG_H

// =========================================================================
// DOSESURE SMART PILLBOX — HARDWARE & NETWORK CONFIGURATION
// =========================================================================

// --- Wi-Fi Network Credentials ---
#define WIFI_SSID         "NIRMAAN 2026"
#define WIFI_PASSWORD     "Nirmaan25hr"

// --- DoseSure Server Connection ---
// Laptop LAN IPv4 address (Find using 'ipconfig' in PowerShell/CMD)
#define SERVER_HOST       "10.110.6.124"
#define SERVER_PORT       3000

// --- Physical Device Identity ---
// Unique pillbox identifier mapped to a patient on the backend
#define DEVICE_ID         "BOX01"

// --- Timezone Configuration ---
// India Standard Time (UTC + 05:30, No DST)
#define TIMEZONE_OFFSET_SEC 19800
#define DAYLIGHT_OFFSET_SEC 0
#define NTP_SERVER_1      "pool.ntp.org"
#define NTP_SERVER_2      "time.nist.gov"

// --- Hardware GPIO Pin Assignments ---
#define LDR_1_PIN         34  // Compartment 1 Optical Sensor (Analog)
#define LDR_2_PIN         35  // Compartment 2 Optical Sensor (Analog)
#define LED_1_PIN         25  // Compartment 1 Visual Indicator
#define LED_2_PIN         26  // Compartment 2 Visual Indicator
#define BUZZER_PIN        27  // Auditory Reminder Alarm

// --- Buzzer Hardware Selection ---
// 1 = ACTIVE Buzzer (Standard in Arduino kits; beeps when GPIO 27 is set HIGH)
// 0 = PASSIVE Piezo Buzzer (Requires 2kHz AC square wave / tone)
#define BUZZER_IS_ACTIVE  1

// --- Optical (LDR) Calibration & Reliability ---
// Raw ADC reading (0-4095 on ESP32)
#define LDR_DARK_BASELINE 1000  // Reading <= 1000 means compartment lid is CLOSED (Dark)
#define LDR_LIGHT_THRESH  1000  // Reading > 1000 means compartment lid is OPENED (Light)
#define LDR_HYSTERESIS    50    // Hysteresis window to prevent sensor boundary flutter
#define LDR_DEBOUNCE_MS   200   // Milliseconds light reading must remain stable before confirming opening

// --- Buzzer Audio Profile ---
#define BUZZER_FREQUENCY  2000  // 2.0 kHz tone for passive buzzers
#define BUZZER_BEEP_ON_MS 400   // Intermittent beep ON duration (ms)
#define BUZZER_BEEP_OFF_MS 400  // Intermittent beep OFF duration (ms)

// --- Network & Polling Intervals ---
#define SCHEDULE_POLL_INTERVAL_MS 5000  // Near-real-time schedule poll (every 5 seconds)
#define WIFI_RETRY_INTERVAL_MS    10000 // Retry reconnect every 10 seconds if offline
#define HTTP_TIMEOUT_MS           3000  // Short 3-second HTTP timeout to prevent loop blocking

#endif // HARDWARE_CONFIG_H
