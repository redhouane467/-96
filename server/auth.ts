import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const SECRET = process.env.JWT_SECRET || "change-me-in-production";

export type U = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "customer" | "courier" | "admin";
};

declare global {
  namespace Express {
    interface Request {
      user?: U;
    }
  }
}

export function sign(u: U) {
  return jwt.sign(u, SECRET, { expiresIn: "7d" });
}

export function auth(req: Request, res: Response, next: NextFunction) {
  try {
    req.user = jwt.verify(req.headers.authorization?.replace("Bearer ", "") || "", SECRET) as U;
    next();
  } catch {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
  }
}

export function role(...r: U["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Ensure req.user is defined before accessing its properties.
    // The 'user' property on Express.Request is defined as optional (user?: U).
    // Accessing req.user!.role without a prior check can lead to a runtime TypeError
    // if the 'auth' middleware hasn't successfully set 'req.user' (e.g., if it wasn't
    // chained correctly or failed unexpectedly without stopping the request).
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (r.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ error: "غير مصرح لك بهذا الإجراء" });
    }
  };
}