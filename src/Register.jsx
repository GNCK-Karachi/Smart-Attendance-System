import { useState } from "react";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase.js";
import { STUDENT_IDENTITY_KEY, normalizeRollNumber } from "./utils.js";

export default function Register({ authUid, deviceId, onComplete }) {
  const [fullName, setFullName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [classSection, setClassSection] = useState("");
  const [hasPhone, setHasPhone] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    const normalizedRoll = normalizeRollNumber(rollNumber);
    if (!fullName.trim() || !classSection.trim()) {
      setError("Enter your full name and class/section.");
      return;
    }
    if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(normalizedRoll)) {
      setError("Use letters, numbers, and hyphens only for the roll number.");
      return;
    }

    setBusy(true);
    try {
      const studentRef = doc(db, "students", normalizedRoll);
      const privateRef = doc(db, "studentDevices", normalizedRoll);
      const student = {
        fullName: fullName.trim(),
        rollNumber: normalizedRoll,
        classSection: classSection.trim(),
        hasPhone,
        createdAt: serverTimestamp(),
      };

      const currentStudent = await getDoc(studentRef);
      if (currentStudent.exists()) {
        throw new Error("That roll number is already registered. Ask a teacher for help.");
      }

      await runTransaction(db, async (transaction) => {
        const [existingStudent, existingDevice] = await Promise.all([
          transaction.get(studentRef),
          transaction.get(privateRef),
        ]);
        if (existingStudent.exists() || existingDevice.exists()) {
          throw new Error("That roll number is already registered. Ask a teacher for help.");
        }
        transaction.set(studentRef, student);
        transaction.set(privateRef, {
          authUid,
          deviceId,
          linkedAt: serverTimestamp(),
        });
      });

      localStorage.setItem(
        STUDENT_IDENTITY_KEY,
        JSON.stringify({ authUid, deviceId, rollNumber: normalizedRoll }),
      );
      await onComplete();
    } catch (registrationError) {
      setError(registrationError.message || "Registration failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-card sm:p-8">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
        One-time setup
      </p>
      <h2 className="mt-2 text-2xl font-extrabold">Create your student profile</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        This device will be linked to the roll number you register.
      </p>

      <form className="mt-6 space-y-5" onSubmit={submit}>
        <label className="block text-sm font-semibold">
          Full name
          <input
            autoComplete="name"
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal"
            maxLength={100}
            onChange={(event) => setFullName(event.target.value)}
            required
            value={fullName}
          />
        </label>
        <label className="block text-sm font-semibold">
          Roll number
          <input
            autoCapitalize="characters"
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal uppercase"
            maxLength={30}
            onChange={(event) => setRollNumber(event.target.value)}
            placeholder="XI-SCI-104"
            required
            value={rollNumber}
          />
        </label>
        <label className="block text-sm font-semibold">
          Class / section
          <input
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal"
            maxLength={60}
            onChange={(event) => setClassSection(event.target.value)}
            placeholder="XI Science A"
            required
            value={classSection}
          />
        </label>

        <fieldset>
          <legend className="text-sm font-semibold">Do you own a smartphone?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              { value: true, label: "Yes, I have a phone" },
              { value: false, label: "No, use Buddy Mode" },
            ].map((option) => (
              <button
                aria-pressed={hasPhone === option.value}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  hasPhone === option.value
                    ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
                key={option.label}
                onClick={() => setHasPhone(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

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
          {busy ? "Registering…" : "Register this device"}
        </button>
      </form>
    </section>
  );
}
