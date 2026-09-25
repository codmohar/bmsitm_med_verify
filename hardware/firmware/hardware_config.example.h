#ifndef HARDWARE_CONFIG_EXAMPLE_H
#define HARDWARE_CONFIG_EXAMPLE_H

// =========================================================================
// DOSESURE SMART PILLBOX — HARDWARE CONFIGURATION TEMPLATE
// =========================================================================
// Copy this file to "hardware_config.h" and enter your local Wi-Fi and server IP.
// =========================================================================

// --- Wi-Fi Network Credentials ---
#define WIFI_SSID         "YOUR_WIFI_SSID"
#define WIFI_PASSWORD     "YOUR_WIFI_PASSWORD"

// --- DoseSure Server Connection ---
// Run 'ipconfig' on Windows to find your laptop's IPv4 address
#define SERVER_HOST       "192.168.1.100"
#define SERVER_PORT       3000

// --- Physical Device Identity ---
#define DEVICE_ID         "BOX01"

// --- Timezone Configuration (India IST = UTC + 5:30) ---
#define TIMEZONE_OFFSET_SEC 19800
#define DAYLIGHT_OFFSET_SEC 0
#define NTP_SERVER_1      "pool.ntp.org"
#define NTP_SERVER_2      "time.nist.gov"

// --- Hardware Pin Assignments ---
#define LDR_1_PIN         34
#define LDR_2_PIN         35
#define LED_1_PIN         25
#define LED_2_PIN         26
#define BUZZER_PIN        27

// --- Optical (LDR) Calibration ---
#define LDR_DARK_BASELINE 1000
#define LDR_LIGHT_THRESH  1000
#define LDR_HYSTERESIS    50
#define LDR_DEBOUNCE_MS   200

// --- Buzzer Profile ---
#define BUZZER_FREQUENCY  2000
#define BUZZER_BEEP_ON_MS 400
#define BUZZER_BEEP_OFF_MS 400

// --- Polling Intervals ---
#define SCHEDULE_POLL_INTERVAL_MS 5000
#define WIFI_RETRY_INTERVAL_MS    10000
#define HTTP_TIMEOUT_MS           3000

#endif // HARDWARE_CONFIG_EXAMPLE_H
