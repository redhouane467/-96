import { useState } from "react";
import type { Role, User } from "./types";
import RoleSelect from "./pages/RoleSelect";
import Auth from "./pages/Auth";
import CustomerDashboard from "./pages/CustomerDashboard";
import CourierDashboard from "./pages/CourierDashboard";
import AdminDashboard from "./pages/AdminDashboard";

function loadUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem("wassli_user") || "null");
  } catch {
    return null;
  }
}

function App() {
  const [user, setUser] = useState<User | null>(loadUser());
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  function logout() {
    localStorage.removeItem("wassli_user");
    localStorage.removeItem("wassli_token");
    setUser(null);
    setSelectedRole(null);
  }

  if (!user) {
    if (!selectedRole) return <RoleSelect onSelect={setSelectedRole} />;
    return <Auth role={selectedRole} onAuth={setUser} onBack={() => setSelectedRole(null)} />;
  }
  if (user.role === "customer") return <CustomerDashboard user={user} onLogout={logout} />;
  if (user.role === "courier") return <CourierDashboard user={user} onLogout={logout} />;
  return <AdminDashboard user={user} onLogout={logout} />;
}

export default App;
