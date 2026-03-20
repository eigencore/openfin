/**
 * Canonical spending/income categories.
 * All transactions, budgets, and analysis use these normalized names.
 */

export const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Housing",
  "Health",
  "Clothing",
  "Entertainment",
  "Education",
  "Utilities",
  "Travel",
  "Debt Payment",
  "Savings",
  "Transfer",
  "Other",
] as const

export const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Investments",
  "Business",
  "Transfer",
  "Other",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]
export type Category = ExpenseCategory | IncomeCategory

// ── Alias map ─────────────────────────────────────────────────────────────────
// Maps common variants/typos/spanish words → canonical category name.

const ALIASES: Record<string, Category> = {
  // Food
  food: "Food",
  comida: "Food",
  restaurante: "Food",
  restaurantes: "Food",
  comer: "Food",
  almuerzo: "Food",
  desayuno: "Food",
  cena: "Food",
  supermercado: "Food",
  despensa: "Food",
  groceries: "Food",
  lunch: "Food",
  dinner: "Food",
  breakfast: "Food",
  restaurant: "Food",

  // Transport
  transport: "Transport",
  transporte: "Transport",
  gasolina: "Transport",
  uber: "Transport",
  taxi: "Transport",
  metro: "Transport",
  "camión": "Transport",
  estacionamiento: "Transport",
  parking: "Transport",
  fuel: "Transport",
  car: "Transport",

  // Housing
  housing: "Housing",
  hogar: "Housing",
  renta: "Housing",
  alquiler: "Housing",
  mantenimiento: "Housing",
  muebles: "Housing",
  casa: "Housing",
  rent: "Housing",
  mortgage: "Housing",

  // Health
  health: "Health",
  salud: "Health",
  "médico": "Health",
  doctor: "Health",
  farmacia: "Health",
  medicina: "Health",
  gym: "Health",
  gimnasio: "Health",
  pharmacy: "Health",
  medicine: "Health",

  // Clothing
  clothing: "Clothing",
  ropa: "Clothing",
  clothes: "Clothing",
  calzado: "Clothing",
  zapatos: "Clothing",
  shoes: "Clothing",

  // Entertainment
  entertainment: "Entertainment",
  entretenimiento: "Entertainment",
  cine: "Entertainment",
  netflix: "Entertainment",
  spotify: "Entertainment",
  juegos: "Entertainment",
  bar: "Entertainment",
  antro: "Entertainment",
  concierto: "Entertainment",
  movies: "Entertainment",
  games: "Entertainment",

  // Education
  education: "Education",
  "educación": "Education",
  escuela: "Education",
  colegio: "Education",
  universidad: "Education",
  libros: "Education",
  curso: "Education",
  cursos: "Education",
  school: "Education",
  books: "Education",
  course: "Education",

  // Utilities
  utilities: "Utilities",
  servicios: "Utilities",
  services: "Utilities",
  internet: "Utilities",
  luz: "Utilities",
  electricidad: "Utilities",
  agua: "Utilities",
  "teléfono": "Utilities",
  celular: "Utilities",
  "suscripción": "Utilities",
  suscripciones: "Utilities",
  electricity: "Utilities",
  water: "Utilities",
  phone: "Utilities",
  subscription: "Utilities",

  // Travel
  travel: "Travel",
  viajes: "Travel",
  vuelo: "Travel",
  hotel: "Travel",
  vacaciones: "Travel",
  flight: "Travel",
  vacation: "Travel",

  // Debt Payment
  "debt payment": "Debt Payment",
  "pago de deuda": "Debt Payment",
  deuda: "Debt Payment",
  tarjeta: "Debt Payment",
  "crédito": "Debt Payment",
  "préstamo": "Debt Payment",
  debt: "Debt Payment",
  loan: "Debt Payment",

  // Savings
  savings: "Savings",
  ahorro: "Savings",
  "inversión": "Savings",
  saving: "Savings",

  // Transfer
  transfer: "Transfer",
  transferencia: "Transfer",
  traspaso: "Transfer",

  // Salary
  salary: "Salary",
  "nómina": "Salary",
  salario: "Salary",
  sueldo: "Salary",
  payroll: "Salary",
  wage: "Salary",

  // Freelance
  freelance: "Freelance",
  honorarios: "Freelance",

  // Investments
  investments: "Investments",
  inversiones: "Investments",
  dividendos: "Investments",
  rendimientos: "Investments",
  dividends: "Investments",

  // Business
  business: "Business",
  negocio: "Business",
  ventas: "Business",
  sales: "Business",

  // Other
  other: "Other",
  otro: "Other",
  otros: "Other",
}

/**
 * Normalize a raw category string to a canonical Category.
 * Falls back to "Other" if no match found.
 */
export function normalizeCategory(raw: string): Category {
  const key = raw.trim().toLowerCase()
  return ALIASES[key] ?? (isCanonical(raw) ? (raw as Category) : "Other")
}

function isCanonical(value: string): boolean {
  return (
    (EXPENSE_CATEGORIES as readonly string[]).includes(value) ||
    (INCOME_CATEGORIES as readonly string[]).includes(value)
  )
}

export const ALL_CATEGORIES = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])]
