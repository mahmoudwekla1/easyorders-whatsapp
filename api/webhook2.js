// api/webhook2.js

const fetch = require("node-fetch");

async function webhook(req, res) {
  // Health check
  if (req.method === "GET") {
    return res.status(200).send("Webhook2 Running ✅");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    // store tag
    const storeTagRaw = req.query?.storeTag || "";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";
    console.log("🏪 Store Tag:", storeTagRaw || "NO_TAG");

    // basic data
    const customerName =
      (data.full_name || "").trim() || "عميلنا العزيز";

    const customerPhone =
      data.phone || data.phone_alt || "";

    const orderId = data.short_id || data.id || "";

    const address = data.address || "";

    const item = data.cart_items?.[0] || {};
    const productName = item.product?.name || "منتج";
    const qty = item.quantity || 1;

    const total =
      data.total_cost ??
      data.cost ??
      item.price ??
      "";

    // build {{3}}
    let details = `العنوان: ${address}`;
    details += ` | المنتج: ${productName}`;
    details += ` | الكمية: ${qty}`;
    if (total !== "") details += ` | الإجمالي: ${total}`;

    const clean = (v) =>
      v?.toString().replace(/[\r\n\t]+/g, " ").trim();

    // -------------------------
    // phone normalize
    // -------------------------
    let raw = customerPhone.toString().replace(/\D/g, "");

    // KSA
    if (raw.startsWith("05") && raw.length === 10) {
      raw = "966" + raw.slice(1);
    }
    // Egypt
    else if (raw.startsWith("01") && raw.length === 11) {
      raw = "20" + raw.slice(1);
    }

    console.log("📞 Normalized Phone:", raw);

    // -------------------------
    // SaaS config
    // -------------------------
    const API_BASE = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE || !VENDOR_UID || !TOKEN) {
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // ✅ FINAL PAYLOAD (AR ONLY)
    // -------------------------
    const payload = {
      phone_number: raw,
      template_name: "first_utillty",
      template_language: "ar",

      field_1: clean(customerName),                 // {{1}}
      field_2: clean(`${orderId} ${storeTag}`),      // {{2}}
      field_3: clean(details),                       // {{3}}

      contact: {
        first_name: clean(customerName),
        phone_number: raw,
        country: "auto",
      },
    };

    const endpoint = `${API_BASE}/${VENDOR_UID}/contact/send-template-message`;

    console.log("🚀 Sending to SaaS:", endpoint);
    console.log("🧾 Payload:", payload);

    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const resp = await r.json();

    if (!r.ok) {
      console.error("❌ SaaS API Error:", resp);
      return res.status(500).json(resp);
    }

    console.log("✅ Sent Successfully");
    return res.status(200).json(resp);

  } catch (err) {
    console.error("❌ Webhook Error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

module.exports = webhook;
