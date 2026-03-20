/**
 * Canonical spending/income categories.
 * All transactions, budgets, and analysis use these normalized names.
 */

export const EXPENSE_CATEGORIES = [
  "Comida",
  "Transporte",
  "Hogar",
  "Salud",
  "Ropa",
  "Entretenimiento",
  "Educación",
  "Servicios",
  "Viajes",
  "Pago de deuda",
  "Ahorro",
  "Transferencia",
  "Otro",
] as const

export const INCOME_CATEGORIES = [
  "Nómina",
  "Freelance",
  "Inversiones",
  "Negocio",
  "Transferencia",
  "Otro",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]
export type Category = ExpenseCategory | IncomeCategory

// ── Alias map ─────────────────────────────────────────────────────────────────
// Maps common variants/typos/english words → canonical category name.

const ALIASES: Record<string, Category> = {
  // Comida
  food: "Comida",
  comida: "Comida",
  restaurante: "Comida",
  restaurantes: "Comida",
  comer: "Comida",
  almuerzo: "Comida",
  desayuno: "Comida",
  cena: "Comida",
  supermercado: "Comida",
  despensa: "Comida",
  groceries: "Comida",

  // Transporte
  transporte: "Transporte",
  transport: "Transporte",
  gasolina: "Transporte",
  gas: "Transporte",
  uber: "Transporte",
  taxi: "Transporte",
  metro: "Transporte",
  camión: "Transporte",
  estacionamiento: "Transporte",
  parking: "Transporte",

  // Hogar
  hogar: "Hogar",
  renta: "Hogar",
  alquiler: "Hogar",
  mantenimiento: "Hogar",
  muebles: "Hogar",
  casa: "Hogar",

  // Salud
  salud: "Salud",
  health: "Salud",
  médico: "Salud",
  doctor: "Salud",
  farmacia: "Salud",
  medicina: "Salud",
  gym: "Salud",
  gimnasio: "Salud",

  // Ropa
  ropa: "Ropa",
  clothes: "Ropa",
  calzado: "Ropa",
  zapatos: "Ropa",

  // Entretenimiento
  entretenimiento: "Entretenimiento",
  entertainment: "Entretenimiento",
  cine: "Entretenimiento",
  netflix: "Entretenimiento",
  spotify: "Entretenimiento",
  juegos: "Entretenimiento",
  bar: "Entretenimiento",
  antro: "Entretenimiento",
  concierto: "Entretenimiento",

  // Educación
  educación: "Educación",
  education: "Educación",
  escuela: "Educación",
  colegio: "Educación",
  universidad: "Educación",
  libros: "Educación",
  curso: "Educación",
  cursos: "Educación",

  // Servicios
  servicios: "Servicios",
  services: "Servicios",
  internet: "Servicios",
  luz: "Servicios",
  electricidad: "Servicios",
  agua: "Servicios",
  teléfono: "Servicios",
  celular: "Servicios",
  suscripción: "Servicios",
  suscripciones: "Servicios",

  // Viajes
  viajes: "Viajes",
  travel: "Viajes",
  vuelo: "Viajes",
  hotel: "Viajes",
  vacaciones: "Viajes",

  // Pago de deuda
  "pago de deuda": "Pago de deuda",
  deuda: "Pago de deuda",
  tarjeta: "Pago de deuda",
  crédito: "Pago de deuda",
  préstamo: "Pago de deuda",

  // Ahorro
  ahorro: "Ahorro",
  savings: "Ahorro",
  inversión: "Ahorro",

  // Transferencia
  transferencia: "Transferencia",
  transfer: "Transferencia",
  traspaso: "Transferencia",

  // Nómina
  nómina: "Nómina",
  salario: "Nómina",
  sueldo: "Nómina",
  salary: "Nómina",
  payroll: "Nómina",

  // Freelance
  freelance: "Freelance",
  honorarios: "Freelance",

  // Inversiones
  inversiones: "Inversiones",
  dividendos: "Inversiones",
  rendimientos: "Inversiones",

  // Negocio
  negocio: "Negocio",
  business: "Negocio",
  ventas: "Negocio",
}

/**
 * Normalize a raw category string to a canonical Category.
 * Falls back to "Otro" if no match found.
 */
export function normalizeCategory(raw: string): Category {
  const key = raw.trim().toLowerCase()
  return ALIASES[key] ?? (isCanonical(raw) ? (raw as Category) : "Otro")
}

function isCanonical(value: string): boolean {
  return (
    (EXPENSE_CATEGORIES as readonly string[]).includes(value) ||
    (INCOME_CATEGORIES as readonly string[]).includes(value)
  )
}

export const ALL_CATEGORIES = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])]
