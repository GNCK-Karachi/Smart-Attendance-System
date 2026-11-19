import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase.js";
import {
  attendanceDocumentId,
  distanceInMeters,
  getCurrentPosition,
  locationErrorMessage,
  normalizeRollNumber,
  useLocalDate,
} from "./utils.js";

const CAMPUS = { latitude: 24.8718, longitude: 67.0601 };
const GEOFENCE_RADIUS_METERS = 100;

export default function StudentCheckIn({ profile }) {
  const today = useLocalDate();
  const [attendance, setAttendance] = useState(null);
  const [pin, setPin] = useState("");
  const [buddyRoll, setBuddyRoll] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const attendanceRef = doc(
      db,
      "attendance",
      attendanceDocumentId(today, profile.rollNumber),
    );
    return onSnapshot(
      attendanceRef,
      (snapshot) => setAttendance(snapshot.exists() ? snapshot.data() : null),
      (snapshotError) => setError(snapshotError.message || "Could not load today's attendance."),
    );
  }, [profile.rollNumber, today]);

  async function verifyLocation() {
    const position = await getCurrentPosition();
    const distance = distanceInMeters(
      position.coords.latitude,
      position.coords.longitude,
      CAMPUS.latitude,
      CAMPUS.longitude,
    );
    if (distance > GEOFENCE_RADIUS_METERS) {
      throw new Error("You must be inside the classroom to mark attendance.");
    }
  }

  async function verifyPin() {
    if (!/^\d{4}$/.test(pin)) throw new Error("Enter the 4-digit PIN from the classroom board.");
    const configSnapshot = await getDoc(doc(db, "config", "daily"));
    if (!configSnapshot.exists() || configSnapshot.data().pin !== pin) {
      throw new Error("The Daily PIN is incorrect. Check the classroom board and try again.");
    }
  }

  async function markPresent(rollNumber, status, markedBy = null) {
    const attendanceId = attendanceDocumentId(today, rollNumber);
    const attendanceRef = doc(db, "attendance", attendanceId);
    const studentRef = doc(db, "students", rollNumber);
    const studentSnapshot = await getDoc(studentRef);
    if (!studentSnapshot.exists()) throw new Error("That roll number is not registered.");

    const student = studentSnapshot.data();
    if (markedBy && student.hasPhone !== false) {
      throw new Error("Buddy Mode can only be used for a student registered without a phone.");
    }
    if (!markedBy && !student.hasPhone) {
      throw new Error("This profile is registered for Buddy Mode. Ask a classmate to check you in.");
    }

    if (markedBy) {
      const [helperStudent, helperAttendance] = await Promise.all([
        getDoc(doc(db, "students", markedBy)),
        getDoc(doc(db, "attendance", attendanceDocumentId(today, markedBy))),
      ]);
      if (!helperStudent.exists() || !helperAttendance.exists()) {
        throw new Error("Mark your own attendance before checking in a classmate.");
      }
      if (!helperStudent.data().hasPhone) {
        throw new Error("Only a student with a phone can check in a classmate.");
      }
    }

    const record = {
      rollNumber,
      studentName: student.fullName,
      classSection: student.classSection,
      attendanceDate: today,
      timestamp: serverTimestamp(),
      status,
      locationVerified: true,
    };
    if (markedBy) record.markedBy = markedBy;

    try {
      await setDoc(attendanceRef, record);
    } catch (writeError) {
      if (writeError.code === "permission-denied") {
        throw new Error(
          "Attendance is already marked for this student today, or this check-in could not be authorized.",
        );
      }
      throw writeError;
    }
  }

  async function submitOwnAttendance(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await verifyLocation();
      await verifyPin();
      await markPresent(profile.rollNumber, "Present");
      setMessage("You're checked in. Have a great class!");
      setPin("");
    } catch (checkInError) {
      setError(
        checkInError.code === 1 || checkInError.code === 2 || checkInError.code === 3
          ? locationErrorMessage(checkInError)
          : checkInError.message || "Could not mark attendance.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitBuddyAttendance(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await verifyLocation();
      await verifyPin();
      const rollNumber = normalizeRollNumber(buddyRoll);
      if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(rollNumber)) {
        throw new Error("Enter a valid roll number.");
      }
      await markPresent(rollNumber, "Present (Peer Assisted)", profile.rollNumber);
      setBuddyRoll("");
      setMessage(`Attendance marked for ${rollNumber}.`);
    } catch (checkInError) {
      setError(
        checkInError.code === 1 || checkInError.code === 2 || checkInError.code === 3
          ? locationErrorMessage(checkInError)
          : checkInError.message || "Could not mark classmate attendance.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-card sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
            Welcome
          </p>
          <h2 className="mt-2 text-2xl font-extrabold">{profile.fullName}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {profile.rollNumber} <span aria-hidden="true">·</span> {profile.classSection}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            attendance
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {attendance ? attendance.status : "Not checked in"}
        </span>
      </div>

      {attendance ? (
        <div className="mt-7 rounded-2xl bg-emerald-50 p-5">
          <p className="font-bold text-emerald-900">Attendance recorded for today</p>
          <p className="mt-1 text-sm text-emerald-800">
            {attendance.markedBy
              ? `Checked in by ${attendance.markedBy}.`
              : "Your location and classroom PIN were verified."}
          </p>
        </div>
      ) : profile.hasPhone ? (
        <form className="mt-7 space-y-4" onSubmit={submitOwnAttendance}>
          <p className="text-sm leading-6 text-slate-600">
            Allow location access and enter the 4-digit PIN shown in class to check in.
          </p>
          <label className="block text-sm font-semibold">
            Daily PIN
            <input
              autoComplete="one-time-code"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg tracking-[0.3em]"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              pattern="\d{4}"
              placeholder="••••"
              required
              value={pin}
            />
          </label>
          <button
            className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? "Verifying location and PIN…" : "Mark my attendance"}
          </button>
        </form>
      ) : (
        <div className="mt-7 rounded-2xl bg-blue-50 p-5">
          <p className="font-bold text-blue-900">Buddy Mode is enabled</p>
          <p className="mt-1 text-sm leading-6 text-blue-800">
            Ask a classmate with a smartphone who has checked in to record your attendance.
          </p>
        </div>
      )}

      {attendance && profile.hasPhone && !attendance.markedBy && (
        <form
          className="mt-7 border-t border-slate-100 pt-6"
          onSubmit={submitBuddyAttendance}
        >
          <h3 className="font-bold">Mark for a classmate</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Check in a student registered for Buddy Mode. Your location and PIN are checked first.
          </p>
          <label className="mt-4 block text-sm font-semibold">
            Classmate's roll number
            <input
              autoCapitalize="characters"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal uppercase"
              maxLength={30}
              onChange={(event) => setBuddyRoll(event.target.value)}
              placeholder="XI-SCI-105"
              required
              value={buddyRoll}
            />
          </label>
          <button
            className="mt-4 w-full rounded-xl border border-emerald-700 px-5 py-3 font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? "Verifying…" : "Mark classmate present"}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
