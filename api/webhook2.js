// api/webhook2.js

async function webhook(req, res) {
  // ✅ Health Check
  if (req.method === "GET") {
    return res.status(200).send("Webhook Running ✅");
  }

  // ✅ Allow only POST (EasyOrders)
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    // 🏪 Store Tag (افتراضي EQ)
    const storeTagRaw = (req.query && req.query.storeTag) || "EQ";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";
    console.log("🏪 Store Tag:", storeTagRaw);

    // 🧪 لوج كامل (تقدر تشيله بعد الاستقرار)
    console.log("📦 FULL DATA:", JSON.stringify(data));

    // -------------------------
    // 1) بيانات العميل والطلب
    // -------------------------
    const customerName =
      data.full_name || data.name || data.customer_name || "عميلنا العزيز";

    const customerPhone =
      data.phone || data.phone_alt || data.customer_phone || "";

    const orderId = data.short_id || data.order_id || data.id || "";
    const address = data.address || data.government || "";

    // -------------------------
    // 2) أول منتج
    // -------------------------
    const firstItem = data.cart_items?.[0] || {};
    const productName = firstItem.product?.name || "منتجك";
    const quantity = firstItem.quantity != null ? firstItem.quantity : 1;

    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const productPrice =
      toNumber(firstItem.price) ??
      toNumber(data.subtotal_cost) ??
      toNumber(data.subtotal) ??
      toNumber(data.cost) ??
      null;

    const shippingCost =
      toNumber(
        data.shipping_cost ??
        data.shipping_fees ??
        data.delivery_cost ??
        data.shipping ??
        0
      ) ?? 0;

    const totalWithShipping =
      toNumber(data.total_cost) ??
      (productPrice != null ? productPrice + shippingCost : null);

    // -------------------------
    // 3) تفاصيل الطلب {{3}} (صيغة متوازنة وآمنة)
    // -------------------------
    const shortProduct = (productName || "").toString().slice(0, 40);
    const shipText = shippingCost > 0 ? `${shippingCost}` : "مجاني";
    const totalText =
      totalWithShipping != null
        ? `${totalWithShipping}`
        : productPrice != null
        ? `${productPrice}`
        : "";

    const details =
      `العنوان: ${address || "-"} | ` +
      `المنتج: ${shortProduct || "-"} | ` +
      `كمية: ${quantity} | ` +
      `شحن: ${shipText} | ` +
      `إجمالي: ${totalText}`;

    const cleanParam = (text) => {
      if (!text) return "";
      return text.toString().replace(/[\r\n\t]+/g, " ").trim();
    };

    // -------------------------
    // 4) Normalize Phone
    // -------------------------
    let raw = customerPhone.toString().replace(/[^0-9]/g, "");

    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);
    else if (raw.startsWith("09") && raw.length === 10) raw = "249" + raw.substring(1);
    else if (raw.startsWith("7") && raw.length === 9) raw = "967" + raw;

    console.log("📞 Normalized Phone:", raw);

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
    // 6) Payload النهائي
    // -------------------------
    const payload = {
      phone_number: raw,
      template_name: "1st_utility",
      template_language: "en", // ✅ Paramedics شايفها en
      field_1: cleanParam(customerName),
      field_2: cleanParam(`${String(orderId)} ${storeTag}`),
      field_3: cleanParam(details),
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

// ✅ تصدير بصيغة CommonJS عشان Vercel
module.exports = webhook;
