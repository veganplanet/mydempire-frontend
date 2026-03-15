require("dotenv").config();
const { calculateProduction } = require("./engine/production");
const GAME_PHASE = process.env.GAME_PHASE || "GENESIS";
console.log("🚀 SERVER BOOT PHASE:", GAME_PHASE);

const express = require("express");
const sendDiscordWebhook = require("./services/discordWebhook");
const { getGenesisStatus } = require("./services/genesisService");
const cors = require("cors");
const dhive = require("@hiveio/dhive");
const { body, validationResult } = require("express-validator");
const pool = require("./db");

const { startScheduler } = require("./cron/scheduler");
const { SPLIT } = require("./config/economy.config");
const { isShadow } = require("./config/gameMode");
const fetch = require("node-fetch");
const { calculateFactoryEP } = require("./engine/ep.engine");
const initDatabase = require("./db/init");
console.log("MYDEMPIRE LOCAL SERVER TEST 777");

function normalizeTier(t) {
  return (t || "").toString().trim().toUpperCase();
}

function buildDaysForBlueprintTier(tier) {
  const t = normalizeTier(tier);
  if (t === "B1") return 1;
  if (t === "B2") return 2;
  if (t === "B3") return 3;
  if (t === "B4") return 4;
  if (t === "B5") return 5;
  return 1; // safe default
}

function getLandSlotLimit(landTier) {
  const t = String(landTier || "").trim().toUpperCase();
  if (t === "L3") return 3;
  if (t === "L2") return 2;
  return 1;
}

function getBuildEmpCostByLandTier(landTier) {
  const t = String(landTier || "").trim().toUpperCase();
  if (t === "L3") return 150;
  if (t === "L2") return 80;
  return 40;
}

function parseBlueprintTier(rawTier) {
  const tier = String(rawTier || "").trim().toUpperCase();

  if (tier.includes("_")) {
    const parts = tier.split("_");
    return {
      industry: parts[0] || null,
      level: parts[1] || null,
      raw: tier
    };
  }

  if (/^B[1-5]$/.test(tier)) {
    return {
      industry: "UNKNOWN",
      level: tier,
      raw: tier
    };
  }

  return {
    industry: null,
    level: null,
    raw: tier
  };
}

function getBlueprintLevelNumber(rawTier) {
  const parsed = parseBlueprintTier(rawTier);
  const level = String(parsed.level || "").toUpperCase();
  const num = parseInt(level.replace(/[^0-9]/g, ""), 10);
  return Number.isInteger(num) ? num : null;
}

function buildBlueprintTierFromIndustryAndLevel(industry, levelNumber) {
  const cleanIndustry = String(industry || "").trim().toUpperCase();
  const lvl = parseInt(levelNumber, 10);

  if (!cleanIndustry || !Number.isInteger(lvl) || lvl < 1 || lvl > 5) {
    return null;
  }

  return `${cleanIndustry}_B${lvl}`;
}

function getUpgradeCapByLandTier(landTier) {
  const t = String(landTier || "").trim().toUpperCase();

  if (t === "L1") return 3; // can upgrade only up to B3
  if (t === "L2") return 4; // can upgrade only up to B4
  if (t === "L3") return 5; // can upgrade up to B5
  return 1;
}

function getUpgradeEmpCost(currentLevel) {
  const lvl = parseInt(currentLevel, 10) || 1;

  if (lvl === 1) return 50;   // B1 -> B2
  if (lvl === 2) return 100;  // B2 -> B3
  if (lvl === 3) return 200;  // B3 -> B4
  if (lvl === 4) return 400;  // B4 -> B5

  return 0;
}

function getUpgradeDaysForLevel(currentLevel) {
  const lvl = parseInt(currentLevel, 10) || 1;

  if (lvl === 1) return 1;
  if (lvl === 2) return 2;
  if (lvl === 3) return 3;
  if (lvl === 4) return 4;

  return 0;
}

function getRequiredActiveDaysForUpgrade(currentLevel) {
  const lvl = parseInt(currentLevel, 10) || 1;

  if (lvl === 1) return 30;   // B1 -> B2
  if (lvl === 2) return 60;   // B2 -> B3
  if (lvl === 3) return 120;  // B3 -> B4
  if (lvl === 4) return 240;  // B4 -> B5

  return 999999;
}

// ============================
// 🛒 MARKETPLACE HELPERS
// ============================

function normalizeUsername(u) {
  return String(u || "").trim().replace("@", "").toLowerCase();
}

function roundHive(num) {
  return Number(Number(num || 0).toFixed(8));
}

function getEmpMarketFloorPricePerEmp() {
  // 1 HIVE = 100 EMP
  // 1 EMP = 0.01 HIVE
  // floor = 75% of base = 0.0075 HIVE
  return 0.0075;
}

function getMarketplaceFeePercent(assetType) {
  const type = String(assetType || "").trim().toUpperCase();
  if (type === "EMP") return 3;
  return 5;
}

async function findMatchingHiveTransfer({
  from,
  to,
  amountHive,
  memo,
  limit = 200
}) {
  const account = normalizeUsername(from);

  const history = await client.database.call(
    "get_account_history",
    [account, -1, limit]
  );

  const expectedAmount = Number(amountHive).toFixed(3) + " HIVE";
  const expectedTo = normalizeUsername(to);
  const expectedMemo = String(memo || "").trim();

  for (const row of history) {
    const op = row?.[1]?.op;
    if (!op || op[0] !== "transfer") continue;

    const data = op[1] || {};
    const opFrom = normalizeUsername(data.from);
    const opTo = normalizeUsername(data.to);
    const opAmount = String(data.amount || "").trim();
    const opMemo = String(data.memo || "").trim();

    if (
      opFrom === account &&
      opTo === expectedTo &&
      opAmount === expectedAmount &&
      opMemo === expectedMemo
    ) {
      return {
        found: true,
        transfer: data,
        block: row?.[1]?.block,
        trx_id: row?.[1]?.trx_id || null
      };
    }
  }

  return { found: false };
}

// ============================
// 🏛 GENESIS SALE CONFIG
// ============================

const GENESIS_FOUNDER_CAP = 5000;
const GENESIS_EXPANSION_CAP = 15000; // 5000 founder + 10000 expansion

const FOUNDER_WALLET_CAP = 50;
const FOUNDER_TX_CAP = 10;

// Helper: sold count in Genesis
function getGenesisBucket(totalSold) {
  if (totalSold < GENESIS_FOUNDER_CAP) {
    return "FOUNDER";
  }
  if (totalSold < GENESIS_EXPANSION_CAP) {
    return "EXPANSION";
  }
  return "SOLD_OUT";
}
// ============================
// 📦 PACK PRICE HELPER
// ============================
//
// For now, both PRE_GENESIS and GENESIS use a simple fixed HIVE price.
// Later, we will replace this with the USD ladder logic.
// All pack and blueprint prices will use this function so they stay in sync.
//
function getCurrentPackHivePrice(era, totalGenesisSold = 0) {
  // PRE_GENESIS stays locked at 3 HIVE
  if (era === "PRE_GENESIS") {
    return 3;
  }

  // GENESIS pricing is being upgraded in phases.
  // For safety, we keep live payment fixed at 3 HIVE for now,
  // so Founder/Expansion structure can be implemented first
  // without breaking checkout flow.
  const bucket = getGenesisBucket(totalGenesisSold);

  if (bucket === "FOUNDER") {
    return 3;
  }

  if (bucket === "EXPANSION") {
    return 3;
  }

  return 3;
}
// ============================
// 🧮 BLUEPRINT MINT COST (EMP)
// ============================
//
// Uses: 100 EMP = 1 HIVE
// Cost = 50% of current pack price (in HIVE), then * 100.
//
// Example: Pack = 3 HIVE → Blueprint = 1.5 HIVE → 150 EMP.
//
function getBlueprintMintEmpCost(era, totalGenesisSold = 0) {
  const packHivePrice = getCurrentPackHivePrice(era, totalGenesisSold);

  // 50% of pack HIVE price
  const blueprintHivePrice = packHivePrice * 0.5;

  // Convert HIVE → EMP (100 EMP = 1 HIVE)
  const blueprintEmpCost = Math.round(blueprintHivePrice * 100);

  return blueprintEmpCost;
}

// ============================
// 🧾 BLUEPRINT RNG HELPERS
// ============================

function weightedBlueprintLevel() {
  const r = Math.random() * 100;

  if (r < 55) return "B1";
  if (r < 80) return "B2";
  if (r < 94) return "B3";
  if (r < 99) return "B4";
  return "B5";
}

function randomBlueprintIndustry() {
  const industries = [
    "FOOD",
    "TEXTILE",
    "PHARMA",
    "CHEMICAL",
    "SUPERMARKET",
  ];

  return industries[Math.floor(Math.random() * industries.length)];
}

function buildBlueprintTier() {
  const industry = randomBlueprintIndustry();
  const level = weightedBlueprintLevel();
  return `${industry}_${level}`;
}
// ============================
// 📜 WRIT HELPERS
// ============================

async function countEligibleFounderPacksForOrder(orderId, username) {
  const res = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM nfts
    WHERE username = $1
      AND type = 'PACK'
      AND founder_pack = TRUE
      AND writ_eligible = TRUE
      AND era = 'GENESIS'
      AND created_at >= (
        SELECT created_at
        FROM orders
        WHERE id = $2
        LIMIT 1
      )
    `,
    [username, orderId]
  );

  return res.rows[0]?.count || 0;
}
// ============================
// 🎁 PACK BONUS HELPERS
// ============================

function getPackBonusConfig(pack) {
  const bonusGroup = String(pack?.bonus_group || "").trim().toUpperCase();

  // Founder packs: higher relic chance
  if (bonusGroup === "FOUNDER") {
    return {
      relicChance: 0.0025,       // 0.25%
      extraBlueprintChance: 0.05, // 5%
      bonusEmpChance: 0.10        // 10%
    };
  }

  // Expansion packs: reduced relic chance
  return {
    relicChance: 0.001,          // 0.10%
    extraBlueprintChance: 0.05,  // 5%
    bonusEmpChance: 0.10         // 10%
  };
}

function rollBonusEmpAmount() {
  const rolls = [50, 100, 150, 200];
  return rolls[Math.floor(Math.random() * rolls.length)];
}
// ============================
// ⚡ EMP PURCHASE HELPER
// ============================
//
// Locked rule:
// 1 HIVE = 100 EMP
// Only whole HIVE amounts allowed
// Min 1 HIVE, Max 10 HIVE per transaction
//
function getEmpAmountFromHive(hiveAmount) {
  return hiveAmount * 100;
}

// ============================
// TEMP HIVE VERIFICATION (SAFE PLACEHOLDER)
// ============================

async function verifyHiveTransaction(txid, order) {
  console.log("🔍 Verifying transaction:", txid);

  if (GAME_PHASE === "PRE_GENESIS") {
    console.log("PRE_GENESIS mode — skipping chain verification");
    return true;
  }

  // Future real verification for GENESIS phase
  return false;
}

// ============================
// DISCORD — PURCHASE LOG
// ============================

async function sendPurchaseLog(username, packs) {
  if (!process.env.DISCORD_PURCHASE_WEBHOOK) return;

  try {
    const response = await fetch(process.env.DISCORD_PURCHASE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "🏛 Genesis Pack Purchase",
            description: `👤 **${username}** purchased **${packs} pack(s)**`,
            color: 15844367,
            timestamp: new Date().toISOString(),
            footer: {
              text: "MydEmpire • Genesis Phase",
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("❌ Discord Error:", text);
    } else {
      console.log("✅ Discord message sent");
    }
  } catch (err) {
    console.error("❌ Webhook failed:", err);
  }
}

// ============================
// DISCORD — EMPIRE BUILDER LOG
// ============================

async function sendEmpireBuilderLog(username, packs) {
  if (!process.env.DISCORD_EMPIRE_BUILDERS_WEBHOOK) return;
  if (packs < 10) return;

  let title = "";
  let color = 3447003;

  if (packs >= 100) {
    title = "🌟 EMPIRE ARCHITECT";
    color = 15158332;
  } else if (packs >= 50) {
    title = "🔱 GRAND STRATEGIST";
    color = 15844367;
  } else if (packs >= 25) {
    title = "👑 DOMINION FOUNDER";
    color = 10181046;
  } else {
    title = "🏛 EMPIRE BUILDER";
  }

  try {
    await fetch(process.env.DISCORD_EMPIRE_BUILDERS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description:
              `👤 **${username}**\n` +
              `📦 Packs Secured: **${packs}**\n` +
              `🚀 Strategic Expansion Initiated`,
            color,
            timestamp: new Date().toISOString(),
            footer: { text: "MydEmpire • Prestige Channel" },
          },
        ],
      }),
    });

    console.log("🏛 Empire Builder Discord sent");
  } catch (err) {
    console.log("❌ Empire Builder Discord error:", err.message);
  }
}

// ============================
// 🔗 HIVE CONFIG
// ============================

const client = new dhive.Client("https://api.hive.blog");

const REVENUE = "mydempiregain";        // pack sale + blueprint mint
const TREASURY = "mydempire-vault";     // EMP sale + marketplace fee
const REWARD = "mydempire-reward";      // reward payout wallet
const DAO = "mydempire-dao";
const FOUNDER = "mydempire-owner";

const revenueKey = dhive.PrivateKey.fromString(
  process.env.REVENUE_ACTIVE_KEY
);

// ============================
// 🚀 APP INIT
// ============================

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 10000;

// ===============================
// 🛡 LIGHT RATE LIMIT SHIELD
// ===============================

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 3000; // 3 seconds per request
const RATE_LIMIT_PATHS = new Set([
  "/verify-pack",
  "/build-factory",
  "/buy-blueprint",
  "/pay-maintenance",
]);

app.use((req, res, next) => {
  if (!RATE_LIMIT_PATHS.has(req.path)) {
    return next(); // not protected endpoint
  }

  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const now = Date.now();

  const last = rateLimitMap.get(ip) || 0;

  if (now - last < RATE_LIMIT_WINDOW_MS) {
    return res.status(429).json({
      error: "Too many requests. Please wait a moment.",
    });
  }

  rateLimitMap.set(ip, now);
  next();
});

app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url}`);
  next();
});

// ============================
// 🏠 ROOT / HEALTH
// ============================

app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "OK", db_time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/debug-ledger", async (req, res) => {
  const result = await pool.query("SELECT * FROM revenue_ledger");
  res.json(result.rows);
});

// ============================
// ⚡ CREATE EMP ORDER
// ============================

app.post(
  "/create-emp-order",
  [
    body("username").isLength({ min: 3 }),
    body("hive_amount").isInt({ min: 1, max: 10 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: "Invalid EMP order input.",
        });
      }

      const { username, hive_amount } = req.body;

      const cleanUsername = String(username || "")
        .trim()
        .replace("@", "")
        .toLowerCase();

      const hiveAmount = parseInt(hive_amount, 10);

      // Extra safety: whole HIVE only
      if (!Number.isInteger(hiveAmount)) {
        return res.status(400).json({
          success: false,
          error: "Only whole HIVE amounts are allowed.",
        });
      }

      if (hiveAmount < 1 || hiveAmount > 10) {
        return res.status(400).json({
          success: false,
          error: "EMP purchase must be between 1 and 10 HIVE.",
        });
      }

      const empAmount = getEmpAmountFromHive(hiveAmount);

      const result = await pool.query(
        `
        INSERT INTO emp_orders (username, hive_amount, emp_amount, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING *
        `,
        [cleanUsername, hiveAmount, empAmount]
      );

      const order = result.rows[0];

      return res.json({
        success: true,
        order: {
          id: order.id,
          username: order.username,
          hive_amount: order.hive_amount,
          emp_amount: order.emp_amount,
          status: order.status,
        },
        payment: {
  to: TREASURY,
  amount: `${Number(order.hive_amount).toFixed(3)} HIVE`,
  memo: `MDE_EMP_${order.id}`,
},
      });
    } catch (err) {
      console.error("🔥 Create EMP Order Error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to create EMP order.",
      });
    }
  }
);

// ============================
// 🛒 CREATE ORDER
// ============================

app.post(
  "/create-order",
  [body("username").isLength({ min: 3 }), body("packs").isInt({ min: 1 })],
  async (req, res) => {
    console.log("GAME_PHASE inside create-order:", process.env.GAME_PHASE);
    console.log("Incoming body:", req.body);

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: "Invalid input.",
        });
      }

      const { username, packs } = req.body;
      const normalizedUsername = String(username || "").trim().replace("@", "").toLowerCase();

      const soldNowRes = await pool.query(
  `
  SELECT COALESCE(SUM(packs), 0) AS total_sold
  FROM orders
  WHERE status = 'completed'
    AND era = $1
  `,
  [process.env.GAME_PHASE]
);

const totalSoldNow = parseInt(soldNowRes.rows[0].total_sold, 10) || 0;
const HIVE_PRICE_PER_PACK = getCurrentPackHivePrice(process.env.GAME_PHASE, totalSoldNow);
const hive_amount = packs * HIVE_PRICE_PER_PACK;

      // PRE-GENESIS per-wallet cap
      if (process.env.GAME_PHASE === "PRE_GENESIS") {
        const MAX_PRE_GENESIS_PACKS = 10; // per wallet cap

       const walletRes = await pool.query(
  `
  SELECT COALESCE(SUM(packs), 0) AS already_bought
  FROM orders
  WHERE username = $1
  AND era = 'PRE_GENESIS'
  AND status = 'completed'
`,
  [username]
);

const alreadyBought = parseInt(walletRes.rows[0].already_bought) || 0;

if (alreadyBought + packs > MAX_PRE_GENESIS_PACKS) {
  return res.status(400).json({
    success: false,
    error: `PRE-GENESIS cap exceeded. Max ${MAX_PRE_GENESIS_PACKS} packs per wallet. You already have ${alreadyBought}.`,
  });
}
      }

      // GENESIS Founder + Expansion logic
if (process.env.GAME_PHASE === "GENESIS") {
  const soldRes = await pool.query(
    `
    SELECT COALESCE(SUM(packs), 0) AS total_sold
    FROM orders
    WHERE status = 'completed'
      AND era = 'GENESIS'
    `
  );

  const totalSold = parseInt(soldRes.rows[0].total_sold, 10) || 0;
  const bucket = getGenesisBucket(totalSold);

  console.log("GENESIS total sold:", totalSold);
  console.log("GENESIS bucket:", bucket);

  if (bucket === "SOLD_OUT") {
    return res.status(400).json({
      success: false,
      error: "Genesis sale is sold out.",
    });
  }

  const totalRemaining = GENESIS_EXPANSION_CAP - totalSold;

  if (packs > totalRemaining) {
    return res.status(400).json({
      success: false,
      error: `Only ${totalRemaining} Genesis packs remaining.`,
    });
  }

  // Founder rules apply only while current sale bucket is Founder
  if (bucket === "FOUNDER") {
    if (packs > FOUNDER_TX_CAP) {
      return res.status(400).json({
        success: false,
        error: `Founder phase limit: max ${FOUNDER_TX_CAP} packs per transaction.`,
      });
    }

    const walletRes = await pool.query(
      `
      SELECT COALESCE(SUM(packs), 0) AS already_bought
      FROM orders
      WHERE username = $1
        AND era = 'GENESIS'
        AND status = 'completed'
      `,
      [normalizedUsername]
    );

    const alreadyBought = parseInt(walletRes.rows[0].already_bought, 10) || 0;

    if (alreadyBought + packs > FOUNDER_WALLET_CAP) {
      return res.status(400).json({
        success: false,
        error: `Founder phase wallet cap exceeded. Max ${FOUNDER_WALLET_CAP} packs per wallet. You already bought ${alreadyBought}.`,
      });
    }

    // Do not allow one order to cross Founder → Expansion boundary
    const founderRemaining = GENESIS_FOUNDER_CAP - totalSold;

    if (packs > founderRemaining) {
      return res.status(400).json({
        success: false,
        error: `Founder phase has only ${founderRemaining} packs remaining. Please reduce your order.`,
      });
    }
  }
}
      // Create order
      const result = await pool.query(
        `
        INSERT INTO orders (username, packs, hive_amount, status, era)
        VALUES ($1, $2, $3, 'pending', $4)
        RETURNING *
      `,
        [username, packs, hive_amount, process.env.GAME_PHASE]
      );

      res.json({ success: true, order: result.rows[0] });
    } catch (err) {
      console.error("🔥 Create Order Error:", err);
      res.status(500).json({ success: false });
    }
  }
);

// ============================
// ⚡ CONFIRM EMP PAYMENT
// ============================

