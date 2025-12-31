# Exista Visibility Score (EVS) — Metodología v1.0 (Baseline AR)

## Exista Visibility Score

El **Exista Visibility Score (EVS)** es una métrica **0–100** que mide **qué tan probable es que tu marca sea encontrada, entendida y citada** por buscadores tradicionales y por motores de respuesta basados en IA, combinando:

- **On-site Readiness (50%)**: tu web como fuente **citable** (acceso, indexación, canonicalidad, estructura, schema, autoridad).
- **Off-site Visibility (50%)**: tu marca como **entidad confiable** fuera de tu web (fuentes canónicas, menciones, reputación, share of voice en IA).

> **Readiness ≠ Visibility.** Necesitás ambos.

**EVS = 50% On-site Readiness + 50% Off-site Visibility**, medido con un protocolo reproducible y versionado.

**Baseline inicial:** Argentina (AR). Luego se activan “packs” por país/región cuando el go-to-market lo pide.

---

## Introducción

El objetivo del EVS es transformar la visibilidad en buscadores y en motores de IA en una **métrica operativa**: medible, repetible y mejorable.

No es un “ranking” ni una promesa de aparecer en un motor específico. Es un sistema de **medición + mejora continua** basado en evidencia.

---

## Metodología

### 1) Fórmula y lectura por rangos

**Fórmula**

- **EVS = 0.5 · On-site + 0.5 · Off-site**

**Rangos (interpretación)**

| Rango | Estado | Interpretación |
|---:|---|---|
| 0–39 | 🔴 Rojo | no sos “recuperable/citable” de forma consistente. |
| 40–59 | 🟠 Ámbar | aparecés “a veces”, pero con inestabilidad o sin citas. |
| 60–79 | 🟢 Verde | base sólida; faltan palancas de autoridad/entidad para Top-3. |
| 80–100 | 🟣 Elite | alto potencial de citación consistente y liderazgo en categoría. |

> **Importante:** el score no es un “ranking”. Es un sistema de **medición + mejora continua**.

---

### 2) Qué hace que esto sea difícil (y por eso valioso)

- **Variabilidad por motor/modelo** (no hay un “Google único”).
- **Variabilidad por intención** (no es lo mismo “qué es” que “mejores agencias”).
- **Variabilidad por país** (AR no es MX ni ES; cambia competencia y fuentes locales).
- **Freshness/caché** (cambios on-site no se reflejan instantáneamente en todos los sistemas).

Por eso Exista mide con:

- un **protocolo** (no screenshots),
- un **set de consultas** (benchmark),
- y **versionado**.

---

### 3) Componentes del score (50/50)

#### A) On-site Readiness (50%)

Tu web como fuente:

- accesible (HTTP/robots/bots),
- consolidada (canonicalidad/duplicados),
- entendible (estructura + schema),
- citable (respuesta rápida, referencias),
- navegable (internal linking a money pages).

#### B) Off-site Visibility (50%)

Tu marca como entidad:

- identidad consistente (naming + perfiles),
- fuentes canónicas (docs/perfiles/KB si aplica),
- earned media/partners,
- reputación y prueba social,
- share of voice por “money queries” en IA.

---

## On-site Readiness

**On-site Readiness responde:** ¿tu sitio es técnicamente accesible y editorialmente citable?

Si la respuesta es “no”, aunque tengas buen contenido, los motores pueden:

- no descubrirlo (crawling),
- no indexarlo bien (canonicalidad/duplicados),
- no entenderlo (estructura y entidades),
- o no considerarlo “citable” (falta de respuestas directas, referencias y señales de confianza).

### 1) Acceso y crawling (HTTP, robots, bots de IA)

**Robots.txt: control de crawling, no de privacidad**

Google explica que robots.txt guía a crawlers sobre qué pueden acceder, y que **no es un mecanismo para mantener páginas fuera de Google** (para eso hay otras técnicas). Esto es relevante porque, si bloqueás crawling por error, tu contenido deja de estar disponible para ser citado.

