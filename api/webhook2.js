// api/webhook2.js

async function webhook2(req, res) {
  // ✅ منع الـ cache نهائيًا (عشان متشوفش 304 وتضمن اللوج يظهر)
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // ✅ Health Check
  if (req.method === "GET") {
    console.log("✅ GET HIT:", req.url);
    return res.status(200).send("Webhook2 Running ✅");
  }

  // ✅ Allow only POST (EasyOrders)
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    // 🧪 Logs
    console.log("📦 FULL DATA:", JSON.stringify(data));

    // ✅ Query params (مع Defaults)
    const storeTagRaw = (req.query && req.query.storeTag) || "EQ";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";

    const tpl = (req.query && req.query.tpl) || "1st_utillty"; // ✅ اسم التمبلت الصح
    const lang = (req.query && req.query.lang) || "en";        // ✅ اللغة الصح

    console.log("🏪 Store Tag:", storeTagRaw || "NO_TAG");
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

    // -------------------------
    // 2) المنتج
    // -------------------------
    const firstItem = data.cart_items?.[0] || {};
    const productName = firstItem.product?.name || "منتجك";
    const quantity = firstItem.quantity != null ? firstItem.quantity : 1;

    // -------------------------
    // Helpers
    // -------------------------
    const cleanParam = (text) => {
      if (!text) return "";
      return text.toString().replace(/[\r\n\t]+/g, " ").trim();
    };

    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // -------------------------
    // 3) الأسعار (منتج + شحن + إجمالي)
    // -------------------------
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
    // 4) Normalize Phone
    // -------------------------
    let raw = customerPhone.toString().replace(/[^0-9]/g, "");

    // السعودية
    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    // مصر
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);
    // السودان
    else if (raw.startsWith("09") && raw.length === 10) raw = "249" + raw.substring(1);
    // اليمن
    else if (raw.startsWith("7") && raw.length === 9) raw = "967" + raw;

    const normalizedPhone = raw;
    console.log("📞 Normalized Phone:", normalizedPhone);

    // -------------------------
    // 5) Paramedics Config (ENV)
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;   // https://paramedics.cloud/api
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;       // vendor uid
    const API_TOKEN  = process.env.SAAS_API_TOKEN;        // token

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      console.error("❌ Missing Environment Variables");
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 6) field_3 (محتوى مختصر “آمن”)
    // -------------------------
    // نخليه قصير عشان يقل احتمال held/dropped + يتفادى أي حدود طول
    const safeAddress = cleanParam(address).slice(0, 40);
    const safeProduct = cleanParam(productName).slice(0, 35);

    const shipText = shippingCost > 0 ? `${shippingCost}` : "FREE";
    const totalText = total != null ? `${total}` : "";

    const field3 =
      `Addr:${safeAddress} | Prod:${safeProduct} | Qty:${quantity}` +
      ` | Ship:${shipText}` +
      (totalText ? ` | Total:${totalText}` : "");

    // -------------------------
    // 7) Payload
    // -------------------------
    const payload = {
      phone_number: normalizedPhone,
      template_name: tpl,            // ✅ 1st_utillty
      template_language: lang,       // ✅ en
      field_1: cleanParam(customerName),                   // {{1}}
      field_2: cleanParam(`${orderId} ${storeTag}`.trim()),// {{2}}
      field_3: cleanParam(field3),                         // {{3}}
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

    // حتى لو السيستم بيرجع failed، نخلي EasyOrders ما يكررهاش بشكل مزعج
    // لكن لو تحب نخليها 500 وقت الفشل قولي
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
