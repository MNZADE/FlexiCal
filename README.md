# FlexiCal

FlexiCal is a local-first timetable and productivity app built with Expo and React Native. Plan a day, keep track of the current task, adjust when a task takes longer than expected, and review how scheduled time is used.

## Features

- **Today dashboard:** shows the current or next task, a live countdown, and upcoming schedule items.
- **Task end actions:** complete a task, add 15 or 30 minutes, move it to the end of the day, or find an available gap with Flexi-mode.
- **Monthly calendar:** browse dates, add tasks and suggested breaks, adjust task times, and delete schedule items.
- **Schedule import:** extract selectable text locally from PDF and DOCX files, or paste schedule text. Review parsed time blocks and conflicts before importing; choose a date range and repeat days.
- **Daily insights:** view completion percentage, completed focus time, planned deep-work time, and planned hours by category.
- **Task notifications:** receive upcoming, start, end, and optional break reminders. The operating system controls notification delivery and sound when the app is in the background.
- **Custom alert tune:** choose and preview an audio file on the device. A selected tune can play while the app is open; background and lock-screen notifications use the system notification sound.
- **Home-screen widgets:** see the current or upcoming task in the Android or iOS widget.
- **Settings and export:** enable larger text, reduce motion, toggle break reminders, and export schedules as JSON or iCalendar (`.ics`).

## Project structure

```text
src/
├── api/                 # Task notifications and custom tune playback
├── app/                 # Expo Router routes and app layout
├── components/          # Shared UI components
├── config/              # SQLite schema, scheduling operations, constants
├── features/
│   ├── analytics/       # Daily insights
│   ├── calendar/        # Calendar and schedule editing
│   ├── dashboard/      # Countdown and task-end actions
│   ├── parser/          # PDF/DOCX extraction and schedule text parsing
│   └── settings/        # Preferences, alert tune, and exports
├── state/               # Task and preference providers
├── utils/               # Shared time helpers
└── widgets/             # Android and iOS next-task widgets
```

The app stores tasks and preferences in a local SQLite database. PDF and DOCX text extraction runs on-device; schedule text is not sent to a server.

## Requirements

- Node.js and npm
- A development environment for the platform you want to run (Android SDK for local Android builds; Xcode on macOS for local iOS builds)
- An Expo/EAS account for cloud builds

This project uses Expo SDK 57. Check the Expo SDK 57 documentation when changing Expo APIs: [docs.expo.dev/versions/v57.0.0](https://docs.expo.dev/versions/v57.0.0/).

## Run locally

Install the locked dependencies:

```sh
npm ci
```

Start Expo:

```sh
npx expo start
```

Platform commands:

```sh
npx expo start --web
npx expo run:android
npx expo run:ios
```

This app uses native modules and widgets. Expo Go may not include everything required; use a development build for native feature testing.

## Checks

```sh
npx expo lint
npx tsc --noEmit
npx expo-doctor
```

## Android preview APK with EAS

The `preview` profile in `eas.json` produces an internally distributed APK:

```sh
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

Download the APK from the EAS build page and install it on an Android device. Rebuild after adding native modules or changing native configuration.

## Import format and limitations

The text parser expects one time range and task name per line, for example:

```text
09:00-10:00 Study
10:15-11:00 Project meeting
1:00 PM-2:30 PM Reading
```

PDF import requires selectable text. Image-only or scanned PDFs need OCR, which is not currently included. Import supports PDF and DOCX documents; it does not edit or highlight the source document.

## License

The repository's current `LICENSE` file is the Expo license. It does not establish a license for FlexiCal project code; choose and add a project license before redistributing the project.
