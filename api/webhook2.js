// api/webhook2.js

async function webhook(req, res) {
  if (req.method === "GET") {
    return res.status(200).send("Webhook2 Running ✅");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    console.log("🔥 WEBHOOK2 VERSION = 1st_utility (LANG=en)");
    console.log("📦 FULL DATA:", JSON.stringify(data));

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
    const quantity = firstItem.quantity ?? 1;

    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const productPrice =
      toNumber(firstItem.price) ??
      toNumber(data.subtotal_cost) ??
      toNumber(data.subtotal) ??
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
    // 3) تفاصيل الطلب {{3}}
    // -------------------------
    let orderDetails = address || "";

    orderDetails += ` - ${productName}`;
    orderDetails += ` - الكمية: ${quantity}`;

    if (productPrice != null) {
      orderDetails += ` - سعر المنتج: ${productPrice}`;
    }

    if (shippingCost > 0) {
      orderDetails += ` - الشحن: ${shippingCost}`;
    } else {
      orderDetails += ` - الشحن: مجاني`;
    }

    if (total != null) {
      orderDetails += ` - الإجمالي: ${total}`;
    }

    // -------------------------
    // 4) Normalize Phone
    // -------------------------
    let raw = customerPhone.toString().replace(/[^0-9]/g, "");

    if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);
    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);

    // -------------------------
    // 5) Paramedics Config
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 6) Payload النهائي
    // -------------------------
    const payload = {
      phone_number: String(raw),
      template_name: "1st_utility",
      template_language: "en",              // ✅ لازم en لأن Paramedics شايفها en
      field_1: String(customerName),        // ✅ String
      field_2: String(orderId),             // ✅ مهم جدًا يبقى String
      field_3: String(orderDetails),        // ✅ String
      // شيلنا contact عشان مش ضروري وقد يسبب رفض في بعض الحسابات
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
