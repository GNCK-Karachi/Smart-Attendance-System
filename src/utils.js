import { useEffect, useState } from "react";

export const DEVICE_ID_KEY = "campus-attendance.device-id";
export const STUDENT_IDENTITY_KEY = "campus-attendance.student";
export const TEACHER_EMAIL = "teacher@college.edu";

export function getLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function useLocalDate() {
  const [date, setDate] = useState(getLocalDate);

  useEffect(() => {
    const timer = window.setInterval(() => setDate(getLocalDate()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return date;
}

export function normalizeRollNumber(value) {
  return value.trim().toUpperCase();
}

export function attendanceDocumentId(date, rollNumber) {
  return `${date}_${rollNumber}`;
}

export function distanceInMeters(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(lat2 - lat1);
  const longitudeDelta = radians(lon2 - lon1);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function getCurrentPosition() {
  if (!navigator.geolocation) {
    return Promise.reject(
      new Error("Location services are not available in this browser."),
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    });
  });
}

export function locationErrorMessage(error) {
  if (error.code === 1) {
    return "Location permission was denied. Allow location access in your browser and try again.";
  }
  if (error.code === 2) {
    return "Your location could not be determined. Check that location services are enabled.";
  }
  if (error.code === 3) {
    return "Location lookup timed out. Please try again.";
  }
  return error.message || "Could not verify your location.";
}

export function escapeCsv(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
