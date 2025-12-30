// api/webhook.js

async function webhook(req, res) {
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

    // 🧪 لوج مؤقت (تشيله بعد التأكد)
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
    const quantity = firstItem.quantity != null ? firstItem.quantity : 1;

    // -------------------------
    // Helpers
    // -------------------------
    const cleanParam = (text) =>
      text ? text.toString().replace(/[\r\n\t]+/g, " ").trim() : "";

    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // -------------------------
    // 3) الأسعار
    // -------------------------
    const productPrice =
      toNumber(firstItem.price) ??
      toNumber(data.subtotal_cost) ??
      toNumber(data.subtotal) ??
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
    // 4) Normalize Phone
    // -------------------------
    let raw = customerPhone.toString().replace(/[^0-9]/g, "");

    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);

    console.log("📞 Normalized Phone:", raw);

    // -------------------------
    // 5) Paramedics Config
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 6) رسالة الطلب
    // -------------------------
    let message = address || "";

    message += ` - ${productName}`;
    message += ` - الكمية: ${quantity}`;

    if (productPrice != null) {
      message += ` - سعر المنتج: ${productPrice}`;
    }

    if (shippingCost > 0) {
      message += ` - الشحن: ${shippingCost}`;
    } else {
      message += ` - الشحن: مجاني`;
    }

    if (totalWithShipping != null) {
      message += ` - الإجمالي: ${totalWithShipping}`;
    }

    // -------------------------
    // 7) Payload (✔ التمبلت الصح)
    // -------------------------
    const payload = {
      phone_number: raw,
      template_name: "1st_utility", // ✅ التمبلت الموجود عندك
      template_language: "en",
      field_1: cleanParam(customerName),
      field_2: cleanParam(orderId),
      field_3: cleanParam(message),
      contact: {
        first_name: cleanParam(customerName),
        phone_number: raw,
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

    if (!saasRes.ok) {
      console.error("❌ SaaS API Error:", responseData);
      return res.status(500).json({ error: "saas_api_error", details: responseData });
    }

    console.log("✅ SaaS Response:", responseData);
    return res.status(200).json({ status: "sent" });
  } catch (err) {
    console.error("❌ Webhook Error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

module.exports = webhook;