**Bots relevantes (ejemplos)**

- OpenAI documenta sus robots y cómo usar robots.txt para controlar el acceso (p.ej., **GPTBot** / **OAI-SearchBot**).
- Anthropic también documenta bots separados (p.ej., **ClaudeBot** y bots de acceso por usuario) y cómo permitir/bloquear cada uno.

En Exista, verificamos esto con test de user-agent y respuestas HTTP (200/3xx/4xx), y lo dejamos auditado.

---

### 2) Indexación y canonicalidad (evitar “ambigüedad”)

**Canonical: una URL “preferida” por tema**

Google detalla métodos para consolidar URLs duplicadas o muy similares y definir una canonical. Cuando hay ambigüedad (www vs non-www, /blog vs /blog/index.html, parámetros, etc.), los motores pueden repartir señales y debilitar citabilidad.

**Checklist típico**

- canonical consistente en cada página (y una sola vez),
- redirecciones coherentes (301 donde corresponde),
- sitemap con URLs canónicas (sin duplicados).

---

### 3) Sitemaps (descubrimiento y cobertura)

Google documenta cómo construir y publicar sitemaps y que **enviarlos/indicarlos es una pista** (no garantía). Bing también recomienda sitemaps (y explica cómo referenciarlos desde robots.txt) para mejorar descubrimiento, incluso en búsqueda “AI-powered”.

**Qué medimos**

- sitemap accesible (200), sin errores de formato,
- cobertura de URLs “money” + páginas pilar,
- consistencia con canonicalidad.

---

### 4) Citabilidad editorial (AEO “desde tu web”)

Esto es lo que más cambia el juego en motores generativos:

**“Respuesta rápida para citar” (Answer Box)**

- arriba del contenido, una respuesta de **2–4 líneas** que pueda ser citada literalmente,
- definición + contexto + alcance + cuándo aplica.

**Estructura**

- un H1 único, descriptivo,
- subtítulos que respondan intenciones reales (“Cómo funciona”, “Qué incluye”, “Qué no incluye”, “Ejemplos”, “FAQ”),
- listas y tablas simples (cuando suman claridad).

---

### 5) Structured data (Schema)

Schema.org existe para que los motores entiendan mejor el contenido y habiliten experiencias “rich”. En Exista usamos schema de manera pragmática: no para “marcar por marcar”, sino para:

- clarificar qué es la empresa, qué ofrece, qué páginas son pilar,
- estructurar FAQ/HowTo cuando aplica,
- reforzar entidad y relaciones.

---

### 6) Authority on-site: señales de confianza

Google enfatiza contenido útil y confiable (people-first), y en su ecosistema la reputación, claridad de autoría y referencias importan.

**Qué medimos / pedimos**

- sección de “Fuentes y referencias oficiales” donde corresponde,
- autoría clara (quién escribe, por qué sabe),
- política editorial mínima (si aplica).

---

### Resultado: qué entregamos del On-site

- Score 0–100 con breakdown por pilar.
- Hallazgos con evidencia (URLs, headers, ejemplos).
- Backlog priorizado con quick wins y fixes estructurales.

---

## Off-site Visibility

**Off-site Visibility responde:** ¿qué tan “presente” y “confiable” es tu marca fuera de tu web, en las fuentes que alimentan motores de IA y buscadores?

En la práctica, muchos motores combinan ranking + señales de autoridad + recuperación (retrieval) de documentos para responder. Eso hace que la **entidad** (quién sos), la **evidencia externa** (quién te valida), y el **share of voice** en consultas relevantes sean determinantes para que te mencionen o te citen.

### 1) Por qué “off-site” pesa tanto en IA

Buena parte de los sistemas modernos usan enfoques tipo **Retrieval-Augmented Generation (RAG)**: recuperan documentos relevantes de una base externa y generan una respuesta apoyándose en esas fuentes (con o sin citas visibles).

La literatura fundacional de RAG lo explica como combinación de un generador con una memoria no paramétrica (documentos recuperados).

