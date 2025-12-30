// api/webhook2.js

async function webhook2(req, res) {
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

    // 🆕 0) storeTag / tpl / lang من URL
    const storeTagRaw = (req.query && req.query.storeTag) || "EQ";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";

    let tpl = (req.query && req.query.tpl) || "1st_utility";
    const lang = (req.query && req.query.lang) || "en";

    // تصحيح الغلط الشائع تلقائي
    if (tpl === "1st_utillty") tpl = "1st_utility";

    console.log("🏪 Store Tag:", storeTagRaw);
    console.log("🧩 tpl/lang:", tpl, lang);
    console.log("📦 FULL DATA:", JSON.stringify(data));

    // -------------------------
    // 1) بيانات العميل
    // -------------------------
    const customerName =
      data.full_name || data.name || data.customer_name || "عميلنا العزيز";

    const customerPhone =
      data.phone || data.phone_alt || data.customer_phone || "";

    const orderId = data.short_id || data.order_id || data.id || "";
    const address = data.address || data.government || "";

    // -------------------------
    // 2) المنتج
    // -------------------------
    const firstItem = data.cart_items?.[0] || {};
    const productName = firstItem.product?.name || "منتجك";
    const quantity = firstItem.quantity ?? 1;

    const cleanParam = (text) =>
      text ? text.toString().replace(/[\r\n\t]+/g, " ").trim() : "";

    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const productPrice =
      toNumber(firstItem.price) ??
      toNumber(data.cost) ??
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

    // -------------------------
    // 3) رسالة مختصرة آمنة ({{3}})
    // -------------------------
    const safeAddress = cleanParam(address).slice(0, 60);
    const safeProduct = cleanParam(productName).slice(0, 40);
    const shipText = shippingCost > 0 ? `${shippingCost}` : "FREE";
    const totalText = total != null ? `${total}` : "";

    const orderDetails =
      `Addr:${safeAddress} | Prod:${safeProduct} | Qty:${quantity}` +
      ` | Ship:${shipText}` +
      (totalText ? ` | Total:${totalText}` : "");

    // -------------------------
    // 4) توحيد رقم الموبايل
    // -------------------------
    let raw = customerPhone.toString().replace(/[^0-9]/g, "");

    // 🇸🇦 السعودية
    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    else if (raw.startsWith("5") && raw.length === 9) raw = "966" + raw;
    else if (raw.startsWith("5") && raw.length === 10) raw = "966" + raw;

    // 🇪🇬 مصر
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);

    // 🇸🇩 السودان
    else if (raw.startsWith("09") && raw.length === 10) raw = "249" + raw.substring(1);

    // 🇾🇪 اليمن
    else if (raw.startsWith("7") && raw.length === 9) raw = "967" + raw;

    const normalizedPhone = raw;
    console.log("📞 Normalized Phone:", normalizedPhone);

    // -------------------------
    // 5) Paramedics ENV
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 6) Payload (body.localizable_params)
    // -------------------------
    const payload = {
      phone_number: normalizedPhone,
      template_name: tpl,
      template_language: lang,
      body: {
        localizable_params: [
          { type: "text", text: cleanParam(customerName) },
          { type: "text", text: cleanParam(`${orderId} ${storeTag}`) },
          { type: "text", text: cleanParam(orderDetails) },
        ],
      },
      contact: {
        first_name: cleanParam(customerName),
        phone_number: normalizedPhone,
        country: "auto",
      },
    };

    const endpoint = `${API_BASE_URL}/${VENDOR_UID}/contact/send-template-message`;

    console.log("🚀 Sending to SaaS:", endpoint, payload);

    const saasRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await saasRes.json().catch(() => null);
    console.log("✅ SaaS Response:", responseData);

    if (!saasRes.ok) {
      return res.status(200).json({ status: "saas_failed", data: responseData });
    }

    return res.status(200).json({ status: "sent", data: responseData });
  } catch (err) {
    console.error("❌ Webhook2 Error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

module.exports = webhook2;
