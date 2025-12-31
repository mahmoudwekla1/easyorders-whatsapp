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

    // 🆕 0) قراءة التاج من الويبهوك URL ?storeTag=EQ / GZ / BR
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

    // السعر: نحاول نجيبه من الآتي بالترتيب
    const price =
      firstItem.price != null
        ? firstItem.price
        : data.total_cost != null
        ? data.total_cost
        : data.cost != null
        ? data.cost
        : "";

    // تركيب المتغير {{3}} = العنوان + المنتج + الكمية + السعر
    let addressAndProduct = address || "";
    if (productName) {
      addressAndProduct += (addressAndProduct ? " - " : "") + productName;
    }
    if (quantity) {
      addressAndProduct += ` - الكمية: ${quantity}`;
    }
    if (price !== "") {
      addressAndProduct += ` - السعر: ${price}`;
    }

    // تنظيف الباراميترات (مفيش سطور جديدة أو Tabs)
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
    // 3) متغيرات SaaS (Paramedics)
    // -------------------------
    const API_BASE_URL = (process.env.SAAS_API_BASE_URL || "").trim();
    const VENDOR_UID = (process.env.SAAS_VENDOR_UID || "").trim();
    const API_TOKEN = (process.env.SAAS_API_TOKEN || "").trim();

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      console.error("❌ Missing Environment Variables");
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 4) Payload الخاص بالتمبلت (✅ body_params)
    // -------------------------
    const p1 = cleanParam(customerName); // {{1}}
    const p2 = cleanParam(`${orderId} ${storeTag}`.trim()); // {{2}}
    const p3 = cleanParam(addressAndProduct); // {{3}}

    const payload = {
      phone_number: normalizedPhone,
      template_name: "1st_utillty",
      template_language: "en", // ✅ زي ما التمبلت متسجل عندك حتى لو عربي

      // ✅ المهم: 3 body params
      body_params: [
        { type: "text", text: p1 },
        { type: "text", text: p2 },
        { type: "text", text: p3 },
      ],

      contact: {
        first_name: p1,
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
      return res.status(500).json({
        error: "saas_api_error",
        details: responseData,
      });
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
