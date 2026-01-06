# Architecture & AI Context

> Este documento está diseñado para que una IA que trabaje en este proyecto entienda rápidamente el contexto, las decisiones de diseño y cómo funciona todo.

## 🎯 Propósito del Proyecto

**Exista** es una agencia especializada en AEO/GEO (Answer Engine Optimization / Generative Engine Optimization) - ayudan a empresas a ser recomendadas por ChatGPT, Claude, Gemini y otros LLMs.

Esta app interna maneja:
1. **Clientes existentes** - Dashboard, auditorías EVS, seguimiento
2. **Leads** - Prospección, outreach multi-canal, conversión

## 📊 Modelo de Datos

### Tablas principales

```
clients          → Empresas cliente
├── audits       → Auditorías EVS por cliente
├── domains      → Dominios del cliente
└── actions      → Acciones pendientes/completadas

leads            → Prospectos
├── outreach_logs→ Historial de emails/contactos
└── meetings     → Meetings agendadas (Calendly)

cadences         → Secuencias de outreach
└── cadence_steps→ Pasos de cada cadencia

email_templates  → Templates de email
```

### Lead - Campos importantes

```typescript
interface Lead {
  // Identificación
  id: string;
  domain: string;
  company_name?: string;
  
  // Contacto
  contact_name?: string;
  contact_email?: string;
  contact_role?: string;
  linkedin_url?: string;
  
  // Quick Scan (scanner de issues técnicos)
  quick_scan_done: boolean;
  quick_score?: number;        // 0-100
  quick_issues?: string[];     // ['sin-schema', 'sin-sitemap', etc]
  
  // Deep Scan (análisis IA completo)
  deep_scan_done: boolean;
  evs_score_estimate?: number; // EVS estimado
  deep_scan_results?: object;  // Scores detallados
  
  // AI Research (Perplexity)
  ai_research_done: boolean;   // Investigación de empresa
  company_description?: string;
  pain_points?: string[];
  
  // Person Research (Perplexity)
  person_research_done: boolean;
  person_background?: string;
  person_interests?: string[];
  person_talking_points?: string[];
  
  // Outreach Status
  outreach_status: 'new' | 'scanned' | 'qualified' | 'intro_sent' | 
                   'intro_opened' | 'meeting_booked' | 'converted' | 'lost';
  
  // Cadence
  cadence_id?: string;         // Cadencia asignada
  sequence_step: number;       // Paso actual
  next_action_at?: string;     // Próxima acción
  next_action_type?: string;   // 'email' | 'linkedin_connect' | etc
  cadence_paused: boolean;
  cadence_completed_at?: string;
  
  // Email tracking
  emails_sent: number;
  email_opens: number;
  email_clicks: number;
}
```

## 🔄 Flujos principales

### 1. Lead → Cliente (conversión)

```
Importar dominio → Quick Scan → Qualified? 
    → AI Research → Email personalizado → Open/Click?
    → LinkedIn connect → Responde?
    → Meeting (Calendly) → Proposal → Convertir a Cliente
```

### 2. Sistema de Cadencias

```
Cadencia = [Step1, Wait, Step2, Wait, Step3...]

Ejemplo "Prospección B2B":
  Step 1: Email intro (día 0)
  Wait: 3 días
  Step 3: LinkedIn connect
  Wait: 2 días
  Step 5: Email follow-up
  Wait: 4 días
  Step 7: LinkedIn message
  Wait: 5 días
  Step 9: Email breakup

Lead asignado → next_action_at calculado
Usuario ejecuta acción → advanceLeadInCadence()
Sistema avanza al siguiente step
```

### 3. AI Content Generation

```
Email: improveEmailWithAI(subject, body, leadContext)
  → Usa: company research, person research, quick issues, EVS
  → Modelo: gemini-3.0-flash-preview
  
LinkedIn: generateLinkedInMessage(leadId, messageType)
  → Tipos: 'connection' | 'followup' | 'pitch'
  → Auto-research si no está hecho
  → Modelo: gemini-3.0-flash-preview
```

## 🔌 Integraciones