app.post(
  "/confirm-emp-payment",
  [body("orderId").isInt(), body("txid").isLength({ min: 5 })],
  async (req, res) => {
    const clientConn = await pool.connect();

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: "Invalid EMP confirmation data.",
        });
      }

      const { orderId, txid } = req.body;

      await clientConn.query("BEGIN");

      const orderRes = await clientConn.query(
        `
        SELECT *
        FROM emp_orders
        WHERE id = $1
        FOR UPDATE
        `,
        [orderId]
      );

      if (!orderRes.rows.length) {
        await clientConn.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error: "EMP order not found.",
        });
      }

      const order = orderRes.rows[0];

      if (order.status !== "pending") {
        await clientConn.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "EMP order already processed.",
        });
      }

      // PRE_GENESIS currently skips real verification,
      // same pattern as your existing payment flow
      let isValid = true;

      if (!isValid) {
        await clientConn.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "EMP payment verification failed.",
        });
      }

      await clientConn.query(
        `
        UPDATE emp_orders
        SET status = 'completed',
            txid = $1
        WHERE id = $2
        `,
        [txid, orderId]
      );

      await clientConn.query(
        `
        INSERT INTO emp_balances (username, balance)
        VALUES ($1, 0)
        ON CONFLICT (username) DO NOTHING
        `,
        [order.username]
      );

      await clientConn.query(
        `
        UPDATE emp_balances
        SET balance = balance + $1
        WHERE username = $2
        `,
        [order.emp_amount, order.username]
      );

      await clientConn.query("COMMIT");

      return res.json({
        success: true,
        username: order.username,
        hive_amount: order.hive_amount,
        emp_credited: order.emp_amount,
      });
    } catch (err) {
      await clientConn.query("ROLLBACK");
      console.error("🔥 Confirm EMP Payment Error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to confirm EMP payment.",
      });
    } finally {
      clientConn.release();
    }
  }
);

// ============================
// 💳 CONFIRM PAYMENT
// ============================

app.post(
  "/confirm-payment",
  [body("orderId").isInt(), body("txid").isLength({ min: 5 })],
  async (req, res) => {
    try {
      console.log("➡️ HIT /confirm-payment");
      console.log("Confirm body:", req.body);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: "Invalid confirmation data.",
        });
      }

      const { orderId, txid } = req.body;

      const { rows } = await pool.query(
        "SELECT * FROM orders WHERE id=$1",
        [orderId]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false });
      }

      const order = rows[0];

      if (order.status !== "pending") {
        return res.status(400).json({
          success: false,
          error: "Order already processed.",
        });
      }

      // 🔐 Verification placeholder
      let isValid = true;

      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: "Payment verification failed.",
        });
      }

      // Mark order completed
      await pool.query(
        "UPDATE orders SET status='completed', txid=$1 WHERE id=$2",
        [txid, orderId]
      );

      // Mint packs
      const edition =
        process.env.GAME_PHASE === "PRE_GENESIS" ? "TESTER" : "FOUNDER";

      const era = process.env.GAME_PHASE;

      // Find current Genesis sold count before minting these packs
let totalGenesisSoldBeforeMint = 0;

if (process.env.GAME_PHASE === "GENESIS") {
  const soldRes = await pool.query(
    `
    SELECT COALESCE(SUM(packs), 0) AS total_sold
    FROM orders
    WHERE status = 'completed'
      AND era = 'GENESIS'
      AND id <> $1
    `,
    [orderId]
  );

  totalGenesisSoldBeforeMint =
    parseInt(soldRes.rows[0].total_sold, 10) || 0;
}

for (let i = 0; i < order.packs; i++) {
  const serialPosition = totalGenesisSoldBeforeMint + i + 1;

  const isFounderPack =
    process.env.GAME_PHASE === "GENESIS" &&
    serialPosition <= GENESIS_FOUNDER_CAP;

  const writEligible = isFounderPack;
  const bonusGroup = isFounderPack ? "FOUNDER" : "EXPANSION";

  await pool.query(
    `
    INSERT INTO nfts (
      username,
      type,
      tier,
      era,
      is_shadow,
      founder_pack,
      writ_eligible,
      bonus_group
    )
    VALUES ($1,'PACK','SEALED',$2,$3,$4,$5,$6)
    `,
    [
      order.username,
      era,
      false,
      isFounderPack,
      writEligible,
      bonusGroup
    ]
  );
}
      // ============================
      // 📜 FOUNDER-ONLY WRIT MINT
      // ============================
      if (process.env.GAME_PHASE === "GENESIS") {
        const founderPackCount = await countEligibleFounderPacksForOrder(orderId, order.username);
        const writCount = Math.floor(founderPackCount / 10);

        for (let i = 0; i < writCount; i++) {
          await pool.query(
            `
            INSERT INTO nfts (username, type, tier, era, founder_pack, writ_eligible, bonus_group)
            VALUES ($1, 'WRIT', 'GENESIS', 'GENESIS', TRUE, FALSE, 'FOUNDER')
            `,
            [order.username]
          );
        }

        if (writCount > 0) {
          console.log(`📜 Minted ${writCount} WRIT(s) for ${order.username}`);
        }
      }
      await sendPurchaseLog(order.username, order.packs);
      await sendEmpireBuilderLog(order.username, order.packs);

      return res.json({ success: true });
    } catch (err) {
      console.error("🔥 Confirm Payment Error:", err);
      return res.status(500).json({ success: false });
    }
  }
);

// ============================
// 🏦 ADMIN DISTRIBUTE
// ============================

app.post("/admin/distribute", async (req, res) => {
  const connection = await pool.connect();

  try {
    if (req.headers["x-admin-key"] !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ success: false });
    }

    const ledgerResult = await connection.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM revenue_ledger WHERE distributed=FALSE"
    );

    const total = parseFloat(ledgerResult.rows[0].total);

    if (total <= 0) return res.json({ success: false });

    const accounts = await client.database.getAccounts([REVENUE]);
    const walletBalance = parseFloat(accounts[0].balance);

    const distributable = Math.min(total, walletBalance);

    const treasuryShare = parseFloat(
      (distributable * SPLIT.treasury).toFixed(3)
    );
    const daoShare = parseFloat((distributable * SPLIT.dao).toFixed(3));
    const founderShare = parseFloat(
      (distributable * SPLIT.founder).toFixed(3)
    );

    await connection.query("BEGIN");

    const send = async (to, amount) =>
      await client.broadcast.transfer(
        {
          from: REVENUE,
          to,
          amount: amount.toFixed(3) + " HIVE",
          memo: "MydEmpire Revenue Distribution",
        },
        revenueKey
      );

    await send(TREASURY, treasuryShare);
    await send(DAO, daoShare);
    await send(FOUNDER, founderShare);

    await connection.query(
      "UPDATE revenue_ledger SET distributed=TRUE WHERE distributed=FALSE"
    );

    await connection.query("COMMIT");

    res.json({
      success: true,
      distributed: distributable,
    });
  } catch (err) {
    await connection.query("ROLLBACK");
    console.error("🔥 Distribution Error:", err);
    res.status(500).json({ success: false });
  } finally {
    connection.release();
  }
});

// ============================
// 🎁 OPEN PACK (MULTI)
// ============================

app.post("/open-pack", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const { username, count } = req.body;

    const requestedCount = Math.min(parseInt(count) || 1, 5);

    await clientConn.query("BEGIN");

    const packResult = await clientConn.query(
  `
  SELECT
    id,
    edition,
    genesis_origin,
    founder_pack,
    writ_eligible,
    bonus_group
  FROM nfts
  WHERE username = $1
    AND type = 'PACK'
    AND tier = 'SEALED'
  ORDER BY created_at ASC
  LIMIT $2
  FOR UPDATE
  `,
  [username, requestedCount]
);
    if (!packResult.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({ error: "No sealed packs found" });
    }

    const genesis = await getGenesisStatus();
    const now = new Date();

    let opened = 0;
    let totalEmp = 0;
    let qualifiedCount = 0;
    let drops = [];

    for (const pack of packResult.rows) {
      const {
  id,
  edition,
  genesis_origin,
  founder_pack,
  writ_eligible,
  bonus_group
} = pack;

      // LAND rarity
      function weightedLand() {
        const r = Math.random() * 100;
        if (r < 75) return "L1";
        if (r < 97) return "L2";
        return "L3";
      }

      // BLUEPRINT rarity + industry
      function weightedBlueprint() {
        const industries = [
          "FOOD",
          "TEXTILE",
          "PHARMA",
          "CHEMICAL",
          "SUPERMARKET",
        ];
        const industry =
          industries[Math.floor(Math.random() * industries.length)];

        const r = Math.random() * 100;
        let level;
        if (r < 55) level = "B1";
        else if (r < 80) level = "B2";
        else if (r < 94) level = "B3";
        else if (r < 99) level = "B4";
        else level = "B5";

        return `${industry}_${level}`;
      }

      const land = weightedLand();
const blueprint = weightedBlueprint();

const bonusConfig = getPackBonusConfig(pack);

// Main relic roll based on pack type
const relicDropped = Math.random() < bonusConfig.relicChance;

// Standard EMP from land
const empDrop = land === "L1" ? 30 : land === "L2" ? 60 : 120;

// Bonus rolls
const extraBlueprintDropped = Math.random() < bonusConfig.extraBlueprintChance;
const bonusEmpDropped = Math.random() < bonusConfig.bonusEmpChance;
const bonusEmp = bonusEmpDropped ? rollBonusEmpAmount() : 0;

totalEmp += empDrop + bonusEmp;

// mint relic if dropped
if (relicDropped) {
  await clientConn.query(
    `
    INSERT INTO nfts (username, type, tier, edition, era, genesis_origin)
    VALUES ($1, 'RELIC', 'GENESIS', 'FOUNDER', 'GENESIS', true)
    `,
    [username]
  );
}

// mint extra blueprint if dropped
let extraBlueprint = null;

if (extraBlueprintDropped) {
  extraBlueprint = weightedBlueprint();

  await clientConn.query(
    `
    INSERT INTO nfts (username, type, tier, era)
    VALUES ($1, 'BLUEPRINT', $2, 'GENESIS')
    `,
    [username, extraBlueprint]
  );
}

drops.push({
  land,
  blueprint,
  emp: empDrop,
  relic: relicDropped,
  founder_pack: !!founder_pack,
  writ_eligible: !!writ_eligible,
  bonus_group: bonus_group || "EXPANSION",
  bonus_emp: bonusEmp,
  extra_blueprint: extraBlueprint
});
      await clientConn.query(
        "INSERT INTO nfts (username,type,tier,era) VALUES ($1,'LAND',$2,'GENESIS')",
        [username, land]
      );

      await clientConn.query(
        "INSERT INTO nfts (username,type,tier,era) VALUES ($1,'BLUEPRINT',$2,'GENESIS')",
        [username, blueprint]
      );

      await clientConn.query("DELETE FROM nfts WHERE id=$1", [id]);

      if (
        edition === "FOUNDER" &&
        genesis_origin === true &&
        genesis.openDeadline &&
        now <= new Date(genesis.openDeadline)
      ) {
        qualifiedCount++;
      }

      opened++;
    }

    await clientConn.query(
      `
      INSERT INTO emp_balances (username,balance)
      VALUES ($1,0)
      ON CONFLICT (username) DO NOTHING
    `,
      [username]
    );

    await clientConn.query(
      `
      UPDATE emp_balances
      SET balance = balance + $1
      WHERE username=$2
    `,
      [totalEmp, username]
    );

    if (qualifiedCount > 0) {
      await clientConn.query(
        `
        INSERT INTO player_status (username)
        VALUES ($1)
        ON CONFLICT (username) DO NOTHING
      `,
        [username]
      );

      const status = await clientConn.query(
        "SELECT genesis_packs_opened, genesis_tier FROM player_status WHERE username=$1 FOR UPDATE",
        [username]
      );

      let packsOpened = status.rows[0].genesis_packs_opened + qualifiedCount;
      let newTier = status.rows[0].genesis_tier;

      if (packsOpened >= 500) newTier = 5;
      else if (packsOpened >= 300) newTier = 4;
      else if (packsOpened >= 150) newTier = 3;
      else if (packsOpened >= 100) newTier = 2;
      else if (packsOpened >= 50) newTier = 1;

      await clientConn.query(
        `
        UPDATE player_status
        SET genesis_packs_opened=$1,
            genesis_tier=$2,
            updated_at=NOW()
        WHERE username=$3
      `,
        [packsOpened, newTier, username]
      );
    }

    await clientConn.query("COMMIT");

    // Discord pack open log
    if (process.env.DISCORD_PACK_OPEN_WEBHOOK) {
      try {
        const lands = drops.map((d) => d.land).join(", ");
        const blueprints = drops.map((d) => d.blueprint).join(", ");
        const bonuses = drops
  .map((d) => {
    const parts = [];
    if (d.relic) parts.push("RELIC");
    if (d.extra_blueprint) parts.push(`EXTRA BP: ${d.extra_blueprint}`);
    if (d.bonus_emp > 0) parts.push(`BONUS EMP: +${d.bonus_emp}`);
    return parts.length ? parts.join(" | ") : null;
  })
  .filter(Boolean)
  .join(" ; ");

        const response = await fetch(process.env.DISCORD_PACK_OPEN_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
           content:
  `🎁 **GENESIS PACK OPENED**\n\n` +
  `👤 Player: ${username}\n` +
  `📦 Packs Opened: ${opened}\n` +
  `🌍 Lands: ${lands}\n` +
  `🏭 Blueprints: ${blueprints}\n` +
  `⚡ Total EMP: ${totalEmp}` +
  (bonuses ? `\n✨ Bonuses: ${bonuses}` : ""),
          }),
        });

        console.log("Pack open Discord status:", response.status);
      } catch (err) {
        console.log("Pack open Discord error:", err.message);
      }
    }

    res.json({
      success: true,
      opened,
      totalEmp,
      genesisQualifiedCount: qualifiedCount,
      drops,
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    clientConn.release();
  }
});

// ============================
// 🚀 GENESIS STATUS
// ============================