**Traducción a marketing:** si no entrás en el set de fuentes recuperables/confiables, no existís para muchas respuestas.

---

### 2) El corazón del método: benchmark de “money queries”

En Exista no medimos con “una pregunta”. Medimos con un set de consultas que representan intención real para SaaS B2B / startups.

**Cómo armamos el set (v1.0)**

- AR como mercado base, con términos y fuentes locales relevantes.
- un set portable (español neutro) para vender en LATAM/ES sin re-trabajar todo.
- intenciones cubiertas: “qué es / cómo funciona”, “mejores / alternativas”, “comparación”, “precio”, “casos de uso”, “implementación / riesgos”.

---

### 3) Qué medimos por query (evidencia, no sensaciones)

Por motor/modelo, capturamos:

- ¿aparece tu marca? (sí/no)
- ¿en qué “bucket” aparece? (top / medio / no aparece)
- ¿te cita/referencia? (sí/no, y a qué URL)
- sentimiento / framing (positivo, neutro, negativo)
- consistencia (repetición y estabilidad en múltiples corridas)

---

### 4) Pilares off-site (los que mueven la aguja)

**A) Identidad de entidad (consistencia)**

- nombre/branding consistente,
- perfiles oficiales,
- datos estructurados y señales que reducen ambigüedad.

**B) Fuentes canónicas**

Páginas “que terceros usan para entenderte”: docs, Wikipedia/Wikidata (cuando aplica), repos, perfiles, directorios serios.

**C) Earned media y menciones confiables**

- menciones en medios, partners, cámaras, ecosistemas,
- backlinks contextuales (no “compra de links”).

**D) Comunidad y prueba social (B2B)**

- conferencias, podcasts, newsletters, repos, comunidades,
- evidencia de adopción (casos, logos, testimonios verificables).

**E) Reviews / reputación**

- dónde se “reseña” tu categoría (según industria).

**F) Share of voice en IA**

- tracking de menciones + citaciones + comparativas.

---

### 5) Panorama competitivo (contexto)

Existen plataformas que ya se posicionan como “AI search visibility” o “AEO platforms” (ejemplos: Profound, Goodie, Otterly, Rank Prompt, LLMrefs). Esto valida el mercado y también muestra un gap: muchas miden, pero no integran el trabajo on-site/off-site en una metodología única y publicable.

---

### Resultado: qué entregamos del Off-site

- Score 0–100 con breakdown por pilar.
- Benchmark por query/motor con evidencia.
- Lista de “gaps” (por qué competidores aparecen y vos no).
- Top acciones off-site priorizadas (sin humo).

---

## Entregables

Exista ofrece tres servicios de visibilidad en IA: **Mini-Auditoría Gratuita** (análisis inicial en 3–5 prompts clave), **Auditoría de Visibilidad en IA** (análisis completo con testing de 20–100 prompts, benchmark competitivo y roadmap de 90 días), y **Retainer Mensual de Optimización** (tracking continuo, optimización de contenido y reportes mensuales).

### 1) Mini-Auditoría Gratuita

- **Precio:** Gratis
- **Qué incluye:**
  - análisis inicial de visibilidad de tu marca en 3–5 prompts clave,
  - descubrí si ChatGPT y otros motores de IA (Claude, Gemini, Perplexity) recomiendan tu empresa,
  - snapshot del estado actual.
- **Cómo solicitar:**
  - completá el formulario en https://exista.io/#contacto
  - o escribí a: info@exista.io

---

### 2) Auditoría de Visibilidad en IA (One-Time)

- **Precio:** $750 – $3,000 USD
- **Entrega:** 5–7 días hábiles

**Qué incluye**

- análisis completo de presencia en IA,
- testing de 20–100 prompts relevantes para tu industria/categoría,
- presencia actual en ChatGPT, Claude, Gemini y Perplexity,
- evidencia documentada: screenshots, citas, menciones.

**Benchmark competitivo**

