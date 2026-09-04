import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const SECRET = process.env.JWT_SECRET || "change-me-in-production";

export type U = {
  id: string;
  name: string;
  email?: string | null;
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
  return jwt.sign(u, SECRET, {
    expiresIn: "7d",
  });
}

export function auth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "يجب تسجيل الدخول",
      });
    }

    const token = header.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        error: "يجب تسجيل الدخول",
      });
    }

    const decoded = jwt.verify(token, SECRET);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.id !== "string" ||
      typeof decoded.name !== "string" ||
      typeof decoded.phone !== "string" ||
      !["customer", "courier", "admin"].includes(
        String(decoded.role)
      )
    ) {
      return res.status(401).json({
        error: "جلسة تسجيل الدخول غير صالحة",
      });
    }

    req.user = {
      id: decoded.id,
      name: decoded.name,
      email:
        typeof decoded.email === "string"
          ? decoded.email
          : null,
      phone: decoded.phone,
      role: decoded.role as U["role"],
    };

    next();
  } catch {
    return res.status(401).json({
      error: "يجب تسجيل الدخول",
    });
  }
}

export function role(...r: U["role"][]) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        error: "يجب تسجيل الدخول",
      });
    }

    return r.includes(req.user.role)
      ? next()
      : res.status(403).json({
          error: "غير مصرح لك بهذا الإجراء",
        });
  };
}
