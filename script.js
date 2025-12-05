// script.js – Arrow web app (auth + pitches + inbox/chat)

// ─────────────────────────────────────────────
//  Firebase imports (use firebase.js for config)
// ─────────────────────────────────────────────
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  doc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

// ─────────────────────────────────────────────
//  Page + helper utilities
// ─────────────────────────────────────────────

const currentPage =
  document.body.dataset.page ||
  window.location.pathname.split("/").pop() ||
  "index.html";

const PUBLIC_PAGES = ["login.html"];

function normalizePage(str) {
  // So "feed.html" vs "index.html" both work for home
  if (!str || str === "/") return "index.html";
  return str;
}

function isFeedPage(page) {
  const p = normalizePage(page);
  return p === "index.html" || p === "feed.html";
}

// Update navbar: show "Hi, email" vs Log in
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

// Login card message (errors / info)
function setLoginMessage(message, type = "error") {
  const el = document.getElementById("login-message");
  if (!el) return;
  el.textContent = message || "";
  el.style.color = type === "error" ? "#ff7b7b" : "#a5ffc5";
}

// ─────────────────────────────────────────────
//  Auth state + route guards
// ─────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
  const page = normalizePage(currentPage);

  // Route guard: protect everything except login
  if (!user && !PUBLIC_PAGES.includes(page)) {
    window.location.href = "login.html";
    return;
  }

  // Already logged in → don't stay on login
  if (user && page === "login.html") {
    window.location.href = "index.html";
    return;
  }

  // Update nav
  renderUserChip(user);

  // Page-specific init
  if (isFeedPage(page)) {
    loadPitches();
  } else if (page === "inbox.html" && user) {
    initInbox(user);
  }
});

// ─────────────────────────────────────────────
//  Login / Signup / Reset
// ─────────────────────────────────────────────

const loginForm = document.getElementById("login-form");
const signInBtn = document.getElementById("sign-in-btn");
const signUpBtn = document.getElementById("sign-up-btn");
const resetLink = document.getElementById("reset-password-link");

let loginMode = "signin"; // or "signup"

if (signInBtn) {
  signInBtn.addEventListener("click", () => {
    loginMode = "signin";
  });
}

if (signUpBtn) {
  signUpBtn.addEventListener("click", () => {
    loginMode = "signup";
  });
}

if (loginForm) {
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
        const cred = await signInWithEmailAndPassword(auth, email, password);

        if (!cred.user.emailVerified) {
          setLoginMessage(
            "Signed in, but your email is not verified yet. Check your inbox.",
            "info"
          );
        } else {
          window.location.href = "index.html";
        }
      } else {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        await sendEmailVerification(cred.user);
        setLoginMessage(
          "Account created! Please verify your email before logging in.",
          "info"
        );
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

// Logout exposed globally for Settings button
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
//  Firestore – Pitches
// ─────────────────────────────────────────────

// New pitch creation (New Pitch page)
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
    ownerEmail: user.email || "",
    interestCount: 0,
    createdAt: serverTimestamp(),
  });
}

