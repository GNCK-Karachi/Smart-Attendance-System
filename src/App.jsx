import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Register from "./Register.jsx";
import StudentCheckIn from "./StudentCheckIn.jsx";
import TeacherDashboard from "./TeacherDashboard.jsx";
import { auth, db, isFirebaseConfigured, teacherAuth } from "./firebase.js";
import {
  DEVICE_ID_KEY,
  STUDENT_IDENTITY_KEY,
  TEACHER_EMAIL,
} from "./utils.js";

let anonymousSignInPromise = null;

function Card({ children, className = "" }) {
  return (
    <section className={`rounded-3xl bg-white p-6 shadow-card sm:p-8 ${className}`}>
      {children}
    </section>
  );
}

function TeacherLogin({ onBack, onLogin }) {
  const [email, setEmail] = useState(TEACHER_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onLogin(email.trim(), password);
    } catch (loginError) {
      setError(
        loginError.code === "auth/invalid-credential"
          ? "Email or password is incorrect."
          : loginError.message || "Could not sign in.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <button
        className="mb-6 text-sm font-semibold text-emerald-800 hover:text-emerald-950"
        onClick={onBack}
        type="button"
      >
        ← Back to student check-in
      </button>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
        Staff access
      </p>
      <h2 className="mt-2 text-2xl font-bold">Teacher sign in</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Use the teacher account created in Firebase Authentication.
      </p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <label className="block text-sm font-semibold">
          Email
          <input
            autoComplete="username"
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="block text-sm font-semibold">
          Password
          <input
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        <button
          className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60"
          disabled={busy}
          type="submit"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </Card>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [teacherUser, setTeacherUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [teacherAuthLoading, setTeacherAuthLoading] = useState(true);
  const [profileState, setProfileState] = useState({ status: "loading" });
  const [teacherLogin, setTeacherLogin] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [identityRefresh, setIdentityRefresh] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const unsubscribe = onAuthStateChanged(
      auth,
      async (nextUser) => {
        setUser(nextUser);
        setAuthLoading(false);
        if (!nextUser && !anonymousSignInPromise) {
          anonymousSignInPromise = signInAnonymously(auth)
            .catch((error) => {
              setStartupError(error.message || "Could not start a student session.");
            })
            .finally(() => {
              anonymousSignInPromise = null;
            });
        }
      },
      (error) => {
        setStartupError(error.message || "Could not connect to Firebase Authentication.");
        setAuthLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    return onAuthStateChanged(
      teacherAuth,
      (nextUser) => {
        setTeacherUser(nextUser);
        setTeacherAuthLoading(false);
      },
      (error) => {
        setStartupError(error.message || "Could not connect to teacher authentication.");
        setTeacherAuthLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!user?.isAnonymous) return undefined;
    let cancelled = false;

    async function loadStudent() {
      setProfileState({ status: "loading" });
      setStartupError("");
      try {
        let deviceId = localStorage.getItem(DEVICE_ID_KEY);
        if (!deviceId) {
          deviceId = crypto.randomUUID();
          localStorage.setItem(DEVICE_ID_KEY, deviceId);
        }

        const savedIdentity = localStorage.getItem(STUDENT_IDENTITY_KEY);
        if (!savedIdentity) {
          if (!cancelled) setProfileState({ status: "unregistered", deviceId });
          return;
        }

        let identity;
        try {
          identity = JSON.parse(savedIdentity);
        } catch {
          throw new Error("The saved registration is damaged. Ask a teacher to reset this device.");
        }
        if (
          !identity?.rollNumber ||
          identity.authUid !== user.uid ||
          !identity.deviceId ||
          identity.deviceId !== deviceId
        ) {
          throw new Error(
            "This device registration does not match the signed-in student. Ask a teacher for help.",
          );
        }

        const studentRef = doc(db, "students", identity.rollNumber);
        const privateRef = doc(db, "studentDevices", identity.rollNumber);
        const [studentSnapshot, privateSnapshot] = await Promise.all([
          getDoc(studentRef),
          getDoc(privateRef),
        ]);
        if (!studentSnapshot.exists() || !privateSnapshot.exists()) {
          throw new Error("The student registration could not be verified. Ask a teacher for help.");
        }
        const privateData = privateSnapshot.data();
        if (privateData.authUid !== user.uid || privateData.deviceId !== deviceId) {
          throw new Error(
            "This roll number is already linked to another device. Ask a teacher for help.",
          );
        }
        if (!cancelled) {
          setProfileState({
            status: "registered",
            profile: studentSnapshot.data(),
            deviceId,
          });
        }
      } catch (error) {
        if (!cancelled) setProfileState({ status: "error", message: error.message });
      }
    }

    loadStudent();
    return () => {
      cancelled = true;
    };
  }, [user, identityRefresh]);

  async function handleRegistrationComplete() {
    setIdentityRefresh((count) => count + 1);
  }

  async function handleTeacherLogin(email, password) {
    await signInWithEmailAndPassword(teacherAuth, email, password);
  }

  async function handleTeacherLogout() {
    await signOut(teacherAuth);
    setTeacherLogin(false);
  }

  if (!isFirebaseConfigured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10">
        <Card>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
            Setup required
          </p>
          <h1 className="mt-2 text-2xl font-bold">Connect your Firebase project</h1>
          <p className="mt-3 leading-7 text-slate-600">
            Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Firebase
            web-app settings, then restart the Vite server. See <code>README.md</code> for
            the complete setup and Firestore rules.
          </p>
        </Card>
      </main>
    );
  }

  if (authLoading || teacherAuthLoading || (!user && !startupError)) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <p className="font-semibold text-emerald-800">Connecting securely…</p>
      </main>
    );
  }

  const isTeacher = Boolean(teacherUser);
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700 text-xl text-white">
              ✓
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                Campus Check-in
              </p>
              <h1 className="text-xl font-extrabold sm:text-2xl">
                Student attendance
              </h1>
            </div>
          </div>
          {!isTeacher && (
            <button
              className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-50"
              onClick={() => setTeacherLogin((value) => !value)}
              type="button"
            >
              {teacherLogin ? "Student view" : "Teacher"}
            </button>
          )}
        </header>

        {startupError && (
          <Card className="mb-5 border border-red-100">
            <p className="text-sm text-red-800" role="alert">{startupError}</p>
          </Card>
        )}

        {isTeacher ? (
          teacherUser.email?.toLowerCase() === TEACHER_EMAIL ? (
            <TeacherDashboard user={teacherUser} onLogout={handleTeacherLogout} />
          ) : (
            <Card>
              <h2 className="text-xl font-bold">Teacher access is not enabled</h2>
              <p className="mt-2 text-slate-600">
                This account is not the teacher account configured for this application.
              </p>
              <button
                className="mt-5 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white"
                onClick={handleTeacherLogout}
                type="button"
              >
                Sign out
              </button>
            </Card>
          )
        ) : teacherLogin ? (
          <TeacherLogin
            onBack={() => setTeacherLogin(false)}
            onLogin={handleTeacherLogin}
          />
        ) : profileState.status === "loading" ? (
          <Card><p className="text-slate-600">Loading your student profile…</p></Card>
        ) : profileState.status === "error" ? (
          <Card className="border border-red-100">
            <h2 className="text-xl font-bold">Could not verify registration</h2>
            <p className="mt-2 text-red-800" role="alert">{profileState.message}</p>
          </Card>
        ) : profileState.status === "unregistered" ? (
          <Register
            authUid={user.uid}
            deviceId={profileState.deviceId}
            onComplete={handleRegistrationComplete}
          />
        ) : (
          <StudentCheckIn profile={profileState.profile} />
        )}
        <footer className="mt-8 text-center text-xs leading-5 text-slate-500">
          Location must be enabled to check in. Your device stays linked to one student.
        </footer>
      </div>
    </main>
  );
}
