# DoseSure – Verified Medication Adherence Platform

> An intelligent medication adherence platform connecting tuberculosis patients, care workers, and IoT smart pillboxes through verified dose monitoring and AI video ingestion verification.

## 🚀 Key Features

* **Two-Stage Dose Verification**:
  * **Stage 1 (Physical Pillbox Intake)**: ESP32 hardware monitors optical LDR sensors in each compartment, drives status LEDs, and rings buzzer alerts at prescribed dose times. Box opening silences the alarm and confirms physical pill retrieval.
  * **Stage 2 (AI Video Ingestion Verification)**: 20-second camera capture analyzes oral medication ingestion using Gemini and computer vision models.
* **Hardware & ESP32 Integration**:
  * Near-real-time schedule synchronization between backend and physical ESP32 pillbox via Wi-Fi and Web Serial API (115200 baud).
  * Strict separation between morning (Compartment 1 / Pin 25) and evening (Compartment 2 / Pin 26) dose alarm windows.
  * Instantaneous telemetry streaming for sensor diagnostics, battery, and lid states.
* **Clinical & Patient Dashboards**:
  * Complete DOTS compliance tracking, adherence metrics, streak counters, and automated WhatsApp alert triggers.
  * Doctor schedule modification with immediate hardware schedule dispatch.

## 🛠️ Tech Stack

* **Frontend**: React 19, Tailwind CSS v4, Lucide React, Motion
* **Backend**: Express.js, Vite middleware, Node.js
* **Hardware Firmware**: ESP32 C++ Arduino firmware (`hardware/firmware/dosesure_esp32.ino`)
* **AI Analysis**: Google GenAI SDK, local Computer Vision pipelines

## 🏁 Getting Started

### 1. Installation
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
The server will start on `http://localhost:3000`.

### 3. Flash ESP32 Firmware
Open `hardware/firmware/dosesure_esp32/dosesure_esp32.ino` in Arduino IDE, configure your Wi-Fi credentials in `hardware_config.h`, and upload to your ESP32 board.