- análisis contra 3–5 competidores directos,
- share of voice por motor,
- gap analysis: por qué te mencionan (o no).

**Análisis técnico (On-site)**

- schema markup (Organization, Service, FAQPage, etc.),
- llms.txt y otros archivos para IA (robots.txt, sitemap.xml),
- crawling/indexación: verificación de acceso para bots de IA,
- canonicalidad y consolidación de URLs,
- estructura de contenido y citabilidad.

**Roadmap priorizado de 90 días**

- quick wins (implementación inmediata),
- mejoras estructurales (30–60 días),
- iniciativas de autoridad (60–90 días),
- backlog priorizado por impacto vs. esfuerzo.

**Formato de entrega**

- reporte ejecutivo (PDF),
- anexo técnico con evidencia,
- planilla de tracking (Excel/Sheets) si aplica.

---

### 3) Retainer Mensual de Optimización GEO/AEO

- **Precio:** $1,500 – $4,000 USD/mes
- **Compromiso mínimo:** 3 meses

**Tracking y medición**

- tracking semanal de menciones,
- monitoreo continuo en ChatGPT, Claude, Gemini, Perplexity,
- alertas ante cambios significativos,
- trending de visibilidad mes a mes.

**Optimización de contenido**

- creación/optimización de páginas “money” con enfoque citable-first,
- implementación de mejoras técnicas on-site,
- ajustes de schema, llms.txt y structured data.

**Reportes**

- reportes mensuales detallados,
- dashboard de métricas (menciones, citas, share of voice),
- comparativa vs. mes anterior y vs. competidores,
- acciones implementadas + impacto.

**Calls de estrategia**

- 1–2 calls mensuales (según plan),
- revisión de roadmap y prioridades,
- alineación con objetivos de negocio.

**Mejora continua**

- re-medición mensual del Exista Visibility Score,
- versionado del baseline (v1.1, v1.2...),
- ajuste de tácticas según resultados.

---

### Qué datos necesitamos (para cualquier servicio)

**Mínimos**

- dominio principal y subdominios relevantes,
- 3–5 competidores directos (URLs),
- 1–2 mercados objetivo (empezamos con Argentina),
- productos/servicios clave (descripción breve).

**Opcionales (ayudan a personalizar)**

- materiales existentes (decks, one-pagers, casos),
- acceso a Analytics/Search Console (si disponible),
- objetivos específicos de go-to-market.

---

## FAQ

### FAQ sobre servicios

**¿La mini auditoría gratis tiene compromiso?**

No. Es un análisis inicial sin costo y sin obligación.

**¿Qué diferencia hay entre la auditoría one-time y el retainer?**

La auditoría one-time es un snapshot con roadmap. El retainer es ejecución continua + tracking + optimización mes a mes.

**¿Puedo empezar con la auditoría y después contratar el retainer?**

Sí. De hecho es lo que recomendamos: primero entender dónde estás (auditoría), después mejorar de forma continua (retainer).

---

### Sobre el score

**¿Qué mide exactamente el Exista Visibility Score?**

El EVS mide qué tan probable es que tu marca sea encontrada, entendida y citada por motores de búsqueda tradicionales y motores de respuesta basados en IA (ChatGPT, Claude, Gemini, Perplexity). Combina:

- 50% On-site Readiness: tu web como fuente citable (acceso, estructura, schema, contenido)
- 50% Off-site Visibility: tu marca como entidad confiable fuera de tu web (menciones, citas, share of voice)

**¿El score es un ranking contra competidores?**

No. El EVS es una medición absoluta de tu preparación y visibilidad, no relativa. No competís por “puesto #1”. La medición es contra un estándar de mejores prácticas técnicas y editoriales. Incluimos benchmark competitivo para contexto (cuánto gap tenés), pero el score es tuyo.

**¿Qué significa un score de 40? ¿Y uno de 80?**