app.get("/genesis/status", async (req, res) => {
  try {
    const status = await getGenesisStatus();
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// ===============================
// 💰 REWARD ENGINE HELPERS
// ===============================

function getGenesisAgeInDays() {
  const genesisStart = process.env.GENESIS_START_DATE;

  if (!genesisStart) {
    return 0;
  }

  const start = new Date(genesisStart);
  const now = new Date();

  if (isNaN(start.getTime())) {
    return 0;
  }

  const diffMs = now.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return Math.max(0, diffDays);
}

function getTreasuryAccessMultiplier(ageDays) {
  if (ageDays < 60) {
    return 0.75; // Month 1–2
  }

  if (ageDays < 120) {
    return 0.90; // Month 3–4
  }

  return 1.00; // After Month 4
}

function interpolateLinear(x, x1, y1, x2, y2) {
  if (x <= x1) return y1;
  if (x >= x2) return y2;

  const ratio = (x - x1) / (x2 - x1);
  return y1 + (y2 - y1) * ratio;
}

function getGenesisEmissionRate(treasuryStrengthRatio) {
  const r = Number(treasuryStrengthRatio || 0);

  if (r <= 0.75) return 0.0010; // 0.10%
  if (r <= 1.50) return interpolateLinear(r, 0.75, 0.0010, 1.50, 0.0015);
  if (r <= 2.50) return interpolateLinear(r, 1.50, 0.0015, 2.50, 0.0020);
  if (r <= 4.00) return interpolateLinear(r, 2.50, 0.0020, 4.00, 0.0025);
  if (r <= 6.00) return interpolateLinear(r, 4.00, 0.0025, 6.00, 0.0030);
  if (r <= 8.00) return interpolateLinear(r, 6.00, 0.0030, 8.00, 0.0035);

  return 0.0035; // Max Genesis emission = 0.35%
}

function calculateRewardPool(treasuryBalance, globalEP) {
  const treasury = Number(treasuryBalance || 0);
  const ep = Number(globalEP || 0);

  const ageDays = getGenesisAgeInDays();
  const treasuryAccessMultiplier = getTreasuryAccessMultiplier(ageDays);
  const effectiveTreasury = treasury * treasuryAccessMultiplier;

  const treasuryStrengthRatio =
    ep > 0 ? effectiveTreasury / ep : effectiveTreasury;

  const emissionRate = getGenesisEmissionRate(treasuryStrengthRatio);
  const rewardPool = effectiveTreasury * emissionRate;

  return {
    ageDays: Number(ageDays.toFixed(2)),
    treasuryAccessMultiplier,
    effectiveTreasury: Number(effectiveTreasury.toFixed(8)),
    treasuryStrengthRatio: Number(treasuryStrengthRatio.toFixed(8)),
    emissionRate,
    rewardPool: Number(rewardPool.toFixed(8))
  };
}
// ============================
// ADMIN HELPERS
// ============================

app.get("/admin/fix-old-packs", async (req, res) => {
  try {
    if (req.query.key !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await pool.query(`
      UPDATE nfts
      SET edition='FOUNDER',
          genesis_origin=true,
          era='GENESIS'
      WHERE type='PACK' AND edition IS NULL
    `);

    res.json({ success: true, message: "Old packs fixed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admin/test-confirm/:id", async (req, res) => {
  req.body = {
    orderId: parseInt(req.params.id),
    txid: "TEST_SHADOW_123456789",
  };
  return app._router.handle(req, res, () => {});
});

console.log("Shadow column route registered");

// ============================
// 🧱 ADD SHADOW COLUMN (TEMP)
// ============================

app.get("/admin/add-shadow-column", async (req, res) => {
  try {
    await pool.query(`
      ALTER TABLE nfts
      ADD COLUMN IF NOT EXISTS is_shadow BOOLEAN DEFAULT FALSE;
    `);

    return res.json({ success: true, message: "is_shadow column added" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to add column" });
  }
});
// ============================
// 🧱 ADD FOUNDER PACK COLUMNS (SAFE)
// ============================

app.get("/admin/add-founder-pack-columns", async (req, res) => {
  try {
    if (req.query.key !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await pool.query(`
      ALTER TABLE nfts
      ADD COLUMN IF NOT EXISTS founder_pack BOOLEAN DEFAULT FALSE;
    `);

    await pool.query(`
      ALTER TABLE nfts
      ADD COLUMN IF NOT EXISTS writ_eligible BOOLEAN DEFAULT FALSE;
    `);

    await pool.query(`
      ALTER TABLE nfts
      ADD COLUMN IF NOT EXISTS bonus_group TEXT DEFAULT NULL;
    `);

    return res.json({
      success: true,
      message: "Founder pack columns added successfully"
    });
  } catch (err) {
    console.error("Add founder pack columns error:", err);
    return res.status(500).json({ error: "Failed to add founder pack columns" });
  }
});

// ===============================
// 🧪 GENESIS SALE STATUS DEBUG
// ===============================
app.get("/debug-genesis-sale-status", async (req, res) => {
  try {
    const ordersRes = await pool.query(`
      SELECT COALESCE(SUM(packs), 0)::int AS total_sold
      FROM orders
      WHERE status = 'completed'
        AND era = 'GENESIS'
    `);

    const nftRes = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE type = 'PACK' AND founder_pack = TRUE)::int AS founder_packs_in_nfts,
        COUNT(*) FILTER (WHERE type = 'PACK' AND COALESCE(founder_pack, FALSE) = FALSE)::int AS non_founder_packs_in_nfts,
        COUNT(*) FILTER (WHERE type = 'PACK' AND writ_eligible = TRUE)::int AS writ_eligible_packs_in_nfts
      FROM nfts
      WHERE era = 'GENESIS'
    `);

    const totalSold = ordersRes.rows[0]?.total_sold || 0;

    res.json({
      total_genesis_packs_sold: totalSold,
      founder_cap: GENESIS_FOUNDER_CAP,
      expansion_cap: GENESIS_EXPANSION_CAP,
      current_bucket: getGenesisBucket(totalSold),
      founder_remaining: Math.max(GENESIS_FOUNDER_CAP - totalSold, 0),
      expansion_remaining: Math.max(GENESIS_EXPANSION_CAP - totalSold, 0),
      founder_packs_in_nfts: nftRes.rows[0]?.founder_packs_in_nfts || 0,
      non_founder_packs_in_nfts: nftRes.rows[0]?.non_founder_packs_in_nfts || 0,
      writ_eligible_packs_in_nfts: nftRes.rows[0]?.writ_eligible_packs_in_nfts || 0
    });
  } catch (err) {
    console.error("Debug genesis sale status error:", err);
    res.status(500).json({ error: err.message });
  }
});
// 🔎 TEMPORARY: Debug latest orders
app.get("/debug-orders", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, username, packs, status, era FROM orders ORDER BY id DESC LIMIT 10"
  );
  res.json(rows);
});
// ===============================
// 📦 GENESIS SALE STATUS
// ===============================
app.get("/genesis-sale-status", async (req, res) => {
  try {
    const soldRes = await pool.query(`
      SELECT COALESCE(SUM(packs), 0)::int AS total_sold
      FROM orders
      WHERE status = 'completed'
        AND era = 'GENESIS'
    `);

    const totalSold = soldRes.rows[0]?.total_sold || 0;

    const founderSold = Math.min(totalSold, GENESIS_FOUNDER_CAP);
    const founderRemaining = Math.max(GENESIS_FOUNDER_CAP - founderSold, 0);

    const expansionSold = Math.max(totalSold - GENESIS_FOUNDER_CAP, 0);
    const expansionCapacity = GENESIS_EXPANSION_CAP - GENESIS_FOUNDER_CAP;
    const expansionRemaining = Math.max(expansionCapacity - expansionSold, 0);

    res.json({
      founder_cap: GENESIS_FOUNDER_CAP,
      founder_sold: founderSold,
      founder_remaining: founderRemaining,

      expansion_cap: expansionCapacity,
      expansion_sold: expansionSold,
      expansion_remaining: expansionRemaining,

      total_genesis_cap: GENESIS_EXPANSION_CAP,
      total_genesis_sold: totalSold,
      total_genesis_remaining: Math.max(GENESIS_EXPANSION_CAP - totalSold, 0),

      current_bucket: getGenesisBucket(totalSold)
    });
  } catch (err) {
    console.error("Genesis sale status error:", err);
    res.status(500).json({ error: "Failed to load genesis sale status" });
  }
});
// ===============================
// 🏛 EMPIRE OVERVIEW (PLAYER)
// ===============================
app.get("/player/:username/empire-overview", async (req, res) => {
  try {
    const { username } = req.params;

    // ✅ Auto-activate finished builds
    await pool.query(
      `      
      UPDATE factories
      SET status = 'active',
          last_claimed_at = NOW(),
          maintenance_ends_at = NOW() + INTERVAL '7 days'
      WHERE username = $1
        AND LOWER(status) = 'building'
        AND built_at IS NOT NULL
        AND built_at <= NOW()
      `,
      [username]
    );

    // ✅ Auto-finish upgrades
const readyUpgradeRes = await pool.query(
  `
  SELECT id, blueprint_tier
  FROM factories
  WHERE username = $1
    AND LOWER(status) = 'upgrading'
    AND upgrade_complete_at IS NOT NULL
    AND upgrade_complete_at <= NOW()
  `,
  [username]
);

for (const row of readyUpgradeRes.rows) {
  const parsed = parseBlueprintTier(row.blueprint_tier);
  const industry = parsed.industry;
  const currentLevel = getBlueprintLevelNumber(row.blueprint_tier);

  if (!industry || !currentLevel || currentLevel >= 5) {
    continue;
  }

  const nextTier = buildBlueprintTierFromIndustryAndLevel(industry, currentLevel + 1);

  if (!nextTier) continue;

  await pool.query(
    `
    UPDATE factories
    SET status = 'active',
        level = COALESCE(level, 1) + 1,
        blueprint_tier = $1,
        last_claimed_at = NOW(),
        upgrade_started_at = NULL,
        upgrade_complete_at = NULL
    WHERE id = $2
    `,
    [nextTier, row.id]
  );
}

           // ✅ Auto-expire maintenance
    await pool.query(
      `
      UPDATE factories
      SET status = 'inactive'
      WHERE username = $1
        AND LOWER(COALESCE(status, '')) = 'active'
        AND maintenance_ends_at IS NOT NULL
        AND maintenance_ends_at < NOW()
      `,
      [username]
    );

    // ✅ Auto-reactivate maintained inactive factories
    await pool.query(
      `
      UPDATE factories
      SET status = 'active',
          last_claimed_at = NOW()
      WHERE username = $1
        AND LOWER(COALESCE(status, '')) = 'inactive'
        AND maintenance_ends_at IS NOT NULL
        AND maintenance_ends_at >= NOW()
      `,
      [username]
    );

    const landsRes = await pool.query(
      `
      SELECT id, tier
      FROM nfts
      WHERE username = $1
        AND type = 'LAND'
      `,
      [username]
    );

    const lands = landsRes.rows;

    const landTierById = {};
    for (const land of lands) {
      landTierById[land.id] = land.tier;
    }

    const factoriesRes = await pool.query(
      `
      SELECT *
      FROM factories
      WHERE username = $1
      ORDER BY id ASC
      `,
      [username]
    );

    const factories = factoriesRes.rows;

    let totalFactories = 0;
    let totalBaseEP = 0;
    const byLand = {};

    for (const f of factories) {
      totalFactories++;

      const status = String(f.status || "").trim().toLowerCase();
      const landTier = landTierById[f.land_id] || null;

      const factoryEP = Number(await calculateFactoryEP(pool, f.id) || 0);

      let epUnclaimed = 0;

      if (status === "active" && factoryEP > 0) {
        const factoryForClaimable = {
          ...f,
          land_tier: landTier,
          status: "active",
          factoryEP
        };

        epUnclaimed = Number(calculateProduction(factoryForClaimable) || 0);

        if (!isNaN(factoryEP)) {
          totalBaseEP += factoryEP;
        }
      }

      const enrichedFactory = {
        ...f,
        land_tier: landTier,
        factoryEP,
        ep_unclaimed: epUnclaimed
      };

      const lid = f.land_id;
      if (!byLand[lid]) byLand[lid] = [];
      byLand[lid].push(enrichedFactory);
    }

    const relicResult = await pool.query(
      `
      SELECT COUNT(*) 
      FROM nfts
      WHERE username = $1
        AND type = 'RELIC'
        AND era = 'GENESIS'
      `,
      [username]
    );

    const relicCount = parseInt(relicResult.rows[0].count, 10) || 0;
    const activeRelics = Math.min(relicCount, 2);
    const activeRelicBoost = activeRelics * 3;
    const totalBoostedEP = totalBaseEP * (1 + activeRelicBoost / 100);

    const responseLands = lands.map((land) => ({
      land_id: land.id,
      land_tier: land.tier,
      factories: byLand[land.id] || []
    }));

    res.json({
      lands: responseLands,
      totals: {
        totalFactories,
        totalBaseEP,
        totalBoostedEP,
        relicCount,
        activeRelics,
        activeRelicBoost
      }
    });
  } catch (err) {
    console.error("Empire overview error:", err);
    res.status(500).json({ error: err.message });
  }
});
// ===============================
// 📦 BLUEPRINT INVENTORY (PLAYER)
// ===============================
app.get("/player/:username/blueprints", async (req, res) => {
  try {
    const { username } = req.params;

    // All BLUEPRINT NFTs for this player
        const result = await pool.query(
      `
      SELECT id, tier, era
      FROM nfts
      WHERE username = $1
      AND LOWER(type) = 'blueprint'
      ORDER BY id ASC
    `,
      [username]
    );

    const rows = result.rows.map(row => {
      // tier looks like "FOOD_B2", "PHARMA_B4" etc.
      const [industry, level] = (row.tier || "").split("_");
      return {
        blueprint_id: row.id,
        raw_tier: row.tier,   // e.g. "FOOD_B2"
        industry,             // e.g. "FOOD"
        level,                // e.g. "B2"
        era: row.era
      };
    });

    // Optional: aggregated counts (can power a summary later)
    const countsByKey = {};
    for (const b of rows) {
      const key = `${b.industry || "UNKNOWN"}_${b.level || ""}`;
      countsByKey[key] = (countsByKey[key] || 0) + 1;
    }

    res.json({
      username,
      blueprints: rows,
      countsByKey
    });
  } catch (err) {
    console.error("Blueprint inventory error:", err);
    res.status(500).json({ error: err.message });
  }
});
// ===============================
// 🎁 UNOPENED PACKS (PLAYER)
// ===============================
app.get("/player/:username/packs", async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
  `
  SELECT
    id,
    type,
    tier,
    era,
    founder_pack,
    writ_eligible,
    bonus_group,
    created_at
  FROM nfts
  WHERE username = $1
    AND type = 'PACK'
    AND tier = 'SEALED'
  ORDER BY id ASC
  `,
  [username]
);

   res.json({
  username,
  packs: result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    tier: row.tier,
    era: row.era,
    founder_pack: !!row.founder_pack,
    writ_eligible: !!row.writ_eligible,
    bonus_group: row.bonus_group || "EXPANSION",
    created_at: row.created_at
  }))
});
  } catch (err) {
    console.error("Unopened packs error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// STATIC FRONTEND
// ===============================

console.log("DIRNAME:", __dirname);
app.use(express.static(__dirname + "/../mydempire-frontend"));

// ===============================
// 🏭 CLAIM PRODUCTION (FACTORY)
// ===============================

app.post("/claim-production", async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Missing username" });
  }

  const clientConn = await pool.connect();

  try {
    await clientConn.query("BEGIN");

    const factoriesRes = await clientConn.query(
      `
      SELECT *
      FROM factories
      WHERE username = $1
        AND LOWER(COALESCE(status, '')) = 'active'
      ORDER BY id ASC
      `,
      [username]
    );

    const factories = factoriesRes.rows;

    let totalEMPClaimed = 0;
    let totalEPFloat = 0;
    const breakdown = [];
    const factoryIdsToUpdate = [];

    for (const factory of factories) {
      const earnedFloat = Number(calculateProduction(factory) || 0);
      const earnedEMP = Math.floor(earnedFloat);

      if (!Number.isFinite(earnedFloat) || earnedEMP <= 0) {
        continue;
      }

      totalEMPClaimed += earnedEMP;
      totalEPFloat += earnedFloat;
      factoryIdsToUpdate.push(factory.id);

      breakdown.push({
        factory_id: factory.id,
        land_id: factory.land_id,
        blueprint_id: factory.blueprint_id,
        earnedEP: earnedFloat,
        earnedEMP: earnedEMP
      });
    }

    if (totalEMPClaimed <= 0 || factoryIdsToUpdate.length === 0) {
      await clientConn.query("COMMIT");
      return res.json({
        success: true,
        message: "No production available to claim",
        totalEMPClaimed: 0,
        totalEP: 0,
        factoryCountClaimed: 0,
        breakdown: []
      });
    }

    await clientConn.query(
      `
      INSERT INTO emp_balances (username, balance)
      VALUES ($1, $2)
      ON CONFLICT (username)
      DO UPDATE SET balance = emp_balances.balance + EXCLUDED.balance
      `,
      [username, totalEMPClaimed]
    );

    await clientConn.query(
      `
      UPDATE factories
      SET last_claimed_at = NOW()
      WHERE id = ANY($1::int[])
      `,
      [factoryIdsToUpdate]
    );

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "Production claimed successfully",
      totalEMPClaimed,
      totalEP: totalEPFloat,
      factoryCountClaimed: factoryIdsToUpdate.length,
      breakdown
    });
  } catch (error) {
    await clientConn.query("ROLLBACK");
    console.error("Claim-all error:", error);
    return res.status(500).json({ error: "Server error" });
  } finally {
    clientConn.release();
  }
});

// ===============================
// 🌍 GLOBAL STATS (GENESIS)
// ===============================

app.get("/global-stats", async (req, res) => {
  try {
    const packsResult = await pool.query(
      `
      SELECT COALESCE(SUM(packs), 0) AS total
      FROM orders
      WHERE status = 'completed'
        AND era = 'GENESIS'
      `
    );

    const totalPacksSold = parseInt(packsResult.rows[0].total, 10) || 0;
    const remainingGenesisPacks = 5000 - totalPacksSold;

    const relicResult = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM nfts
      WHERE type = 'RELIC'
        AND era = 'GENESIS'
      `
    );

    const totalRelics = parseInt(relicResult.rows[0].count, 10) || 0;

    const factoryStatusResult = await pool.query(
      `
      SELECT
        UPPER(COALESCE(status, 'inactive')) AS status,
        COUNT(*)::int AS count
      FROM factories
      GROUP BY UPPER(COALESCE(status, 'inactive'))
      `
    );

    let totalFactories = 0;
    let activeFactories = 0;
    let buildingFactories = 0;
    let inactiveFactories = 0;

    for (const row of factoryStatusResult.rows) {
      const status = row.status;
      const count = Number(row.count) || 0;

      totalFactories += count;

      if (status === "ACTIVE") {
        activeFactories += count;
      } else if (status === "BUILDING" || status === "UPGRADING") {
        buildingFactories += count;
      } else {
        inactiveFactories += count;
      }
    }

    const empResult = await pool.query(
      `
      SELECT COALESCE(SUM(balance), 0) AS total
      FROM emp_balances
      `
    );

    const totalEmpSupply = parseFloat(empResult.rows[0].total) || 0;

    const treasuryResult = await pool.query(
      `
      SELECT balance
      FROM treasury
      LIMIT 1
      `
    );

    const treasuryBalance = treasuryResult.rows.length
      ? parseFloat(treasuryResult.rows[0].balance)
      : 0;

    res.json({
      totalPacksSold,
      remainingGenesisPacks,
      totalRelics,
      totalFactories,
      activeFactories,
      buildingFactories,
      inactiveFactories,
      totalEmpSupply,
      treasuryBalance
    });
  } catch (err) {
    console.error("Global stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/player/:username/emp-balance", async (req, res) => {
  try {
    const username = normalizeUsername(req.params.username);

    const result = await pool.query(
      `
      SELECT balance
      FROM emp_balances
      WHERE username = $1
      `,
      [username]
    );

    const balance = result.rows.length > 0
      ? Number(result.rows[0].balance)
      : 0;

    return res.json({
      success: true,
      username,
      emp_balance: balance
    });

  } catch (err) {
    console.error("EMP balance error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch EMP balance."
    });
  }
});
// ===============================
// 📊 PLAYER DASHBOARD (GENESIS)
// ===============================

app.get("/player/:username/dashboard", async (req, res) => {
  try {
    const { username } = req.params;

    const empResult = await pool.query(
      "SELECT balance FROM emp_balances WHERE username = $1",
      [username]
    );

    const empBalance = empResult.rows.length
      ? parseFloat(empResult.rows[0].balance)
      : 0;

    const factoryStatusResult = await pool.query(
      `
      SELECT
        UPPER(COALESCE(status, 'inactive')) AS status,
        COUNT(*)::int AS count
      FROM factories
      WHERE username = $1
      GROUP BY UPPER(COALESCE(status, 'inactive'))
      `,
      [username]
    );

    let totalFactories = 0;
    let activeFactories = 0;
    let buildingFactories = 0;
    let inactiveFactories = 0;

    for (const row of factoryStatusResult.rows) {
      const status = row.status;
      const count = Number(row.count) || 0;

      totalFactories += count;

      if (status === "ACTIVE") {
        activeFactories += count;
      } else if (status === "BUILDING" || status === "UPGRADING") {
        buildingFactories += count;
      } else {
        inactiveFactories += count;
      }
    }

    const relicResult = await pool.query(
      `
      SELECT COUNT(*) 
      FROM nfts 
      WHERE username = $1 
        AND type = 'RELIC'
        AND era = 'GENESIS'
      `,
      [username]
    );

    const relicCount = parseInt(relicResult.rows[0].count, 10) || 0;
    const activeRelics = Math.min(relicCount, 2);
    const activeRelicBoost = activeRelics * 3;
    const relicBoostCapReached = relicCount >= 2;

    // Load lands so each factory gets correct land tier
    const landsRes = await pool.query(
      `
      SELECT id, tier
      FROM nfts
      WHERE username = $1
        AND type = 'LAND'
      `,
      [username]
    );

    const landTierById = {};
    for (const l of landsRes.rows) {
      landTierById[l.id] = l.tier;
    }

    // Load factories for EP/day and claimable EP calculation
    const factoriesRes = await pool.query(
      `
      SELECT *
      FROM factories
      WHERE username = $1
      `,
      [username]
    );

    let totalBaseEP = 0;
    let totalClaimableEP = 0;

    for (const f of factoriesRes.rows) {
      const status = String(f.status || "").trim().toUpperCase();
      if (status !== "ACTIVE") continue;

      const landTier = landTierById[f.land_id] || null;

      // ✅ Always calculate EP dynamically from engine
      const factoryEP = Number(await calculateFactoryEP(pool, f.id) || 0);
      if (!Number.isFinite(factoryEP) || factoryEP <= 0) continue;

      // Claimable EP using real elapsed time
      const factoryForClaimable = {
        ...f,
        land_tier: landTier,
        status: "active",
        factoryEP
      };

      const claimableEP = Number(calculateProduction(factoryForClaimable) || 0);
      if (!isNaN(claimableEP)) {
        totalClaimableEP += claimableEP;
      }

      // EP/day using simulated 1 day elapsed time
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const factoryForRate = {
        ...f,
        land_tier: landTier,
        status: "active",
        factoryEP,
        last_claimed_at: oneDayAgo.toISOString()
      };

      const dailyEP = Number(calculateProduction(factoryForRate) || 0);
      if (!isNaN(dailyEP)) {
        totalBaseEP += dailyEP;
      }
    }

    const totalBoostedEP = totalBaseEP * (1 + activeRelicBoost / 100);

    res.json({
      username,
      empBalance,
      totalFactories,
      activeFactories,
      buildingFactories,
      inactiveFactories,
      relicCount,
      activeRelics,
      activeRelicBoost,
      relicBoostCapReached,

      // flat values
      totalBaseEP,
      totalBoostedEP,
      totalClaimableEP,

      // nested values for frontend compatibility
      totals: {
        totalBaseEP,
        totalBoostedEP,
        totalClaimableEP,
        totalFactories,
        activeFactories,
        buildingFactories,
        inactiveFactories,
        relicCount,
        activeRelics,
        activeRelicBoost,
        relicBoostCapReached
      }
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: err.message });
  }
}); 
// ===============================
// 🎁 PLAYER PACK INVENTORY
// ===============================

 

// ============================
// 🛠 ADMIN ADD PACK
// ============================
app.post("/admin/add-pack", async (req, res) => {
  try {
    const { username, count = 1 } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Missing username" });
    }

    const created = [];

    for (let i = 0; i < Number(count); i++) {
      const r = await pool.query(
        `
        INSERT INTO nfts (username, type, tier, era, edition, genesis_origin)
        VALUES ($1, 'PACK', 'SEALED', 'GENESIS', 'FOUNDER', true)
        RETURNING id, type, tier, era, edition, created_at
        `,
        [username]
      );

      created.push(r.rows[0]);
    }

    res.json({ ok: true, created });
  } catch (err) {
    console.error("admin/add-pack error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// 📦 PLAYER UNOPENED PACK COUNT
// ===============================
app.get("/player/:username/unopened-packs", async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM nfts
      WHERE LOWER(username) = LOWER($1)
        AND UPPER(type) = 'PACK'
        AND UPPER(tier) = 'SEALED'
      `,
      [username]
    );

    res.json({
      username,
      totalUnopenedPacks: parseInt(result.rows[0].total, 10) || 0
    });
  } catch (err) {
    console.error("Unopened packs error:", err);
    res.status(500).json({ error: err.message });
  }
});
// ============================
// 🧾 MINT EXTRA BLUEPRINT
// ============================

app.post("/mint-extra-blueprint", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const { username } = req.body;

    const cleanUsername = String(username || "")
      .trim()
      .replace("@", "")
      .toLowerCase();

    if (!cleanUsername) {
      return res.status(400).json({
        success: false,
        error: "Username is required.",
      });
    }

    await clientConn.query("BEGIN");

    // 1️⃣ Count total land slots from owned LAND NFTs
    const slotsRes = await clientConn.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN tier = 'L1' THEN 1
          WHEN tier = 'L2' THEN 2
          WHEN tier = 'L3' THEN 3
          ELSE 0
        END
      ), 0) AS total_slots
      FROM nfts
      WHERE username = $1
        AND type = 'LAND'
      `,
      [cleanUsername]
    );

    const totalSlots = parseInt(slotsRes.rows[0].total_slots, 10) || 0;

    if (totalSlots <= 0) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "You do not own any land slots.",
      });
    }

    // 2️⃣ Count owned BLUEPRINT NFTs
    // Listed blueprints still count because ownership is still with player
    const bpRes = await clientConn.query(
      `
      SELECT COUNT(*) AS total_blueprints
      FROM nfts
      WHERE username = $1
        AND type = 'BLUEPRINT'
      `,
      [cleanUsername]
    );

    const totalBlueprints = parseInt(bpRes.rows[0].total_blueprints, 10) || 0;

    // 3️⃣ Eligibility = total slots - total owned blueprints
    const eligibleMints = Math.max(totalSlots - totalBlueprints, 0);

    if (eligibleMints <= 0) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "No empty slot is eligible for blueprint mint.",
        totalSlots,
        totalBlueprints,
        eligibleMints: 0,
      });
    }

    // 4️⃣ Current Genesis sold count (for future dynamic ladder support)
    let totalGenesisSold = 0;
    if (process.env.GAME_PHASE === "GENESIS") {
      const soldRes = await clientConn.query(
        `
        SELECT COALESCE(SUM(packs), 0) AS total_sold
        FROM orders
        WHERE status = 'completed'
          AND era = 'GENESIS'
        `
      );

      totalGenesisSold = parseInt(soldRes.rows[0].total_sold, 10) || 0;
    }

    // 5️⃣ Dynamic EMP mint cost
    const era = process.env.GAME_PHASE || "GENESIS";
    const empCost = getBlueprintMintEmpCost(era, totalGenesisSold);

    // 6️⃣ Lock EMP balance row
    await clientConn.query(
      `
      INSERT INTO emp_balances (username, balance)
      VALUES ($1, 0)
      ON CONFLICT (username) DO NOTHING
      `,
      [cleanUsername]
    );

    const empRes = await clientConn.query(
      `
      SELECT balance
      FROM emp_balances
      WHERE username = $1
      FOR UPDATE
      `,
      [cleanUsername]
    );

    const currentEmp = parseFloat(empRes.rows[0]?.balance || 0);

    if (currentEmp < empCost) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Insufficient EMP. Required: ${empCost}, Available: ${currentEmp}`,
        requiredEmp: empCost,
        currentEmp,
        totalSlots,
        totalBlueprints,
        eligibleMints,
      });
    }

    // 7️⃣ Deduct EMP
    await clientConn.query(
      `
      UPDATE emp_balances
      SET balance = balance - $1
      WHERE username = $2
      `,
      [empCost, cleanUsername]
    );

    // 8️⃣ Roll blueprint using same rarity logic as pack
    const blueprintTier = buildBlueprintTier();

    const mintRes = await clientConn.query(
      `
      INSERT INTO nfts (username, type, tier, era)
      VALUES ($1, 'BLUEPRINT', $2, $3)
      RETURNING id, tier, era
      `,
      [cleanUsername, blueprintTier, era]
    );

    const minted = mintRes.rows[0];

    // 9️⃣ Read updated EMP balance
    const updatedEmpRes = await clientConn.query(
      `
      SELECT balance
      FROM emp_balances
      WHERE username = $1
      `,
      [cleanUsername]
    );

    const updatedEmp = parseFloat(updatedEmpRes.rows[0]?.balance || 0);

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "Extra blueprint minted successfully.",
      blueprint: {
        id: minted.id,
        tier: minted.tier,
        era: minted.era,
      },
      empSpent: empCost,
      empBalance: updatedEmp,
      totalSlots,
      totalBlueprintsBeforeMint: totalBlueprints,
      eligibleMintsBeforeMint: eligibleMints,
      eligibleMintsRemaining: Math.max(eligibleMints - 1, 0),
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("🔥 Mint Extra Blueprint Error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to mint extra blueprint.",
    });
  } finally {
    clientConn.release();
  }
});
// =========================================================
// MYDEMPIRE — ADMIN BACKEND PATCH
// Paste these routes into server.js
// Recommended placement:
// AFTER /debug-orders
// BEFORE frontend static hosting block
// =========================================================

// ===============================
// 🛡 ADMIN AUTH HELPER
// ===============================
function requireAdmin(req, res, next) {
  const adminKey = req.headers["x-admin-key"];

  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({
      success: false,
      error: "ADMIN_SECRET is not configured on backend.",
    });
  }

  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(403).json({
      success: false,
      error: "Unauthorized admin request.",
    });
  }

  next();
}
// ===============================
// 🧱 WITHDRAWAL REQUESTS TABLE INIT
// ===============================
async function ensureWithdrawalRequestsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      amount NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP NULL,
      processed_by TEXT NULL,
      notes TEXT NULL
    );
  `);
}
// ===============================
// 🧱 PLAYER WALLETS TABLE INIT
// ===============================
async function ensurePlayerWalletsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_wallets (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      hive_balance NUMERIC NOT NULL DEFAULT 0,
      total_claimed NUMERIC NOT NULL DEFAULT 0,
      total_withdrawn NUMERIC NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
// ===============================
// 🧱 PLAYER REWARD ENTRIES TABLE INIT
// ===============================
async function ensurePlayerRewardEntriesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_reward_entries (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      cycle_date DATE NOT NULL,
      reward_cycle_id INTEGER REFERENCES reward_cycles(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL DEFAULT 0,
      claimed BOOLEAN NOT NULL DEFAULT FALSE,
      expired BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (username, cycle_date)
    );
  `);
}

// ===============================
// 🧱 MARKETPLACE LISTINGS TABLE INIT
// ===============================
async function ensureMarketplaceListingsTable() {

  // DEV RESET (safe during development)
  await pool.query(`DROP TABLE IF EXISTS emp_locks CASCADE`);
  await pool.query(`DROP TABLE IF EXISTS marketplace_listings CASCADE`);

  await pool.query(`
    CREATE TABLE marketplace_listings (
      id SERIAL PRIMARY KEY,
      seller_username TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      asset_id INTEGER NULL,
      quantity NUMERIC NOT NULL DEFAULT 0,
      unit_price_hive NUMERIC NOT NULL DEFAULT 0,
      total_price_hive NUMERIC NOT NULL DEFAULT 0,
      fee_percent NUMERIC NOT NULL DEFAULT 0,
      fee_amount_hive NUMERIC NOT NULL DEFAULT 0,
      seller_amount_hive NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      buyer_username TEXT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      sold_at TIMESTAMP NULL,
      cancelled_at TIMESTAMP NULL
    );
  `);

  await pool.query(`
    CREATE INDEX idx_marketplace_asset_status
    ON marketplace_listings (asset_type, status, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX idx_marketplace_seller
    ON marketplace_listings (seller_username, status);
  `);
}

// ===============================
// 🧱 EMP LOCKS TABLE INIT
// ===============================
async function ensureEmpLocksTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS emp_locks (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      listing_id INTEGER NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'locked',   -- locked / released / consumed
      created_at TIMESTAMP DEFAULT NOW(),
      released_at TIMESTAMP NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_emp_locks_username_status
    ON emp_locks (username, status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_emp_locks_listing
    ON emp_locks (listing_id);
  `);
}
// ===============================
// 🧱 BLUEPRINT LOCKS TABLE INIT
// ===============================
async function ensureBlueprintLocksTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blueprint_locks (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      nft_id INTEGER NOT NULL,
      listing_id INTEGER NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'locked',   -- locked / released / consumed
      created_at TIMESTAMP DEFAULT NOW(),
      released_at TIMESTAMP NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_blueprint_locks_username_status
    ON blueprint_locks (username, status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_blueprint_locks_nft_status
    ON blueprint_locks (nft_id, status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_blueprint_locks_listing
    ON blueprint_locks (listing_id);
  `);
}
// ===============================
// 🧱 MARKETPLACE PURCHASE SESSIONS TABLE INIT
// ===============================
async function ensureMarketplacePurchaseSessionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_purchase_sessions (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
      buyer_username TEXT NOT NULL,
      seller_username TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      quantity NUMERIC NOT NULL DEFAULT 0,
      total_price_hive NUMERIC NOT NULL DEFAULT 0,
      fee_amount_hive NUMERIC NOT NULL DEFAULT 0,
      seller_amount_hive NUMERIC NOT NULL DEFAULT 0,
      seller_payment_memo TEXT NOT NULL,
      fee_payment_memo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',   -- pending / completed / expired / cancelled
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_sessions_listing
    ON marketplace_purchase_sessions (listing_id, status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_sessions_buyer
    ON marketplace_purchase_sessions (buyer_username, status, created_at DESC);
  `);

    
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_completed_session_per_listing
    ON marketplace_purchase_sessions (listing_id)
    WHERE status = 'completed';
  `);
   
}

// ===============================
// 🧱 ADMIN FLAGS TABLE INIT
// ===============================
async function ensureAdminFlagsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_flags (
      key TEXT PRIMARY KEY,
      value BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const defaultFlags = [
    "pack_sales_enabled",
    "blueprint_mint_enabled",
    "factory_build_enabled",
    "marketplace_enabled"
  ];

  for (const key of defaultFlags) {
    await pool.query(
      `
      INSERT INTO admin_flags (key, value)
      VALUES ($1, TRUE)
      ON CONFLICT (key) DO NOTHING
      `,
      [key]
    );
  }
}
async function ensureFounderPackColumns() {
  await pool.query(`
    ALTER TABLE nfts
    ADD COLUMN IF NOT EXISTS founder_pack BOOLEAN DEFAULT FALSE;
  `);

  await pool.query(`
    ALTER TABLE nfts
    ADD COLUMN IF NOT EXISTS writ_eligible BOOLEAN DEFAULT FALSE;
  `);

  await pool.query(`
    ALTER TABLE nfts
    ADD COLUMN IF NOT EXISTS bonus_group TEXT DEFAULT NULL;
  `);
}

// ===============================
// 🧱 REWARD CYCLES TABLE INIT
// ===============================
async function ensureRewardCyclesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reward_cycles (
      id SERIAL PRIMARY KEY,
      cycle_date DATE NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE reward_cycles
    ADD COLUMN IF NOT EXISTS treasury_balance NUMERIC NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE reward_cycles
    ADD COLUMN IF NOT EXISTS global_ep NUMERIC NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE reward_cycles
    ADD COLUMN IF NOT EXISTS treasury_access_multiplier NUMERIC NOT NULL DEFAULT 1;
  `);

  await pool.query(`
    ALTER TABLE reward_cycles
    ADD COLUMN IF NOT EXISTS effective_treasury NUMERIC NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE reward_cycles
    ADD COLUMN IF NOT EXISTS treasury_strength_ratio NUMERIC NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE reward_cycles
    ADD COLUMN IF NOT EXISTS emission_rate NUMERIC NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE reward_cycles
    ADD COLUMN IF NOT EXISTS reward_pool NUMERIC NOT NULL DEFAULT 0;
  `);
}

// ===============================
// 🧱 MAINTENANCE COLUMNS INIT
// ===============================
async function ensureMaintenanceColumns() {
  await pool.query(`
    ALTER TABLE factories
    ADD COLUMN IF NOT EXISTS maintenance_ends_at TIMESTAMP;
  `);
}
// Call once on boot
ensureAdminFlagsTable().catch((err) => {
  console.error("❌ Failed to initialize admin_flags:", err.message);
});
ensureFounderPackColumns().catch((err) => {
  console.error("❌ Failed to initialize founder pack columns:", err.message);
});
ensureMaintenanceColumns().catch((err) => {
  console.error("❌ Failed to initialize maintenance columns:", err.message);
});

ensureRewardCyclesTable().catch((err) => {
  console.error("❌ Failed to initialize reward cycles table:", err.message);
});
ensurePlayerRewardEntriesTable().catch((err) => {
  console.error("❌ Failed to initialize player reward entries table:", err.message);
});
ensurePlayerWalletsTable().catch((err) => {
  console.error("❌ Failed to initialize player wallets table:", err.message);
});
ensureWithdrawalRequestsTable().catch((err) => {
  console.error("❌ Failed to initialize withdrawal requests table:", err.message);
});
app.get("/debug-player-reward-entries-count", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM player_reward_entries
    `);

    res.json({
      player_reward_entries_count: result.rows[0]?.count || 0
    });
  } catch (err) {
    console.error("Player reward entries count debug error:", err);
    res.status(500).json({ error: "Failed to read player reward entries count" });
  }
});
app.get("/debug-reward-cycles-count", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM reward_cycles
    `);

    res.json({
      reward_cycles_count: result.rows[0]?.count || 0
    });
  } catch (err) {
    console.error("Reward cycles count debug error:", err);
    res.status(500).json({ error: "Failed to read reward cycles count" });
  }
});
app.get("/debug-withdrawal-requests/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM withdrawal_requests
      WHERE username = $1
      ORDER BY created_at DESC
      `,
      [String(username || "").trim().toLowerCase()]
    );

    res.json({
      success: true,
      requests: result.rows
    });
  } catch (err) {
    console.error("Debug withdrawal requests error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to load withdrawal requests."
    });
  }
});
// ===============================
// 🧪 CREATE DAILY REWARD CYCLE
// ===============================
app.get("/admin/create-reward-cycle", async (req, res) => {
  try {
    const cycleDate = new Date().toISOString().slice(0, 10);

    // Prevent duplicate daily cycle
    const existingRes = await pool.query(
      `
      SELECT id
      FROM reward_cycles
      WHERE cycle_date = $1
      LIMIT 1
      `,
      [cycleDate]
    );

    if (existingRes.rows.length > 0) {
      return res.json({
        success: false,
        message: "Reward cycle already exists for today.",
        cycle_date: cycleDate
      });
    }

    // ✅ Correct treasury = vault + reward wallet
    const treasuryAccounts = await client.database.getAccounts([
      "mydempire-vault",
      "mydempire-reward"
    ]);

    const treasuryBalance = treasuryAccounts.reduce((sum, acc) => {
      const hiveBalance = parseFloat(acc.balance || "0");
      return sum + (Number.isFinite(hiveBalance) ? hiveBalance : 0);
    }, 0);

    // ✅ Only truly active factories count toward global EP
    const factoriesRes = await pool.query(`
      SELECT f.*, n.tier AS land_tier
      FROM factories f
      JOIN nfts n ON n.id = f.land_id
      WHERE LOWER(COALESCE(f.status, 'inactive')) = 'active'
        AND f.maintenance_ends_at IS NOT NULL
        AND f.maintenance_ends_at > NOW()
    `);

    const factories = factoriesRes.rows || [];

    function calculateFactoryEP(factory) {
      const BASE_RATE = 10;

      const LAND_MULTIPLIERS = {
        L1: 1.0,
        L2: 1.5,
        L3: 2.0
      };

      function getLevelMultiplier(level) {
        return 1 + (level - 1) * 0.25;
      }

      const landTier = String(factory.land_tier || "").trim().toUpperCase();
      const landMultiplier = LAND_MULTIPLIERS[landTier] || 1.0;
      const levelMultiplier = getLevelMultiplier(Number(factory.level || 1));

      return BASE_RATE * landMultiplier * levelMultiplier;
    }

    let globalEP = 0;

    for (const f of factories) {
      globalEP += calculateFactoryEP(f);
    }

    const rewardData = calculateRewardPool(treasuryBalance, globalEP);

    const insertRes = await pool.query(
      `
      INSERT INTO reward_cycles (
        cycle_date,
        treasury_balance,
        global_ep,
        treasury_access_multiplier,
        effective_treasury,
        treasury_strength_ratio,
        emission_rate,
        reward_pool
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        cycleDate,
        treasuryBalance,
        globalEP,
        rewardData.treasuryAccessMultiplier,
        rewardData.effectiveTreasury,
        rewardData.treasuryStrengthRatio,
        rewardData.emissionRate,
        rewardData.rewardPool
      ]
    );

    return res.json({
      success: true,
      message: "Reward cycle created successfully.",
      cycle: insertRes.rows[0]
    });
  } catch (err) {
    console.error("Create reward cycle error:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ===============================
// 🧪 ALLOCATE DAILY PLAYER REWARDS
// ===============================
app.get("/admin/allocate-player-rewards", async (req, res) => {
  try {
    const cycleDate = new Date().toISOString().slice(0, 10);

    // 1. Find today's reward cycle
    const cycleRes = await pool.query(
      `
      SELECT *
      FROM reward_cycles
      WHERE cycle_date = $1
      LIMIT 1
      `,
      [cycleDate]
    );

    if (!cycleRes.rows.length) {
      return res.status(400).json({
        success: false,
        error: "No reward cycle exists for today."
      });
    }

    const cycle = cycleRes.rows[0];

    // 2. Prevent duplicate allocation for same day
    const existingRes = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM player_reward_entries
      WHERE cycle_date = $1
      `,
      [cycleDate]
    );

    if ((existingRes.rows[0]?.count || 0) > 0) {
      return res.json({
        success: false,
        message: "Player rewards already allocated for today.",
        cycle_date: cycleDate
      });
    }

    // 3. Load active factories
    const factoriesRes = await pool.query(`
  SELECT f.*, n.tier AS land_tier
  FROM factories f
  JOIN nfts n ON n.id = f.land_id
  WHERE LOWER(COALESCE(f.status, 'inactive')) = 'active'
`);

    const factories = factoriesRes.rows || [];

    function calculateFactoryEP(factory) {
  const BASE_RATE = 10;

  const LAND_MULTIPLIERS = {
    L1: 1.0,
    L2: 1.5,
    L3: 2.0
  };

  function getLevelMultiplier(level) {
    return 1 + (level - 1) * 0.25;
  }

  const landTier = String(factory.land_tier || "").trim().toUpperCase();
  const landMultiplier = LAND_MULTIPLIERS[landTier] || 1.0;
  const levelMultiplier = getLevelMultiplier(Number(factory.level || 1));

  return BASE_RATE * landMultiplier * levelMultiplier;
}

    // 4. Aggregate base EP by username
    const playerBaseEP = {};

    for (const f of factories) {
      const username = String(f.username || "").trim().toLowerCase();
      const factoryEP = calculateFactoryEP(f);

      if (!username || factoryEP <= 0) continue;

      if (!playerBaseEP[username]) {
        playerBaseEP[username] = 0;
      }

      playerBaseEP[username] += factoryEP;
    }

    const usernames = Object.keys(playerBaseEP);

    if (!usernames.length || Number(cycle.global_ep || 0) <= 0 || Number(cycle.reward_pool || 0) <= 0) {
      return res.json({
        success: true,
        message: "No active EP or reward pool for allocation.",
        allocations_created: 0
      });
    }

    // 5. Load relic counts for those players
    const relicRes = await pool.query(
      `
      SELECT username, COUNT(*)::int AS relic_count
      FROM nfts
      WHERE type = 'RELIC'
        AND era = 'GENESIS'
        AND username = ANY($1::text[])
      GROUP BY username
      `,
      [usernames]
    );

    const relicMap = {};
    for (const row of relicRes.rows) {
      relicMap[String(row.username || "").trim().toLowerCase()] = Math.min(Number(row.relic_count) || 0, 2);
    }

    // 6. Apply player-level relic boost
    const playerBoostedEP = {};
    let totalBoostedEP = 0;

    for (const username of usernames) {
      const baseEP = Number(playerBaseEP[username] || 0);
      const activeRelics = relicMap[username] || 0;
      const relicBoost = activeRelics * 3; // 3% each, max 2 relics = 6%
      const boostedEP = baseEP * (1 + relicBoost / 100);

      playerBoostedEP[username] = boostedEP;
      totalBoostedEP += boostedEP;
    }

    if (totalBoostedEP <= 0) {
      return res.json({
        success: true,
        message: "No boosted EP available for allocation.",
        allocations_created: 0
      });
    }

    // 7. Insert one player reward entry per username
    let allocationsCreated = 0;

    for (const username of usernames) {
      const boostedEP = Number(playerBoostedEP[username] || 0);
      if (boostedEP <= 0) continue;

      const rewardAmount = (boostedEP / totalBoostedEP) * Number(cycle.reward_pool || 0);

      await pool.query(
        `
        INSERT INTO player_reward_entries (
          username,
          cycle_date,
          reward_cycle_id,
          amount,
          claimed,
          expired
        )
        VALUES ($1, $2, $3, $4, FALSE, FALSE)
        `,
        [
          username,
          cycleDate,
          cycle.id,
          rewardAmount
        ]
      );

      allocationsCreated++;
    }

    return res.json({
      success: true,
      message: "Player rewards allocated successfully.",
      cycle_date: cycleDate,
      reward_pool: Number(cycle.reward_pool),
      total_boosted_ep: Number(totalBoostedEP.toFixed(8)),
      allocations_created: allocationsCreated
    });
  } catch (err) {
    console.error("Allocate player rewards error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to allocate player rewards."
    });
  }
});
app.get("/debug-factories", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT *
      FROM factories
      LIMIT 10
    `);

    res.json(r.rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// 📊 ADMIN OVERVIEW STATS
// ===============================
app.get("/admin/overview", requireAdmin, async (req, res) => {
  try {
    const [
      genesisOrdersRes,
      treasuryRes,
      empRes,
      factoryRes,
      playerRes,
      flagsRes
    ] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN era = 'GENESIS' AND status = 'completed' THEN packs ELSE 0 END), 0) AS genesis_packs_sold,
          COALESCE(SUM(CASE WHEN era = 'PRE_GENESIS' AND status = 'completed' THEN packs ELSE 0 END), 0) AS pre_genesis_packs_sold
        FROM orders
      `),
      pool.query(`
        SELECT balance, updated_at
        FROM treasury
        ORDER BY id ASC
        LIMIT 1
      `),
      pool.query(`
        SELECT COALESCE(SUM(balance), 0) AS total_emp
        FROM emp_balances
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_factories,
          COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) = 'ACTIVE')::int AS active_factories,
          COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) IN ('UPGRADING', 'BUILDING'))::int AS upgrading_factories,
          COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) NOT IN ('ACTIVE', 'UPGRADING', 'BUILDING'))::int AS inactive_factories
        FROM factories
      `),
      pool.query(`
        SELECT COUNT(DISTINCT username)::int AS active_players
        FROM (
          SELECT username FROM orders WHERE status = 'completed'
          UNION
          SELECT username FROM nfts
          UNION
          SELECT username FROM emp_balances
          UNION
          SELECT username FROM factories
        ) u
      `),
      pool.query(`
        SELECT key, value, updated_at
        FROM admin_flags
        ORDER BY key ASC
      `)
    ]);

    const genesisSold = parseInt(genesisOrdersRes.rows[0]?.genesis_packs_sold || 0, 10);
    const preGenesisSold = parseInt(genesisOrdersRes.rows[0]?.pre_genesis_packs_sold || 0, 10);

    const treasury = treasuryRes.rows[0] || { balance: 0, updated_at: null };
    const emp = empRes.rows[0] || { total_emp: 0 };
    const factories = factoryRes.rows[0] || {
      total_factories: 0,
      active_factories: 0,
      upgrading_factories: 0,
      inactive_factories: 0,
    };
    const players = playerRes.rows[0] || { active_players: 0 };

    const flags = {};
    for (const row of flagsRes.rows) {
      flags[row.key] = {
        value: row.value,
        updated_at: row.updated_at,
      };
    }

    return res.json({
      success: true,
      phase: process.env.GAME_PHASE || 'GENESIS',
      packs: {
        genesis_sold: genesisSold,
        genesis_remaining: 5000 - genesisSold,
        pre_genesis_sold: preGenesisSold,
      },
      treasury: {
        balance: Number(treasury.balance || 0),
        updated_at: treasury.updated_at,
      },
      emp: {
        total_supply: Number(emp.total_emp || 0),
      },
      factories: {
        total: Number(factories.total_factories || 0),
        active: Number(factories.active_factories || 0),
        upgrading: Number(factories.upgrading_factories || 0),
        inactive: Number(factories.inactive_factories || 0),
      },
      players: {
        active: Number(players.active_players || 0),
      },
      flags,
    });
  } catch (err) {
    console.error("🔥 /admin/overview error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load admin overview.",
    });
  }
});

// ===============================
// 👤 ADMIN PLAYER INSPECTOR
// ===============================
app.get("/admin/player/:username", requireAdmin, async (req, res) => {
  try {
    const username = String(req.params.username || "")
      .trim()
      .replace("@", "")
      .toLowerCase();

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required.",
      });
    }

    const [dashboardRes, landsRes, blueprintRes, packsRes, writRes] = await Promise.all([
      pool.query(`
        SELECT
          $1::text AS username,
          COALESCE((SELECT balance FROM emp_balances WHERE username = $1), 0) AS emp_balance,
          (SELECT COUNT(*) FROM factories WHERE username = $1)::int AS total_factories,
          (SELECT COUNT(*) FROM nfts WHERE username = $1 AND type = 'RELIC')::int AS relic_count,
          (SELECT COUNT(*) FROM nfts WHERE username = $1 AND type = 'WRIT')::int AS writ_count
      `, [username]),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_lands,
          COUNT(*) FILTER (WHERE tier = 'L1')::int AS l1,
          COUNT(*) FILTER (WHERE tier = 'L2')::int AS l2,
          COUNT(*) FILTER (WHERE tier = 'L3')::int AS l3
        FROM nfts
        WHERE username = $1 AND type = 'LAND'
      `, [username]),
      pool.query(`
        SELECT COUNT(*)::int AS total_blueprints
        FROM nfts
        WHERE username = $1 AND LOWER(type) = 'blueprint'
      `, [username]),
      pool.query(`
        SELECT COUNT(*)::int AS unopened_packs
        FROM nfts
        WHERE username = $1
          AND type = 'PACK'
          AND tier = 'SEALED'
      `, [username]),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_orders,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN packs ELSE 0 END), 0)::int AS total_packs_bought
        FROM orders
        WHERE username = $1
      `, [username])
    ]);

    const base = dashboardRes.rows[0] || {};
    const lands = landsRes.rows[0] || {};
    const blueprints = blueprintRes.rows[0] || {};
    const packs = packsRes.rows[0] || {};
    const orders = writRes.rows[0] || {};

    return res.json({
      success: true,
      username,
      emp_balance: Number(base.emp_balance || 0),
      total_factories: Number(base.total_factories || 0),
      relic_count: Number(base.relic_count || 0),
      writ_count: Number(base.writ_count || 0),
      total_lands: Number(lands.total_lands || 0),
      land_breakdown: {
        l1: Number(lands.l1 || 0),
        l2: Number(lands.l2 || 0),
        l3: Number(lands.l3 || 0),
      },
      total_blueprints: Number(blueprints.total_blueprints || 0),
      unopened_packs: Number(packs.unopened_packs || 0),
      completed_orders: Number(orders.completed_orders || 0),
      total_packs_bought: Number(orders.total_packs_bought || 0),
    });
  } catch (err) {
    console.error("🔥 /admin/player/:username error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to inspect player.",
    });
  }
});
function defaultFactoryName(industry, level, id) {
  return `${industry} Factory ${level} #${id}`;
}
app.post("/build-factory", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const { username, land_id, blueprint_id, factory_name, use_relic_bonus } = req.body;

    if (!username || !land_id || !blueprint_id) {
      return res.status(400).json({
        success: false,
        error: "Missing username, land_id, or blueprint_id."
      });
    }

    await clientConn.query("BEGIN");

    // 1. Verify land ownership
    const landRes = await clientConn.query(
      `
      SELECT id, username, tier
      FROM nfts
      WHERE id = $1
        AND username = $2
        AND type = 'LAND'
      FOR UPDATE
      `,
      [land_id, username]
    );

    if (!landRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Land not found or not owned by player."
      });
    }

    const land = landRes.rows[0];
    const landTier = String(land.tier || "").trim().toUpperCase();

    // 2. Verify blueprint ownership
    const bpRes = await clientConn.query(
      `
      SELECT id, username, tier
      FROM nfts
      WHERE id = $1
        AND username = $2
        AND LOWER(type) = 'blueprint'
      FOR UPDATE
      `,
      [blueprint_id, username]
    );

    if (!bpRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Blueprint not found or not owned by player."
      });
    }

    const blueprint = bpRes.rows[0];
    const parsed = parseBlueprintTier(blueprint.tier);
    const blueprintIndustry = parsed.industry;
    const blueprintLevel = parsed.level;

    if (!blueprintIndustry || !blueprintLevel) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Invalid blueprint tier format."
      });
    }

    // 3. Check slot limit
    const slotRes = await clientConn.query(
      `
      SELECT COUNT(*)::int AS used_slots
      FROM factories
      WHERE land_id = $1
      `,
      [land_id]
    );

    const usedSlots = Number(slotRes.rows[0]?.used_slots || 0);
    const maxSlots = getLandSlotLimit(landTier);

    if (usedSlots >= maxSlots) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "No free slot available on this land."
      });
    }

    // 4. Zoning rules
    if (landTier === "L1" && blueprintLevel === "B5") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "L1 land cannot build B5 factories."
      });
    }

    if ((landTier === "L2" || landTier === "L3") && blueprintLevel === "B5") {
      const b5Check = await clientConn.query(
        `
        SELECT COUNT(*)::int AS b5_count
        FROM factories
        WHERE land_id = $1
          AND UPPER(COALESCE(blueprint_tier, '')) LIKE '%_B5'
        `,
        [land_id]
      );

      const b5Count = Number(b5Check.rows[0]?.b5_count || 0);

      if (b5Count >= 1) {
        await clientConn.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "Only one B5 factory is allowed on this land."
        });
      }
    }

        // 5A. Relic ownership check
    let ownsRelic = false;

    const relicRes = await clientConn.query(
      `
      SELECT COUNT(*)::int AS relic_count
      FROM nfts
      WHERE username = $1
        AND type = 'RELIC'
      `,
      [username]
    );

    const relicCount = Number(relicRes.rows[0]?.relic_count || 0);
    ownsRelic = relicCount > 0;

    // 5. EMP balance check
        const normalCostEMP = getBuildEmpCostByLandTier(landTier);

    const usingRelicBonus = Boolean(use_relic_bonus) && ownsRelic;

    const costEMP = usingRelicBonus
      ? Math.ceil(normalCostEMP * 0.25)
      : normalCostEMP;

    const empRes = await clientConn.query(
      `
      SELECT balance
      FROM emp_balances
      WHERE username = $1
      FOR UPDATE
      `,
      [username]
    );

    const empBalance = Number(empRes.rows[0]?.balance || 0);

    if (empBalance < costEMP) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Not enough EMP. Required: ${costEMP}`
      });
    }

    // 6. Deduct EMP
    await clientConn.query(
      `
      UPDATE emp_balances
      SET balance = balance - $1
      WHERE username = $2
      `,
      [costEMP, username]
    );

    // 7. Consume blueprint permanently
    await clientConn.query(
      `
      DELETE FROM nfts
      WHERE id = $1
      `,
      [blueprint_id]
    );

    // 8. Construction time
const normalBuildDays = buildDaysForBlueprintTier(blueprintLevel);
const buildDays = usingRelicBonus ? 0 : normalBuildDays;

// 9. Insert factory
const cleanFactoryName = String(factory_name || "").trim().slice(0, 30);

const now = new Date();
const buildCompleteAt = new Date(now);

if (!usingRelicBonus) {
  buildCompleteAt.setDate(buildCompleteAt.getDate() + buildDays);
}

const factoryStatus = usingRelicBonus ? "active" : "building";
const builtAtValue = buildCompleteAt;
const upgradeCompleteValue = null;

    const factoryInsert = await clientConn.query(
      `
      INSERT INTO factories (
        username,
        land_id,
        blueprint_id,
        level,
        status,
        built_at,
        blueprint_tier,
        upgrade_started_at,
        upgrade_complete_at,
        factory_name
      )
      VALUES (
        $1, $2, $3, 1, $4, $5, $6, NOW(), $7, $8
      )
      RETURNING *
      `,
      [
        username,
        land_id,
        blueprint_id,
        factoryStatus,
        builtAtValue,
        blueprint.tier,
        upgradeCompleteValue,
        cleanFactoryName || null
      ]
    );

    let factory = factoryInsert.rows[0];

    // 10. Default name if empty
    if (!factory.factory_name) {
      const autoName = defaultFactoryName(blueprintIndustry, blueprintLevel, factory.id);

      const updated = await clientConn.query(
        `
        UPDATE factories
        SET factory_name = $1
        WHERE id = $2
        RETURNING *
        `,
        [autoName, factory.id]
      );

      factory = updated.rows[0];
    }

    await clientConn.query("COMMIT");

   return res.json({
  success: true,
  message: usingRelicBonus
    ? "Relic build activated successfully. Factory is now active."
    : "Factory build started successfully.",
  factory,
  build_cost_emp: costEMP,
  build_days: buildDays,
  used_relic_bonus: usingRelicBonus,
  owns_relic: ownsRelic
});
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("🔥 Build factory error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to build factory."
    });
  } finally {
    clientConn.release();
  }
});

// ===============================
// 🚨 ADMIN FLAG TOGGLE
// ===============================
app.post("/admin/flags/:key", requireAdmin, async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();
    const { value } = req.body;

    const allowed = new Set([
      "pack_sales_enabled",
      "blueprint_mint_enabled",
      "factory_build_enabled",
      "marketplace_enabled",
    ]);

    if (!allowed.has(key)) {
      return res.status(400).json({
        success: false,
        error: "Invalid admin flag key.",
      });
    }

    if (typeof value !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "Flag value must be true or false.",
      });
    }

    const result = await pool.query(
      `
      UPDATE admin_flags
      SET value = $1,
          updated_at = NOW()
      WHERE key = $2
      RETURNING key, value, updated_at
      `,
      [value, key]
    );

    return res.json({
      success: true,
      flag: result.rows[0],
    });
  } catch (err) {
    console.error("🔥 /admin/flags/:key error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to update admin flag.",
    });
  }
});

app.get("/admin/fix-building-factories", async (req, res) => {

  if (req.query.key !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {

    const result = await pool.query(`
      UPDATE factories
      SET status = 'active'
      WHERE LOWER(status) = 'building'
        AND built_at IS NOT NULL
        AND built_at <= NOW()
      RETURNING id, username, land_id
    `);

    res.json({
      success: true,
      activated: result.rowCount
    });

  } catch (err) {
    console.error("Fix building factories error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});
app.post("/factory/rename", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const { username, factory_id, factory_name } = req.body || {};

    const cleanName = String(factory_name || "").trim();

    if (!username || !factory_id || !cleanName) {
      return res.status(400).json({
        success: false,
        error: "username, factory_id and factory_name are required."
      });
    }

    if (cleanName.length > 60) {
      return res.status(400).json({
        success: false,
        error: "Factory name must be 60 characters or less."
      });
    }

    const checkRes = await clientConn.query(
      `
      SELECT id, username, status
      FROM factories
      WHERE id = $1 AND username = $2
      LIMIT 1
      `,
      [factory_id, username]
    );

    if (!checkRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Factory not found."
      });
    }

    await clientConn.query(
      `
      UPDATE factories
      SET factory_name = $1
      WHERE id = $2 AND username = $3
      `,
      [cleanName, factory_id, username]
    );

    return res.json({
      success: true,
      message: "Factory renamed successfully."
    });
  } catch (err) {
    console.error("Rename factory error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to rename factory."
    });
  } finally {
    clientConn.release();
  }
});
app.post("/claim-production-all", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Missing username."
      });
    }

    await clientConn.query("BEGIN");

    // Load all ACTIVE factories for this player
    const factoriesRes = await clientConn.query(
      `
      SELECT *
      FROM factories
      WHERE username = $1
        AND UPPER(COALESCE(status, 'inactive')) = 'ACTIVE'
      ORDER BY id ASC
      FOR UPDATE
      `,
      [username]
    );

    const factories = factoriesRes.rows || [];

    if (!factories.length) {
      await clientConn.query("COMMIT");
      return res.json({
        success: true,
        message: "No active factories found.",
        totalEMPClaimed: 0,
        totalEP: 0,
        factoryCountClaimed: 0,
        breakdown: []
      });
    }

    let totalEMPClaimed = 0;
    let totalEP = 0;
    const breakdown = [];
    const claimedFactoryIds = [];

    for (const factory of factories) {
      const earnedFloat = Number(calculateProduction(factory) || 0);
      const earnedEMP = Math.floor(earnedFloat);

      if (!Number.isFinite(earnedFloat) || earnedEMP <= 0) {
        continue;
      }

      totalEMPClaimed += earnedEMP;
      totalEP += earnedFloat;
      claimedFactoryIds.push(factory.id);

      breakdown.push({
        factory_id: factory.id,
        land_id: factory.land_id,
        blueprint_id: factory.blueprint_id,
        earnedEP: earnedFloat,
        earnedEMP: earnedEMP
      });
    }

    if (totalEMPClaimed <= 0 || claimedFactoryIds.length === 0) {
      await clientConn.query("COMMIT");
      return res.json({
        success: true,
        message: "No production available to claim.",
        totalEMPClaimed: 0,
        totalEP: 0,
        factoryCountClaimed: 0,
        breakdown: []
      });
    }

    // Ensure balance row exists
    await clientConn.query(
      `
      INSERT INTO emp_balances (username, balance)
      VALUES ($1, 0)
      ON CONFLICT (username) DO NOTHING
      `,
      [username]
    );

    // Credit EMP
    await clientConn.query(
      `
      UPDATE emp_balances
      SET balance = balance + $1
      WHERE username = $2
      `,
      [totalEMPClaimed, username]
    );

    // Reset production timer
    await clientConn.query(
      `
      UPDATE factories
      SET last_claimed_at = NOW()
      WHERE id = ANY($1::int[])
      `,
      [claimedFactoryIds]
    );

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "Production claimed successfully.",
      totalEMPClaimed,
      totalEP,
      factoryCountClaimed: claimedFactoryIds.length,
      breakdown
    });
  } catch (err) {
    try {
      await clientConn.query("ROLLBACK");
    } catch (e) {}

    console.error("Claim all production error:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to claim production."
    });
  } finally {
    clientConn.release();
  }
});
// ===============================
// ⚡ GLOBAL EMPIRE POWER INDEX
// ===============================
app.get("/global-ep", async (req, res) => {
  try {
    const factoriesRes = await pool.query(`
      SELECT *
      FROM factories
      WHERE LOWER(COALESCE(status, 'inactive')) = 'active'
    `);

    const factories = factoriesRes.rows || [];

    let totalActiveFactories = 0;
    let totalBaseEP = 0;

    function getFactoryEPValue(f) {
      const candidates = [
        f.factoryEP,
        f.factoryep,
        f.factory_ep,
        f.ep_per_day,
        f.ep
      ];

      for (const value of candidates) {
        const n = parseFloat(value);
        if (Number.isFinite(n) && n > 0) {
          return n;
        }
      }

      return 0;
    }

    for (const f of factories) {
      const factoryEP = getFactoryEPValue(f);

      if (factoryEP > 0) {
        totalActiveFactories++;
        totalBaseEP += factoryEP;
      }
    }

    const relicRes = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM nfts
      WHERE type = 'RELIC'
        AND era = 'GENESIS'
    `);

    const totalRelics = relicRes.rows[0]?.count || 0;

    // Global relic boost model:
    // each player gets max 2 counted relics personally,
    // but for public global EP index we expose total relic count separately
    // and keep boosted EP equal to base EP for now to avoid misleading aggregation.
    const totalBoostedEP = totalBaseEP;

    res.json({
      active_factories: totalActiveFactories,
      total_base_ep_per_day: Number(totalBaseEP.toFixed(2)),
      total_boosted_ep_per_day: Number(totalBoostedEP.toFixed(2)),
      total_relics_minted: totalRelics,
      note: "Global boosted EP currently shown equal to base EP. Player-level relic boosts are applied in personal dashboard calculations."
    });
  } catch (err) {
    console.error("Global EP endpoint error:", err);
    res.status(500).json({ error: "Failed to load global EP" });
  }
});
// ===============================
// 🌍 GLOBAL TRANSPARENCY ENDPOINT
// ===============================
app.get("/transparency", async (req, res) => {
  try {

    // Genesis sale
    const saleRes = await pool.query(`
      SELECT COALESCE(SUM(packs),0)::int AS total_sold
      FROM orders
      WHERE status = 'completed'
      AND era = 'GENESIS'
    `);

    const totalSold = saleRes.rows[0]?.total_sold || 0;

    const founderSold = Math.min(totalSold, GENESIS_FOUNDER_CAP);
    const expansionSold = Math.max(totalSold - GENESIS_FOUNDER_CAP, 0);

    // NFT supply
    const nftRes = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE type='LAND') AS lands,
        COUNT(*) FILTER (WHERE type='BLUEPRINT') AS blueprints,
        COUNT(*) FILTER (WHERE type='FACTORY') AS factories,
        COUNT(*) FILTER (WHERE type='RELIC') AS relics,
        COUNT(*) FILTER (WHERE type='WRIT') AS writs
      FROM nfts
    `);

    // active factories
    const factoryRes = await pool.query(`
      SELECT COUNT(*) AS active_factories
      FROM factories
      WHERE status='active'
    `);

    res.json({

      treasury_wallets: {
        vault: "@mydempire-vault",
        revenue: "@mydempiregain",
        dao: "@mydempire-dao",
        payment_gateway: "@mydempire-reward"
      },

      genesis_sale: {
        founder_cap: GENESIS_FOUNDER_CAP,
        founder_sold: founderSold,
        founder_remaining: GENESIS_FOUNDER_CAP - founderSold,
        expansion_cap: GENESIS_EXPANSION_CAP - GENESIS_FOUNDER_CAP,
        expansion_sold: expansionSold,
        total_sold: totalSold
      },

      nft_supply: nftRes.rows[0],

      factories: {
        active: factoryRes.rows[0]?.active_factories || 0
      },

      reward_system: {
        treasury_emission: "0.1% – 0.5% daily",
        reward_source: "@mydempire-vault"
      }

    });

  } catch (err) {
    console.error("Transparency endpoint error:", err);
    res.status(500).json({ error: "Transparency data unavailable" });
  }
});

// ===============================
// 🔧 PAY FACTORY MAINTENANCE
// ===============================
app.post("/factory/pay-maintenance", async (req, res) => {

  const { username, factory_id, days } = req.body;

  try {

    if (!days || days < 1 || days > 7) {
      return res.status(400).json({ error: "Days must be between 1 and 7." });
    }

    const factoryRes = await pool.query(
      `SELECT * FROM factories WHERE id=$1 AND username=$2`,
      [factory_id, username]
    );

    if (!factoryRes.rows.length) {
      return res.status(404).json({ error: "Factory not found." });
    }

    const factory = factoryRes.rows[0];

    const now = new Date();

        let maintenanceEnds = factory.maintenance_ends_at
      ? new Date(factory.maintenance_ends_at)
      : now;

    if (maintenanceEnds < now) {
      maintenanceEnds = now;
    }

    let remainingDays = Math.max(0, (maintenanceEnds - now) / (1000 * 60 * 60 * 24));

    if (remainingDays + days > 7) {
      return res.status(400).json({
        error: "Maintenance cannot exceed 7 days total."
      });
    }

    const epPerDay = 10 * (1 + ((Number(factory.level || 1) - 1) * 0.25));

    const cost = Math.ceil(epPerDay * days * 0.05);

    const empRes = await pool.query(
  `
  SELECT balance
  FROM emp_balances
  WHERE username = $1
  `,
  [username]
);

const balance = Number(empRes.rows[0]?.balance || 0);

    if (balance < cost) {
      return res.status(400).json({
        error: "Not enough EMP."
      });
    }

    const newMaintenanceEnd = new Date(
      maintenanceEnds.getTime() + days * 24 * 60 * 60 * 1000
    );

    await pool.query(
      `UPDATE factories SET maintenance_ends_at=$1 WHERE id=$2`,
      [newMaintenanceEnd, factory_id]
    );

    await pool.query(
  `
  UPDATE emp_balances
  SET balance = balance - $1
  WHERE username = $2
  `,
  [cost, username]
);

    res.json({
      success: true,
      days_added: days,
      emp_spent: cost,
      maintenance_until: newMaintenanceEnd
    });

  } catch (err) {

    console.error("Maintenance payment error:", err);

    res.status(500).json({
      error: "Maintenance payment failed."
    });

  }
});
app.get("/debug-player-wallet/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM player_wallets
      WHERE username = $1
      LIMIT 1
      `,
      [String(username || "").trim().toLowerCase()]
    );

    res.json({
      success: true,
      wallet: result.rows[0] || null
    });
  } catch (err) {
    console.error("Debug player wallet error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to load player wallet."
    });
  }
});
// ===============================
// 🧪 REWARD ENGINE DEBUG
// ===============================
app.get("/debug-reward-pool", async (req, res) => {
  try {
const treasuryBalance = treasuryAccounts.reduce((sum, acc) => {
  const hiveBalance = parseFloat(acc.balance || "0");
  return sum + (Number.isFinite(hiveBalance) ? hiveBalance : 0);
}, 0);

    const factoriesRes = await pool.query(`
      SELECT *
      FROM factories
      WHERE LOWER(COALESCE(status, 'inactive')) = 'active'
    `);

    const factories = factoriesRes.rows || [];

    function getFactoryEPValue(f) {
      const candidates = [
        f.factoryEP,
        f.factoryep,
        f.factory_ep,
        f.ep_per_day,
        f.ep
      ];

      for (const value of candidates) {
        const n = parseFloat(value);
        if (Number.isFinite(n) && n > 0) {
          return n;
        }
      }

      return 0;
    }

    let globalEP = 0;

    for (const f of factories) {
      globalEP += getFactoryEPValue(f);
    }

    const rewardData = calculateRewardPool(treasuryBalance, globalEP);

    res.json({
      treasuryBalance: Number(treasuryBalance.toFixed(8)),
      globalEP: Number(globalEP.toFixed(8)),
      ...rewardData
    });
  } catch (err) {
    console.error("Reward pool debug error:", err);
    res.status(500).json({ error: "Failed to calculate reward pool debug data" });
  }
});