// Load pitches on feed
async function loadPitches() {
  const list = document.getElementById("pitch-list");
  const searchInput = document.getElementById("search-input");
  const metaCount = document.getElementById("feed-meta-count");

  if (!list) return;

  list.innerHTML = "<p>Loading pitches...</p>";

  try {
    const pitchesRef = collection(db, "pitches");
    const q = query(pitchesRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const allPitches = [];
    snap.forEach((docSnap) => {
      allPitches.push({ id: docSnap.id, ...docSnap.data() });
    });

    function render(filterText = "") {
      const term = filterText.trim().toLowerCase();

      const filtered = allPitches.filter((p) => {
        if (!term) return true;
        const fields = [
          p.title || "",
          p.founder || "",
          p.sector || "",
          p.location || "",
          p.summary || "",
        ];
        return fields.some((f) => f.toLowerCase().includes(term));
      });

      list.innerHTML = "";

      if (metaCount) {
        metaCount.textContent = `${filtered.length} live pitches`;
      }

      if (!filtered.length) {
        list.innerHTML =
          "<p style='color:#a5a3c5'>No pitches match your search yet.</p>";
        return;
      }

      filtered.forEach((p) => {
        const card = document.createElement("article");
        card.className = "pitch-card";

        const equityText = p.equity ? `${p.equity} equity` : "Terms TBD";

        card.innerHTML = `
          <div class="pitch-header">
            <div>
              <h3 class="pitch-title">${p.title || "Untitled"}</h3>
              <div class="pitch-meta-row">
                <span>Founder: ${p.founder || "Unknown"}</span>
                ${
                  p.sector
                    ? `<span class="tag-pill">${p.sector}</span>`
                    : ""
                }
                ${
                  p.location
                    ? `<span class="tag-pill">${p.location}</span>`
                    : ""
                }
                ${
                  p.ownerEmail
                    ? `<span class="tag-pill">by ${p.ownerEmail}</span>`
                    : ""
                }
              </div>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
              <span class="equity-pill">${equityText}</span>
              <span class="interest-pill">
                ${p.interestCount || 0} interested
              </span>
            </div>
          </div>

          <p class="pitch-summary">${p.summary || ""}</p>

          <div class="pitch-actions-row">
            <button
              class="btn btn-primary btn-interest"
              data-pitch-id="${p.id}"
            >
              I’m interested
            </button>
          </div>
        `;

        const interestBtn = card.querySelector(".btn-interest");
        if (interestBtn) {
          interestBtn.addEventListener("click", async () => {
            try {
              await handleInterestClick(p);
              alert(
                "Your interest has been sent. You’ll see this thread in your Inbox."
              );
            } catch (err) {
              console.error(err);
              alert("Failed to send interest: " + err.message);
            }
          });
        }

        list.appendChild(card);
      });
    }

    render();

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        render(searchInput.value);
      });
    }
  } catch (err) {
    console.error(err);
    list.innerHTML =
      "<p style='color:#ff7b7b'>Failed to load pitches. Check console for details.</p>";
  }
}

// New Pitch form hook
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
//  "I'm interested" → Conversations
// ─────────────────────────────────────────────

