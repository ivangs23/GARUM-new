import type { Database } from "../database.types";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type ProductExtra = Database["public"]["Tables"]["product_extras"]["Row"];