app.get("/admin/reset-todays-reward-cycle", async (req, res) => {
  try {
    const cycleDate = new Date().toISOString().slice(0, 10);

    await pool.query(
      `DELETE FROM player_reward_entries WHERE cycle_date = $1`,
      [cycleDate]
    );

    await pool.query(
      `DELETE FROM reward_cycles WHERE cycle_date = $1`,
      [cycleDate]
    );

    res.json({
      success: true,
      message: "Today's reward cycle and player entries deleted.",
      cycle_date: cycleDate
    });
  } catch (err) {
    console.error("Reset today's reward cycle error:", err);
    res.status(500).json({ error: "Failed to reset today's reward cycle." });
  }
});
app.get("/debug-player-rewards/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
      `
      SELECT id, username, cycle_date, amount, claimed, expired, created_at
      FROM player_reward_entries
      WHERE username = $1
      ORDER BY cycle_date ASC
      `,
      [username.toLowerCase()]
    );

    res.json({
      success: true,
      rewards: result.rows
    });
  } catch (err) {
    console.error("Debug player rewards error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to load player rewards."
    });
  }
});

// ===============================
// 💰 CLAIM PLAYER REWARDS
// ===============================
app.get("/player/:username/claim-rewards", async (req, res) => {
  const { username } = req.params;

  try {
    const normalizedUsername = String(username || "").trim().toLowerCase();

    // 1. Load all claimable rewards
    const rewardsRes = await pool.query(
      `
      SELECT id, amount
      FROM player_reward_entries
      WHERE username = $1
        AND claimed = FALSE
        AND expired = FALSE
      ORDER BY cycle_date ASC
      `,
      [normalizedUsername]
    );

    const rewards = rewardsRes.rows || [];

    if (!rewards.length) {
      return res.json({
        success: false,
        message: "No claimable rewards available.",
        claimable_amount: 0
      });
    }

    // 2. Sum claimable amount
    const totalClaimable = rewards.reduce((sum, row) => {
      return sum + Number(row.amount || 0);
    }, 0);

    // 3. Mark all as claimed
    await pool.query(
      `
      UPDATE player_reward_entries
      SET claimed = TRUE
      WHERE username = $1
        AND claimed = FALSE
        AND expired = FALSE
      `,
      [normalizedUsername]
    );
    // 4. Move claimed amount into player wallet
    await pool.query(
      `
      INSERT INTO player_wallets (username, hive_balance, total_claimed, total_withdrawn, updated_at)
      VALUES ($1, $2, $2, 0, NOW())
      ON CONFLICT (username)
      DO UPDATE SET
        hive_balance = player_wallets.hive_balance + EXCLUDED.hive_balance,
        total_claimed = player_wallets.total_claimed + EXCLUDED.total_claimed,
        updated_at = NOW()
      `,
      [normalizedUsername, totalClaimable]
    );
       return res.json({
      success: true,
      message: "Rewards claimed successfully.",
      claimable_amount: Number(totalClaimable.toFixed(8)),
      claimed_entries: rewards.length,
      moved_to_wallet: true
    });
  } catch (err) {
    console.error("Claim rewards error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to claim rewards."
    });
  }
});
// ===============================
// 🧪 EXPIRE OLD PLAYER REWARDS
// ===============================
app.get("/admin/expire-old-rewards", async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE player_reward_entries
      SET expired = TRUE
      WHERE claimed = FALSE
        AND expired = FALSE
        AND cycle_date < CURRENT_DATE - INTERVAL '7 days'
      RETURNING id, username, cycle_date, amount
    `);

    return res.json({
      success: true,
      message: "Old rewards expired successfully.",
      expired_count: result.rows.length,
      expired_entries: result.rows
    });
  } catch (err) {
    console.error("Expire old rewards error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to expire old rewards."
    });
  }
});
app.get("/admin/run-daily-rewards", async (req, res) => {
  try {
    if (req.query.key !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const cycleDate = new Date().toISOString().slice(0, 10);

    // 1) Create reward cycle if missing
    let cycleRes = await pool.query(
      `SELECT id FROM reward_cycles WHERE cycle_date = $1 LIMIT 1`,
      [cycleDate]
    );

    if (!cycleRes.rows.length) {
     

      const treasuryBalance = treasuryAccounts.reduce((sum, acc) => {
        const hiveBalance = parseFloat(acc.balance || "0");
        return sum + (Number.isFinite(hiveBalance) ? hiveBalance : 0);
      }, 0);

      const factoriesRes = await pool.query(`
        SELECT f.*, n.tier AS land_tier
        FROM factories f
        JOIN nfts n ON n.id = f.land_id
        WHERE LOWER(COALESCE(f.status, 'inactive')) = 'active'
      `);

      const factories = factoriesRes.rows || [];

      function calculateFactoryEP(factory) {
        const BASE_RATE = 10;
        const LAND_MULTIPLIERS = { L1: 1.0, L2: 1.5, L3: 2.0 };
        const landTier = String(factory.land_tier || "").trim().toUpperCase();
        const landMultiplier = LAND_MULTIPLIERS[landTier] || 1.0;
        const levelMultiplier = 1 + ((Number(factory.level || 1) - 1) * 0.25);
        return BASE_RATE * landMultiplier * levelMultiplier;
      }

      let globalEP = 0;
      for (const f of factories) {
        globalEP += calculateFactoryEP(f);
      }

      const rewardData = calculateRewardPool(treasuryBalance, globalEP);

      await pool.query(
        `
        INSERT INTO reward_cycles (
          cycle_date,
          treasury_balance,
          global_ep,
          treasury_access_multiplier,
          effective_treasury,
          treasury_strength_ratio,
          emission_rate,
          reward_pool
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          cycleDate,
          treasuryBalance,
          globalEP,
          rewardData.treasuryAccessMultiplier,
          rewardData.effectiveTreasury,
          rewardData.treasuryStrengthRatio,
          rewardData.emissionRate,
          rewardData.rewardPool
        ]
      );
    }

    // 2) Allocate player rewards if not already allocated
    const existingAllocRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM player_reward_entries WHERE cycle_date = $1`,
      [cycleDate]
    );

    if ((existingAllocRes.rows[0]?.count || 0) === 0) {
      const cycleFullRes = await pool.query(
        `SELECT * FROM reward_cycles WHERE cycle_date = $1 LIMIT 1`,
        [cycleDate]
      );
      const cycle = cycleFullRes.rows[0];

      const factoriesRes = await pool.query(`
        SELECT f.*, n.tier AS land_tier
        FROM factories f
        JOIN nfts n ON n.id = f.land_id
        WHERE LOWER(COALESCE(f.status, 'inactive')) = 'active'
      `);

      const factories = factoriesRes.rows || [];

      function calculateFactoryEP(factory) {
        const BASE_RATE = 10;
        const LAND_MULTIPLIERS = { L1: 1.0, L2: 1.5, L3: 2.0 };
        const landTier = String(factory.land_tier || "").trim().toUpperCase();
        const landMultiplier = LAND_MULTIPLIERS[landTier] || 1.0;
        const levelMultiplier = 1 + ((Number(factory.level || 1) - 1) * 0.25);
        return BASE_RATE * landMultiplier * levelMultiplier;
      }

      const playerBaseEP = {};
      for (const f of factories) {
        const username = String(f.username || "").trim().toLowerCase();
        const factoryEP = calculateFactoryEP(f);
        if (!username || factoryEP <= 0) continue;
        playerBaseEP[username] = (playerBaseEP[username] || 0) + factoryEP;
      }

      const usernames = Object.keys(playerBaseEP);

      if (usernames.length && Number(cycle.global_ep || 0) > 0 && Number(cycle.reward_pool || 0) > 0) {
        const relicRes = await pool.query(
          `
          SELECT username, COUNT(*)::int AS relic_count
          FROM nfts
          WHERE type = 'RELIC'
            AND era = 'GENESIS'
            AND username = ANY($1::text[])
          GROUP BY username
          `,
          [usernames]
        );

        const relicMap = {};
        for (const row of relicRes.rows) {
          relicMap[String(row.username || "").trim().toLowerCase()] =
            Math.min(Number(row.relic_count) || 0, 2);
        }

        let totalBoostedEP = 0;
        const playerBoostedEP = {};

        for (const username of usernames) {
          const baseEP = Number(playerBaseEP[username] || 0);
          const relicBoost = (relicMap[username] || 0) * 3;
          const boostedEP = baseEP * (1 + relicBoost / 100);
          playerBoostedEP[username] = boostedEP;
          totalBoostedEP += boostedEP;
        }

        if (totalBoostedEP > 0) {
          for (const username of usernames) {
            const boostedEP = Number(playerBoostedEP[username] || 0);
            if (boostedEP <= 0) continue;

            const rewardAmount = (boostedEP / totalBoostedEP) * Number(cycle.reward_pool || 0);

            await pool.query(
              `
              INSERT INTO player_reward_entries (
                username, cycle_date, reward_cycle_id, amount, claimed, expired
              )
              VALUES ($1, $2, $3, $4, FALSE, FALSE)
              ON CONFLICT (username, cycle_date) DO NOTHING
              `,
              [username, cycleDate, cycle.id, rewardAmount]
            );
          }
        }
      }
    }

    // 3) Expire rewards older than 7 days
    const expireRes = await pool.query(`
      UPDATE player_reward_entries
      SET expired = TRUE
      WHERE claimed = FALSE
        AND expired = FALSE
        AND cycle_date < CURRENT_DATE - INTERVAL '7 days'
      RETURNING id
    `);
    // 4) Increment active_days for truly active + maintained factories
    const activeDaysRes = await pool.query(`
      UPDATE factories
      SET active_days = COALESCE(active_days, 0) + 1
      WHERE LOWER(COALESCE(status, 'inactive')) = 'active'
        AND maintenance_ends_at IS NOT NULL
        AND maintenance_ends_at >= NOW()
      RETURNING id, username, active_days
    `);
        return res.json({
      success: true,
      message: "Daily rewards job completed.",
      cycle_date: cycleDate,
      active_days_updated: activeDaysRes.rows.length,
      expired_count: expireRes.rows.length
    });
  } catch (err) {
    console.error("Daily rewards job error:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
  
});
app.get("/debug-factory-active-days/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
      `
      SELECT id, username, status, active_days, maintenance_ends_at, level, blueprint_tier
      FROM factories
      WHERE username = $1
      ORDER BY id ASC
      `,
      [String(username || "").trim().toLowerCase()]
    );

    res.json({
      success: true,
      factories: result.rows
    });
  } catch (err) {
    console.error("Debug factory active days error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to load factory active days."
    });
  }
});
// ===============================
// 💸 PLAYER WITHDRAW REQUEST
// ===============================
app.get("/player/:username/request-withdraw/:amount", async (req, res) => {
  try {
    const { username, amount } = req.params;

    const normalizedUsername = String(username || "").trim().toLowerCase();
    const withdrawAmount = parseFloat(amount);

    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      return res.json({
        success: false,
        error: "Invalid withdrawal amount."
      });
    }

    // Minimum withdrawal rule
    if (withdrawAmount < 1) {
      return res.json({
        success: false,
        error: "Minimum withdrawal is 1 HIVE."
      });
    }

    // Load wallet
    const walletRes = await pool.query(
      `
      SELECT *
      FROM player_wallets
      WHERE username = $1
      LIMIT 1
      `,
      [normalizedUsername]
    );

    const wallet = walletRes.rows[0];

    if (!wallet) {
      return res.json({
        success: false,
        error: "Player wallet not found."
      });
    }

    const balance = parseFloat(wallet.hive_balance || 0);

    if (withdrawAmount > balance) {
      return res.json({
        success: false,
        error: "Insufficient wallet balance."
      });
    }

    // Deduct balance immediately
    await pool.query(
      `
      UPDATE player_wallets
      SET hive_balance = hive_balance - $1,
          updated_at = NOW()
      WHERE username = $2
      `,
      [withdrawAmount, normalizedUsername]
    );

    // Create withdrawal request
    const insertRes = await pool.query(
      `
      INSERT INTO withdrawal_requests (username, amount, status)
      VALUES ($1, $2, 'pending')
      RETURNING *
      `,
      [normalizedUsername, withdrawAmount]
    );

    return res.json({
      success: true,
      message: "Withdrawal request created.",
      request: insertRes.rows[0]
    });

  } catch (err) {
    console.error("Withdraw request error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to create withdrawal request."
    });
  }
});
// ===============================
// ✅ ADMIN APPROVE WITHDRAWAL
// ===============================
app.get("/admin/approve-withdrawal/:id", async (req, res) => {
  try {
    if (req.query.key !== process.env.ADMIN_SECRET) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized"
      });
    }

    const withdrawalId = parseInt(req.params.id, 10);

    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
      return res.json({
        success: false,
        error: "Invalid withdrawal request id."
      });
    }

    const reqRes = await pool.query(
      `
      SELECT *
      FROM withdrawal_requests
      WHERE id = $1
      LIMIT 1
      `,
      [withdrawalId]
    );

    const request = reqRes.rows[0];

    if (!request) {
      return res.json({
        success: false,
        error: "Withdrawal request not found."
      });
    }

    if (request.status !== "pending") {
      return res.json({
        success: false,
        error: `Withdrawal request already processed with status: ${request.status}`
      });
    }

    const processedBy = "admin";

    const updateRes = await pool.query(
      `
      UPDATE withdrawal_requests
      SET status = 'paid',
          processed_at = NOW(),
          processed_by = $1
      WHERE id = $2
      RETURNING *
      `,
      [processedBy, withdrawalId]
    );

    return res.json({
      success: true,
      message: "Withdrawal request approved and marked paid.",
      request: updateRes.rows[0]
    });
  } catch (err) {
    console.error("Approve withdrawal error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to approve withdrawal."
    });
  }
});
// ===============================
// ❌ ADMIN REJECT WITHDRAWAL
// ===============================
app.get("/admin/reject-withdrawal/:id", async (req, res) => {
  try {
    if (req.query.key !== process.env.ADMIN_SECRET) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized"
      });
    }

    const withdrawalId = parseInt(req.params.id, 10);

    if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
      return res.json({
        success: false,
        error: "Invalid withdrawal request id."
      });
    }

    const reqRes = await pool.query(
      `
      SELECT *
      FROM withdrawal_requests
      WHERE id = $1
      LIMIT 1
      `,
      [withdrawalId]
    );

    const request = reqRes.rows[0];

    if (!request) {
      return res.json({
        success: false,
        error: "Withdrawal request not found."
      });
    }

    if (request.status !== "pending") {
      return res.json({
        success: false,
        error: `Withdrawal request already processed with status: ${request.status}`
      });
    }

    const processedBy = "admin";
    const amount = Number(request.amount || 0);
    const username = String(request.username || "").trim().toLowerCase();

    // Return amount back to player wallet
    await pool.query(
      `
      INSERT INTO player_wallets (username, hive_balance, total_claimed, total_withdrawn, updated_at)
      VALUES ($1, $2, 0, 0, NOW())
      ON CONFLICT (username)
      DO UPDATE SET
        hive_balance = player_wallets.hive_balance + EXCLUDED.hive_balance,
        updated_at = NOW()
      `,
      [username, amount]
    );

    const updateRes = await pool.query(
      `
      UPDATE withdrawal_requests
      SET status = 'rejected',
          processed_at = NOW(),
          processed_by = $1
      WHERE id = $2
      RETURNING *
      `,
      [processedBy, withdrawalId]
    );

    return res.json({
      success: true,
      message: "Withdrawal request rejected and balance returned.",
      request: updateRes.rows[0]
    });
  } catch (err) {
    console.error("Reject withdrawal error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to reject withdrawal."
    });
  }
});
// ===============================
// 📊 PLAYER REWARD SUMMARY
// ===============================
app.get("/player/:username/reward-summary", async (req, res) => {
  try {
    const { username } = req.params;
    const normalizedUsername = String(username || "").trim().toLowerCase();

    const claimableRes = await pool.query(
      `
      SELECT
        COALESCE(SUM(amount), 0) AS claimable_amount,
        COUNT(*)::int AS claimable_entries,
        MIN(cycle_date) AS oldest_cycle_date
      FROM player_reward_entries
      WHERE username = $1
        AND claimed = FALSE
        AND expired = FALSE
      `,
      [normalizedUsername]
    );

    const walletRes = await pool.query(
      `
      SELECT
        hive_balance,
        total_claimed,
        total_withdrawn
      FROM player_wallets
      WHERE username = $1
      LIMIT 1
      `,
      [normalizedUsername]
    );

    const pendingWithdrawRes = await pool.query(
      `
      SELECT
        COALESCE(SUM(amount), 0) AS pending_withdraw_amount,
        COUNT(*)::int AS pending_withdraw_count
      FROM withdrawal_requests
      WHERE username = $1
        AND status = 'pending'
      `,
      [normalizedUsername]
    );

    const claimable = claimableRes.rows[0] || {};
    const wallet = walletRes.rows[0] || {};
    const pending = pendingWithdrawRes.rows[0] || {};

    let oldestRewardDays = null;

    if (claimable.oldest_cycle_date) {
      const oldestDate = new Date(claimable.oldest_cycle_date);
      const now = new Date();
      oldestRewardDays = Math.floor(
        (now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return res.json({
      success: true,
      username: normalizedUsername,
      claimable_amount: Number(claimable.claimable_amount || 0),
      claimable_entries: Number(claimable.claimable_entries || 0),
      oldest_reward_days: oldestRewardDays,
      wallet_balance: Number(wallet.hive_balance || 0),
      total_claimed: Number(wallet.total_claimed || 0),
      total_withdrawn: Number(wallet.total_withdrawn || 0),
      pending_withdraw_amount: Number(pending.pending_withdraw_amount || 0),
      pending_withdraw_count: Number(pending.pending_withdraw_count || 0),
      minimum_withdrawal: 1
    });
  } catch (err) {
    console.error("Player reward summary error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load player reward summary."
    });
  }
});
app.get("/debug-pay-maintenance/:username/:factoryId/:days", async (req, res) => {
  try {
    const username = String(req.params.username || "").trim().toLowerCase();
    const factory_id = parseInt(req.params.factoryId, 10);
    const days = parseInt(req.params.days, 10);

    if (!days || days < 1 || days > 7) {
      return res.status(400).json({ error: "Days must be between 1 and 7." });
    }

    const factoryRes = await pool.query(
      `SELECT * FROM factories WHERE id=$1 AND username=$2`,
      [factory_id, username]
    );

    if (!factoryRes.rows.length) {
      return res.status(404).json({ error: "Factory not found." });
    }

    const factory = factoryRes.rows[0];
    const now = new Date();

    let maintenanceEnds = factory.maintenance_ends_at
      ? new Date(factory.maintenance_ends_at)
      : now;

    if (maintenanceEnds < now) {
      maintenanceEnds = now;
    }

    const remainingDays = Math.max(0, (maintenanceEnds - now) / (1000 * 60 * 60 * 24));

    if (remainingDays + days > 7) {
      return res.status(400).json({
        error: "Maintenance cannot exceed 7 days total."
      });
    }

    const epPerDay = 10 * (1 + ((Number(factory.level || 1) - 1) * 0.25));
    const cost = Math.ceil(epPerDay * days * 0.05);

    const empRes = await pool.query(
      `
      SELECT balance
      FROM emp_balances
      WHERE username = $1
      `,
      [username]
    );

    const balance = Number(empRes.rows[0]?.balance || 0);

    if (balance < cost) {
      return res.status(400).json({ error: "Not enough EMP." });
    }

    const newMaintenanceEnd = new Date(
      maintenanceEnds.getTime() + days * 24 * 60 * 60 * 1000
    );

    await pool.query(
      `UPDATE factories SET maintenance_ends_at=$1 WHERE id=$2`,
      [newMaintenanceEnd, factory_id]
    );

    await pool.query(
      `
      UPDATE emp_balances
      SET balance = balance - $1
      WHERE username = $2
      `,
      [cost, username]
    );

    return res.json({
      success: true,
      username,
      factory_id,
      days_added: days,
      emp_spent: cost,
      maintenance_until: newMaintenanceEnd
    });
  } catch (err) {
    console.error("Debug maintenance payment error:", err);
    return res.status(500).json({ error: "Maintenance payment failed." });
  }
});
app.get("/admin/debug-active-players", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT username
      FROM nfts
      ORDER BY username
    `);

    res.json({
      total_players: result.rows.length,
      players: result.rows
    });
  } catch (err) {
    console.error("Debug active players error:", err);
    res.status(500).json({ error: "Failed to fetch players." });
  }
});
// ============================
// ⬆️ FACTORY UPGRADE
// ============================
app.post("/factory/upgrade", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const { username, factory_id } = req.body;

    const cleanUsername = String(username || "")
      .trim()
      .replace("@", "")
      .toLowerCase();

    const cleanFactoryId = parseInt(factory_id, 10);

    if (!cleanUsername || !cleanFactoryId) {
      return res.status(400).json({
        success: false,
        error: "username and factory_id are required."
      });
    }

    await clientConn.query("BEGIN");

    // 1) Lock factory
    const factoryRes = await clientConn.query(
      `
      SELECT *
      FROM factories
      WHERE id = $1
        AND username = $2
      FOR UPDATE
      `,
      [cleanFactoryId, cleanUsername]
    );

    if (!factoryRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Factory not found."
      });
    }

    const factory = factoryRes.rows[0];
    const currentStatus = String(factory.status || "").trim().toUpperCase();

    if (currentStatus !== "ACTIVE") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Only active factories can be upgraded."
      });
    }

    if (
      factory.upgrade_complete_at &&
      currentStatus === "UPGRADING"
    ) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Factory is already upgrading."
      });
    }

    // 2) Get land tier
    const landRes = await clientConn.query(
      `
      SELECT id, tier
      FROM nfts
      WHERE id = $1
        AND username = $2
        AND type = 'LAND'
      LIMIT 1
      `,
      [factory.land_id, cleanUsername]
    );

    if (!landRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Linked land not found."
      });
    }

    const land = landRes.rows[0];
    const landTier = String(land.tier || "").trim().toUpperCase();

    // 3) Determine current B-tier from blueprint_tier
    const parsedTier = parseBlueprintTier(factory.blueprint_tier);
    const industry = parsedTier.industry;
    const currentLevel = getBlueprintLevelNumber(factory.blueprint_tier);

    if (!industry || !currentLevel) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Invalid factory blueprint tier."
      });
    }

    const nextLevel = currentLevel + 1;

    if (currentLevel >= 5) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Factory is already at maximum B5."
      });
    }
