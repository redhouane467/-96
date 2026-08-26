export type Role = "customer" | "courier" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
};

export type OrderStatus = "pending" | "accepted" | "delivered" | "completed" | "cancelled";

export type Order = {
  id: string;
  customer_id: string;
  courier_id: string | null;
  pickup_address: string;
  delivery_address: string;
  distance_km: number;
  offered_price: number | null;
  final_price: number;
  status: OrderStatus;
  confirmation_code?: string;
  created_at: string;
  updated_at: string;
};

export type Complaint = {
  id: string;
  order_id: string | null;
  user_id: string;
  message: string;
  status: "pending" | "resolved";
  response: string | null;
  created_at: string;
  updated_at: string;
};