- 0–39 (Red Zone): problemas graves (sitio bloqueado, canonical roto, sin menciones). Prioridad: fijar lo técnico.
- 40–59 (Amber Zone): base técnica funcional, pero sin citabilidad editorial ni presencia off-site relevante.
- 60–79 (Green Zone): sólido. On-site preparado, off-site en progreso. Mejora continua con retainer.
- 80–100 (Elite): líderes. Citados consistentemente, fuentes canónicas, share of voice alto.

**¿Cuándo debo volver a medir?**

- primera vez: baseline (v1.0)
- después de implementar quick wins: 30–45 días (v1.1)
- con retainer mensual: cada mes (v1.2, v1.3...)
- cambios estructurales: rediseño de web, cambio de marca, expansión geográfica → re-baseline

---

### Sobre la metodología

**¿Por qué 50/50 (on-site / off-site)?**

Porque ninguna de las dos es suficiente por sí sola:

- si tenés on-site perfecto pero sin menciones externas, los motores de IA no te citan (no sos “confiable”).
- si tenés menciones pero web rota, los motores no pueden usar tu contenido como fuente.

> Readiness ≠ Visibility. Necesitás ambos.

**¿Qué “motores de IA” consideran?**

Baseline AR v1.0 incluye:

- ChatGPT (OpenAI)
- Claude (Anthropic)
- Gemini (Google)
- Perplexity

También auditamos para buscadores tradicionales con IA (Google Search Generative Experience, Bing AI).

**¿Puedo medir en múltiples mercados?**

Sí. El baseline inicial es Argentina (AR), pero el método es portable para LATAM y España. Si vendés en múltiples países, ajustamos el set de prompts y fuentes por mercado.

---

### Sobre las auditorías

**¿Qué incluye la mini-auditoría gratuita?**

- análisis inicial de 3–5 prompts clave para tu industria,
- snapshot de estado actual (¿aparece tu marca? ¿te citan?),
- score preliminar y top 3–5 acciones priorizadas,
- sin compromiso.

**¿Cuánto tarda la auditoría completa?**

5–7 días hábiles desde que recibimos datos (dominio, competidores, mercados). Incluye:

- testing de 20–100 prompts relevantes,
- análisis técnico on-site completo,
- benchmark competitivo (3–5 competidores),
- roadmap priorizado de 90 días.

**¿Qué datos necesitan para empezar?**

Mínimos:

- dominio principal y subdominios relevantes,
- 3–5 competidores directos (URLs),
- 1–2 mercados objetivo (empezamos con Argentina),
- productos/servicios clave (descripción breve).

Opcionales:

- materiales existentes (decks, one-pagers, casos),
- acceso a Analytics/Search Console (si disponible),
- objetivos específicos de go-to-market.

---

### Sobre el retainer mensual

**¿Qué diferencia hay entre la auditoría y el retainer?**

La auditoría one-time es un snapshot con roadmap. El retainer es ejecución continua + tracking + optimización mes a mes.

Recomendamos: primero entender dónde estás (auditoría), después mejorar de forma continua (retainer).

**¿Cuál es el compromiso mínimo para el retainer?**

3 meses. Razón: la visibilidad en IA no cambia de un día para otro. Necesitamos ciclos completos de:

- implementación de mejoras on-site,
- publicación de contenido optimizado,
- acumulación de menciones/citas,
- re-medición y ajuste de tácticas.

**¿Puedo pausar el retainer?**

Sí, después del compromiso inicial de 3 meses. Pero la visibilidad en IA es un juego de consistencia: si pausás, competidores siguen mejorando.

---

### Sobre implementación

**¿Ustedes implementan o solo auditan?**

Depende del servicio:

- mini-auditoría: solo diagnóstico + recomendaciones,
- auditoría completa: diagnóstico + roadmap detallado (vos implementás o lo delegás),
- retainer mensual: nosotros implementamos mejoras on-site, creamos/optimizamos contenido, y ejecutamos roadmap.

**¿Necesito acceso técnico a mi web?**