const currentActiveDays = Number(factory.active_days || 0);
const requiredActiveDays = getRequiredActiveDaysForUpgrade(currentLevel);

if (currentActiveDays < requiredActiveDays) {
  await clientConn.query("ROLLBACK");
  return res.status(400).json({
    success: false,
    error: `This factory needs ${requiredActiveDays} active days before upgrading. Current: ${currentActiveDays}`
  });
}    // 4) Land upgrade cap
    const landUpgradeCap = getUpgradeCapByLandTier(landTier);

    if (nextLevel > landUpgradeCap) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `This land can only upgrade up to B${landUpgradeCap}.`
      });
    }

    const relicRes = await clientConn.query(
  `
  SELECT COUNT(*)::int AS relic_count
  FROM nfts
  WHERE username = $1
    AND type = 'RELIC'
    AND era = 'GENESIS'
  `,
  [cleanUsername]
);

const relicCount = Number(relicRes.rows[0]?.relic_count || 0);
const hasRelicUpgradeBenefit = relicCount > 0;

    // 5) One B5 per land rule
    if (nextLevel === 5) {
      const b5Check = await clientConn.query(
        `
        SELECT COUNT(*)::int AS b5_count
        FROM factories
        WHERE land_id = $1
          AND id <> $2
          AND UPPER(COALESCE(blueprint_tier, '')) LIKE '%_B5'
        `,
        [factory.land_id, cleanFactoryId]
      );

      const b5Count = Number(b5Check.rows[0]?.b5_count || 0);

      if (b5Count >= 1) {
        await clientConn.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: "Only one B5 factory is allowed on this land."
        });
      }
    }

    // 6) EMP cost
    let upgradeCostEMP = getUpgradeEmpCost(currentLevel);

