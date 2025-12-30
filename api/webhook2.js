// api/webhook2.js

async function webhook(req, res) {
  // ✅ Health Check
  if (req.method === "GET") {
    return res.status(200).send("Webhook2 Running ✅");
  }

  // ✅ Allow only POST (EasyOrders)
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    // 🏪 Store Tag from URL: ?storeTag=EQ / GZ / BR
    const storeTagRaw = (req.query && req.query.storeTag) || "";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";
    console.log("🏪 Store Tag:", storeTagRaw || "NO_TAG");

    // 🧩 Template/Language from URL (optional)
    const tpl = (req.query && req.query.tpl) || "1st_utillty"; // ✅ template name (2 L)
    const lang = (req.query && req.query.lang) || "en";
    console.log("🧩 tpl/lang:", tpl, lang);

    console.log("📦 FULL DATA:", JSON.stringify(data));

    // -------------------------
    // 1) Customer / Order Data
    // -------------------------
    const customerName =
      data.full_name || data.name || data.customer_name || "Customer";

    const customerPhone =
      data.phone || data.phone_alt || data.customer_phone || "";

    const orderId = data.short_id || data.order_id || data.id || "";
    const address = data.address || data.government || "";

    // First cart item
    const firstItem = data.cart_items?.[0] || {};
    const productName = firstItem.product?.name || "Product";
    const quantity = firstItem.quantity != null ? firstItem.quantity : 1;

    // Prices
    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const productPrice =
      toNumber(firstItem.price) ??
      toNumber(data.cost) ??
      toNumber(data.total_cost) ??
      null;

    const shippingCost =
      toNumber(
        data.shipping_cost ??
          data.shipping_fees ??
          data.delivery_cost ??
          data.shipping ??
          0
      ) ?? 0;

    const total =
      toNumber(data.total_cost) ??
      (productPrice != null ? productPrice + shippingCost : null);

    // -------------------------
    // 2) Build field_3 ({{3}}) short & clean
    // -------------------------
    // (اختصاره عشان يقلل مشاكل الـ held/dropped + يمنع طول زيادة)
    const short = (t, max = 45) => {
      const s = (t || "").toString().trim();
      return s.length > max ? s.slice(0, max) : s;
    };

    let field3 = "";
    field3 += `Addr:${short(address, 35)}`;
    field3 += ` | Prod:${short(productName, 35)}`;
    field3 += ` | Qty:${quantity}`;
    field3 += ` | Ship:${shippingCost > 0 ? shippingCost : "FREE"}`;
    field3 += ` | Total:${total != null ? total : (productPrice != null ? productPrice : "")}`;

    // -------------------------
    // 3) Clean helper (remove newlines/tabs)
    // -------------------------
    const cleanParam = (text) => {
      if (!text) return "";
      return text.toString().replace(/[\r\n\t]+/g, " ").trim();
    };

    // -------------------------
    // 4) Normalize Phone
    // -------------------------
    let raw = customerPhone.toString().replace(/[^0-9]/g, "");

    // السعودية
    if (raw.startsWith("05") && raw.length === 10) {
      raw = "966" + raw.substring(1);
    }
    // مصر
    else if (raw.startsWith("01") && raw.length === 11) {
      raw = "20" + raw.substring(1);
    }
    // السودان
    else if (raw.startsWith("09") && raw.length === 10) {
      raw = "249" + raw.substring(1);
    }
    // اليمن
    else if (raw.startsWith("7") && raw.length === 9) {
      raw = "967" + raw;
    }

    const normalizedPhone = raw;
    console.log("📞 Normalized Phone:", normalizedPhone);

    // -------------------------
    // 5) Paramedics Config
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      console.error("❌ Missing Environment Variables");
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 6) Payload (✅ correct for your template)
    // -------------------------
    // ✅ WhatsApp template variables MUST be array of strings:
    // localizable_params: [ {{1}}, {{2}}, {{3}} ]
    const payload = {
      phone_number: normalizedPhone,
      template_name: tpl,              // "1st_utillty"
      template_language: lang,         // "en"
      localizable_params: [
        cleanParam(customerName),                     // {{1}}
        cleanParam(`${orderId} ${storeTag}`.trim()),  // {{2}}
        cleanParam(field3),                           // {{3}}
      ],
      contact: {
        first_name: cleanParam(customerName),
        phone_number: normalizedPhone,
        country: "auto",
      },
    };

    const endpoint = `${API_BASE_URL}/${VENDOR_UID}/contact/send-template-message`;

    console.log("🚀 Sending to SaaS:", endpoint);
    console.log("🧾 Payload:", JSON.stringify(payload));

    const saasRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await saasRes.json().catch(() => null);

    if (!saasRes.ok || (responseData && responseData.result === "failed")) {
      console.error("❌ SaaS API Error:", responseData);
      return res.status(500).json({
        error: "saas_api_error",
        details: responseData,
      });
    }

    console.log("✅ SaaS Response:", responseData);
    return res.status(200).json({ status: "sent", data: responseData });
  } catch (err) {
    console.error("❌ Webhook Error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

module.exports = webhook;
