import express from "express";
import requireAuth, { requireAdmin } from "../middleware/auth.js";
import { listCustomers, getCustomer } from "../controllers/adminController.js";

const router = express.Router();

// All routes here require an authenticated admin.
router.use(requireAuth, requireAdmin);

router.get("/users", listCustomers);
router.get("/users/:id", getCustomer);

export default router;
