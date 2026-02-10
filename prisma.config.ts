// prisma.config.ts
// Este archivo ahora es necesario para comandos como `prisma migrate`

// Importamos el tipo `Config` desde Prisma para tener autocompletado y validación
import type { Config } from 'prisma-cli'

// Cargamos las variables de entorno para acceder a process.env.DATABASE_URL
require('dotenv').config()

const config: Config = {
  datasources: [
    {
      name: 'db', // Debe coincidir con el nombre del datasource en schema.prisma
      provider: 'postgresql',
      url: process.env.DATABASE_URL!, // '!' para indicar que sabemos que no será undefined
    },
  ],
}

export default config
