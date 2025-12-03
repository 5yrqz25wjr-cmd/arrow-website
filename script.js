// script.js – Arrow app logic (auth + Firestore + UI)

// ─────────────────────────────────────────────
// Firebase imports
// ─────────────────────────────────────────────
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  getDoc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const currentPage =
  document.body.dataset.page ||
  window.location.pathname.split("/").pop().toLowerCase() ||
  "index.html";

const PUBLIC_PAGES = ["login.html", "launch.html"];

// Update navbar chip "Hi, email"
function renderUserChip(user) {
  const chip = document.getElementById("user-chip");
  const loginLink = document.getElementById("login-link");

  if (!chip || !loginLink) return;

  if (user) {
    chip.textContent = `Hi, ${user.email}`;
    chip.style.display = "inline-flex";
    loginLink.style.display = "none";
  } else {
    chip.style.display = "none";
    loginLink.style.display = "inline-flex";
  }
}

// Show message in login card
function setLoginMessage(message, type = "error") {
  const el = document.getElementById("login-message");
  if (!el) return;
  el.textContent = message || "";
  el.style.color = type === "error" ? "#ff7b7b" : "#a5ffc5";
}

// Read role from Firestore
async function getUserRole(uid) {
  try {
    const ref = doc(db, "profiles", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return data.role || null;
    }
  } catch (e) {
    console.error("getUserRole error", e);
  }
  return null;
}

// Save role to Firestore
async function setUserRole(uid, role) {
  const ref = doc(db, "profiles", uid);
  await setDoc(ref, { role }, { merge: true });
}

// Route user after login based on page + role
async function routeAfterLogin(user) {
  const page = currentPage;

  // If we're on role page, stay; logic handled there
  if (page === "role.html") return;

  const role = await getUserRole(user.uid);

  // If no role yet, send to role picker
  if (!role) {
    if (page !== "role.html") {
      window.location.href = "role.html";
    }
    return;
  }

  // If has role, go to right dashboard if they just logged in from login
  if (page === "login.html") {
    if (role === "investor") {
      window.location.href = "investor.html";
    } else {
      window.location.href = "index.html";
    }
  }
}

// ─────────────────────────────────────────────
// Auth state & route guards
// ─────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const page = currentPage;

  if (!user && !PUBLIC_PAGES.includes(page)) {
    // Not logged in -> always send to login
    if (page !== "login.html") window.location.href = "login.html";
    return;
  }

  if (user) {
    // update nav chip
    renderUserChip(user);

    // Route if needed
    await routeAfterLogin(user);
  } else {
    renderUserChip(null);
  }

  // If we're on feed-like pages and logged in, load pitches
  if (user && (page === "index.html" || page === "feed.html" || page === "investor.html")) {
    loadPitches();
  }
});

// ─────────────────────────────────────────────
// Login / Signup / Reset password handlers
// ─────────────────────────────────────────────
const loginForm = document.getElementById("login-form");
const signInBtn = document.getElementById("sign-in-btn");
const signUpBtn = document.getElementById("sign-up-btn");
const resetLink = document.getElementById("reset-password-link");

let loginMode = "signin"; // "signin" or "signup"

if (loginForm && signInBtn && signUpBtn) {
  // Clicking Sign in
  signInBtn.addEventListener("click", () => {
    loginMode = "signin";
    loginForm.requestSubmit();
  });

  // Clicking Sign up
  signUpBtn.addEventListener("click", () => {
    loginMode = "signup";
    loginForm.requestSubmit();
  });

  // Single submit handler for both
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setLoginMessage("");

    const emailEl = document.getElementById("login-email");
    const passEl = document.getElementById("login-password");

    const email = emailEl.value.trim();
    const password = passEl.value.trim();

    if (!email || !password) {
      setLoginMessage("Please enter both email and password.");
      return;
    }

    try {
      if (loginMode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will route
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // New user, no role yet; role page will handle
        await setUserRole(cred.user.uid, null);
        setLoginMessage(
          "Account created! Choose your role on the next screen.",
          "info"
        );
        // go straight to role page
        window.location.href = "role.html";
      }
    } catch (err) {
      console.error(err);
      setLoginMessage(
        err.message.replace("Firebase: ", "").replace("(auth/", "(")
      );
    }
  });
}

if (resetLink) {
  resetLink.addEventListener("click", async () => {
    const emailEl = document.getElementById("login-email");
    const email = emailEl.value.trim();

    if (!email) {
      setLoginMessage("Enter your email first, then click reset.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setLoginMessage(
        "Password reset email sent. Check your inbox (and spam).",
        "info"
      );
    } catch (err) {
      console.error(err);
      setLoginMessage(
        err.message.replace("Firebase: ", "").replace("(auth/", "(")
      );
    }
  });
}

// Logout – called from nav / settings
window.handleLogout = async function handleLogout() {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (err) {
    console.error(err);
    alert("Logout failed: " + err.message);
  }
};

