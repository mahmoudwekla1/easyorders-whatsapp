// api/webhook.js

module.exports = async function webhook(req, res) {
  // =========================
  // Health Check
  // =========================
  if (req.method === "GET") {
    return res.status(200).send("Webhook Running ✅");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    // =========================
    // بيانات العميل والطلب
    // =========================
    const customerName =
      data.full_name ||
      data.name ||
      data.customer_name ||
      "عميلنا العزيز";

    const customerPhone =
      data.phone ||
      data.phone_alt ||
      data.customer_phone ||
      "";

    const orderId =
      data.short_id ||
      data.order_id ||
      data.id ||
      "";

    // =========================
    // العنوان التفصيلي
    // =========================
    const detailedAddress =
      data.address ||
      data.full_address ||
      data.shipping_address ||
      data.address_text ||
      data.city ||
      "غير متوفر";

    // =========================
    // بيانات المنتج
    // =========================
    const firstItem = data.cart_items?.[0] || {};
    const productName = firstItem.product?.name || "منتج";
    const quantity =
      firstItem.quantity != null ? firstItem.quantity : 1;

    const priceRaw =
      firstItem.price ??
      data.total_cost ??
      data.cost ??
      0;

    // =========================
    // الشحن + الإجمالي
    // =========================
    const shippingRaw =
      data.shipping_cost ??
      data.shipping_fee ??
      data.shipping_price ??
      data.delivery_cost ??
      data.shipping ??
      data.delivery ??
      0;

    const priceNum =
      Number(String(priceRaw).replace(/[^0-9.]/g, "")) || 0;

    const shippingNum =
      Number(String(shippingRaw).replace(/[^0-9.]/g, "")) || 0;

    const shippingText =
      shippingNum > 0 ? `${shippingNum} ريال سعودي` : "مجاني";

    const totalNum =
      shippingNum > 0 ? priceNum + shippingNum : priceNum;

    // =========================
    // العنوان الوطني (آخر حاجة)
    // =========================
    const nationalAddressRaw =
      data.national_address ||
      data.short_address ||
      data.shortAddress ||
      data.address_short ||
      "";

    const nationalAddressClean =
      String(nationalAddressRaw).trim();

    const nationalAddress =
      nationalAddressClean
        ? nationalAddressClean
        : "غير متوفر (يرجى تزويدنا بالعنوان الوطني)";

    // =========================
    // تنظيف نص (سطر واحد)
    // =========================
    const safeText = (t) => {
      if (!t) return "";
      return String(t)
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    };

    const addrText = safeText(detailedAddress);

    // =========================
    // {{3}} = العنوان المسجل لدينا
    // =========================
    const field3Text = safeText(
      `العنوان التفصيلي: ${addrText} 🔴 العنوان الوطني: ${nationalAddress}`
    );

    // =========================
    // ENV
    // =========================
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      return res.status(500).json({ error: "missing_env" });
    }

    // =========================
    // Payload WhatsApp
    // =========================
    const payload = {
      phone_number: safeText(customerPhone),
      template_name: "first_utillty",
      template_language: "ar",

      // {{1}}
      field_1: safeText(customerName),

      // {{2}} رقم الطلب + تفاصيله
      field_2: safeText(
        `${orderId} — المنتج: ${productName} | الكمية: ${quantity} | السعر: ${priceNum} ريال سعودي | الشحن: ${shippingText} | الإجمالي: ${totalNum} ريال سعودي`
      ),

      // {{3}} العنوان المسجل لدينا
      field_3: field3Text,

      contact: {
        first_name: safeText(customerName),
        phone_number: safeText(customerPhone),
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
      return res.status(500).json({
        error: "saas_error",
        details: responseData,
      });
    }

    console.log("✅ Success:", responseData);
    return res.status(200).json({
      status: "sent",
      data: responseData,
    });

  } catch (err) {
    console.error("❌ Webhook Crash:", err);
    return res.status(500).json({
      error: "internal_error",
      details: err?.message || String(err),
    });
  }
};
