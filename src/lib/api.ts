// src/lib/api.ts

const STORAGE_KEY_ORDERS = "wassli_orders";
const STORAGE_KEY_COMPLAINTS = "wassli_complaints";
const STORAGE_KEY_USERS = "wassli_users";

function getStoredOrders(): any[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_ORDERS) || "[]");
  } catch {
    return [];
  }
}

function setStoredOrders(orders: any[]) {
  localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(orders));
}

export async function api<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body as string) : {};

  // محاكاة تأخير بسيط للشبكة
  await new Promise((resolve) => setTimeout(resolve, 200));

  // --- تسجيل الدخول وإنشاء الحساب ---
  if (endpoint === "/auth/login" && method === "POST") {
    const users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS) || "[]");
    const foundUser = users.find((u: any) => u.email === body.email && u.role === body.role);

    // إذا لم يكن هناك مستخدم مسجل بنفس البريد، يتم إنشاؤه تلقائياً للتجربة
    const user = foundUser || {
      id: "usr_" + Date.now(),
      name: body.email ? body.email.split("@")[0] : "مستخدم",
      email: body.email,
      role: body.role,
      phone: "0550000000",
    };

    if (!foundUser) {
      users.push(user);
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }

    return { user, token: "mock_token_" + Date.now() } as unknown as T;
  }

  if (endpoint === "/auth/register" && method === "POST") {
    const users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS) || "[]");
    const newUser = {
      id: "usr_" + Date.now(),
      name: body.name || "مستخدم جديد",
      email: body.email,
      role: body.role,
      phone: body.phone || "",
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));

    return { user: newUser, token: "mock_token_" + Date.now() } as unknown as T;
  }

  // --- إدارة الطلبات ---
  if (endpoint === "/orders" && method === "GET") {
    const orders = getStoredOrders();
    return { orders } as unknown as T;
  }

  if (endpoint === "/orders" && method === "POST") {
    const orders = getStoredOrders();
    const newOrder = {
      id: "ord_" + Date.now(),
      created_at: new Date().toISOString(),
      status: "pending",
      pickup_address: body.pickup_address,
      delivery_address: body.delivery_address,
      pickup_lat: body.pickup_lat,
      pickup_lng: body.pickup_lng,
      delivery_lat: body.delivery_lat,
      delivery_lng: body.delivery_lng,
      package_description: body.package_description,
      recipient_phone: body.recipient_phone || null,
      offered_price: body.offered_price || null,
    };

    orders.unshift(newOrder);
    setStoredOrders(orders);
    return { message: "تم إنشاء الطلب بنجاح", order: newOrder } as unknown as T;
  }

  if (endpoint.startsWith("/orders/") && endpoint.endsWith("/cancel") && method === "POST") {
    const id = endpoint.split("/")[2];
    const orders = getStoredOrders();
    const index = orders.findIndex((o) => o.id === id);

    if (index !== -1) {
      if (["pending", "accepted"].includes(orders[index].status)) {
        orders[index].status = "cancelled";
        setStoredOrders(orders);
        return { message: "تم إلغاء الطلب بنجاح", order: orders[index] } as unknown as T;
      } else {
        throw new Error("لا يمكن إلغاء الطلب بعد استلامه أو توصيله");
      }
    }
    throw new Error("الطلب غير موجود");
  }

  if (endpoint.startsWith("/orders/") && endpoint.endsWith("/accept") && method === "POST") {
    const id = endpoint.split("/")[2];
    const orders = getStoredOrders();
    const index = orders.findIndex((o) => o.id === id);

    if (index !== -1) {
      orders[index].status = "accepted";
      setStoredOrders(orders);
      return { message: "تم قبول الطلب", order: orders[index] } as unknown as T;
    }
    throw new Error("الطلب غير موجود");
  }

  if (endpoint.startsWith("/orders/") && endpoint.endsWith("/status") && method === "PATCH") {
    const id = endpoint.split("/")[2];
    const orders = getStoredOrders();
    const index = orders.findIndex((o) => o.id === id);

    if (index !== -1) {
      orders[index].status = body.status;
      setStoredOrders(orders);
      return { message: "تم تحديث حالة الطلب", order: orders[index] } as unknown as T;
    }
    throw new Error("الطلب غير موجود");
  }

  if (endpoint.startsWith("/orders/") && endpoint.endsWith("/rate") && method === "POST") {
    const id = endpoint.split("/")[2];
    const orders = getStoredOrders();
    const index = orders.findIndex((o) => o.id === id);

    if (index !== -1) {
      orders[index].rating = body.stars;
      setStoredOrders(orders);
      return { message: "شكرًا لتقييمك!" } as unknown as T;
    }
    throw new Error("الطلب غير موجود");
  }

  // --- إدارة الشكاوى ---
  if (endpoint === "/complaints" && method === "GET") {
    const complaints = JSON.parse(localStorage.getItem(STORAGE_KEY_COMPLAINTS) || "[]");
    return { complaints } as unknown as T;
  }

  if (endpoint === "/complaints" && method === "POST") {
    const complaints = JSON.parse(localStorage.getItem(STORAGE_KEY_COMPLAINTS) || "[]");
    const newComplaint = {
      id: "cmp_" + Date.now(),
      message: body.message,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    complaints.unshift(newComplaint);
    localStorage.setItem(STORAGE_KEY_COMPLAINTS, JSON.stringify(complaints));
    return { message: "تم إرسال الشكوى" } as unknown as T;
  }

  return {} as T;
}
