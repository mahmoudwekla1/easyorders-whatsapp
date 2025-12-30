// /api/webhook2.js

const axios = require("axios");

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

    // 🆕 قراءة storeTag من URL
    const storeTagRaw = (req.query && req.query.storeTag) || "";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";
    console.log("🏪 Store Tag:", storeTagRaw || "NO_TAG");

    // 🆕 Template name + lang من URL (هنستخدم العربي)
    const tpl = (req.query && req.query.tpl) || "first_utillty";
    const lang = (req.query && req.query.lang) || "ar";
    console.log("🧩 tpl/lang:", tpl, lang);

    // -------------------------
    // 1) بيانات العميل والطلب
    // -------------------------
    const customerName =
      data.full_name || data.name || data.customer_name || "عميلنا العزيز";

    const customerPhone =
      data.phone || data.phone_alt || data.customer_phone || "";

    const orderId = data.short_id || data.order_id || data.id || "";
    const address = data.address || data.government || "";

    const firstItem = data.cart_items?.[0] || {};
    const productName = firstItem.product?.name || "منتج";
    const quantity = firstItem.quantity != null ? firstItem.quantity : 1;

    const price =
      firstItem.price != null
        ? firstItem.price
        : data.total_cost != null
        ? data.total_cost
        : data.cost != null
        ? data.cost
        : "";

    // field_3 للتمبلت العربي: نخليه "العنوان" زي ما في التمبلت
    // لو تحب نضيف المنتج والكمية والسعر جوه العنوان—بس نخليه مختصر
    let field3 = address || "";
    if (productName) field3 += (field3 ? " - " : "") + productName;
    if (quantity) field3 += ` - الكمية: ${quantity}`;
    if (price !== "") field3 += ` - السعر: ${price}`;

    // تنظيف (من غير سطور جديدة)
    const cleanParam = (text) => {
      if (!text) return "";
      return text.toString().replace(/[\r\n\t]+/g, " ").trim();
    };

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
    // 3) Paramedics Config
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      console.error("❌ Missing Environment Variables");
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 4) Payload (الأهم)
    // -------------------------
    // ✅ الحل هنا: نبعته بنفس صيغة field_1/field_2/field_3
    // لأن Paramedics واضح انه مش بيقرأ localizable_params عندك.
    const payload = {
      phone_number: normalizedPhone,
      template_name: tpl,       // first_utillty
      template_language: lang,  // ar
      field_1: cleanParam(customerName),
      field_2: cleanParam(`${orderId} ${storeTag}`.trim()),
      field_3: cleanParam(field3),
      contact: {
        first_name: cleanParam(customerName),
        phone_number: normalizedPhone,
        country: "auto",
      },
    };

    const endpoint = `${API_BASE_URL}/${VENDOR_UID}/contact/send-template-message`;

    console.log("🚀 Sending to SaaS:", endpoint);
    console.log("🧾 Payload:", JSON.stringify(payload));

    const saasRes = await axios.post(endpoint, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      timeout: 20000,
    });

    console.log("✅ SaaS Response:", saasRes.data);
    return res.status(200).json({ status: "sent", data: saasRes.data });
  } catch (err) {
    const details = err?.response?.data || err?.message || err;
    console.error("❌ Webhook Error:", details);
    return res.status(500).json({ error: "internal_error", details });
  }
}

module.exports = webhook;
