// ===== BLUEPRINT PREVIEW LOGIC (LOCKED DESIGN) =====

// Industry → image + label
const BP_INDUSTRIES = {
  pharma:      { name: "PHARMA",      img: "assets/pharma-building.png" },
  food:        { name: "FOOD",        img: "assets/food-building.png" },
  textile:     { name: "TEXTILE",     img: "assets/textile-building.png" },
  chemical:    { name: "CHEMICAL",    img: "assets/chemical-building.png" },
  supermarket: { name: "SUPERMARKET", img: "assets/supermarket-building.png" }
};

// Level → colour variable
const BP_LEVEL_COLORS = {
  1: "--b1-color",
  2: "--b2-color",
  3: "--b3-color",
  4: "--b4-color",
  5: "--b5-color"
};

let bpCurrentIndustry = "pharma";
let bpCurrentLevel = 1;

function bpUpdateAccent() {
  const root = document.documentElement;
  const colorVar = BP_LEVEL_COLORS[bpCurrentLevel];
  const accent = getComputedStyle(root).getPropertyValue(colorVar).trim() || "#b0bec5";
  root.style.setProperty("--bp-accent", accent);
}

function bpUpdateProductionFormula() {
  // Level multiplier: 1 + 0.25 * (level - 1)
  const levelMult = 1 + 0.25 * (bpCurrentLevel - 1);
  let levelText = levelMult.toFixed(2).replace(/\.00$/, ""); // 1.00 -> 1

  const formula = `10 × Land × ${levelText}`;
  const formulaEl = document.getElementById("bp-production-text");
  if (formulaEl) formulaEl.textContent = formula;
}

function bpSetLevel(level) {
  bpCurrentLevel = Number(level);
  bpUpdateAccent();
  bpUpdateProductionFormula();

  const badge = document.getElementById("bp-badge-text");
  if (badge) badge.textContent = "B" + bpCurrentLevel;

  document.querySelectorAll("[data-level]").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.level) === bpCurrentLevel);
  });
}

function bpSetIndustry(ind) {
  bpCurrentIndustry = ind;

  const data = BP_INDUSTRIES[ind];
  const labelEl = document.getElementById("bp-industry-short");
  const imgEl = document.getElementById("bp-building-img");

  if (labelEl) labelEl.textContent = data.name;
  if (imgEl) imgEl.src = data.img;

  document.querySelectorAll("[data-ind]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.ind === bpCurrentIndustry);
  });
}

// Init only when dashboard has blueprint preview
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("blueprint-preview")) return;

  // Wire up buttons
  document.querySelectorAll("[data-level]").forEach(btn => {
    btn.addEventListener("click", () => bpSetLevel(btn.dataset.level));
  });

  document.querySelectorAll("[data-ind]").forEach(btn => {
    btn.addEventListener("click", () => bpSetIndustry(btn.dataset.ind));
  });

  // Initial state
  bpSetIndustry("pharma");
  bpSetLevel(1);
});