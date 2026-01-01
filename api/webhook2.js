// api/webhook.js

module.exports = async function webhook(req, res) {
  // ✅ Health Check
  if (req.method === "GET") {
    return res.status(200).send("Webhook Running ✅");
  }

  // ✅ Allow only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    // ✅ قراءة التاج من الـ query
    const storeTagRaw = (req.query && req.query.storeTag) ? String(req.query.storeTag) : "";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";

    // -------------------------
    // 1) تجهيز البيانات
    // -------------------------
    const customerName =
      data.full_name || data.name || data.customer_name || "عميلنا العزيز";

    const customerPhone =
      data.phone || data.phone_alt || data.customer_phone || "";

    const orderId =
      data.short_id || data.order_id || data.id || "";

    const address =
      data.address || data.government || data.city || "";

    const firstItem = (data.cart_items && data.cart_items[0]) ? data.cart_items[0] : {};
    const productName = (firstItem.product && firstItem.product.name) ? firstItem.product.name : "منتجك";
    const quantity = (firstItem.quantity != null) ? firstItem.quantity : 1;

    const price =
      (firstItem.price != null) ? firstItem.price
      : (data.total_cost != null) ? data.total_cost
      : (data.cost != null) ? data.cost
      : "";

    // تركيب الملخص
    let addressAndProduct = address || "";
    if (productName) addressAndProduct += (addressAndProduct ? " - " : "") + productName;
    if (quantity) addressAndProduct += ` - الكمية: ${quantity}`;
    if (price !== "") addressAndProduct += ` - السعر: ${price}`;

    const cleanParam = (text) => {
      if (text == null) return "";
      return String(text).replace(/[\r\n\t]+/g, " ").trim();
    };

    // -------------------------
    // 2) توحيد رقم الهاتف
    // -------------------------
    let raw = String(customerPhone).replace(/[^0-9]/g, "");

    // KSA: 05xxxxxxxx -> 9665xxxxxxxx
    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    // EG: 01xxxxxxxxx -> 20xxxxxxxxxx
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);
    // SD: 09xxxxxxxx -> 249xxxxxxxxx
    else if (raw.startsWith("09") && raw.length === 10) raw = "249" + raw.substring(1);
    // YE: 7xxxxxxxx -> 9677xxxxxxxx
    else if (raw.startsWith("7") && raw.length === 9) raw = "967" + raw;

    const normalizedPhone = raw;

    // -------------------------
    // 3) ENV
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 4) Payload
    // -------------------------
    const payload = {
      phone_number: normalizedPhone,
      template_name: "1st_utillty",
      template_language: "en", // غيّرها للغة المعتمدة عندك لو مختلفة
      field_1: cleanParam(customerName),
      field_2: cleanParam(`${orderId} ${storeTag}`.trim()),
      field_3: cleanParam(addressAndProduct),
      contact: {
        first_name: cleanParam(customerName),
        phone_number: normalizedPhone,
        country: "auto",
      },
    };

    const endpoint = `${API_BASE_URL}/${VENDOR_UID}/contact/send-template-message`;

    console.log("🚀 Sending Payload:", JSON.stringify(payload, null, 2));
    console.log("📍 Endpoint:", endpoint);

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
      console.error("❌ SaaS Error:", responseData);
      return res.status(500).json({ error: "saas_error", details: responseData });
    }

    console.log("✅ Success:", responseData);
    return res.status(200).json({ status: "sent", data: responseData });

  } catch (err) {
    console.error("❌ Webhook Crash:", err);
    return res.status(500).json({ error: "internal_error", details: err?.message || String(err) });
  }
};
