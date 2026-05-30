(function () {
  const API_BASE = "https://mydempire-backend-1.onrender.com";

  function getLoggedInUser() {
    return (
      localStorage.getItem("hiveUsername") ||
      localStorage.getItem("mde_username") ||
      ""
    );
  }

  function getEls() {
    return {
      bell: document.getElementById("notification-bell-btn"),
      count: document.getElementById("notification-count"),
      panel: document.getElementById("notification-panel"),
      list: document.getElementById("notification-list"),
    };
  }

  async function loadNotifications() {
    const username = getLoggedInUser();
    const { bell, count, list } = getEls();

    if (!username || !bell || !count || !list) return;

    try {
      const res = await fetch(`${API_BASE}/player/${username}/notifications`);
      const data = await res.json();

      if (!data.success) return;

      const unread = Number(data.unreadCount || 0);
      const notifications = data.notifications || [];

      count.textContent = unread;
      count.style.background = unread > 0 ? "#ef4444" : "#22c55e";

      if (!notifications.length) {
        list.innerHTML = `<div class="notification-item">No notifications yet.</div>`;
        return;
      }

      list.innerHTML = notifications
        .map((n) => {
          return `
            <div
              class="notification-item ${n.is_read ? "" : "unread"}"
              data-notification-id="${n.id}"
            >
              <div class="notification-title">${n.title || "Notification"}</div>
              <div class="notification-message">${n.message || ""}</div>
              <div class="notification-time">
                ${new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          `;
        })
        .join("");
    } catch (err) {
      console.error("Notification load failed:", err);
    }
  }

  async function markUnreadAsRead() {
    const username = getLoggedInUser();
    if (!username) return;

    const unreadItems = document.querySelectorAll(".notification-item.unread");

    for (const item of unreadItems) {
      const id = item.getAttribute("data-notification-id");
      if (!id) continue;

      try {
        await fetch(`${API_BASE}/player/${username}/notifications/${id}/read`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mde-actor": username,
            "x-player-actor": username,
          },
          body: JSON.stringify({ username }),
        });

        item.classList.remove("unread");
      } catch (err) {
        console.error("Notification read failed:", err);
      }
    }

    const { count } = getEls();
    if (count) {
      count.textContent = "0";
      count.style.background = "#22c55e";
    }
  }

  function setupNotificationBell() {
    const { bell, panel } = getEls();

    if (!bell || !panel) return;

    if (bell.dataset.ready === "true") return;
    bell.dataset.ready = "true";

    bell.addEventListener("click", async function (e) {
      e.preventDefault();
      e.stopPropagation();

      const isOpen = panel.style.display === "block";
      panel.style.display = isOpen ? "none" : "block";

      if (!isOpen) {
        await markUnreadAsRead();
      }
    });

    panel.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    document.addEventListener("click", function () {
      panel.style.display = "none";
    });
  }

  function initNotifications() {
    setupNotificationBell();
    loadNotifications();

    setInterval(loadNotifications, 60000);
  }

  window.addEventListener("load", initNotifications);
})();