// ─────────────────────────────────────────────
// Role page handlers (role.html)
// ─────────────────────────────────────────────
const founderBtn = document.getElementById("choose-founder");
const investorBtn = document.getElementById("choose-investor");

async function handleRoleChoice(role) {
  const user = auth.currentUser;
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  try {
    await setUserRole(user.uid, role);
    if (role === "investor") {
      window.location.href = "investor.html";
    } else {
      window.location.href = "index.html";
    }
  } catch (err) {
    console.error(err);
    alert("Failed to set role: " + err.message);
  }
}

if (founderBtn) {
  founderBtn.addEventListener("click", () => handleRoleChoice("founder"));
}
if (investorBtn) {
  investorBtn.addEventListener("click", () => handleRoleChoice("investor"));
}

// ─────────────────────────────────────────────
// Firestore – Pitches (feed + new pitch)
// ─────────────────────────────────────────────

// Create a new pitch from the New Pitch form
async function createPitch(formData) {
  const user = auth.currentUser;
  if (!user) {
    alert("You must be signed in to create a pitch.");
    return;
  }

  const pitchesRef = collection(db, "pitches");

  await addDoc(pitchesRef, {
    title: formData.title,
    founder: formData.founder,
    sector: formData.sector,
    location: formData.location,
    summary: formData.summary,
    equity: formData.equity,
    ownerUid: user.uid,
    ownerEmail: user.email,
    createdAt: serverTimestamp(),
  });
}

// Load pitches into the feed page
async function loadPitches() {
  const list = document.getElementById("pitch-list");
  if (!list) return;

  list.innerHTML = "<p>Loading pitches...</p>";

  try {
    const pitchesRef = collection(db, "pitches");
    const q = query(pitchesRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML =
        "<p style='color:#a5a3c5'>No pitches yet. Create one from the New Pitch tab!</p>";
      return;
    }

    list.innerHTML = "";

    snap.forEach((docSnap) => {
      const p = docSnap.data();
      const card = document.createElement("article");
      card.className = "pitch-card";

      card.innerHTML = `
        <div class="pitch-header">
          <h3 class="pitch-title">${p.title || "Untitled"}</h3>
          <span class="equity-pill">${p.equity || "–"} Equity</span>
        </div>

        <div class="pitch-meta-row">
          <span>Founder: ${p.founder || "Unknown"}</span>
          ${p.sector ? `<span class="tag-pill">${p.sector}</span>` : ""}
          ${p.location ? `<span class="tag-pill">${p.location}</span>` : ""}
          ${
            p.ownerEmail
              ? `<span class="tag-pill">by ${p.ownerEmail}</span>`
              : ""
          }
        </div>

        <p class="pitch-summary">${p.summary || ""}</p>
      `;

      list.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    list.innerHTML =
      "<p style='color:#ff7b7b'>Failed to load pitches. Check the console for details.</p>";
  }
}

// Hook New Pitch form
const newPitchForm = document.getElementById("new-pitch-form");
if (newPitchForm) {
  newPitchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = newPitchForm.querySelector("button[type=submit]");
    if (submitBtn) submitBtn.disabled = true;

    const formData = {
      title: newPitchForm.title.value.trim(),
      founder: newPitchForm.founder.value.trim(),
      sector: newPitchForm.sector.value.trim(),
      location: newPitchForm.location.value.trim(),
      summary: newPitchForm.summary.value.trim(),
      equity: newPitchForm.equity.value.trim(),
    };

    try {
      await createPitch(formData);
      newPitchForm.reset();
      alert("Pitch created!");
      window.location.href = "index.html";
    } catch (err) {
      console.error(err);
      alert("Failed to create pitch: " + err.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// ─────────────────────────────────────────────
// Settings demo buttons (seed + wipe local)
// ─────────────────────────────────────────────
const seedBtn = document.getElementById("seed-demo");
const wipeBtn = document.getElementById("wipe-demo");

if (seedBtn) {
  seedBtn.addEventListener("click", async () => {
    try {
      await createPitch({
        title: "AI Tutor",
        founder: "Sample Founder",
        sector: "EdTech",
        location: "NY",
        summary: "Short demo pitch so you can see the UI in action.",
        equity: "8.0%",
      });

      await createPitch({
        title: "Fintech App",
        founder: "FF",
        sector: "Fintech",
        location: "NY",
        summary: "Finance app that helps people save.",
        equity: "10.0%",
      });

      alert("Demo pitches created in Firestore.");
    } catch (err) {
      console.error(err);
      alert("Failed to create demo pitches: " + err.message);
    }
  });
}

if (wipeBtn) {
  wipeBtn.addEventListener("click", () => {
    localStorage.clear();
    alert(
      "Local storage cleared. (Firestore data is NOT deleted by this button.)"
    );
  });
}
