# Exista Internal App

Sistema interno de gestión de clientes, leads y outreach para Exista - Agencia de AEO/GEO (Answer Engine Optimization / Generative Engine Optimization).

## 🚀 Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Email:** Resend
- **AI:** Google Gemini 3.0 Flash, Perplexity Sonar
- **Styling:** Tailwind CSS + shadcn/ui
- **Deploy:** Vercel

## 📋 Features

### Clientes
- Dashboard con métricas EVS (Engine Visibility Score)
- Gestión de auditorías
- Seguimiento de acciones
- Historial de servicios

### Leads
- Quick Scan de dominios (detección de issues AEO)
- Deep Scan con IA (análisis completo)
- Enriquecimiento con Hunter.io
- Investigación con Perplexity (empresa + persona)
- Generación de emails personalizados con IA
- Generación de mensajes LinkedIn con IA
- Export CSV para herramientas de automatización
- **Sistema de Cadencias** (secuencias multi-canal)

### Integraciones
- **Resend:** Envío de emails + webhooks de tracking
- **Calendly:** Webhooks para detectar meetings agendadas
- **Hunter.io:** Búsqueda de emails empresariales

## 🛠 Setup

### 1. Clonar e instalar

```bash
git clone https://github.com/Exista-io/exista-internal-app.git
cd exista-internal-app
npm install
```

### 2. Variables de entorno

Copiar `.env.example` a `.env.local` y completar:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# APIs
RESEND_API_KEY=re_xxx
HUNTER_API_KEY=xxx
PERPLEXITY_API_KEY=pplx-xxx
GOOGLE_GENERATIVE_AI_API_KEY=xxx
```

### 3. Migraciones

Correr en Supabase SQL Editor (en orden):
1. `migrations/migration_phase10_leads.sql`
2. `migrations/migration_phase8_ai_research.sql`
3. `migrations/migration_phase9b_person_research.sql`
4. `migrations/migration_phase10_cadences.sql`

### 4. Ejecutar

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## 📁 Estructura

```
src/
├── app/
│   ├── (protected)/        # Rutas autenticadas
│   │   ├── page.tsx        # Dashboard
│   │   ├── clients/        # Gestión de clientes
│   │   ├── leads/          # Gestión de leads
│   │   └── cadences/       # Gestión de cadencias
│   ├── api/webhooks/       # Webhooks (Resend, Calendly)
│   └── login/              # Auth
├── components/             # Componentes reutilizables
├── lib/                    # Utilidades y SDKs
│   ├── supabase/           # Cliente Supabase
│   └── leads/              # Quick scan, Hunter
└── types/                  # TypeScript types
```

## 📖 Documentación adicional

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Contexto técnico detallado para desarrollo

## 🔗 URLs

- **Producción:** https://exista-internal-app.vercel.app
- **Supabase:** Dashboard de Supabase
- **Vercel:** Dashboard de Vercel
