// api/webhook.js

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

    // ✅ Debug كامل للـ payload (مؤقت)
    console.log("📦 FULL DATA:", JSON.stringify(data));

    // 🆕 قراءة التاج من الويبهوك URL ?storeTag=EQ / GZ / BR
    const storeTagRaw = (req.query && req.query.storeTag) || "";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";
    console.log("🏪 Store Tag:", storeTagRaw || "NO_TAG");

    // -------------------------
    // 1) بيانات العميل والطلب
    // -------------------------
    const customerName =
      data.full_name || data.name || data.customer_name || "عميلنا العزيز";

    const customerPhone =
      data.phone || data.phone_alt || data.customer_phone || "";

    const orderId = data.short_id || data.order_id || data.id || "";
    const address = data.address || data.government || "";

    // 🔹 أول عنصر في السلة
    const firstItem = data.cart_items?.[0] || {};
    const productName = firstItem.product?.name || "منتجك";
    const quantity = firstItem.quantity != null ? firstItem.quantity : 1;

    // ✅ تنظيف الباراميترات (مفيش سطور جديدة أو Tabs)
    const cleanParam = (text) => {
      if (!text) return "";
      return text.toString().replace(/[\r\n\t]+/g, " ").trim();
    };

    // ✅ Helper لتحويل أي رقم بشكل آمن
    const toNumber = (v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // -------------------------
    // 1.1) حساب السعر + الشحن + الإجمالي
    // -------------------------

    // ✅ سعر المنتج (نحاول نجيبه من أكتر من مكان)
    const productPrice =
      toNumber(firstItem.price) ??
      toNumber(firstItem.total) ??
      toNumber(data.subtotal_cost) ??
      toNumber(data.subtotal) ??
      toNumber(data.items_total) ??
      null;

    // ✅ الشحن (نجرب كذا مفتاح شائع)
    const shippingCostRaw =
      data.shipping_cost ??
      data.shipping_fees ??
      data.delivery_cost ??
      data.shipping_price ??
      data.shipping ??
      data.delivery_fee ??
      data.deliveryFees ??
      0;

    const shippingCost = toNumber(shippingCostRaw) ?? 0;

    // ✅ إجمالي المنصة (لو موجود)
    const platformTotal =
      toNumber(data.total_cost) ??
      toNumber(data.total) ??
      toNumber(data.cost) ??
      null;

    // ✅ الإجمالي النهائي
    const totalWithShipping =
      platformTotal != null
        ? platformTotal
        : productPrice != null
        ? productPrice + shippingCost
        : null;

    // -------------------------
    // 2) توحيد صيغة رقم الموبايل
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
    // 3) متغيرات SaaS (Paramedics)
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      console.error("❌ Missing Environment Variables");
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 4) تركيب field_3
    // -------------------------
    let addressAndProduct = address || "";

    if (productName) {
      addressAndProduct += (addressAndProduct ? " - " : "") + productName;
    }
    if (quantity) {
      addressAndProduct += ` - الكمية: ${quantity}`;
    }

    // ✅ عرض الأسعار
    if (productPrice != null) {
      addressAndProduct += ` - سعر المنتج: ${productPrice}`;
    }

    // ✅ الشحن: لو 0 => مجاني
    if (shippingCost > 0) {
      addressAndProduct += ` - الشحن: ${shippingCost}`;
    } else {
      addressAndProduct += ` - الشحن: مجاني`;
    }

    // ✅ الإجمالي
    if (totalWithShipping != null) {
      addressAndProduct += ` - الإجمالي: ${totalWithShipping}`;
    }

    // -------------------------
    // 5) Payload الخاص بالتمبلت
    // -------------------------
    const payload = {
      phone_number: normalizedPhone,
      template_name: "1st_utility",
      template_language: "en",
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
      return res
        .status(500)
        .json({ error: "saas_api_error", details: responseData });
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
