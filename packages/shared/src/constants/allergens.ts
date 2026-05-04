export const ALLERGENS = [
  { id: 1, key: "gluten", label_es: "Gluten" },
  { id: 2, key: "crustaceans", label_es: "Crustáceos" },
  { id: 3, key: "eggs", label_es: "Huevos" },
  { id: 4, key: "fish", label_es: "Pescado" },
  { id: 5, key: "peanuts", label_es: "Cacahuetes" },
  { id: 6, key: "soy", label_es: "Soja" },
  { id: 7, key: "milk", label_es: "Leche (lactosa)" },
  { id: 8, key: "nuts", label_es: "Frutos de cáscara" },
  { id: 9, key: "celery", label_es: "Apio" },
  { id: 10, key: "mustard", label_es: "Mostaza" },
  { id: 11, key: "sesame", label_es: "Sésamo" },
  { id: 12, key: "sulphites", label_es: "Sulfitos" },
  { id: 13, key: "lupin", label_es: "Altramuces" },
  { id: 14, key: "molluscs", label_es: "Moluscos" },
] as const;

export type AllergenId = (typeof ALLERGENS)[number]["id"];
export type AllergenKey = (typeof ALLERGENS)[number]["key"];
