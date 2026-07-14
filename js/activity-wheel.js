(function () {
  const ACTIVITY_SOURCES = [
    ["Open Pack", "10 AP per pack"],
    ["Build Factory", "3 AP"],
    ["Upgrade Factory", "5 AP"],
    ["Maintenance", "1 AP per factory, max 10 AP/day"],
    ["Crate Open", "2 AP per crate, max 8 AP/day"],
    ["Local Empire Operation", "3 AP"],
    ["Regional Empire Operation", "7 AP"],
    ["Imperial Empire Operation", "12 AP"],
    ["Standard Fulfillment", "5 AP"],
    ["Bulk Fulfillment", "10 AP"],
    ["Grand Fulfillment", "15 AP"],
    ["Rat Cleanup up to Orderly", "5 AP"],
    ["Rat Cleanup Cluttered / Infested", "8 AP"],
    ["Hire Manager", "10 AP"],
    ["Accept Management Deal", "15 AP"],
    ["Foundry Craft", "25 AP"],
    ["Claim Daily Goods", "3 AP/day"],
    ["Redeem Goods", "3 AP/day"],
  ];
  const WHEEL_SEGMENTS = [
    { label: "30 EMP", key: "EMP_30" },
    { label: "50 EMP", key: "EMP_50" },
    { label: "75 EMP", key: "EMP_75" },
    { label: "80 EMP", key: "EMP_80" },
    { label: "100 EMP", key: "EMP_100" },
    { label: "1 SMP", key: "SMP_1" },
    { label: "2 SMP", key: "SMP_2" },
    { label: "150 EMP", key: "EMP_150" },
    { label: "1 Fragment", key: "FRAGMENT_1" },
    { label: "250 EMP", key: "EMP_250" },
    { label: "Genesis Pack", key: "PACK_1" },
  ];

  function drawActivityWheel(rotation = 0) {
    const canvas = document.getElementById("activity-wheel-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 16;

    const colors = [
      "#fef3c7",
      "#fde68a",
      "#bbf7d0",
      "#bfdbfe",
      "#ddd6fe",
      "#fecaca",
      "#cffafe",
      "#fed7aa",
      "#e9d5ff",
      "#fef08a",
      "#dcfce7",
    ];

    ctx.clearRect(0, 0, size, size);

    const slice = (Math.PI * 2) / WHEEL_SEGMENTS.length;

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(rotation);

    for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
      const start = i * slice;
      const end = start + slice;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.save();
      ctx.rotate(start + slice / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#111827";
      ctx.font = "900 22px Arial";
      ctx.fillText(WHEEL_SEGMENTS[i].label, radius - 24, 8);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.restore();
  }
  let currentWheelRotation = 0;
  let isWheelSpinning = false;

  function getWheelKeyFromReward(reward) {
    const type = String(reward?.reward_type || "").toUpperCase();
    const amount = Number(reward?.reward_amount || 0);

    if (type === "EMP") return `EMP_${amount}`;
    if (type === "SMP") return `SMP_${amount}`;
    if (type === "IMPERIAL_FRAGMENT") return "FRAGMENT_1";
    if (type === "GENESIS_PACK") return "PACK_1";

    return "";
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  let activityWheelAudioCtx = null;
  let activityWheelTickTimer = null;
  let activityWheelTickStopped = false;
  let activityWheelTickStartedAt = 0;

  function getActivityWheelAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return null;

    if (!activityWheelAudioCtx) {
      activityWheelAudioCtx = new AudioContext();
    }

    if (activityWheelAudioCtx.state === "suspended") {
      activityWheelAudioCtx.resume();
    }

    return activityWheelAudioCtx;
  }

  function playOneActivityWheelTick(volume = 0.22) {
    try {
      const ctx = getActivityWheelAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "square";

      oscillator.frequency.setValueAtTime(850, now);
      oscillator.frequency.exponentialRampToValueAtTime(420, now + 0.045);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + 0.055);
    } catch (err) {
      console.warn("Activity Wheel tick failed:", err);
    }
  }

  function startActivityWheelTickSound() {
    stopActivityWheelTickSound();

    activityWheelTickStopped = false;
    activityWheelTickStartedAt = performance.now();

    function tickLoop() {
      if (activityWheelTickStopped) return;

      const elapsed = performance.now() - activityWheelTickStartedAt;
      const progress = Math.min(elapsed / 5200, 1);

      // Starts fast, then slows down like a real wheel.
      const nextDelay = 38 + progress * 150;
      const volume = 0.24 - progress * 0.06;

      playOneActivityWheelTick(volume);

      activityWheelTickTimer = setTimeout(tickLoop, nextDelay);
    }

    tickLoop();
  }

  function stopActivityWheelTickSound() {
    activityWheelTickStopped = true;

    if (activityWheelTickTimer) {
      clearTimeout(activityWheelTickTimer);
      activityWheelTickTimer = null;
    }
  }
  function animateWheelToReward(reward) {
    return new Promise((resolve) => {
      const rewardKey = getWheelKeyFromReward(reward);
      const index = WHEEL_SEGMENTS.findIndex((item) => item.key === rewardKey);

      if (index < 0) {
        resolve();
        return;
      }

      const TWO_PI = Math.PI * 2;
      const slice = TWO_PI / WHEEL_SEGMENTS.length;

      // Pointer is visually at top of wheel
      const pointerAngle = Math.PI * 1.5;

      // Center angle of selected reward segment before rotation
      const segmentCenter = index * slice + slice / 2;

      // Normalize current wheel position
      const normalizedCurrent =
        ((currentWheelRotation % TWO_PI) + TWO_PI) % TWO_PI;

      // Absolute target rotation needed so selected segment center reaches pointer
      const targetBase =
        (((pointerAngle - segmentCenter) % TWO_PI) + TWO_PI) % TWO_PI;

      // Move forward from current position to target position
      const deltaToTarget =
        (((targetBase - normalizedCurrent) % TWO_PI) + TWO_PI) % TWO_PI;

      // Add full spins for animation drama
      const extraSpins = 6 * TWO_PI;

      const startRotation = currentWheelRotation;
      const finalRotation = startRotation + extraSpins + deltaToTarget;

      const duration = 4200;
      const startTime = performance.now();

      isWheelSpinning = true;

      function frame(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = easeOutCubic(progress);

        currentWheelRotation =
          startRotation + (finalRotation - startRotation) * eased;

        drawActivityWheel(currentWheelRotation);

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          currentWheelRotation = ((finalRotation % TWO_PI) + TWO_PI) % TWO_PI;

          drawActivityWheel(currentWheelRotation);
          isWheelSpinning = false;
          resolve();
        }
      }

      requestAnimationFrame(frame);
    });
  }
  let activityWheelPreSpinFrame = null;

  function startActivityWheelPreSpin() {
    stopActivityWheelPreSpin();

    let lastTime = performance.now();
    isWheelSpinning = true;

    function frame(now) {
      const delta = now - lastTime;
      lastTime = now;

      // Immediate fast movement while backend is preparing reward.
      currentWheelRotation += delta * 0.014;
      drawActivityWheel(currentWheelRotation);

      activityWheelPreSpinFrame = requestAnimationFrame(frame);
    }

    activityWheelPreSpinFrame = requestAnimationFrame(frame);
  }

  function stopActivityWheelPreSpin() {
    if (activityWheelPreSpinFrame) {
      cancelAnimationFrame(activityWheelPreSpinFrame);
      activityWheelPreSpinFrame = null;
    }
  }
  function getLoggedInUserSafe() {
    return (
      localStorage.getItem("hiveUsername") ||
      localStorage.getItem("mde_username") ||
      localStorage.getItem("username") ||
      ""
    )
      .trim()
      .replace("@", "")
      .toLowerCase();
  }

  function getViewedUsername() {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("user") ||
      params.get("view") ||
      getLoggedInUserSafe() ||
      ""
    )
      .trim()
      .replace("@", "")
      .toLowerCase();
  }

  function getApiBase() {
    const host = window.location.hostname;

    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:10000";
    }

    return "https://mydempire-backend-1.onrender.com";
  }
  function formatActivityWheelLocalTime(value) {
    if (!value) return "--";

    let raw = String(value).trim();

    // Convert database timestamp to safe ISO format.
    raw = raw.replace(" ", "T");

    // If backend timestamp has no timezone, treat it as UTC.
    if (!raw.endsWith("Z") && !/[+-]\d{2}:?\d{0,2}$/.test(raw)) {
      raw += "Z";
    }

    // Convert "+00" to "+00:00" for browser safety.
    raw = raw.replace(/([+-]\d{2})$/, "$1:00");

    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) return "--";

    // Show in player's own browser/device local time.
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderActivitySources() {
    const list = document.getElementById("activity-source-list");
    if (!list) return;

    list.innerHTML = ACTIVITY_SOURCES.map(
      ([name, ap]) => `
        <div class="activity-source-row">
          <span>${name}</span>
          <span>${ap}</span>
        </div>
      `,
    ).join("");
  }
  function fixActivityBottomLayout() {
    const sourceCard = document.getElementById("activity-source-card");
    const historyCard = document.getElementById("activity-history-card");
    const spinCard = document.getElementById("activity-spin-card");

    const sourceList = document.getElementById("activity-source-list");
    const historyList = document.getElementById("activity-history-list");
    const spinList = document.getElementById("activity-spin-history-list");

    if (
      !sourceCard ||
      !historyCard ||
      !spinCard ||
      !sourceList ||
      !historyList ||
      !spinList
    ) {
      return;
    }

    // 1st card stays natural, no scroll.
    sourceCard.style.setProperty("height", "auto", "important");
    sourceCard.style.setProperty("overflow", "visible", "important");
    sourceList.style.setProperty("height", "auto", "important");
    sourceList.style.setProperty("max-height", "none", "important");
    sourceList.style.setProperty("overflow", "visible", "important");

    // Match AP + Spins list height to Activity Sources list height.
    const sourceListHeight = Math.ceil(
      sourceList.getBoundingClientRect().height,
    );

    [historyCard, spinCard].forEach((card) => {
      card.style.setProperty("height", "auto", "important");
      card.style.setProperty("overflow", "visible", "important");
      card.style.setProperty("display", "block", "important");
    });

    [historyList, spinList].forEach((list) => {
      list.style.setProperty("height", `${sourceListHeight}px`, "important");
      list.style.setProperty(
        "max-height",
        `${sourceListHeight}px`,
        "important",
      );
      list.style.setProperty("overflow-y", "auto", "important");
      list.style.setProperty("padding-right", "6px", "important");
    });
  }
  function renderRewardPool(rewards) {
    const box = document.getElementById("activity-reward-pool");
    if (!box) return;

    if (!Array.isArray(rewards) || rewards.length === 0) {
      box.innerHTML = `<div class="activity-empty">Reward table unavailable.</div>`;
      return;
    }

    const rewardColorMap = {
      "30 EMP": { bg: "#f3e8a6", border: "#e7d86a" },
      "50 EMP": { bg: "#f6df7b", border: "#e6c84f" },
      "75 EMP": { bg: "#b9e8c8", border: "#8fd3a8" },
      "80 EMP": { bg: "#bcd3f2", border: "#8fb2e6" },
      "100 EMP": { bg: "#d6cef2", border: "#b8a8e8" },
      "1 SMP": { bg: "#f2c7c7", border: "#e3a8a8" },
      "2 SMP": { bg: "#bfe5ea", border: "#97d1d8" },
      "150 EMP": { bg: "#f2d1a3", border: "#e5b97e" },
      "1 Fragment": { bg: "#d9c9ee", border: "#bfa7df" },
      "1 IMPERIAL FRAGMENT": { bg: "#d9c9ee", border: "#bfa7df" },

      "250 EMP": { bg: "#efe587", border: "#dfd05d" },

      "1 Genesis Pack": { bg: "#ccebd6", border: "#a4d7b5" },
      "1 GENESIS PACK": { bg: "#ccebd6", border: "#a4d7b5" },
    };

    box.innerHTML = rewards
      .map((reward) => {
        const label =
          reward.reward_label ||
          `${Number(reward.reward_amount || 0)} ${String(
            reward.reward_type || "REWARD",
          ).replaceAll("_", " ")}`;

        const colors = rewardColorMap[label] || {
          bg: "#f8fafc",
          border: "#dbeafe",
        };

        return `
        <div
          class="activity-reward-card"
          style="
            background: ${colors.bg};
            border: 1px solid ${colors.border};
            border-radius: 18px;
            padding: 14px 12px;
            text-align: center;
            box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
          "
        >
          <div
            style="
              font-size: 18px;
              font-weight: 950;
              color: #0f172a;
              line-height: 1.15;
            "
          >
            ${label}
          </div>
          <div
            style="
              margin-top: 10px;
              font-size: 15px;
              font-weight: 900;
              color: #7c3aed;
            "
          >
            ${reward.chance}%
          </div>
        </div>
      `;
      })
      .join("");
  }

  function renderActivityHistory(items) {
    const box = document.getElementById("activity-history-list");
    if (!box) return;

    if (!Array.isArray(items) || items.length === 0) {
      box.innerHTML = `<div class="activity-empty">No AP activity yet.</div>`;
      return;
    }

    box.innerHTML = items
      .map((item) => {
        const type = String(item.activity_type || "ACTIVITY").replaceAll(
          "_",
          " ",
        );
        const points = Number(item.points || 0);
        const note = item.note || "";
        const createdAt = item.created_at
          ? new Date(
              String(item.created_at)
                .trim()
                .replace(" ", "T")
                .replace(/([+-]\d{2})$/, "$1:00"),
            ).toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        console.log("Spin time check:", item.created_at, "=>", createdAt);
        return `
          <div class="activity-history-row">
            <div>
              <strong>${type}</strong>
              <div>${note}</div>
              <small>${createdAt}</small>
            </div>
            <span>+${points} AP</span>
          </div>
        `;
      })
      .join("");
  }

  function renderSpinHistory(items) {
    const box = document.getElementById("activity-spin-history-list");
    if (!box) return;

    if (!Array.isArray(items) || items.length === 0) {
      box.innerHTML = `<div class="activity-empty">No spins yet.</div>`;
      return;
    }

    box.innerHTML = items
      .map((item) => {
        const type = String(item.reward_type || "REWARD").replaceAll("_", " ");
        const amount = Number(item.reward_amount || 0);
        const label = item.reward_label || `${amount} ${type}`;

        const createdAt = item.created_at
          ? formatActivityWheelLocalTime(item.created_at)
          : "";

        return `
        <div class="activity-history-row">
          <div>
            <strong>${label}</strong>
            <small>${createdAt}</small>
          </div>
          
        </div>
      `;
      })
      .join("");
  }
  function renderSpinButton(data) {
    const btn = document.getElementById("activity-spin-btn");
    const resultBox = document.getElementById("activity-spin-result");

    if (!btn) return;

    const availableSpins = Number(data?.availableSpins || 0);

    btn.disabled = availableSpins <= 0;
    btn.style.opacity = availableSpins > 0 ? "1" : "0.55";
    btn.style.cursor = availableSpins > 0 ? "pointer" : "not-allowed";

    if (resultBox && availableSpins > 0) {
      resultBox.textContent = `You have ${availableSpins} spin available.`;
    }

    if (resultBox && availableSpins <= 0) {
      resultBox.textContent = "Collect 50 AP to unlock one reward spin.";
    }
  }
  function forceResetActivityWheelButton() {
    const spinBtn = document.getElementById("activity-spin-btn");
    const availableSpinsText = document.getElementById(
      "activity-available-spins",
    );

    if (!spinBtn) return;

    const availableSpins = Number(
      String(availableSpinsText?.textContent || "0").replace(/[^\d]/g, ""),
    );

    if (availableSpins > 0) {
      spinBtn.disabled = false;
      spinBtn.style.opacity = "1";
      spinBtn.style.cursor = "pointer";
      spinBtn.textContent = "🎡 Spin Wheel";
    } else {
      spinBtn.disabled = true;
      spinBtn.style.opacity = "0.55";
      spinBtn.style.cursor = "not-allowed";
      spinBtn.textContent = "🎡 Spin Wheel";
    }
  }
  async function announceActivityWheelSpinAfterStop(username, spinId) {
    if (!spinId) return;

    const actor = getLoggedInUserSafe();
    const apiBase = getApiBase();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(
        `${apiBase}/player/${encodeURIComponent(username)}/activity-wheel/announce`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mde-actor": actor,
          },
          body: JSON.stringify({
            spinId,
          }),
          signal: controller.signal,
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        console.warn("Activity Wheel Discord announce failed:", data);
      }
    } catch (err) {
      console.warn("Activity Wheel Discord announce skipped:", err.message);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  function isActivityWheelRareReward(reward) {
    const type = String(reward?.reward_type || "").toUpperCase();
    const amount = Number(reward?.reward_amount || 0);

    return (
      type === "IMPERIAL_FRAGMENT" ||
      type === "GENESIS_PACK" ||
      (type === "EMP" && amount >= 250)
    );
  }

  function showActivityWheelRareCelebration(rewardLabel) {
    const oldCelebration = document.getElementById(
      "activity-wheel-celebration",
    );

    if (oldCelebration) {
      oldCelebration.remove();
    }

    const overlay = document.createElement("div");
    overlay.id = "activity-wheel-celebration";
    overlay.className = "activity-wheel-celebration";

    const card = document.createElement("div");
    card.className = "activity-wheel-celebration-card";

    const emoji = document.createElement("div");
    emoji.className = "activity-wheel-celebration-emoji";
    emoji.textContent = "🎉";

    const title = document.createElement("div");
    title.className = "activity-wheel-celebration-title";
    title.textContent = "Rare Reward Hit!";

    const reward = document.createElement("div");
    reward.className = "activity-wheel-celebration-reward";
    reward.textContent = rewardLabel || "Jackpot Reward";

    const note = document.createElement("div");
    note.className = "activity-wheel-celebration-note";
    note.textContent =
      "Your empire activity paid off — click anywhere to close.";

    card.appendChild(emoji);
    card.appendChild(title);
    card.appendChild(reward);
    card.appendChild(note);
    overlay.appendChild(card);

    const colors = [
      "#f59e0b",
      "#7c3aed",
      "#22c55e",
      "#ef4444",
      "#06b6d4",
      "#facc15",
    ];

    for (let i = 0; i < 70; i++) {
      const piece = document.createElement("div");
      piece.className = "activity-wheel-confetti";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.45}s`;
      piece.style.animationDuration = `${2.2 + Math.random() * 1.4}s`;
      overlay.appendChild(piece);
    }

    overlay.addEventListener("click", () => {
      overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  async function spinActivityWheelFromPage() {
    if (isWheelSpinning) return;

    const username = getViewedUsername();
    const actor = getLoggedInUserSafe();
    const apiBase = getApiBase();

    const spinBtn = document.getElementById("activity-spin-btn");
    const resultBox = document.getElementById("activity-spin-result");

    if (!username) {
      if (resultBox) {
        resultBox.textContent = "Please login first.";
      }
      return;
    }

    if (!actor || actor.toLowerCase() !== username.toLowerCase()) {
      if (resultBox) {
        resultBox.textContent = "Visitor mode: only your own account can spin.";
      }
      return;
    }

    try {
      if (spinBtn) {
        spinBtn.disabled = true;
        spinBtn.style.opacity = "0.55";
        spinBtn.style.cursor = "not-allowed";
        spinBtn.textContent = "🎡 Spinning...";
      }

      if (resultBox) {
        resultBox.textContent = "🎡 Wheel is spinning...";
      }

      // Start visual + sound immediately, before waiting for backend.
      startActivityWheelPreSpin();
      startActivityWheelTickSound();

      const response = await fetch(
        `${apiBase}/player/${encodeURIComponent(username)}/activity-wheel/spin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mde-actor": actor,
          },
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        stopActivityWheelPreSpin();
        stopActivityWheelTickSound();
        isWheelSpinning = false;

        if (resultBox) {
          resultBox.textContent = data.error || "Activity Wheel spin failed.";
        }

        await loadActivityWheelState();
        const resultBoxAfterRefresh = document.getElementById(
          "activity-spin-result",
        );
        if (resultBoxAfterRefresh && rewardLabel) {
          resultBoxAfterRefresh.textContent = `🎉 You won ${rewardLabel}!`;
          resultBoxAfterRefresh.style.color = "#6d28d9";
          resultBoxAfterRefresh.style.borderColor = "#a78bfa";
        }
        return;
      }

      const reward = data.reward || data.spin;

      const rewardLabel =
        data.reward?.reward_label ||
        data.spin?.reward_label ||
        "Activity Wheel reward";

      // Stop fast waiting spin, then finish neatly on backend reward.
      stopActivityWheelPreSpin();

      await animateWheelToReward(reward);

      stopActivityWheelTickSound();

      if (resultBox) {
        resultBox.textContent = `🎉 You won ${rewardLabel}!`;
      }
      if (isActivityWheelRareReward(reward)) {
        showActivityWheelRareCelebration(rewardLabel);
      }

      // Reset button immediately after wheel stops.
      isWheelSpinning = false;

      if (spinBtn) {
        spinBtn.textContent = "🎡 Spin Wheel";
        spinBtn.disabled = false;
        spinBtn.style.opacity = "1";
        spinBtn.style.cursor = "pointer";
      }

      // Now refresh AP/spin count.
      await loadActivityWheelState();

      // Discord runs silently after wheel result. It should not block button reset.
      announceActivityWheelSpinAfterStop(username, data.spin?.id);
    } catch (err) {
      console.error("Activity Wheel spin error:", err);

      stopActivityWheelPreSpin();
      stopActivityWheelTickSound();
      isWheelSpinning = false;

      if (resultBox) {
        resultBox.textContent = "Activity Wheel spin failed.";
      }

      await loadActivityWheelState();
      isWheelSpinning = false;
      forceResetActivityWheelButton();
    }
  }
  async function loadActivityWheelState() {
    const username = getViewedUsername();

    const currentApEl = document.getElementById("activity-current-ap");
    const spinsEl = document.getElementById("activity-available-spins");
    const statusEl = document.getElementById("activity-status-text");

    if (!username) {
      if (statusEl) statusEl.textContent = "Please connect wallet first.";
      return;
    }

    try {
      if (statusEl) statusEl.textContent = "Loading real AP state...";

      const apiBase = getApiBase();
      const res = await fetch(
        `${apiBase}/player/${encodeURIComponent(username)}/activity-wheel`,
      );

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load Activity Wheel.");
      }

      if (currentApEl)
        currentApEl.textContent = `${Number(data.currentAP || 0)} AP`;
      if (spinsEl) spinsEl.textContent = Number(data.availableSpins || 0);
      renderSpinButton(data);

      renderRewardPool(data.rewards);
      renderActivityHistory(data.recentActivity);
      renderSpinHistory(data.recentSpins);

      setTimeout(fixActivityBottomLayout, 80);

      if (statusEl) statusEl.textContent = "Connected";
    } catch (err) {
      console.error("Activity Wheel load failed:", err);
      if (statusEl)
        statusEl.textContent = "Failed to load Activity Wheel data.";
    }
  }
  window.loadActivityWheelState = loadActivityWheelState;
  document.addEventListener("DOMContentLoaded", function () {
    drawActivityWheel();
    renderActivitySources();
    setTimeout(fixActivityBottomLayout, 120);

    loadActivityWheelState();

    const spinBtn = document.getElementById("activity-spin-btn");

    if (spinBtn) {
      spinBtn.addEventListener("click", spinActivityWheelFromPage);
    }
  });
})();
