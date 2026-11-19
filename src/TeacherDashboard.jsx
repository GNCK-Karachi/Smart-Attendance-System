import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase.js";
import { escapeCsv, useLocalDate } from "./utils.js";

export default function TeacherDashboard({ user, onLogout }) {
  const today = useLocalDate();
  const [records, setRecords] = useState([]);
  const [pin, setPin] = useState("");
  const [savedPin, setSavedPin] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const attendanceQuery = query(
      collection(db, "attendance"),
      where("attendanceDate", "==", today),
    );
    return onSnapshot(
      attendanceQuery,
      (snapshot) => {
        setRecords(
          snapshot.docs
            .map((item) => item.data())
            .sort((a, b) => (b.timestamp?.toMillis?.() ?? 0) - (a.timestamp?.toMillis?.() ?? 0)),
        );
        setError("");
      },
      (snapshotError) => setError(snapshotError.message || "Could not load attendance."),
    );
  }, [today]);

  useEffect(() => {
    return onSnapshot(
      doc(db, "config", "daily"),
      (snapshot) => {
        if (snapshot.exists()) {
          const currentPin = snapshot.data().pin;
          setSavedPin(currentPin);
          setPin((current) => current || currentPin);
        }
      },
      (snapshotError) => setError(snapshotError.message || "Could not load the Daily PIN."),
    );
  }, []);

  async function savePin(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!/^\d{4}$/.test(pin)) {
      setError("The Daily PIN must contain exactly 4 digits.");
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, "config", "daily"), {
        pin,
        updatedAt: serverTimestamp(),
        updatedBy: user.email,
      });
      setSavedPin(pin);
      setNotice("Today's PIN has been updated.");
    } catch (saveError) {
      setError(saveError.message || "Could not save the Daily PIN.");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const headings = [
      "Roll Number",
      "Student Name",
      "Class / Section",
      "Date",
      "Time",
      "Status",
      "Marked By",
      "Location Verified",
    ];
    const rows = records.map((record) => [
      record.rollNumber,
      record.studentName,
      record.classSection,
      record.attendanceDate,
      record.timestamp?.toDate?.().toLocaleTimeString() ?? "",
      record.status,
      record.markedBy ?? "",
      record.locationVerified ? "Yes" : "No",
    ]);
    const csv = [headings, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await onLogout();
    } catch (logoutError) {
      setError(logoutError.message || "Could not sign out.");
      setLoggingOut(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-6 shadow-card sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
              Teacher dashboard
            </p>
            <h2 className="mt-2 text-2xl font-extrabold">Today's attendance</h2>
            <p className="mt-1 text-sm text-slate-600">{today} · Live updates</p>
          </div>
          <button
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            disabled={loggingOut}
            onClick={logout}
            type="button"
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800">Checked in</p>
            <p className="mt-1 text-3xl font-extrabold text-emerald-900">{records.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">Buddy check-ins</p>
            <p className="mt-1 text-3xl font-extrabold text-slate-900">
              {records.filter((record) => Boolean(record.markedBy)).length}
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          {records.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              No students have checked in yet today.
            </p>
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3 font-semibold">Student</th>
                  <th className="px-3 py-3 font-semibold">Class</th>
                  <th className="px-3 py-3 font-semibold">Time</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr className="border-b border-slate-50" key={record.rollNumber}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{record.studentName}</p>
                      <p className="text-xs text-slate-500">{record.rollNumber}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{record.classSection}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {record.timestamp?.toDate?.().toLocaleTimeString() ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                        {record.markedBy ? "Peer assisted" : "Present"}
                      </span>
                      {record.markedBy && (
                        <p className="mt-1 text-xs text-slate-500">By {record.markedBy}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-card sm:p-8">
        <h3 className="text-lg font-extrabold">Daily classroom PIN</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Set the 4-digit PIN students will enter from the classroom board.
        </p>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={savePin}>
          <label className="sr-only" htmlFor="daily-pin">Daily 4-digit PIN</label>
          <input
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-lg tracking-[0.3em]"
            id="daily-pin"
            inputMode="numeric"
            maxLength={4}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            pattern="\d{4}"
            placeholder="••••"
            required
            value={pin}
          />
          <button
            className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? "Saving…" : "Save PIN"}
          </button>
        </form>
        {savedPin && (
          <p className="mt-3 text-xs text-slate-500">
            A PIN is currently set. Share it only with students in class.
          </p>
        )}
      </section>

      <button
        className="w-full rounded-xl border border-emerald-700 bg-white px-5 py-3 font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
        disabled={records.length === 0}
        onClick={exportCsv}
        type="button"
      >
        Export today's attendance as CSV
      </button>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