### Resend (Email)
- **Envío:** `sendCustomEmailToLead()` en `leads/actions.ts`
- **Webhook:** `/api/webhooks/resend` → actualiza email_opens, email_clicks

### Calendly (Meetings)
- **Webhook:** `/api/webhooks/calendly`
- **Eventos:** `invitee.created` → crea meeting + cambia lead a `meeting_booked`
- **Eventos:** `invitee.canceled` → actualiza status a cancelled

### Hunter.io (Enriquecimiento)
- **Función:** `enrichLeadWithHunter()` en `leads/actions.ts`
- **Uso:** Busca email de contacto por dominio

### Perplexity (AI Research)
- **Empresa:** `researchLead()` → company_description, pain_points, etc
- **Persona:** `researchPerson()` → person_background, interests, talking_points
- **Modelo:** sonar

### Google Gemini
- **Email improvement:** gemini-3.0-flash-preview
- **LinkedIn generation:** gemini-3.0-flash-preview
- **Website scan:** gemini-3.0-flash-preview

## 📁 Archivos clave

### Server Actions
```
src/app/(protected)/leads/actions.ts      # 1800+ líneas
  - CRUD leads
  - scanLead(), researchLead(), researchPerson()
  - sendCustomEmailToLead(), improveEmailWithAI()
  - generateLinkedInMessage(), exportLeadsToCSV()
  
src/app/(protected)/cadences/actions.ts   # 450+ líneas
  - CRUD cadences
  - assignLeadToCadence(), advanceLeadInCadence()
  - pauseLeadCadence(), resumeLeadCadence()
  - getTodaysActions()
```

### UI Pages
```
src/app/(protected)/page.tsx         # Dashboard con stats y widget acciones
src/app/(protected)/leads/page.tsx   # Tabla de leads (1700+ líneas)
src/app/(protected)/cadences/page.tsx# Gestión de cadencias
src/app/(protected)/clients/         # Gestión de clientes
```

### Webhooks
```
src/app/api/webhooks/resend/route.ts    # Email tracking
src/app/api/webhooks/calendly/route.ts  # Meeting booking
```

## 🔐 Variables de entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# APIs
RESEND_API_KEY
HUNTER_API_KEY
PERPLEXITY_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY
```

## 💡 Decisiones de diseño

### ¿Por qué Server Actions en vez de API routes?
- Colocación directa con el UI
- Type safety automático
- Menos boilerplate

### ¿Por qué Perplexity para research?
- Acceso a internet en tiempo real
- Mejor para research de empresas/personas que Gemini
- Modelo `sonar` optimizado para search

### ¿Por qué Gemini para content?
- Mejor calidad en español
- Más barato que GPT-4
- Modelo `3.0-flash-preview` es rápido y bueno

### ¿Por qué cadencias manuales vs automáticas?
- Control de calidad del outreach
- Evitar spam/problemas de deliverability
- Usuario decide cuándo ejecutar cada paso

## 📅 Estado actual (Enero 2026)

### ✅ Implementado
- Sistema completo de leads con Quick/Deep Scan
- AI Research (empresa + persona)
- Email con tracking (Resend)
- LinkedIn message generation
- Cadencias multi-canal
- Calendly integration
- Widget "Acciones de Hoy"

### 🔮 Ideas futuras
- Auto-pause cuando lead responde
- Templates vinculados a cadence steps
- Lead detail page con timeline
- Notificaciones de acciones pendientes
- A/B testing de templates

## 🐛 Troubleshooting

### Migration errors
Correr migraciones en orden:
1. `migration_phase10_leads.sql`
2. `migration_phase8_ai_research.sql`
3. `migration_phase9b_person_research.sql`
4. `migration_phase10_cadences.sql`

### Webhook no funciona
- Verificar URL en Calendly/Resend dashboard
- La app está en: `https://exista-internal-app.vercel.app`
- Endpoints: `/api/webhooks/calendly`, `/api/webhooks/resend`

### AI research falla
- Verificar `PERPLEXITY_API_KEY` en env
- El lead debe tener `domain` y `contact_name` para person research