// This creates or updates a conversation document for (pitch, investor)
async function handleInterestClick(pitch) {
  const user = auth.currentUser;
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  if (!pitch.ownerUid) {
    throw new Error("This pitch missing owner UID. Recreate or contact support.");
  }

  const convId = `${pitch.id}_${user.uid}`; // stable: one convo per pitch+investor
  const convRef = doc(db, "conversations", convId);
  const existing = await getDoc(convRef);

  const baseData = {
    pitchId: pitch.id,
    pitchTitle: pitch.title || "Untitled",
    founderUid: pitch.ownerUid,
    founderEmail: pitch.ownerEmail || "",
    investorUid: user.uid,
    investorEmail: user.email || "",
    participants: [pitch.ownerUid, user.uid],
    lastMessage: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (!existing.exists()) {
    await setDoc(convRef, baseData);
  } else {
    await setDoc(
      convRef,
      {
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  // Optionally bump interest count in pitch doc
  try {
    const pitchRef = doc(db, "pitches", pitch.id);
    const snap = await getDoc(pitchRef);
    if (snap.exists()) {
      const data = snap.data();
      const currentCount = data.interestCount || 0;
      await setDoc(
        pitchRef,
        { interestCount: currentCount + 1 },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn("Could not update interestCount:", err);
  }
}

// ─────────────────────────────────────────────
//  Inbox + Chat
// ─────────────────────────────────────────────

let activeConvUnsub = null;
let activeConvId = null;

async function initInbox(user) {
  const listEl = document.getElementById("conversation-list");
  const chatPanel = document.getElementById("chat-panel");
  const chatMessagesEl = document.getElementById("chat-messages");
  const chatTitleEl = document.getElementById("chat-pitch-title");
  const chatPartnerLabelEl = document.getElementById("chat-partner-label");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");

  if (!listEl || !chatPanel || !chatMessagesEl || !chatForm || !chatInput) {
    return;
  }

  // Subscribe to all conversations where I'm a participant
  const convRef = collection(db, "conversations");
  const qConv = query(
    convRef,
    where("participants", "array-contains", user.uid),
    orderBy("updatedAt", "desc")
  );

  onSnapshot(
    qConv,
    (snapshot) => {
      listEl.innerHTML = "";

      if (snapshot.empty) {
        listEl.innerHTML =
          "<p style='color:#a5a3c5'>No conversations yet. Click “I’m interested” on a pitch to start one.</p>";
        return;
      }

      snapshot.forEach((docSnap) => {
        const c = docSnap.data();
        const convId = docSnap.id;

        const isFounder = c.founderUid === user.uid;
        const partnerEmail = isFounder ? c.investorEmail : c.founderEmail;

        const item = document.createElement("button");
        item.className = "conversation-item";
        item.innerHTML = `
          <div class="conversation-main">
            <div class="conversation-title">${c.pitchTitle || "Untitled"}</div>
            <div class="conversation-partner">
              With ${partnerEmail || "Unknown"}
            </div>
          </div>
          <div class="conversation-meta">
            <span class="conversation-role-chip">${
              isFounder ? "Founder" : "Investor"
            }</span>
          </div>
        `;

        item.addEventListener("click", () => {
          openConversation(
            convId,
            c,
            user,
            chatPanel,
            chatMessagesEl,
            chatTitleEl,
            chatPartnerLabelEl,
            chatForm,
            chatInput
          );
        });

        listEl.appendChild(item);
      });
    },
    (err) => {
      console.error(err);
      listEl.innerHTML =
        "<p style='color:#ff7b7b'>Failed to load conversations.</p>";
    }
  );
}

function openConversation(
  convId,
  convo,
  user,
  chatPanel,
  chatMessagesEl,
  chatTitleEl,
  chatPartnerLabelEl,
  chatForm,
  chatInput
) {
  // Unsubscribe from previous convo
  if (activeConvUnsub) {
    activeConvUnsub();
    activeConvUnsub = null;
  }

  activeConvId = convId;

  const isFounder = convo.founderUid === user.uid;
  const partnerEmail = isFounder ? convo.investorEmail : convo.founderEmail;

  chatPanel.classList.remove("hidden");
  chatTitleEl.textContent = convo.pitchTitle || "Untitled pitch";
  chatPartnerLabelEl.textContent = isFounder
    ? `You’re chatting with investor ${partnerEmail || ""}`
    : `You’re chatting with founder ${partnerEmail || ""}`;

  // Subscribe to messages in this conversation
  const messagesRef = collection(db, "conversations", convId, "messages");
  const qMsg = query(messagesRef, orderBy("createdAt", "asc"));

  activeConvUnsub = onSnapshot(
    qMsg,
    (snapshot) => {
      chatMessagesEl.innerHTML = "";

      if (snapshot.empty) {
        chatMessagesEl.innerHTML =
          "<p style='color:#a5a3c5'>No messages yet. Say hi!</p>";
        return;
      }

      snapshot.forEach((docSnap) => {
        const m = docSnap.data();
        const mine = m.senderUid === user.uid;

        const row = document.createElement("div");
        row.className = "message-row" + (mine ? " message-row-self" : "");

        const bubble = document.createElement("div");
        bubble.className =
          "message-bubble" + (mine ? " message-bubble-self" : "");
        bubble.textContent = m.text || "";

        row.appendChild(bubble);
        chatMessagesEl.appendChild(row);
      });

      // Scroll to bottom
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    },
    (err) => {
      console.error(err);
      chatMessagesEl.innerHTML =
        "<p style='color:#ff7b7b'>Failed to load messages.</p>";
    }
  );

  // Hook send
  chatForm.onsubmit = async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    try {
      await sendMessage(convId, convo, user, text);
      chatInput.value = "";
    } catch (err) {
      console.error(err);
      alert("Failed to send: " + err.message);
    }
  };
}

async function sendMessage(convId, convo, user, text) {
  const messagesRef = collection(db, "conversations", convId, "messages");
  await addDoc(messagesRef, {
    text,
    senderUid: user.uid,
    senderEmail: user.email || "",
    createdAt: serverTimestamp(),
  });

  // Update lastMessage + updatedAt on conversation doc
  const convRef = doc(db, "conversations", convId);
  await setDoc(
    convRef,
    {
      lastMessage: text,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ─────────────────────────────────────────────
//  Settings demo buttons (these only touch localStorage)
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
