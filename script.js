// Simple local storage keys
const STORAGE_KEY_PITCHES = "arrow_pitches";
const STORAGE_KEY_ROLE = "arrow_role";

// ----------- helpers ------------

function loadPitches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PITCHES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePitches(pitches) {
  localStorage.setItem(STORAGE_KEY_PITCHES, JSON.stringify(pitches));
}

function getRole() {
  return localStorage.getItem(STORAGE_KEY_ROLE) || "Founder";
}

function saveRole(role) {
  localStorage.setItem(STORAGE_KEY_ROLE, role);
}

// Seed demo pitches (same ones from your screenshots)
function getDemoPitches() {
  return [
    {
      id: "demo-1",
      title: "AI Tutor",
      founder: "Sample Founder",
      sector: "EdTech",
      region: "NY",
      equity: 8,
      summary: "Short demo pitch so you can see the UI in action.",
      leads: 0,
    },
    {
      id: "demo-2",
      title: "F",
      founder: "Ff",
      sector: "Fintech",
      region: "NY",
      equity: 10,
      summary: "Fgggrv gghhtg gghfvv",
      leads: 0,
    },
  ];
}

// ----------- FEED PAGE ------------

function setupFeedPage() {
  const listEl = document.getElementById("pitch-list");
  if (!listEl) return;

  const searchEl = document.getElementById("search-input");
  const pitchCountEl = document.getElementById("pitch-count");
  const leadCountEl = document.getElementById("lead-count");

  let pitches = loadPitches();
  if (!pitches.length) {
    // if first load, seed automatically so page isn't empty
    pitches = getDemoPitches();
    savePitches(pitches);
  }

  function render(filter = "") {
    const q = filter.trim().toLowerCase();
    const filtered = pitches.filter((p) => {
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.founder.toLowerCase().includes(q) ||
        (p.sector || "").toLowerCase().includes(q) ||
        (p.region || "").toLowerCase().includes(q)
      );
    });

    listEl.innerHTML = "";

    filtered.forEach((p) => {
      const card = document.createElement("article");
      card.className = "pitch-card";

      card.innerHTML = `
        <div class="pitch-header">
          <div class="pitch-title">${p.title || "Untitled"}</div>
          <div class="equity-pill">${(p.equity ?? 0).toFixed(1)}% Equity</div>
        </div>

        <div class="pitch-meta-row">
          <span>Founder: ${p.founder || "Unknown"}</span>
          ${
            p.sector
              ? `<span class="tag-pill">${p.sector}</span>`
              : ""
          }
          ${
            p.region
              ? `<span class="tag-pill">${p.region}</span>`
              : ""
          }
        </div>

        <p class="pitch-summary">
          ${p.summary || "No summary provided yet."}
        </p>
      `;

      listEl.appendChild(card);
    });

    pitchCountEl.textContent = `${pitches.length} pitches`;
    // leads are just a placeholder for now
    leadCountEl.textContent = `${0} leads`;
  }

  render();

  if (searchEl) {
    searchEl.addEventListener("input", (e) => {
      render(e.target.value);
    });
  }
}

// ----------- NEW PITCH PAGE ------------

function setupNewPitchPage() {
  const form = document.getElementById("new-pitch-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const title = formData.get("title")?.toString().trim();
    const founder = formData.get("founder")?.toString().trim();
    const sector = formData.get("sector")?.toString().trim();
    const region = formData.get("region")?.toString().trim();
    const equityRaw = formData.get("equity")?.toString().trim();
    const summary = formData.get("summary")?.toString().trim();
    const videoUrl = formData.get("videoUrl")?.toString().trim();

    const equity = Number(equityRaw) || 0;

    const pitches = loadPitches();

    pitches.push({
      id: `p-${Date.now()}`,
      title,
      founder,
      sector,
      region,
      equity,
      summary,
      videoUrl,
      leads: 0,
    });

    savePitches(pitches);

    // Simple redirect back to feed
    window.location.href = "index.html";
  });
}

// ----------- SETTINGS PAGE ------------

function setupSettingsPage() {
  const founderRadio = document.getElementById("role-founder");
  const investorRadio = document.getElementById("role-investor");
  const seedBtn = document.getElementById("seed-demo-btn");
  const wipeBtn = document.getElementById("wipe-data-btn");

  const currentRole = getRole();
  if (currentRole === "Investor" && investorRadio) {
    investorRadio.checked = true;
  } else if (founderRadio) {
    founderRadio.checked = true;
  }

  function updateRoleUI() {
    const options = document.querySelectorAll(".role-option");
    options.forEach((opt) => opt.classList.remove("role-selected"));

    if (founderRadio?.checked) {
      founderRadio.parentElement.classList.add("role-selected");
    }
    if (investorRadio?.checked) {
      investorRadio.parentElement.classList.add("role-selected");
    }
  }

  if (founderRadio) {
    founderRadio.addEventListener("change", () => {
      if (founderRadio.checked) {
        saveRole("Founder");
        updateRoleUI();
      }
    });
  }

  if (investorRadio) {
    investorRadio.addEventListener("change", () => {
      if (investorRadio.checked) {
        saveRole("Investor");
        updateRoleUI();
      }
    });
  }

  updateRoleUI();

  if (seedBtn) {
    seedBtn.addEventListener("click", () => {
      const demo = getDemoPitches();
      savePitches(demo);
      alert("Demo pitches have been seeded in this browser.");
    });
  }

  if (wipeBtn) {
    wipeBtn.addEventListener("click", () => {
      const ok = confirm(
        "This will remove all locally saved pitches in this browser. Continue?"
      );
      if (!ok) return;
      savePitches([]);
      alert("All local pitches wiped.");
    });
  }
}

// ----------- bootstrap based on page ------------

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;

  if (page === "feed") {
    setupFeedPage();
  } else if (page === "new") {
    setupNewPitchPage();
  } else if (page === "settings") {
    setupSettingsPage();
  }
});
