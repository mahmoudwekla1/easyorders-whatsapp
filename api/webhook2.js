// api/webhook.js

module.exports = async function webhook(req, res) {
  // Health Check
  if (req.method === "GET") {
    return res.status(200).send("Webhook Running ✅");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    // قراءة Store Tag
    const storeTagRaw = (req.query && req.query.storeTag) || "";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";

    // -------------------------
    // 1) بيانات العميل والطلب
    // -------------------------
    const customerName =
      data.full_name || data.name || data.customer_name || "عميلنا العزيز";

    const customerPhone =
      data.phone || data.phone_alt || data.customer_phone || "";

    const orderId =
      data.short_id || data.order_id || data.id || "";

    const address =
      data.address || data.government || data.city || "";

    const firstItem = data.cart_items?.[0] || {};
    const productName = firstItem.product?.name || "منتجك";
    const quantity = firstItem.quantity != null ? firstItem.quantity : 1;

    const priceRaw =
      firstItem.price ??
      data.total_cost ??
      data.cost ??
      0;

    // -------------------------
    // 2) حساب الشحن + الإجمالي (SAR)
    // -------------------------
    const shippingRaw =
      data.shipping_cost ??
      data.shipping_fee ??
      data.shipping_price ??
      data.delivery_cost ??
      data.shipping ??
      data.delivery ??
      0;

    const priceNum = Number(String(priceRaw).replace(/[^0-9.]/g, "")) || 0;
    const shippingNum = Number(String(shippingRaw).replace(/[^0-9.]/g, "")) || 0;

    const shippingText =
      shippingNum > 0 ? `${shippingNum} ريال سعودي` : "مجاني";

    const totalNum =
      shippingNum > 0 ? priceNum + shippingNum : priceNum;

    // -------------------------
    // 3) تفاصيل الطلب (المتغير الثالث)
    // -------------------------
    const addressAndProduct = `
اسم المنتج: ${productName}
الكمية: ${quantity}
سعر المنتج: ${priceNum} ريال سعودي
الشحن: ${shippingText}
الإجمالي: ${totalNum} ريال سعودي
العنوان: ${address}
`.trim();

    const cleanParam = (text) => {
      if (!text) return "";
      return String(text).replace(/[\r\n\t]+/g, " ").trim();
    };

    // -------------------------
    // 4) توحيد رقم الهاتف
    // -------------------------
    let raw = String(customerPhone).replace(/[^0-9]/g, "");

    // السعودية
    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);

    // مصر
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);

    const normalizedPhone = raw;

    // -------------------------
    // 5) ENV
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 6) Payload (WhatsApp Template)
    // -------------------------
    const payload = {
      phone_number: normalizedPhone,
      template_name: "first_utillty",
      template_language: "ar",

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

    const saasRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await saasRes.json().catch(() => null);

    if (!saasRes.ok || responseData?.result === "failed") {
      console.error("❌ SaaS Error:", responseData);
      return res.status(500).json({ error: "saas_error", details: responseData });
    }

    console.log("✅ Success:", responseData);
    return res.status(200).json({ status: "sent", data: responseData });

  } catch (err) {
    console.error("❌ Webhook Crash:", err);
    return res.status(500).json({
      error: "internal_error",
      details: err?.message || String(err),
    });
  }
};