if (hasRelicUpgradeBenefit) {
  upgradeCostEMP = Math.ceil(upgradeCostEMP * 0.75);
}

    if (upgradeCostEMP <= 0) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Invalid upgrade cost."
      });
    }

    const empRes = await clientConn.query(
      `
      SELECT balance
      FROM emp_balances
      WHERE username = $1
      FOR UPDATE
      `,
      [cleanUsername]
    );

    const empBalance = Number(empRes.rows[0]?.balance || 0);

    if (empBalance < upgradeCostEMP) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Not enough EMP. Required: ${upgradeCostEMP}`
      });
    }

    // 7) Deduct EMP
    await clientConn.query(
      `
      INSERT INTO emp_balances (username, balance)
      VALUES ($1, 0)
      ON CONFLICT (username) DO NOTHING
      `,
      [cleanUsername]
    );

    await clientConn.query(
      `
      UPDATE emp_balances
      SET balance = balance - $1
      WHERE username = $2
      `,
      [upgradeCostEMP, cleanUsername]
    );

    // 8) Start upgrade timer
    let upgradeDays = getUpgradeDaysForLevel(currentLevel);

if (hasRelicUpgradeBenefit) {
  upgradeDays = 0;
}

    if (upgradeDays <= 0) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Invalid upgrade duration."
      });
    }

    if (upgradeDays === 0) {
  const nextTier = buildBlueprintTierFromIndustryAndLevel(industry, nextLevel);

  await clientConn.query(
    `
    UPDATE factories
    SET status = 'active',
        level = COALESCE(level, 1) + 1,
        blueprint_tier = $1,
        last_claimed_at = NOW(),
        upgrade_started_at = NULL,
        upgrade_complete_at = NULL
    WHERE id = $2
    `,
    [nextTier, cleanFactoryId]
  );
} else {
  await clientConn.query(
    `
    UPDATE factories
    SET status = 'upgrading',
        upgrade_started_at = NOW(),
        upgrade_complete_at = NOW() + ($1::text || ' days')::interval
    WHERE id = $2
    `,
    [String(upgradeDays), cleanFactoryId]
  );
}

    await clientConn.query("COMMIT");

    return res.json({
  success: true,
  factory_id: cleanFactoryId,
  current_tier: `B${currentLevel}`,
  next_tier: `B${nextLevel}`,
  land_tier: landTier,
  upgrade_cost_emp: upgradeCostEMP,
  upgrade_days: upgradeDays,
  relic_benefit_applied: hasRelicUpgradeBenefit,
  message:
    upgradeDays === 0
      ? `Instant upgrade completed: B${currentLevel} → B${nextLevel}`
      : `Upgrade started: B${currentLevel} → B${nextLevel}`
});
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("🔥 Factory Upgrade Error:", err);
    return res.status(500).json({
      success: false,
      error: "Factory upgrade failed."
    });
  } finally {
    clientConn.release();
  }
});

// ===============================
// 🛒 CREATE EMP MARKETPLACE LISTING
// ===============================
app.post("/marketplace/emp/list", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const username = normalizeUsername(req.body.username);
    const quantity = Number(req.body.quantity);
    const unitPriceHive = Number(req.body.unit_price_hive);

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required."
      });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "EMP quantity must be greater than 0."
      });
    }

    if (!Number.isInteger(quantity)) {
      return res.status(400).json({
        success: false,
        error: "EMP quantity must be a whole number."
      });
    }

    if (quantity < 100) {
      return res.status(400).json({
        success: false,
        error: "Minimum EMP listing is 100 EMP."
      });
    }

    if (!Number.isFinite(unitPriceHive) || unitPriceHive <= 0) {
      return res.status(400).json({
        success: false,
        error: "Unit price must be greater than 0."
      });
    }

    const floorPrice = getEmpMarketFloorPricePerEmp();
    if (unitPriceHive < floorPrice) {
      return res.status(400).json({
        success: false,
        error: `EMP price floor is ${floorPrice.toFixed(4)} HIVE per EMP.`
      });
    }

    await clientConn.query("BEGIN");

    // 1. Load EMP balance
    const empRes = await clientConn.query(
      `
      SELECT balance
      FROM emp_balances
      WHERE username = $1
      LIMIT 1
      `,
      [username]
    );

    const currentEmpBalance = Number(empRes.rows[0]?.balance || 0);

    // 2. Load already locked EMP
    const lockedRes = await clientConn.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS locked_emp
      FROM emp_locks
      WHERE username = $1
        AND status = 'locked'
      `,
      [username]
    );

    const lockedEmp = Number(lockedRes.rows[0]?.locked_emp || 0);
    const availableEmp = currentEmpBalance - lockedEmp;

    if (availableEmp < quantity) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Not enough available EMP. Balance: ${currentEmpBalance}, Locked: ${lockedEmp}, Available: ${availableEmp}.`
      });
    }

    const totalPriceHive = roundHive(quantity * unitPriceHive);
    const feePercent = getMarketplaceFeePercent("EMP");
    const feeAmountHive = roundHive(totalPriceHive * (feePercent / 100));
    const sellerAmountHive = roundHive(totalPriceHive - feeAmountHive);

    // 3. Insert listing
    const listingRes = await clientConn.query(
      `
      INSERT INTO marketplace_listings (
        seller_username,
        asset_type,
        asset_id,
        quantity,
        unit_price_hive,
        total_price_hive,
        fee_percent,
        fee_amount_hive,
        seller_amount_hive,
        status
      )
      VALUES ($1, 'EMP', NULL, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING *
      `,
      [
        username,
        quantity,
        unitPriceHive,
        totalPriceHive,
        feePercent,
        feeAmountHive,
        sellerAmountHive
      ]
    );

    const listing = listingRes.rows[0];

    // 4. Lock EMP against this listing
    await clientConn.query(
      `
      INSERT INTO emp_locks (username, listing_id, amount, status)
      VALUES ($1, $2, $3, 'locked')
      `,
      [username, listing.id, quantity]
    );

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "EMP listing created successfully.",
      listing: {
        id: listing.id,
        seller_username: listing.seller_username,
        asset_type: listing.asset_type,
        quantity: Number(listing.quantity),
        unit_price_hive: Number(listing.unit_price_hive),
        total_price_hive: Number(listing.total_price_hive),
        fee_percent: Number(listing.fee_percent),
        fee_amount_hive: Number(listing.fee_amount_hive),
        seller_amount_hive: Number(listing.seller_amount_hive),
        status: listing.status,
        created_at: listing.created_at
      }
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("Create EMP listing error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to create EMP listing."
    });
  } finally {
    clientConn.release();
  }
});

// ===============================
// 🛒 CREATE BLUEPRINT MARKETPLACE LISTING
// ===============================
app.post("/marketplace/blueprint/list", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const username = normalizeUsername(req.body.username);
    const nftId = Number(req.body.nft_id);
    const priceHive = Number(req.body.price_hive);

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required."
      });
    }

    if (!Number.isInteger(nftId) || nftId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid blueprint nft_id is required."
      });
    }

    if (!Number.isFinite(priceHive) || priceHive <= 0) {
      return res.status(400).json({
        success: false,
        error: "Price must be greater than 0."
      });
    }

    await clientConn.query("BEGIN");

    const nftRes = await clientConn.query(
      `
      SELECT id, username, type, tier, edition, era
      FROM nfts
      WHERE id = $1
      LIMIT 1
      `,
      [nftId]
    );

    if (!nftRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Blueprint NFT not found."
      });
    }

    const nft = nftRes.rows[0];

    if (normalizeUsername(nft.username) !== username) {
      await clientConn.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        error: "You do not own this blueprint."
      });
    }

    if (String(nft.type || "").toUpperCase() !== "BLUEPRINT") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Only BLUEPRINT NFTs can be listed here."
      });
    }

    const existingLockRes = await clientConn.query(
      `
      SELECT id
      FROM blueprint_locks
      WHERE nft_id = $1
        AND status = 'locked'
      LIMIT 1
      `,
      [nftId]
    );

    if (existingLockRes.rows.length > 0) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "This blueprint is already locked in an active listing."
      });
    }

    const feePercent = getMarketplaceFeePercent("BLUEPRINT");
    const totalPriceHive = roundHive(priceHive);
    const feeAmountHive = roundHive(totalPriceHive * (feePercent / 100));
    const sellerAmountHive = roundHive(totalPriceHive - feeAmountHive);

    const listingRes = await clientConn.query(
      `
      INSERT INTO marketplace_listings (
        seller_username,
        asset_type,
        asset_id,
        quantity,
        unit_price_hive,
        total_price_hive,
        fee_percent,
        fee_amount_hive,
        seller_amount_hive,
        status
      )
      VALUES ($1, 'BLUEPRINT', $2, 1, $3, $4, $5, $6, $7, 'active')
      RETURNING *
      `,
      [
        username,
        nftId,
        totalPriceHive,
        totalPriceHive,
        feePercent,
        feeAmountHive,
        sellerAmountHive
      ]
    );

    const listing = listingRes.rows[0];

    await clientConn.query(
      `
      INSERT INTO blueprint_locks (username, nft_id, listing_id, status)
      VALUES ($1, $2, $3, 'locked')
      `,
      [username, nftId, listing.id]
    );

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "Blueprint listing created successfully.",
      listing: {
        id: listing.id,
        seller_username: listing.seller_username,
        asset_type: listing.asset_type,
        asset_id: listing.asset_id,
        price_hive: Number(listing.total_price_hive),
        fee_percent: Number(listing.fee_percent),
        fee_amount_hive: Number(listing.fee_amount_hive),
        seller_amount_hive: Number(listing.seller_amount_hive),
        status: listing.status,
        created_at: listing.created_at,
        blueprint: {
          nft_id: nft.id,
          tier: nft.tier,
          edition: nft.edition,
          era: nft.era
        }
      }
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("Create blueprint listing error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to create blueprint listing."
    });
  } finally {
    clientConn.release();
  }
});

// ===============================
// 📦 GET ACTIVE BLUEPRINT MARKETPLACE LISTINGS
// ===============================
app.get("/marketplace/blueprint", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        ml.id,
        ml.seller_username,
        ml.asset_id,
        ml.total_price_hive,
        ml.fee_percent,
        ml.fee_amount_hive,
        ml.seller_amount_hive,
        ml.status,
        ml.created_at,
        n.tier,
        n.edition,
        n.era
      FROM marketplace_listings ml
      LEFT JOIN nfts n
        ON n.id = ml.asset_id
      WHERE ml.asset_type = 'BLUEPRINT'
        AND ml.status = 'active'
      ORDER BY ml.created_at DESC, ml.id DESC
      `
    );

    return res.json({
      success: true,
      listings: result.rows.map((row) => ({
        id: row.id,
        seller_username: row.seller_username,
        asset_id: row.asset_id,
        total_price_hive: Number(row.total_price_hive),
        fee_percent: Number(row.fee_percent),
        fee_amount_hive: Number(row.fee_amount_hive),
        seller_amount_hive: Number(row.seller_amount_hive),
        status: row.status,
        created_at: row.created_at,
        blueprint: {
          nft_id: row.asset_id,
          tier: row.tier,
          edition: row.edition,
          era: row.era
        }
      }))
    });
  } catch (err) {
    console.error("Get blueprint listings error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load blueprint marketplace listings."
    });
  }
});