- para auditoría: no. Auditamos lo público (robots.txt, sitemaps, schema, contenido).
- para retainer: sí, si queremos implementar cambios técnicos (schema, llms.txt, canonical, etc.). Coordinamos con tu equipo o proveedor de hosting.

---

### Sobre resultados

**¿Cuándo veo resultados?**

- quick wins técnicos (schema, llms.txt, canonical): impacto en 7–15 días,
- mejoras editoriales (contenido citable): 30–60 días,
- autoridad off-site (menciones, citas): 60–90 días.

La visibilidad en IA es un maratón, no un sprint. Medimos progreso mensual (v1.1 → v1.2 → v1.3...).

**¿Garantizan que voy a aparecer en ChatGPT?**

No. Nadie puede garantizar eso (los algoritmos de IA son cajas negras que cambian constantemente). Lo que sí garantizamos:

- tu web será técnicamente citable (on-site readiness al 100%),
- evidencia documentada de dónde estás y qué falta,
- un roadmap basado en mejores prácticas validadas,
- medición de progreso mensual con métricas objetivas.

---

## Glosario

Este glosario define términos clave del Exista Visibility Score: desde conceptos técnicos (AEO, GEO, RAG, schema) hasta metodológicos (citabilidad, entidad, share of voice). Sirve como referencia para equipos técnicos y de marketing que trabajan en visibilidad en IA.

### Conceptos fundamentales

**AEO (Answer Engine Optimization)**

Optimización de contenido y estructura web para que motores de respuesta basados en IA (ChatGPT, Claude, Perplexity) puedan encontrar, entender y citar tu contenido como fuente confiable. Evolución del SEO tradicional adaptada a modelos generativos.

**GEO (Generative Engine Optimization)**

Término amplio que incluye optimización para cualquier motor que genere respuestas (no solo links). Engloba AEO y también buscadores tradicionales con capacidades generativas (Google SGE, Bing AI). En la práctica, AEO y GEO se usan de forma intercambiable.

**RAG (Retrieval-Augmented Generation)**

Arquitectura de IA que combina recuperación de documentos relevantes (retrieval) con generación de texto (generation). El modelo primero busca fuentes externas y luego genera una respuesta apoyándose en esas fuentes. Si tu contenido no está en el set recuperable, no existís para la respuesta.

**Exista Visibility Score (EVS)**

Métrica 0–100 que combina On-site Readiness (50%) + Off-site Visibility (50%) para medir qué tan probable es que tu marca sea encontrada, entendida y citada por motores de IA. No es ranking sino baseline + roadmap.

---

### On-site Readiness (componentes técnicos)

**Citabilidad**

Capacidad de tu contenido para ser citado literalmente por motores de IA. Requiere: respuestas directas (answer boxes), estructura clara (H1/H2), ausencia de ambigüedad, referencias verificables.

**Canonical (URL canónica)**

URL “preferida” para una página cuando hay múltiples versiones (www vs non-www, parámetros, etc.). Evita duplicados y consolida señales. Se declara con <link rel="canonical">.

**Crawling**

Proceso por el cual bots de buscadores y motores de IA descubren y leen tu contenido. Controlado por robots.txt, sitemaps, y acceso HTTP. Si no te crawlean, no existís.

**llms.txt**

Archivo emergente (similar a robots.txt) que ayuda a motores de IA a entender qué contenido es prioritario para ellos. Formato: markdown simple con secciones clave. No es estándar oficial pero adoptado por comunidad.

**Robots.txt**

Archivo que guía a crawlers sobre qué pueden acceder. No es mecanismo de privacidad (para eso: noindex, autenticación). Bloquear por error = invisibilidad total.

**Schema / Structured Data**

Markup (JSON-LD, generalmente) que añade contexto semántico a tu HTML. Ejemplo: Organization, Service, FAQPage. Ayuda a motores a entender qué es cada cosa (no solo “texto”).

**Sitemap (XML)**

Archivo que lista URLs importantes de tu web para facilitar descubrimiento. Referenciado desde robots.txt. No garantiza indexación pero sí ayuda a coverage.

