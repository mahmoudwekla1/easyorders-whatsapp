// api/webhook2.js

async function webhook2(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    console.log("✅ GET HIT:", req.url);
    return res.status(200).send("Webhook2 Running ✅");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};
    console.log("📦 FULL DATA:", JSON.stringify(data));

    // ✅ storeTag من اللينك
    const storeTagRaw = (req.query && req.query.storeTag) || "EQ";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";

    // ✅ tpl/lang من اللينك (مع default صح)
    const tpl = (req.query && req.query.tpl) || "1st_utility";
    const lang = (req.query && req.query.lang) || "en";

    console.log("🏪 Store Tag:", storeTagRaw || "NO_TAG");
    console.log("🧩 tpl/lang:", tpl, lang);

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

    const cleanParam = (text) => {
      if (!text) return "";
      return text.toString().replace(/[\r\n\t]+/g, " ").trim();
    };

    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

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
    // 3) رسالة مختصرة (أضمن للـ delivery)
    // -------------------------
    const safeAddress = cleanParam(address).slice(0, 40);
    const safeProduct = cleanParam(productName).slice(0, 35);
    const shipText = shippingCost > 0 ? `${shippingCost}` : "FREE";
    const totalText = total != null ? `${total}` : "";

    const field3 =
      `Addr:${safeAddress} | Prod:${safeProduct} | Qty:${quantity}` +
      ` | Ship:${shipText}` +
      (totalText ? ` | Total:${totalText}` : "");

    // -------------------------
    // 4) Normalize Phone
    // -------------------------
    let raw = customerPhone.toString().replace(/[^0-9]/g, "");

    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);
    else if (raw.startsWith("09") && raw.length === 10) raw = "249" + raw.substring(1);
    else if (raw.startsWith("7") && raw.length === 9) raw = "967" + raw;

    const normalizedPhone = raw;
    console.log("📞 Normalized Phone:", normalizedPhone);

    // -------------------------
    // 5) ENV
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      console.error("❌ Missing Environment Variables");
      return res.status(500).json({ error: "missing_env" });
    }

    const endpoint = `${API_BASE_URL}/${VENDOR_UID}/contact/send-template-message`;

    // ✅✅ هنا التعديل المهم: localizable_params جوا body
    const payload = {
      phone_number: normalizedPhone,
      template_name: tpl,                 // 1st_utility
      template_language: lang,            // en
      body: {
        localizable_params: [
          cleanParam(customerName),                      // {{1}}
          cleanParam(`${orderId} ${storeTag}`.trim()),   // {{2}}
          cleanParam(field3),                            // {{3}}
        ],
      },
      contact: {
        first_name: cleanParam(customerName),
        phone_number: normalizedPhone,
        country: "auto",
      },
    };

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

    // نخليها 200 عشان EasyOrders مايعيدش بشكل مزعج
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