// ===============================
// ❌ CANCEL BLUEPRINT MARKETPLACE LISTING
// ===============================
app.post("/marketplace/blueprint/cancel", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const username = normalizeUsername(req.body.username);
    const listingId = Number(req.body.listing_id);

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required."
      });
    }

    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid listing_id is required."
      });
    }

    await clientConn.query("BEGIN");

    const listingRes = await clientConn.query(
      `
      SELECT *
      FROM marketplace_listings
      WHERE id = $1
        AND asset_type = 'BLUEPRINT'
      LIMIT 1
      `,
      [listingId]
    );

    if (!listingRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Blueprint listing not found."
      });
    }

    const listing = listingRes.rows[0];

    if (listing.seller_username !== username) {
      await clientConn.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        error: "You can cancel only your own blueprint listing."
      });
    }

    if (listing.status !== "active") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Listing is already ${listing.status}.`
      });
    }

    await clientConn.query(
      `
      UPDATE marketplace_listings
      SET status = 'cancelled',
          cancelled_at = NOW()
      WHERE id = $1
      `,
      [listingId]
    );

    await clientConn.query(
      `
      UPDATE blueprint_locks
      SET status = 'released',
          released_at = NOW()
      WHERE listing_id = $1
        AND status = 'locked'
      `,
      [listingId]
    );

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "Blueprint listing cancelled successfully.",
      listing_id: listingId
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("Cancel blueprint listing error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to cancel blueprint listing."
    });
  } finally {
    clientConn.release();
  }
});

// ===============================
// 🔎 DEBUG EMP MARKETPLACE SESSIONS
// ===============================
app.get("/debug/marketplace/emp/sessions", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        listing_id,
        buyer_username,
        seller_username,
        quantity,
        total_price_hive,
        fee_amount_hive,
        seller_amount_hive,
        seller_payment_memo,
        fee_payment_memo,
        status,
        created_at,
        completed_at
      FROM marketplace_purchase_sessions
      ORDER BY id DESC
      LIMIT 50
    `);

    return res.json({
      success: true,
      sessions: result.rows
    });
  } catch (err) {
    console.error("Debug EMP sessions error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load EMP marketplace sessions."
    });
  }
});

// ===============================
// 🛠 DEBUG CLEAN DUPLICATE COMPLETED EMP SESSIONS
// ===============================
app.get("/debug/marketplace/emp/cleanup-duplicate-completed", async (req, res) => {
  try {
    // Keep only the newest completed session per listing
    await pool.query(`
      DELETE FROM marketplace_purchase_sessions
      WHERE status = 'completed'
        AND id IN (
          SELECT id
          FROM (
            SELECT
              id,
              listing_id,
              ROW_NUMBER() OVER (
                PARTITION BY listing_id
                ORDER BY completed_at DESC NULLS LAST, id DESC
              ) AS rn
            FROM marketplace_purchase_sessions
            WHERE status = 'completed'
          ) t
          WHERE t.rn > 1
        )
    `);

    return res.json({
      success: true,
      message: "Duplicate completed marketplace sessions cleaned successfully."
    });
  } catch (err) {
    console.error("Cleanup duplicate completed sessions error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to clean duplicate completed sessions."
    });
  }
});

// ===============================
// 📦 GET ACTIVE EMP MARKETPLACE LISTINGS
// ===============================
app.get("/marketplace/emp", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        seller_username,
        quantity,
        unit_price_hive,
        total_price_hive,
        fee_percent,
        fee_amount_hive,
        seller_amount_hive,
        status,
        created_at
      FROM marketplace_listings
      WHERE asset_type = 'EMP'
        AND status = 'active'
      ORDER BY created_at DESC, id DESC
      `
    );

    return res.json({
      success: true,
      listings: result.rows.map((row) => ({
        id: row.id,
        seller_username: row.seller_username,
        quantity: Number(row.quantity),
        unit_price_hive: Number(row.unit_price_hive),
        total_price_hive: Number(row.total_price_hive),
        fee_percent: Number(row.fee_percent),
        fee_amount_hive: Number(row.fee_amount_hive),
        seller_amount_hive: Number(row.seller_amount_hive),
        status: row.status,
        created_at: row.created_at
      }))
    });
  } catch (err) {
    console.error("Get EMP listings error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load EMP marketplace listings."
    });
  }
});

// ===============================
// ❌ CANCEL EMP MARKETPLACE LISTING
// ===============================
app.post("/marketplace/emp/cancel", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const username = normalizeUsername(req.body.username);
    const listingId = Number(req.body.listing_id);

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required."
      });
    }

    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid listing_id is required."
      });
    }

    await clientConn.query("BEGIN");

    const listingRes = await clientConn.query(
      `
      SELECT *
      FROM marketplace_listings
      WHERE id = $1
        AND asset_type = 'EMP'
      LIMIT 1
      `,
      [listingId]
    );

    if (!listingRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Listing not found."
      });
    }

    const listing = listingRes.rows[0];

    if (listing.seller_username !== username) {
      await clientConn.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        error: "You can cancel only your own listing."
      });
    }

    if (listing.status !== "active") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Listing is already ${listing.status}.`
      });
    }

    await clientConn.query(
      `
      UPDATE marketplace_listings
      SET status = 'cancelled',
          cancelled_at = NOW()
      WHERE id = $1
      `,
      [listingId]
    );

    await clientConn.query(
      `
      UPDATE emp_locks
      SET status = 'released',
          released_at = NOW()
      WHERE listing_id = $1
        AND status = 'locked'
      `,
      [listingId]
    );

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "EMP listing cancelled successfully.",
      listing_id: listingId
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("Cancel EMP listing error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to cancel EMP listing."
    });
  } finally {
    clientConn.release();
  }
});

