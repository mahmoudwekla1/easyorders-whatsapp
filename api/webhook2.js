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

    // العنوان التفصيلي
    const detailedAddress =
      data.address ||
      data.full_address ||
      data.shipping_address ||
      data.address_text ||
      data.government ||
      data.city ||
      "";

    // المنتج
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

    const shippingText = shippingNum > 0 ? `${shippingNum} ريال سعودي` : "مجاني";
    const totalNum = shippingNum > 0 ? priceNum + shippingNum : priceNum;

    // -------------------------
    // 3) العنوان الوطني (لو موجود)
    // -------------------------
    const nationalAddressRaw =
      data.national_address ||
      data.short_address ||
      data.shortAddress ||
      data.address_short ||
      data.na_short ||
      "";

    const nationalAddressClean = String(nationalAddressRaw).trim();

    const nationalAddress =
      nationalAddressClean
        ? nationalAddressClean
        : "غير متوفر (يرجى تزويدنا بالعنوان الوطني)";

    // -------------------------
    // 4) تنسيق الرسالة (سطر واحد مرتب)
    // -------------------------
    const safeText = (t) => {
      if (!t) return "";
      return String(t)
        .replace(/[\r\n\t]+/g, " ")   // واتساب غالبًا هيكبس السطور، فنخليها أصلًا سطر واحد
        .replace(/\s{2,}/g, " ")
        .trim();
    };

    const addrText = safeText(detailedAddress) || "غير متوفر";

    // ✅ تنسيق مقروء حتى لو سطر واحد
    const addressAndProduct = safeText(
      `تفاصيل الطلب 🧾 — ` +
      `المنتج: ${productName} | ` +
      `الكمية: ${quantity} | ` +
      `السعر: ${priceNum} ريال سعودي | ` +
      `الشحن: ${shippingText} | ` +
      `الإجمالي: ${totalNum} ريال سعودي — ` +
      `العنوان التفصيلي: ${addrText} — ` +
      `العنوان الوطني 📍: ${nationalAddress}`
    );

    // -------------------------
    // 5) توحيد رقم الهاتف
    // -------------------------
    let raw = String(customerPhone).replace(/[^0-9]/g, "");

    // السعودية
    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    // مصر
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);

    const normalizedPhone = raw;

    // -------------------------
    // 6) ENV
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 7) Payload (WhatsApp Template)
    // -------------------------
    const payload = {
      phone_number: normalizedPhone,
      template_name: "first_utillty",
      template_language: "ar",

      field_1: safeText(customerName),
      field_2: safeText(`${orderId} ${storeTag}`.trim()),
      field_3: addressAndProduct,

      contact: {
        first_name: safeText(customerName),
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
