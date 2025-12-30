// api/webhook2.js

async function webhook(req, res) {
  if (req.method === "GET") {
    return res.status(200).send("Webhook2 Running ✅");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    // =========================
    // 0) Query Params
    // =========================
    const storeTagRaw = (req.query && req.query.storeTag) || "";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";

    const lang = ((req.query && req.query.lang) || "en").toString().toLowerCase();

    // ✅ اسم التمبلت عندك (بالغلط الإملائي نفسه)
    // EN: 1st_utillty
    // AR: first_utillty
    let tpl = (req.query && req.query.tpl) ? req.query.tpl.toString() : "";
    if (!tpl) tpl = lang === "ar" ? "first_utillty" : "1st_utillty";

    console.log("🏪 Store Tag:", storeTagRaw || "NO_TAG");
    console.log("🧩 tpl/lang:", tpl, lang);
    console.log("📦 FULL DATA:", JSON.stringify(data));

    // =========================
    // Helpers
    // =========================
    const cleanParam = (text) => {
      if (text === null || text === undefined) return "";
      return text.toString().replace(/[\r\n\t]+/g, " ").trim();
    };

    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const asText = (value) => ({
      type: "text",
      text: cleanParam(value),
    });

    // =========================
    // 1) بيانات العميل والطلب
    // =========================
    const customerName =
      data.full_name || data.name || data.customer_name || "عميلنا العزيز";

    const customerPhone =
      data.phone || data.phone_alt || data.customer_phone || "";

    const orderId = data.short_id || data.order_id || data.id || "";
    const address = data.address || data.government || "";

    const firstItem = data.cart_items?.[0] || {};
    const productName = firstItem.product?.name || "منتجك";
    const quantity = firstItem.quantity != null ? firstItem.quantity : 1;

    const productPrice =
      toNumber(firstItem.price) ??
      toNumber(data.cost) ??
      toNumber(data.subtotal_cost) ??
      toNumber(data.subtotal) ??
      null;

    const shippingCost =
      toNumber(
        data.shipping_cost ??
          data.shipping_fees ??
          data.delivery_cost ??
          data.shipping ??
          data.expense ??
          0
      ) ?? 0;

    const total =
      toNumber(data.total_cost) ??
      (productPrice != null ? productPrice + shippingCost : null);

    // =========================
    // 2) تفاصيل مختصرة وآمنة (field_3 / param3)
    // =========================
    const safeProductName = cleanParam(productName).slice(0, 35);
    const safeAddress = cleanParam(address).slice(0, 70);

    const shipText = shippingCost > 0 ? `${shippingCost}` : "FREE";
    const totalText = total != null ? `${total}` : (productPrice != null ? `${productPrice}` : "");

    const details =
      `Addr:${safeAddress} | ` +
      `Prod:${safeProductName} | ` +
      `Qty:${quantity} | ` +
      `Ship:${shipText} | ` +
      `Total:${totalText}`;

    // =========================
    // 3) Normalize Phone (EG/SA/SD/YE)
    // =========================
    let raw = customerPhone.toString().replace(/[^0-9]/g, "");

    // السعودية 05xxxxxxxx => 9665xxxxxxxx
    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    // السعودية 5xxxxxxxx => 9665xxxxxxxx
    else if (raw.startsWith("5") && raw.length === 9) raw = "966" + raw;
    // مصر 01xxxxxxxxx => 201xxxxxxxxx
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);
    // السودان 09xxxxxxxx => 2499xxxxxxxx
    else if (raw.startsWith("09") && raw.length === 10) raw = "249" + raw.substring(1);
    // اليمن 7xxxxxxxx => 9677xxxxxxxx
    else if (raw.startsWith("7") && raw.length === 9) raw = "967" + raw;

    const normalizedPhone = raw;
    console.log("📞 Normalized Phone:", normalizedPhone);

    // =========================
    // 4) Paramedics Config
    // =========================
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      console.error("❌ Missing Environment Variables");
      return res.status(500).json({ error: "missing_env" });
    }

    // =========================
    // 5) Parameters (3)
    // =========================
    const p1 = cleanParam(customerName);
    const p2 = cleanParam(`${orderId} ${storeTag}`.trim());
    const p3 = cleanParam(details);

    // ✅ WhatsApp official format
    const components = [
      {
        type: "body",
        parameters: [asText(p1), asText(p2), asText(p3)],
      },
    ];

    // =========================
    // 6) Payload (components هو الأهم)
    // =========================
    const payload = {
      phone_number: normalizedPhone,
      template_name: tpl,
      template_language: lang,

      // ✅ ده اللي ميتا بتفهمه 100%
      components,

      // ✅ فallbacks (لو Paramedics بيقرأهم)
      body: { localizable_params: [p1, p2, p3] },
      localizable_params: [p1, p2, p3],
      field_1: p1,
      field_2: p2,
      field_3: p3,

      contact: {
        first_name: p1,
        phone_number: normalizedPhone,
        country: "auto",
      },
    };

    const endpoint = `${API_BASE_URL}/${VENDOR_UID}/contact/send-template-message`;

    console.log("🚀 Sending to SaaS:", endpoint);
    console.log("🧾 Payload:", JSON.stringify(payload, null, 2));

    const saasRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await saasRes.json().catch(() => null);

    if (!saasRes.ok) {
      console.error("❌ SaaS API Error:", responseData);
      return res.status(500).json({ error: "saas_api_error", details: responseData });
    }

    console.log("✅ SaaS Response:", responseData);
    return res.status(200).json({ status: "sent", data: responseData });
  } catch (err) {
    console.error("❌ Webhook Error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

module.exports = webhook;
