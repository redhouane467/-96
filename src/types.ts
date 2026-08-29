export type Role = "customer" | "courier" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
};

export type OrderStatus = "pending" | "accepted" | "picked_up" | "delivered" | "completed" | "cancelled";

export type AssignedCourier = {
  name: string;
  phone: string;
  online: boolean;
  lat: number | null;
  lng: number | null;
  location_updated_at: string | null;
};

export type Order = {
  id: string;
  customer_id: string;
  courier_id: string | null;
  pickup_address: string;
  delivery_address: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  distance_km: number;
  package_description?: string | null;
  recipient_phone?: string | null;
  notes?: string | null;
  offered_price: number | null;
  final_price: number;
  status: OrderStatus;
  confirmation_code?: string;
  created_at: string;
  updated_at: string;
  courier?: AssignedCourier;
  distance_from_me_km?: number;
};

export type OrderHistoryEntry = {
  status: OrderStatus;
  created_at: string;
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
