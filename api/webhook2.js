// api/webhook2.js

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

    // ✅ Store Tag (افتراضي EQ)
    const storeTagRaw = (req.query && req.query.storeTag) || "EQ";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";
    console.log("🏪 Store Tag:", storeTagRaw);

    // 🧪 Debug (تشيله بعدين)
    console.log("📦 FULL DATA:", JSON.stringify(data));

    // -------------------------
    // 1) بيانات العميل والطلب
    // -------------------------
    const customerName =
      (data.full_name || data.name || data.customer_name || "Customer")
        .toString()
        .trim();

    const customerPhone =
      (data.phone || data.phone_alt || data.customer_phone || "").toString();

    const orderId = data.short_id || data.order_id || data.id || "";
    const address = (data.address || data.government || "-").toString().trim();

    // -------------------------
    // 2) المنتج
    // -------------------------
    const firstItem = data.cart_items?.[0] || {};
    const productName =
      (firstItem.product?.name || "Product").toString().trim();
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
    // 3) الأسعار (منتج + شحن + إجمالي)
    // -------------------------
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

    const total =
      toNumber(data.total_cost) ??
      (productPrice != null ? productPrice + shippingCost : null);

    // -------------------------
    // 4) Compose field_3 (صيغة قصيرة وآمنة)
    // -------------------------
    const shortProduct = productName.slice(0, 45);
    const shipText = shippingCost > 0 ? `${shippingCost}` : "Free";
    const totalText =
      total != null ? `${total}` : productPrice != null ? `${productPrice}` : "";

    const field3 =
      `Addr: ${address} | ` +
      `Prod: ${shortProduct} | ` +
      `Qty: ${quantity} | ` +
      `Ship: ${shipText} | ` +
      `Total: ${totalText}`;

    // -------------------------
    // 5) Normalize Phone
    // -------------------------
    let raw = customerPhone.replace(/[^0-9]/g, "");

    // KSA
    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    // EG
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);
    // SD
    else if (raw.startsWith("09") && raw.length === 10) raw = "249" + raw.substring(1);
    // YE
    else if (raw.startsWith("7") && raw.length === 9) raw = "967" + raw;

    console.log("📞 Normalized Phone:", raw);

    // -------------------------
    // 6) Paramedics Config
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      console.error("❌ Missing Environment Variables");
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 7) Payload (1st_utility EN فقط)
    // -------------------------
    const payload = {
      phone_number: raw,
      template_name: "1st_utility",
      template_language: "en",
      field_1: cleanParam(customerName),
      field_2: cleanParam(`${String(orderId)} ${storeTag}`.trim()),
      field_3: cleanParam(field3),
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

    // Paramedics ممكن يرجع ok بس result=failed
    if (!saasRes.ok || responseData?.result === "failed") {
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

module.exports = webhook;
