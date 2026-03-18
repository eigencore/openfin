import { Database } from "./storage/db"

const db = Database.Client()
console.log("[openfin] db ready at", Database.Path)
console.log("[openfin] tables:", Object.keys(db._.schema ?? {}).join(", "))