---

### Off-site Visibility (componentes de autoridad)

**Entidad**

Representación de tu marca como concepto único y reconocible fuera de tu web. Incluye: nombre consistente, perfiles oficiales, presencia en bases de conocimiento (Wikidata, directorios), menciones verificables.

**Fuentes canónicas**

Páginas externas que terceros (incluidos motores de IA) usan para entenderte. Ejemplos: Wikipedia/Wikidata (cuando aplica), repositorios oficiales, perfiles en ecosistemas relevantes, directorios de industria.

**Earned Media**

Menciones no pagadas en medios, blogs, ecosistemas. Se “ganan” por relevancia, no por dinero. Más valiosas para autoridad que paid media.

**Backlinks contextuales**

Links desde otras webs hacia la tuya que añaden contexto (no solo “link por link”). Ejemplo: artículo que explica tu caso de uso y linkea a tu docs. Más valor que links de directorios genéricos.

**Share of Voice (SoV)**

Porcentaje de menciones/citas que capturás en un set de consultas relevantes comparado con competidores. Ejemplo: si en 100 prompts sobre “CRM B2B Argentina” aparecés en 30, tu SoV es 30%.

**Money Queries**

Consultas con intención comercial clara para tu negocio. Ejemplos: “mejores CRM para startups”, “cómo elegir plataforma de email marketing”, “alternativas a [competidor]”. No son “awareness” sino “consideración/decisión”.

---

### Metodología y medición

**Baseline**

Medición inicial de tu EVS (v1.0). Sirve como punto de partida para medir progreso futuro (v1.1, v1.2...). Sin baseline, no hay forma de validar mejoras.

**Benchmark competitivo**

Comparación de tu EVS y presencia en IA contra 3–5 competidores directos. No cambia tu score (que es absoluto) pero da contexto de gap.

**Quick Wins**

Mejoras técnicas/editoriales de implementación inmediata (7–15 días) que generan impacto visible. Ejemplos: agregar schema, crear llms.txt, fijar canonical, agregar answer boxes.

**Roadmap de 90 días**

Plan priorizado con 3 horizontes: Quick Wins (0–30d), Mejoras estructurales (30–60d), Iniciativas de autoridad (60–90d). Incluye backlog priorizado por impacto vs. esfuerzo.

**Re-baseline**

Nueva medición completa cuando hay cambios estructurales (rediseño web, cambio de marca, expansión geográfica). No es mejora iterativa sino nueva v1.0.

**Versionado**

Sistema de versiones para tracking de mejoras. v1.0 = baseline inicial, v1.1/v1.2... = mejoras iterativas, v2.0 = re-baseline por cambio estructural.

---

### Plataformas y herramientas

**ChatGPT (OpenAI)**

Motor de respuesta basado en GPT-4. Usa búsqueda web + conocimiento interno. Documenta bots en openai.com/gptbot.

**Claude (Anthropic)**

Motor de respuesta basado en Claude 3. Documenta bots en anthropic.com/ClaudeBot.

**Gemini (Google)**

Motor de respuesta basado en modelos Gemini. Integrado con Google Search.

**Perplexity**

Buscador nativo con IA generativa. Cita fuentes visibles por defecto (más transparente que otros).

**Google Search Generative Experience (SGE)**

Respuestas generadas por IA dentro de Google Search. No reemplaza links tradicionales pero aparece arriba.

**Bing AI / Copilot**

Respuestas generadas por IA en Bing (basadas en GPT-4). Cita fuentes con links visibles.

---

## Fuentes

El Exista Visibility Score se apoya en documentación oficial de Google, OpenAI, Anthropic, Schema.org, Bing, y literatura académica sobre Retrieval-Augmented Generation (RAG). Esta página lista las fuentes clave usadas para construir la metodología v1.0.

### Documentación oficial de motores y plataformas

#### Google (Search + SEO)

