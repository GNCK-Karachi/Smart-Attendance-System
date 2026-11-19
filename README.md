# Campus Check-in

A mobile-first student attendance app built with React, Vite, Tailwind CSS, Firebase Authentication, and Cloud Firestore. It is a static site: Vite produces `dist/`, which can be deployed to Firebase Hosting or GitHub Pages.

## Features

- One-time student registration with a device token kept in `localStorage`.
- Anonymous Firebase Authentication for student sessions, isolated from the teacher login.
- Daily check-in with browser geolocation, a classroom PIN, and one attendance document per student/day.
- Buddy Mode for students registered without a smartphone.
- Teacher email/password sign-in, live attendance, daily PIN management, and CSV export.
- Firestore rules that restrict profile/device writes, attendance creation, and teacher-only dashboard/configuration access.

## 1. Create your Firebase project

These steps use the Firebase Console and the free Spark plan. This app does not use
Cloud Storage, so you do not need to enable billing or create a storage bucket.

1. Sign in to the [Firebase Console](https://console.firebase.google.com/) with your Google
   account and choose **Add project**. Enter a project name, continue through the prompts,
   and create the project. Google Analytics is optional for this app.
2. From the project overview, choose **Add app → Web** (`</>`). Give the app a name,
   register it, and copy the displayed Firebase configuration. The config has fields like
   `apiKey`, `authDomain`, and `projectId`. It is okay to use these public web-app values
   in this browser app.
3. Open **Project settings → General → Your apps** and find the registered Web App. If
   needed, copy its `firebaseConfig` again from the SDK setup instructions.
4. In **Build → Authentication → Get started → Sign-in method**, enable **Anonymous**
   and **Email/Password**. The first is for student sessions; the second is for teachers.
5. In **Authentication → Users → Add user**, create the teacher login:
   - Email: `teacher@college.edu`
   - Password: choose a strong password and keep it private. Do not put it in the source
     code or share it in chat.
6. In **Build → Firestore Database → Create database**, choose **Start in production
   mode**, select a database location close to your users, and create the database.
7. Open the **Rules** tab for Firestore, replace its contents with the rules in this
   project's `firestore.rules`, and click **Publish**. Do not leave Firestore in test mode.
8. Under **Authentication → Settings → Authorized domains**, ensure `localhost` is
   present for local development. Firebase Hosting/Pages domains must be added after you
   know the deployed domain.

## 2. Connect the app

Create a `.env.local` file in the project root (next to `package.json`) by copying
`.env.example`. Put the matching values from the Web App's `firebaseConfig` in it:

   ```dotenv
   VITE_FIREBASE_API_KEY=the-apiKey-value
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=the-projectId-value
   VITE_FIREBASE_STORAGE_BUCKET=the-storageBucket-value
   VITE_FIREBASE_MESSAGING_SENDER_ID=the-messagingSenderId-value
   VITE_FIREBASE_APP_ID=the-appId-value
   ```

   Copy each value exactly; do not include quotes or `<`/`>` brackets. Some Firebase
   projects use a `firebasestorage.app` storage bucket instead of `appspot.com`—use the
   exact value shown for your project. `.env.local` is ignored by Git; do not put real
   project values in the tracked `.env.example`.

Install dependencies and run the local app:

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. For a production build, run `npm run build`; Vite
writes the static site to `dist/`.

## 3. Try a check-in

1. Open the app and register a test student with a unique roll number.
2. Use **Teacher** to sign in as `teacher@college.edu`, set a 4-digit Daily PIN, and sign
   out.
3. For a local geofence test, open Chrome DevTools → **More tools → Sensors**, choose a
   custom location near latitude `24.8718`, longitude `67.0601`, and allow location access
   for localhost. Enter the Daily PIN to mark attendance.
4. Sign in as teacher again to see the live check-in and try the CSV export. For Buddy
   Mode, register a second roll number with **No, use Buddy Mode**, then use an already
   checked-in phone-enabled student to check in that roll number.

The rules use `teacher@college.edu` as the teacher's authenticated email. If you choose a
different teacher address, update `TEACHER_EMAIL` in `src/utils.js` **and** the
`isTeacher()` rule in `firestore.rules` to match, then republish the rules. Do not add a
public teacher sign-up form.

The app writes these collections:

- `students/{ROLL}` — public attendance-facing profile (name, roll number, class/section, phone/Buddy Mode flag).
- `studentDevices/{ROLL}` — private anonymous-auth UID and per-browser device token; a student can read only their own record.
- `attendance/{YYYY-MM-DD_ROLL}` — one check-in per roll number and local calendar day.
- `config/daily` — the current 4-digit classroom PIN.

Create a student roster in advance if you need to prevent people from self-registering arbitrary roll numbers; this starter intentionally supports first-visit registration and enforces unique roll-number documents.

## 3. Deployment

### Firebase Hosting

Install the Firebase CLI, run `firebase login`, then from the project directory:

```sh
firebase init hosting
```

Choose the existing Firebase project, set the public directory to `dist`, configure as a single-page app if prompted (the app does not require client-side routes), and do not overwrite `index.html`. Build and deploy:

```sh
npm run build
firebase deploy --only hosting,firestore:rules
```

Ensure your deployed site uses HTTPS: browser geolocation is only available in secure contexts (localhost is also considered secure).

### GitHub Pages

Set the repository's deployment workflow to install dependencies, run `npm run build`, and publish the `dist` directory with GitHub Pages. `vite.config.js` sets `base: "./"` for relative asset paths on project pages. Add the Firebase values as GitHub Actions environment variables/secrets and write them to `.env.production` before the build. Configure Firebase Authentication's **Authorized domains** to include your Pages domain.

## Important security and operational limits

- The browser's geolocation result and the classroom PIN comparison happen in client code. A technically capable user can modify the app or forge browser location; Firestore rules cannot independently prove physical presence. For high-assurance attendance, move PIN verification, geofence policy, and attendance creation to a trusted server (for example, a Firebase callable function with App Check) and consider a controlled student roster.
- Students need to read `config/daily` to check the classroom PIN, so a student can inspect that document through the client. The PIN is a convenience against casual remote check-ins, not a secret from an authenticated app user.
- Device binding is a best-effort browser lock, not device attestation. Clearing browser storage or switching browsers may require a teacher to reset the student's records using a trusted administrative process.
- The default geofence is centered at latitude `24.8718`, longitude `67.0601`, with a 100-meter radius. Adjust `CAMPUS` and `GEOFENCE_RADIUS_METERS` in `src/StudentCheckIn.jsx` to the actual classroom/campus boundary.
- Attendance dates use the student's local device date. For authoritative timezone handling, compute the attendance date on a trusted backend.