// ===============================
// 🛒 START EMP PURCHASE
// ===============================
app.post("/marketplace/emp/buy-init", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const buyerUsername = normalizeUsername(req.body.username);
    const listingId = Number(req.body.listing_id);

    if (!buyerUsername) {
      return res.status(400).json({
        success: false,
        error: "Username is required."
      });
    }

    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid listing_id is required."
      });
    }

    await clientConn.query("BEGIN");

    const listingRes = await clientConn.query(
      `
      SELECT *
      FROM marketplace_listings
      WHERE id = $1
        AND asset_type = 'EMP'
      LIMIT 1
      FOR UPDATE
      `,
      [listingId]
    );

    if (!listingRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "EMP listing not found."
      });
    }

    const listing = listingRes.rows[0];

    if (listing.status !== "active") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Listing is already ${listing.status}.`
      });
    }

    if (listing.seller_username === buyerUsername) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "You cannot buy your own EMP listing."
      });
    }
    // Removed stale completed-session blocker for EMP buy-init.

    const sellerPaymentAmount = Number(listing.seller_amount_hive).toFixed(3);
    const feePaymentAmount = Number(listing.fee_amount_hive).toFixed(3);

    const sessionRes = await clientConn.query(
      `
      INSERT INTO marketplace_purchase_sessions (
        asset_type,
        listing_id,
        buyer_username,
        seller_username,
        quantity,
        total_price_hive,
        fee_amount_hive,
        seller_amount_hive,
        seller_payment_memo,
        fee_payment_memo,
        status
      )
      VALUES (
        'EMP',
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        'pending'
      )
      RETURNING *
      `,
      [
        listing.id,
        buyerUsername,
        listing.seller_username,
        listing.quantity,
        listing.total_price_hive,
        listing.fee_amount_hive,
        listing.seller_amount_hive,
        `MDE_EMPSELL_${listing.id}_${buyerUsername}`,
        `MDE_EMPFEE_${listing.id}_${buyerUsername}`
      ]
    );

    await clientConn.query("COMMIT");

    const session = sessionRes.rows[0];

    return res.json({
      success: true,
      session: {
        id: session.id,
        listing_id: session.listing_id,
        buyer_username: session.buyer_username,
        seller_username: session.seller_username,
        quantity: Number(session.quantity),
        total_price_hive: Number(session.total_price_hive),
        fee_amount_hive: Number(session.fee_amount_hive),
        seller_amount_hive: Number(session.seller_amount_hive),
        seller_payment: {
          to: session.seller_username,
          amount: sellerPaymentAmount,
          memo: session.seller_payment_memo
        },
        fee_payment: {
          to: "mydempiregain",
          amount: feePaymentAmount,
          memo: session.fee_payment_memo
        }
      }
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("EMP buy-init error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to start EMP purchase."
    });
  } finally {
    clientConn.release();
  }
});
// ===============================
// ✅ FINALIZE EMP MARKETPLACE PURCHASE
// ===============================
app.post("/marketplace/emp/buy-finalize", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const buyerUsername = normalizeUsername(req.body.username);
    const sessionId = Number(req.body.session_id);
    const paymentTxId = String(req.body.payment_tx_id || "").trim();

    if (!buyerUsername) {
      return res.status(400).json({
        success: false,
        error: "Username is required."
      });
    }

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid session_id is required."
      });
    }

    if (!paymentTxId) {
      return res.status(400).json({
        success: false,
        error: "payment_tx_id is required."
      });
    }

    await clientConn.query("BEGIN");

    const sessionRes = await clientConn.query(
      `
      SELECT *
      FROM marketplace_purchase_sessions
      WHERE id = $1
        AND asset_type = 'EMP'
      LIMIT 1
      FOR UPDATE
      `,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "EMP purchase session not found."
      });
    }

    const session = sessionRes.rows[0];

    if (session.buyer_username !== buyerUsername) {
      await clientConn.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        error: "This purchase session does not belong to you."
      });
    }

    if (session.status !== "pending") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Purchase session is already ${session.status}.`
      });
    }

    const listingRes = await clientConn.query(
      `
      SELECT *
      FROM marketplace_listings
      WHERE id = $1
        AND asset_type = 'EMP'
      LIMIT 1
      FOR UPDATE
      `,
      [session.listing_id]
    );

    if (!listingRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "EMP listing no longer exists."
      });
    }

    const listing = listingRes.rows[0];

    if (listing.status !== "active") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Listing is already ${listing.status}.`
      });
    }

    await clientConn.query(
      `
      INSERT INTO emp_balances (username, balance)
      VALUES ($1, 0), ($2, 0)
      ON CONFLICT (username) DO NOTHING
      `,
      [session.seller_username, buyerUsername]
    );

    const sellerBalRes = await clientConn.query(
      `
      SELECT balance
      FROM emp_balances
      WHERE username = $1
      FOR UPDATE
      `,
      [session.seller_username]
    );

    const sellerBalance = Number(sellerBalRes.rows[0]?.balance || 0);
    const empQty = Number(session.quantity || 0);

    if (!Number.isFinite(empQty) || empQty <= 0) {
      throw new Error("Invalid EMP quantity in purchase session.");
    }

    if (sellerBalance < empQty) {
      throw new Error(
        `Seller does not have enough EMP to finalize. Seller balance: ${sellerBalance}, required: ${empQty}`
      );
    }

   // FIXED version for fee calculation (prevents toFixed error)

const totalPriceHive = Number(session.total_price_hive || listing.total_price_hive || 0);
const feePercent = 3;

// Ensure numeric values before calling toFixed
const feeAmountHive = Number(
  (Number(session.fee_amount_hive ?? (totalPriceHive * feePercent) / 100)).toFixed(8)
);

const sellerAmountHive = Number(
  (Number(session.seller_amount_hive ?? (totalPriceHive - feeAmountHive))).toFixed(8)
);

// Explanation:
// The error happened because session.fee_amount_hive could be a string.
// Strings do not support .toFixed(), so we wrap values with Number() first.
// This guarantees the calculation always works.


    // TODO:
    // Verify the single Hive transfer here:
    // from = buyerUsername
    // to   = REVENUE (mydempiregain)
    // amount = totalPriceHive
    // memo = session memo / purchase memo
    //
    // For now this route records payment_tx_id and settlement values only.

    await clientConn.query(
      `
      UPDATE emp_balances
      SET balance = balance - $1
      WHERE username = $2
      `,
      [empQty, session.seller_username]
    );

    await clientConn.query(
      `
      INSERT INTO emp_balances (username, balance)
      VALUES ($1, $2)
      ON CONFLICT (username)
      DO UPDATE SET balance = emp_balances.balance + EXCLUDED.balance
      `,
      [buyerUsername, empQty]
    );

    await clientConn.query(
      `
      UPDATE emp_locks
      SET status = 'consumed',
          released_at = NOW()
      WHERE listing_id = $1
        AND status = 'locked'
      `,
      [listing.id]
    );

    await clientConn.query(
      `
      UPDATE marketplace_listings
      SET status = 'sold',
          buyer_username = $1,
          sold_at = NOW()
      WHERE id = $2
      `,
      [buyerUsername, listing.id]
    );

    await clientConn.query(
      `
      UPDATE marketplace_purchase_sessions
      SET status = 'completed',
          completed_at = NOW(),
          payment_tx_id = $2,
          total_price_hive = $3,
          fee_amount_hive = $4,
          seller_amount_hive = $5,
          seller_payout_status = COALESCE(seller_payout_status, 'pending'),
          vault_transfer_status = COALESCE(vault_transfer_status, 'pending')
      WHERE id = $1
      `,
      [
        sessionId,
        paymentTxId,
        totalPriceHive,
        feeAmountHive,
        sellerAmountHive
      ]
    );

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "EMP trade finalized successfully.",
      trade: {
        listing_id: listing.id,
        session_id: session.id,
        buyer_username: buyerUsername,
        seller_username: session.seller_username,
        quantity: empQty,
        payment_tx_id: paymentTxId,
        total_price_hive: totalPriceHive,
        fee_amount_hive: feeAmountHive,
        seller_amount_hive: sellerAmountHive
      }
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("EMP buy-finalize error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to finalize EMP purchase."
    });
  } finally {
    clientConn.release();
  }
});
app.get("/admin/add-emp-settlement-columns", async (req, res) => {
  try {
    if (req.query.key !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await pool.query(`
      ALTER TABLE marketplace_purchase_sessions
      ADD COLUMN IF NOT EXISTS payment_tx_id TEXT,
      ADD COLUMN IF NOT EXISTS seller_payout_status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS vault_transfer_status TEXT DEFAULT 'pending';
    `);

    return res.json({
      success: true,
      message: "EMP settlement columns added successfully."
    });
  } catch (err) {
    console.error("Add EMP settlement columns error:", err);
    return res.status(500).json({ error: err.message });
  }
});


// ===============================
// 🏁 BLUEPRINT BUY FINALIZE
// ===============================
app.post("/marketplace/blueprint/buy-finalize", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const buyerUsername = normalizeUsername(req.body.username);
    const sessionId = Number(req.body.session_id);
    const sellerTxId = String(req.body.seller_tx_id || "").trim();
    const feeTxId = String(req.body.fee_tx_id || "").trim();

    if (!buyerUsername) {
      return res.status(400).json({
        success: false,
        error: "Username required."
      });
    }

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid session_id required."
      });
    }

    if (!sellerTxId) {
      return res.status(400).json({
        success: false,
        error: "seller_tx_id is required."
      });
    }

    if (!feeTxId) {
      return res.status(400).json({
        success: false,
        error: "fee_tx_id is required."
      });
    }

    await clientConn.query("BEGIN");

    const sessionRes = await clientConn.query(
      `
      SELECT *
      FROM marketplace_purchase_sessions
      WHERE id = $1
        AND asset_type = 'BLUEPRINT'
      LIMIT 1
      `,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Blueprint purchase session not found."
      });
    }

    const session = sessionRes.rows[0];

    if (session.buyer_username !== buyerUsername) {
      await clientConn.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        error: "This purchase session does not belong to you."
      });
    }

    if (session.status !== "pending") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Purchase session is already ${session.status}.`
      });
    }

    const listingRes = await clientConn.query(
      `
      SELECT *
      FROM marketplace_listings
      WHERE id = $1
        AND asset_type = 'BLUEPRINT'
      LIMIT 1
      `,
      [session.listing_id]
    );

    if (!listingRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Blueprint listing no longer exists."
      });
    }

    const listing = listingRes.rows[0];

    if (listing.status !== "active") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Listing is already ${listing.status}.`
      });
    }
    // Removed stale completed-session blocker for blueprint finalize.

    const sellerPaymentCheck = await findMatchingHiveTransfer({
      from: buyerUsername,
      to: session.seller_username,
      amountHive: session.seller_amount_hive,
      memo: session.seller_payment_memo
    });

    if (!sellerPaymentCheck.found) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Seller payment transfer not found on Hive."
      });
    }

    const feePaymentCheck = await findMatchingHiveTransfer({
      from: buyerUsername,
      to: TREASURY,
      amountHive: session.fee_amount_hive,
      memo: session.fee_payment_memo
    });

    if (!feePaymentCheck.found) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Vault fee transfer not found on Hive."
      });
    }

    const matchedSellerTxId = String(sellerPaymentCheck.trx_id || "").trim();
const matchedFeeTxId = String(feePaymentCheck.trx_id || "").trim();

// Payment is already verified by:
// from + to + amount + memo
// Keep tx ids only for record/debug, not as a hard failure check.
    const nftRes = await clientConn.query(
      `
      SELECT id, username, type
      FROM nfts
      WHERE id = $1
      LIMIT 1
      `,
      [listing.asset_id]
    );

    if (!nftRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Blueprint NFT not found."
      });
    }

    const nft = nftRes.rows[0];

    if (String(nft.type || "").toUpperCase() !== "BLUEPRINT") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Referenced NFT is not a blueprint."
      });
    }

    if (normalizeUsername(nft.username) !== normalizeUsername(session.seller_username)) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "Seller no longer owns this blueprint."
      });
    }

    await clientConn.query(
      `
      UPDATE nfts
      SET username = $1
      WHERE id = $2
      `,
      [buyerUsername, listing.asset_id]
    );

    await clientConn.query(
      `
      UPDATE blueprint_locks
      SET status = 'consumed',
          released_at = NOW()
      WHERE listing_id = $1
        AND status = 'locked'
      `,
      [listing.id]
    );

    await clientConn.query(
      `
      UPDATE marketplace_listings
      SET status = 'sold',
          buyer_username = $1,
          sold_at = NOW()
      WHERE id = $2
      `,
      [buyerUsername, listing.id]
    );

    await clientConn.query(
      `
      UPDATE marketplace_purchase_sessions
      SET status = 'completed',
          completed_at = NOW()
      WHERE id = $1
      `,
      [sessionId]
    );

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "Blueprint trade finalized successfully.",
      trade: {
        listing_id: listing.id,
        session_id: session.id,
        buyer_username: buyerUsername,
        seller_username: session.seller_username,
        blueprint_nft_id: listing.asset_id,
        total_price_hive: Number(session.total_price_hive),
        fee_amount_hive: Number(session.fee_amount_hive),
        seller_amount_hive: Number(session.seller_amount_hive),
        seller_tx_id: sellerTxId,
        fee_tx_id: feeTxId
      }
    });
  } catch (err) {
  await clientConn.query("ROLLBACK");
  console.error("Blueprint buy-finalize error:", err);
  return res.status(500).json({
    success: false,
    error: err.message || "Failed to finalize blueprint trade."
  });
} finally {
  clientConn.release();
}
});

app.get("/debug/marketplace/emp/reset-all", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    await clientConn.query("BEGIN");

    await clientConn.query(`
      DELETE FROM marketplace_purchase_sessions
      WHERE asset_type = 'EMP'
    `);

    await clientConn.query(`
      DELETE FROM emp_locks
    `);

    await clientConn.query(`
      DELETE FROM marketplace_listings
      WHERE asset_type = 'EMP'
    `);

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "All local EMP marketplace test data reset."
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("EMP reset-all debug error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to reset EMP marketplace test data."
    });
  } finally {
    clientConn.release();
  }
});

// ===============================
// 🔎 DEBUG EMP LOCKS
// ===============================
app.get("/debug/marketplace/emp/locks", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        username,
        listing_id,
        amount,
        status,
        created_at,
        released_at
      FROM emp_locks
      ORDER BY id DESC
      LIMIT 50
    `);

    return res.json({
      success: true,
      locks: result.rows
    });
  } catch (err) {
    console.error("Debug EMP locks error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load EMP locks."
    });
  }
});

// ===============================
// 🛠 DEBUG CLEAN STALE BLUEPRINT LOCKS
// ===============================
app.post("/debug/marketplace/blueprint/cleanup-stale-locks", async (req, res) => {
  try {
    await pool.query(`
      UPDATE blueprint_locks bl
      SET status = 'released',
          released_at = NOW()
      WHERE status = 'locked'
        AND NOT EXISTS (
          SELECT 1
          FROM marketplace_listings ml
          WHERE ml.id = bl.listing_id
            AND ml.asset_type = 'BLUEPRINT'
            AND ml.status = 'active'
        )
    `);

    return res.json({
      success: true,
      message: "Stale blueprint locks cleaned successfully."
    });
  } catch (err) {
    console.error("Cleanup stale blueprint locks error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to clean stale blueprint locks."
    });
  }
});
// ===============================
// 🛠 DEBUG FORCE TRANSFER BLUEPRINT NFT
// ===============================
app.post("/debug/marketplace/blueprint/force-transfer-nft", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const nftId = Number(req.body.nft_id);
    const fromUsername = normalizeUsername(req.body.from_username);
    const toUsername = normalizeUsername(req.body.to_username);

    if (!Number.isInteger(nftId) || nftId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid nft_id is required."
      });
    }

    if (!fromUsername || !toUsername) {
      return res.status(400).json({
        success: false,
        error: "from_username and to_username are required."
      });
    }

    await clientConn.query("BEGIN");

    const nftRes = await clientConn.query(
      `
      SELECT id, username, type
      FROM nfts
      WHERE id = $1
      LIMIT 1
      `,
      [nftId]
    );

    if (!nftRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "NFT not found."
      });
    }

    const nft = nftRes.rows[0];

    if (String(nft.type || "").toUpperCase() !== "BLUEPRINT") {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "NFT is not a BLUEPRINT."
      });
    }

    if (normalizeUsername(nft.username) !== fromUsername) {
      await clientConn.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Blueprint is not owned by ${fromUsername}.`
      });
    }

    await clientConn.query(
      `
      UPDATE nfts
      SET username = $1
      WHERE id = $2
      `,
      [toUsername, nftId]
    );

    await clientConn.query(
      `
      UPDATE blueprint_locks
      SET status = 'released',
          released_at = NOW()
      WHERE nft_id = $1
        AND status = 'locked'
      `,
      [nftId]
    );

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "Blueprint NFT force-transferred successfully.",
      nft_id: nftId,
      from_username: fromUsername,
      to_username: toUsername
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("Force transfer blueprint NFT error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to force-transfer blueprint NFT."
    });
  } finally {
    clientConn.release();
  }
});
// ===============================
// 🛠 DEBUG FORCE COMPLETE BLUEPRINT TRADE
// ===============================
app.post("/debug/marketplace/blueprint/force-complete", async (req, res) => {
  const clientConn = await pool.connect();

  try {
    const listingId = Number(req.body.listing_id);
    const sessionId = Number(req.body.session_id);
    const buyerUsername = normalizeUsername(req.body.buyer_username);

    if (!Number.isInteger(listingId) || listingId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid listing_id is required."
      });
    }

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid session_id is required."
      });
    }

    if (!buyerUsername) {
      return res.status(400).json({
        success: false,
        error: "buyer_username is required."
      });
    }

    await clientConn.query("BEGIN");

    const listingRes = await clientConn.query(
      `
      SELECT *
      FROM marketplace_listings
      WHERE id = $1
        AND asset_type = 'BLUEPRINT'
      LIMIT 1
      `,
      [listingId]
    );

    if (!listingRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Blueprint listing not found."
      });
    }

    const listing = listingRes.rows[0];

    const sessionRes = await clientConn.query(
      `
      SELECT *
      FROM marketplace_purchase_sessions
      WHERE id = $1
        AND asset_type = 'BLUEPRINT'
      LIMIT 1
      `,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      await clientConn.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error: "Blueprint purchase session not found."
      });
    }

    const session = sessionRes.rows[0];

    // Move blueprint NFT to buyer
    await clientConn.query(
      `
      UPDATE nfts
      SET username = $1
      WHERE id = $2
      `,
      [buyerUsername, listing.asset_id]
    );

    // Consume lock
    await clientConn.query(
      `
      UPDATE blueprint_locks
      SET status = 'consumed',
          released_at = NOW()
      WHERE listing_id = $1
        AND status = 'locked'
      `,
      [listingId]
    );

    // Mark listing sold
    await clientConn.query(
      `
      UPDATE marketplace_listings
      SET status = 'sold',
          buyer_username = $1,
          sold_at = NOW()
      WHERE id = $2
      `,
      [buyerUsername, listingId]
    );

    // Mark session completed
    await clientConn.query(
      `
      UPDATE marketplace_purchase_sessions
      SET status = 'completed',
          completed_at = NOW()
      WHERE id = $1
      `,
      [sessionId]
    );

    await clientConn.query("COMMIT");

    return res.json({
      success: true,
      message: "Blueprint trade force-completed successfully.",
      listing_id: listingId,
      session_id: sessionId,
      blueprint_nft_id: listing.asset_id,
      buyer_username: buyerUsername
    });
  } catch (err) {
    await clientConn.query("ROLLBACK");
    console.error("Force complete blueprint trade error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to force-complete blueprint trade."
    });
  } finally {
    clientConn.release();
  }
});
// ===============================
// 🔎 DEBUG EMP MARKETPLACE LISTINGS
// ===============================
app.get("/debug/marketplace/emp/listings", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        seller_username,
        buyer_username,
        asset_type,
        quantity,
        unit_price_hive,
        total_price_hive,
        fee_percent,
        fee_amount_hive,
        seller_amount_hive,
        status,
        created_at,
        sold_at,
        cancelled_at
      FROM marketplace_listings
      WHERE asset_type = 'EMP'
      ORDER BY id DESC
      LIMIT 50
    `);

    return res.json({
      success: true,
      listings: result.rows
    });
  } catch (err) {
    console.error("Debug EMP listings error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load EMP marketplace listings."
    });
  }
});

app.get("/debug/emp-balance/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "")
      .trim()
      .replace("@", "")
      .toLowerCase();

    const result = await pool.query(
      `
      SELECT COALESCE(balance, 0) AS balance
      FROM emp_balances
      WHERE username = $1
      LIMIT 1
      `,
      [username]
    );

    return res.json({
      success: true,
      username,
      balance: Number(result.rows[0]?.balance || 0)
    });
  } catch (err) {
    console.error("Debug EMP balance error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load EMP balance."
    });
  }
});
// ===============================
// 🛠 DEBUG CREDIT EMP
// ===============================
app.post("/debug/emp/credit", async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const amount = Number(req.body.amount);

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required."
      });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Amount must be greater than 0."
      });
    }

    await pool.query(
      `
      INSERT INTO emp_balances (username, balance)
      VALUES ($1, $2)
      ON CONFLICT (username)
      DO UPDATE SET balance = emp_balances.balance + EXCLUDED.balance
      `,
      [username, amount]
    );

    return res.json({
      success: true,
      message: `${amount} EMP credited to ${username}.`
    });
  } catch (err) {
    console.error("Debug EMP credit error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to credit EMP."
    });
  }
});

// =========================================================
// OPTIONAL GUARDS FOR IMPORTANT ROUTES
// Add these checks inside existing routes later.
// =========================================================

// Inside /create-order, near start:
// const packSalesFlag = await pool.query(
//   `SELECT value FROM admin_flags WHERE key = 'pack_sales_enabled' LIMIT 1`
// );
// if (packSalesFlag.rows[0] && packSalesFlag.rows[0].value === false) {
//   return res.status(403).json({ success: false, error: 'Pack sales are temporarily paused.' });
// }

// Inside /buy-blueprint or /buy-blueprint-hive:
// check blueprint_mint_enabled before continuing.

// Inside /build-factory:
// check factory_build_enabled before continuing.

// Inside marketplace routes:
// check marketplace_enabled before continuing.

// =========================================================
// FRONTEND WIRING NOTES
// =========================================================
// admin-dashboard.html should next be updated to:
// 1. call GET /admin/overview with x-admin-key
// 2. call GET /admin/player/:username with x-admin-key
// 3. call POST /admin/flags/:key with x-admin-key
// 4. stop using placeholders for EMP / treasury / factories / flags

// ============================
// 🚀 START SERVER
// ============================

app.listen(PORT, async () => {
  console.log("🚀 MydEmpire backend running on port", PORT);
  await initDatabase();
    await ensureMarketplaceListingsTable();
  await ensureEmpLocksTable();
    await ensureBlueprintLocksTable();
    await ensureMarketplacePurchaseSessionsTable();
  startScheduler();
});