- **Google Search Central** — Guías oficiales de SEO y structured data: developers.google.com/search
- **Robots.txt Introduction** — Especificación y uso de robots.txt: developers.google.com/search/docs/crawling-indexing/robots/intro
- **Canonical URLs** — Consolidación de URLs duplicadas: developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- **Structured Data / Schema** — Guías de markup semántico: developers.google.com/search/docs/appearance/structured-data
- **Helpful Content System** — Principios de contenido útil y confiable: developers.google.com/search/docs/fundamentals/creating-helpful-content

#### OpenAI (ChatGPT)

- **GPTBot Documentation** — Bots de OpenAI y control de acceso: platform.openai.com/docs/gptbot
- **GPTBot robots.txt example** — Cómo permitir/bloquear GPTBot (incluye User-agent: GPTBot y otros bots relevantes)

#### Anthropic (Claude)

- **ClaudeBot Documentation** — Bots de Anthropic y políticas de crawling: anthropic.com/claudebot
- Documenta bots separados para entrenamiento vs. acceso por usuario

#### Bing / Microsoft

- **Bing Webmaster Guidelines** — SEO y structured data para Bing: bing.com/webmasters/help/webmasters-guidelines
- **Bing AI Search** — Documentación sobre búsqueda con IA generativa (incluye recomendaciones de sitemaps y crawling para motores AI-powered)

#### Schema.org

- **Schema.org Vocabulary** — Especificación completa: schema.org
- **Organization**: schema.org/Organization
- **Service**: schema.org/Service
- **FAQPage**: schema.org/FAQPage

---

### Literatura académica y técnica

#### Retrieval-Augmented Generation (RAG)

- “Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks” — Lewis et al. (2020): arxiv.org/abs/2005.11401
- “RAG for LLMs: A Survey” — Gao et al. (2023) — estado del arte (arquitecturas, estrategias de retrieval, aplicaciones)

#### Answer Engine Optimization (AEO)

- “Generative Engines and Search Visibility” — literatura emergente sobre optimización para motores generativos
- “From SEO to GEO: Optimizing for Generative Search” — análisis sobre diferencias entre SEO tradicional y optimización para IA generativa

---

### Herramientas y plataformas de medición (referencia competitiva)

- **Profound** — AI search visibility platform
- **Goodie** — Generative engine optimization tracking
- **Otterly** — AI-powered SEO insights
- **Rank Prompt** — AI search ranking tracker
- **LLMrefs** — Citation tracking for AI engines

> Nota: Exista no usa estas plataformas (medimos manualmente con metodología propia) pero se citan como evidencia de mercado emergente.

---

### Estándares y especificaciones

- **Robots Exclusion Protocol (robots.txt)**: robotstxt.org
- **Sitemaps Protocol**: sitemaps.org
- **Emergente: llms.txt**
  - llms.txt Proposal: llmstxt.org
  - Formato emergente (markdown) para ayudar a motores de IA a priorizar contenido
  - No es estándar oficial pero adoptado por comunidad técnica

---

### Caso de estudio: Exista (auto-aplicación)

Implementación de la metodología EVS en exista.io:

- On-site Readiness: schema Organization, llms.txt, canonical URLs, answer boxes en blog
- Off-site Visibility: presencia en ecosistema B2B AR, blog técnico con casos, menciones en newsletters
- Baseline v1.0: medido en diciembre 2025, score inicial [documentado en auditoría interna]
- Iteración v1.1: mejoras post-quick-wins (schema, llms.txt, FAQ optimizadas)

Exista usa su propia metodología EVS de forma transparente. Publicamos esta documentación abierta como evidencia de “practice what we preach”.

---

### Actualización de fuentes

Esta página se actualiza cuando:

- motores de IA publican nueva documentación oficial,
- aparece literatura académica relevante sobre RAG/AEO,
- hay cambios en especificaciones (robots.txt, schema.org, llms.txt),
- detectamos nuevas plataformas de medición con metodología publicable.

**Última actualización de fuentes:** 2025-12-17

