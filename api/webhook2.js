// api/webhook2.js

async function webhook(req, res) {
  if (req.method === "GET") return res.status(200).send("Webhook2 Running ✅");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const data = req.body || {};

    // ✅ من اللينك
    const storeTagRaw = (req.query && req.query.storeTag) || "EQ";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";

    // ✅ جرّب أسماء/لغات بسهولة من URL
    const templateName = (req.query && req.query.tpl) ? String(req.query.tpl) : "1st_utility";
    const templateLang = (req.query && req.query.lang) ? String(req.query.lang) : "en";

    console.log("🏪 Store Tag:", storeTagRaw);
    console.log("🧩 Template:", templateName, "Lang:", templateLang);
    console.log("📦 FULL DATA:", JSON.stringify(data));

    const customerName = (data.full_name || data.name || data.customer_name || "Customer").toString().trim();
    const customerPhone = (data.phone || data.phone_alt || data.customer_phone || "").toString();
    const orderId = data.short_id || data.order_id || data.id || "";
    const address = (data.address || data.government || "-").toString().trim();

    const firstItem = data.cart_items?.[0] || {};
    const productName = (firstItem.product?.name || "Product").toString().trim();
    const quantity = firstItem.quantity != null ? firstItem.quantity : 1;

    const cleanParam = (text) => (text ? text.toString().replace(/[\r\n\t]+/g, " ").trim() : "");
    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const productPrice =
      toNumber(firstItem.price) ??
      toNumber(data.subtotal_cost) ??
      toNumber(data.subtotal) ??
      toNumber(data.cost) ??
      null;

    const shippingCost =
      toNumber(data.shipping_cost ?? data.shipping_fees ?? data.delivery_cost ?? data.shipping ?? 0) ?? 0;

    const total =
      toNumber(data.total_cost) ?? (productPrice != null ? productPrice + shippingCost : null);

    const shortProduct = productName.slice(0, 45);
    const shipText = shippingCost > 0 ? `${shippingCost}` : "Free";
    const totalText = total != null ? `${total}` : productPrice != null ? `${productPrice}` : "";

    const field3 =
      `Addr: ${address} | ` +
      `Prod: ${shortProduct} | ` +
      `Qty: ${quantity} | ` +
      `Ship: ${shipText} | ` +
      `Total: ${totalText}`;

    let raw = customerPhone.replace(/[^0-9]/g, "");
    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);

    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      return res.status(500).json({ error: "missing_env" });
    }

    const endpoint = `${API_BASE_URL}/${VENDOR_UID}/contact/send-template-message`;

    const payload = {
      phone_number: raw,
      template_name: templateName,
      template_language: templateLang,
      field_1: cleanParam(customerName),
      field_2: cleanParam(`${String(orderId)} ${storeTag}`.trim()),
      field_3: cleanParam(field3),
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

    // ✅ حتى لو failed رجّع 200 عشان EasyOrders مايعلمش Fail (اختياري)
    return res.status(200).json({ ok: responseData?.result === "success", data: responseData });
  } catch (err) {
    console.error("❌ Webhook Error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

module.exports = webhook;
