// api/webhook.js

async function webhook(req, res) {
  if (req.method === "GET") return res.status(200).send("Webhook Running ✅");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const data = req.body || {};
    
    // قراءة التاج
    const storeTagRaw = (req.query && req.query.storeTag) || "";
    const storeTag = storeTagRaw ? `[${storeTagRaw}]` : "";

    // -------------------------
    // 1) تجهيز البيانات
    // -------------------------
    const customerName = data.full_name || data.name || data.customer_name || "عميلنا العزيز";
    const customerPhone = data.phone || data.phone_alt || data.customer_phone || "";
    const orderId = data.short_id || data.order_id || data.id || "";
    const address = data.address || data.government || "";

    const firstItem = data.cart_items?.[0] || {};
    const productName = firstItem.product?.name || "منتجك";
    const quantity = firstItem.quantity != null ? firstItem.quantity : 1;
    
    const price = firstItem.price != null ? firstItem.price 
                : data.total_cost != null ? data.total_cost 
                : data.cost != null ? data.cost : "";

    // تركيب المتغير الثالث
    let addressAndProduct = address || "";
    if (productName) addressAndProduct += (addressAndProduct ? " - " : "") + productName;
    if (quantity) addressAndProduct += ` - الكمية: ${quantity}`;
    if (price !== "") addressAndProduct += ` - السعر: ${price}`;

    const cleanParam = (text) => {
      if (!text) return "";
      return text.toString().replace(/[\r\n\t]+/g, " ").trim();
    };

    // -------------------------
    // 2) توحيد رقم الهاتف
    // -------------------------
    let raw = customerPhone.toString().replace(/[^0-9]/g, "");
    if (raw.startsWith("05") && raw.length === 10) raw = "966" + raw.substring(1);
    else if (raw.startsWith("01") && raw.length === 11) raw = "20" + raw.substring(1);
    else if (raw.startsWith("09") && raw.length === 10) raw = "249" + raw.substring(1);
    else if (raw.startsWith("7") && raw.length === 9) raw = "967" + raw;
    
    const normalizedPhone = raw;

    // -------------------------
    // 3) متغيرات البيئة
    // -------------------------
    const API_BASE_URL = process.env.SAAS_API_BASE_URL;
    const VENDOR_UID = process.env.SAAS_VENDOR_UID;
    const API_TOKEN = process.env.SAAS_API_TOKEN;

    if (!API_BASE_URL || !VENDOR_UID || !API_TOKEN) {
      return res.status(500).json({ error: "missing_env" });
    }

    // -------------------------
    // 4) Payload حسب التوثيق (The Documentation Way)
    // -------------------------
  

    const payload = {
      phone_number: normalizedPhone,
      template_name: "first_utillty", 
      template_language: "en", 
      
      // المتغيرات المباشرة حسب التوثيق
      field_1: cleanParam(customerName),                      // {{1}}
      field_2: cleanParam(`${orderId} ${storeTag}`.trim()),   // {{2}}
      field_3: cleanParam(addressAndProduct),                 // {{3}}

      // إذا كان القالب يحتوي على صورة في الهيدر، يجب إضافة header_image هنا
      // "header_image": "LINK_TO_IMAGE",
      
      contact: {
        first_name: cleanParam(customerName),
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

    if (!saasRes.ok) {
      console.error("❌ SaaS Error:", responseData);
      return res.status(500).json({ error: "saas_error", details: responseData });
    }

    console.log("✅ Success:", responseData);
    return res.status(200).json({ status: "sent", data: responseData });

  } catch (err) {
    console.error("❌ Error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

module.exports = webhook;
