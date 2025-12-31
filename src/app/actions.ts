'use server'

import * as cheerio from 'cheerio';
import { generateObject, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { tavily } from '@tavily/core';
import { z } from 'zod';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// --- CONFIGURATION ---
// EVS v2.0 Multi-Engine Stack
// Supports: Gemini, ChatGPT, Claude, Perplexity (+ Tavily fallback)
// --- CONFIGURATION ---
const MODEL_FAST = google('gemini-3-flash-preview');
const MODEL_REASONING = google('gemini-3-flash-preview');

// Initialize Tavily Client (Fallback for web search)
const tavilyClient = process.env.TAVILY_API_KEY
    ? tavily({ apiKey: process.env.TAVILY_API_KEY })
    : null;

// Initialize OpenAI Client (for ChatGPT)
const openaiClient = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

// Initialize Anthropic Client (for Claude)
const anthropicClient = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

// Initialize Perplexity Client (uses OpenAI-compatible API)
const perplexityClient = process.env.PERPLEXITY_API_KEY
    ? new OpenAI({
        apiKey: process.env.PERPLEXITY_API_KEY,
        baseURL: 'https://api.perplexity.ai'
    })
    : null;

// Engine Type
export type AIEngine = 'ChatGPT' | 'Claude' | 'Gemini' | 'Perplexity';

// Result Interface
export interface LLMCheckResult {
    engine: AIEngine;
    query: string;
    raw_response: string;
    is_mentioned: boolean;
    bucket: 'Top Answer' | 'Mentioned' | 'Cited' | 'Not Found';
    citation_url?: string;
    sentiment: 'Positive' | 'Neutral' | 'Negative';
    competitors_mentioned?: string[]; // NEW: Which competitors were mentioned
    error?: string;
}

// --- ACTIONS ---

export interface ScanResult {
    robots_ok: boolean;
    sitemap_ok: boolean;
    llms_txt_present: boolean;
    canonical_ok: boolean;
    schema_ok: boolean;
    summary: string;
}

/**
 * EVS v3.0: Detect Industry from Domain
 * Scans the homepage and uses AI to identify industry, products, and competitors.
 */
export async function detectIndustry(domain: string): Promise<{
    industria: string;
    descripcion: string;
    productos: string[];
    competidores_sugeridos: string[];
}> {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        return { industria: 'Desconocida', descripcion: '', productos: [], competidores_sugeridos: [] };
    }

    let url = domain.trim();
    if (!url.startsWith('http')) url = 'https://' + url;

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'ExistaBot/1.0 (EVS Auditor)' },
            redirect: 'follow'
        });
        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract key content
        const title = $('title').text();
        const metaDescription = $('meta[name="description"]').attr('content') || '';
        const h1 = $('h1').first().text();
        const bodyText = $('body').text().substring(0, 3000);

        const { object } = await generateObject({
            model: MODEL_FAST,
            schema: z.object({
                industria: z.string().describe('Industria o vertical del negocio (ej: "Electrodomésticos y Retail", "Seguros", "SaaS B2B")'),
                descripcion: z.string().describe('Breve descripción de lo que hace la empresa (1-2 oraciones)'),
                productos: z.array(z.string()).describe('Lista de productos/servicios principales que ofrece'),
                competidores_sugeridos: z.array(z.string()).describe('3-5 competidores probables en el mercado argentino')
            }),
            prompt: `
            Analiza esta página web y detecta la industria, productos y competidores.
            
            DOMINIO: ${domain}
            TÍTULO: ${title}
            META DESCRIPTION: ${metaDescription}
            H1: ${h1}
            CONTENIDO (extracto): ${bodyText.substring(0, 2000)}
            
            Responde en español. Sé específico con la industria (no digas "Servicios" genéricamente).
            Para competidores, sugiere empresas reales del mercado argentino en la misma categoría.
            `
        });

        console.log(`[EVS v3.0] Detected Industry for ${domain}: ${object.industria}`);
        return object;

    } catch (e) {
        console.error('Industry detection failed:', e);
        return { industria: 'Desconocida', descripcion: '', productos: [], competidores_sugeridos: [] };
    }
}

/**
 * Action: Semantic On-site Analysis (EVS v3.0)
 * Uses Gemini to read HTML and judge quality with EVIDENCE for each metric.
 */
export async function scanWebsite(domain: string): Promise<ScanResult & {
    readiness_score: number,
    structure_score: number,
    authority_score: number,
    readiness_evidence: string,
    structure_evidence: string,
    authority_evidence: string,
    notas: string
}> {
    let url = domain.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    url = url.replace(/\/$/, '');

    const summaryPoints: string[] = [];
    const results = {
        robots_ok: false,
        sitemap_ok: false,
        llms_txt_present: false,
        canonical_ok: false,
        schema_ok: false,
        readiness_score: 0,
        structure_score: 0,
        authority_score: 0,
        readiness_evidence: '',
        structure_evidence: '',
        authority_evidence: '',
        summary: '',
        notas: ''
    };

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        results.notas = "Error: Falta GOOGLE_GENERATIVE_AI_API_KEY. No se puede realizar el análisis semántico.";
        return results;
    }

    try {
        // 1. Technical Fetch
        const [robotsRes, sitemapRes, llmsRes] = await Promise.allSettled([
            fetch(`${url}/robots.txt`, { next: { revalidate: 0 } }),
            fetch(`${url}/sitemap.xml`, { method: 'HEAD' }),
            fetch(`${url}/llms.txt`, { method: 'HEAD' })
        ]);

        if (robotsRes.status === 'fulfilled' && robotsRes.value.ok) results.robots_ok = true;
        if (sitemapRes.status === 'fulfilled' && sitemapRes.value.ok) results.sitemap_ok = true;
        if (llmsRes.status === 'fulfilled' && llmsRes.value.ok) results.llms_txt_present = true;

        // 2. Fetch HTML for Semantic Analysis
        const homeRes = await fetch(url, { next: { revalidate: 0 } });
        if (!homeRes.ok) throw new Error("Could not fetch homepage");

        const html = await homeRes.text();
        const $ = cheerio.load(html);

        if ($('link[rel="canonical"]').attr('href')) results.canonical_ok = true;
        if ($('script[type="application/ld+json"]').length > 0) results.schema_ok = true;

        // Extract Text Context for Gemini
        const h1Text = $('h1').first().text().trim();
        const h2Texts = $('h2').map((i, el) => $(el).text().trim()).get().slice(0, 5);
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        const schemaJson = $('script[type="application/ld+json"]').first().html() || '';
        const textContent = $('body').text().replace(/\s+/g, ' ').substring(0, 5000);

        // 3. GENERATE OBJECT with DETAILED EVIDENCE (EVS v3.0)
        const analysis = await generateObject({
            model: MODEL_FAST,
            schema: z.object({
                readiness_score: z.number().min(0).max(10),
                readiness_evidence: z.string().describe('Evidencia específica: ¿Hay Answer Boxes? ¿Contenido citable? ¿Definiciones claras?'),
                structure_score: z.number().min(0).max(10),
                structure_evidence: z.string().describe('Evidencia específica: ¿Jerarquía H1→H2? ¿Responde intenciones?'),
                authority_score: z.number().min(0).max(10),
                authority_evidence: z.string().describe('Evidencia específica: ¿Hay E-E-A-T? ¿Autor? ¿Fuentes? ¿Contacto?')
            }),
            prompt: `
            Role: EVS (Exista Visibility Score) Audit AI - v3.0 con EVIDENCIA.
            Target: Analizar webpage para optimización de IA con EVIDENCIA ESPECÍFICA.
            
            DATOS EXTRAÍDOS:
            - URL: ${url}
            - H1: "${h1Text}"
            - H2s: ${h2Texts.join(' | ') || 'No encontrados'}
            - Meta Description: "${metaDesc || 'No encontrada'}"
            - Schema JSON-LD: ${schemaJson ? 'Presente' : 'No encontrado'}
            - robots.txt: ${results.robots_ok ? 'OK' : 'No accesible'}
            - sitemap.xml: ${results.sitemap_ok ? 'OK' : 'No accesible'}
            - llms.txt: ${results.llms_txt_present ? 'Presente' : 'No encontrado'}
            - Contenido: ${textContent.substring(0, 2000)}...

            EVALUAR 3 PILARES (Scoring estricto 0-10 con EVIDENCIA):
            
            1. READINESS (Citabilidad):
               - ¿Hay "Answer Boxes" (definiciones claras después de H2)?
               - ¿El contenido es denso y factual?
               - ¿Es citable por LLMs?
               EVIDENCIA: Citar H1 actual, si el meta description sirve, qué falta.
            
            2. STRUCTURE (Estructura):
               - ¿H1→H2→H3 siguen jerarquía lógica?
               - ¿Responde intenciones de búsqueda (Qué es, Cómo, Precio)?
               EVIDENCIA: Listar H1 y H2s encontrados, indicar problemas.
            
            3. AUTHORITY (E-E-A-T):
               - ¿Hay señales de confianza (Autor, Dirección, Teléfono, Social)?
               - ¿El Schema.org está configurado?
               EVIDENCIA: Qué señales se encontraron y cuáles faltan.

            RESPONDER EN ESPAÑOL ARGENTINO. Ser específico con la evidencia.
            `
        });

        results.readiness_score = analysis.object.readiness_score;
        results.structure_score = analysis.object.structure_score;
        results.authority_score = analysis.object.authority_score;
        results.readiness_evidence = analysis.object.readiness_evidence;
        results.structure_evidence = analysis.object.structure_evidence;
        results.authority_evidence = analysis.object.authority_evidence;

        results.notas = `🤖 **Análisis Gemini (EVS v3.0)**\n\n` +
            `**Readiness (${results.readiness_score}/10):** ${results.readiness_evidence}\n\n` +
            `**Structure (${results.structure_score}/10):** ${results.structure_evidence}\n\n` +
            `**Authority (${results.authority_score}/10):** ${results.authority_evidence}`;

        summaryPoints.push("✅ Análisis Semántico EVS v3.0 con evidencia completado.");

    } catch (e) {
        console.error("Scan Error", e);
        results.notas = "Error: Falló el análisis semántico. " + (e instanceof Error ? e.message : String(e));
    }

    results.summary = summaryPoints.join('\n');
    return results;
}


/**
 * EVS v3.0: Suggest Money Queries
 * Generates contextual "Money Queries" following EVS methodology intenciones:
 * - "qué es / cómo funciona" (Educational)
 * - "mejores / alternativas" (Category Leader)
 * - "comparación" (vs Competitors)
 * - "precio" (Transactional)
 * - "casos de uso / implementación" (Expert)
 * - "riesgos / reviews" (Social Proof)
 */
export async function suggestQueries(
    industria: string,
    market: string,
    brand: string,
    competidores: string[] = [],
    productos: string[] = []
): Promise<string[]> {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return ["Error: Configurar API Key"];

    // Use first product or generic term
    const productoClave = productos.length > 0 ? productos[0] : industria;
    const competidoresStr = competidores.length > 0 ? competidores.slice(0, 3).join(', ') : 'competidores principales';

    try {
        const { object } = await generateObject({
            model: MODEL_FAST,
            schema: z.object({
                queries: z.array(z.string()).length(6)
            }),
            prompt: `
            Sos un experto en EVS (Exista Visibility Score) generando "Money Queries" para auditar visibilidad de marca en IA.
            
            CONTEXTO:
            - Empresa: "${brand}"
            - Industria: "${industria}"
            - Mercado: "${market}"
            - Productos/Servicios: ${productos.join(', ') || 'No especificados'}
            - Competidores conocidos: ${competidoresStr}
            
            METODOLOGÍA EVS - INTENCIONES CUBIERTAS (genera 1 query por intención):
            1. "qué es / cómo funciona" → Ejemplo: "¿Cómo comprar electrodomésticos por internet en Argentina?"
            2. "mejores / alternativas" → Ejemplo: "¿Cuáles son las mejores tiendas de ${productoClave} en ${market}?"
            3. "comparación" → Ejemplo: "¿Me conviene comprar en ${brand} o en ${competidores[0] || 'Frávega'}?"
            4. "precio" → Ejemplo: "¿Dónde comprar ${productoClave} barato en ${market}?"
            5. "casos de uso / opiniones" → Ejemplo: "Opiniones de ${brand} ${market}"
            6. "ranking / recomendación" → Ejemplo: "Ranking de tiendas de ${industria} confiables ${market} 2025"
            
            REGLAS CRÍTICAS:
            - Las queries deben sonar como preguntas reales de un usuario argentino.
            - NO generes "¿Qué es ${brand}?" ni "${brand} ${industria}" (eso es búsqueda de marca, no Money Query).
            - El objetivo es ver si ${brand} aparece cuando el usuario busca genéricamente por la CATEGORÍA.
            - Usá español argentino natural (no "usted", sí "vos" implícito en tono).
            `
        });
        return object.queries;
    } catch (e) {
        console.error("Query Gen Error", e);
        // Fallback templates with industry context
        return [
            `¿Cómo elegir ${industria} en ${market}?`,
            `¿Cuáles son las mejores tiendas de ${productoClave} en ${market}?`,
            `¿Me conviene ${brand} o ${competidores[0] || 'la competencia'}?`,
            `¿Dónde comprar ${productoClave} barato en ${market}?`,
            `Opiniones de ${brand} ${market}`,
            `Ranking de ${industria} confiables ${market} 2025`
        ];
    }
}

/**
 * Action: Off-site Reputation Analysis (RAG Pattern)
 * 1. Tavily Search (Reviews, Wiki)
 * 2. Gemini Analysis (Consistency, Reputation)
 */
export async function analyzeOffsiteQualitative(brand: string, market: string): Promise<{
    entity_consistency_score: number;
    canonical_sources_presence: boolean;
    reputation_score: number;
    notas: string;
}> {
    if (!tavilyClient) {
        return {
            entity_consistency_score: 0,
            canonical_sources_presence: false,
            reputation_score: 0,
            notas: "⚠️ Error: Falta TAVILY_API_KEY. No se puede investigar."
        };
    }

    try {
        // 1. Perform Real Searches (Parallel)
        const [reviewsData, wikiData, pricingData] = await Promise.all([
            tavilyClient.search(`${brand} reviews opiniones ${market}`, { search_depth: "advanced", max_results: 5 }),
            tavilyClient.search(`${brand} wikipedia crunchbase`, { search_depth: "basic", max_results: 3 }),
            tavilyClient.search(`${brand} pricing prices costos`, { search_depth: "basic", max_results: 3 })
        ]);

        const combinedContext = `
        Search 1 (Reviews):\n${JSON.stringify(reviewsData.results)}\n
        Search 2 (Wiki/Canonical):\n${JSON.stringify(wikiData.results)}\n
        Search 3 (Pricing):\n${JSON.stringify(pricingData.results)}
        `;

        // 2. Gemini Analysis
        const { object } = await generateObject({
            model: MODEL_REASONING,
            schema: z.object({
                consistency: z.number().min(0).max(10),
                canonical: z.boolean(),
                reputation: z.number().min(0).max(10),
                justification: z.string()
            }),
            prompt: `
            You are an Expert Auditor investigating the brand "${brand}".
            
            Analyze the following Real Search Results found on Tavily:
            ${combinedContext}

            Task:
            1. **Consistency**: Is the entity clearly defined across sources? (0-10)
            2. **Canonical**: Is there a Wikipedia, Crunchbase, or Official Wikidata profile? (Boolean)
            3. **Reputation**: Analyze the sentiment of the reviews found. (0-10, 5 is neutral, 0 is bad, 10 is excellent).

            Output: Scores and a detailed Note citing specific sources/URLs found in the context.
            `
        });

        return {
            entity_consistency_score: object.consistency,
            canonical_sources_presence: object.canonical,
            reputation_score: object.reputation,
            notas: `🌍 **Investigación Real (Tavily + Gemini)**:\n${object.justification}`
        };

    } catch (e) {
        console.error("Offsite Analysis Error", e);
        return {
            entity_consistency_score: 0,
            canonical_sources_presence: false,
            reputation_score: 0,
            notas: "Error durante la investigación Off-site. " + String(e)
        };
    }
}

/**
 * Action: Share of Voice (Direct Tavily Search)
 * Searches query and checks if brand is in results.
 */
export async function checkShareOfVoice(query: string, brand: string, competitors: string[]) {
    if (!tavilyClient) {
        console.error("DEBUG_SOV: Missing Tavily Key");
        return {
            mentioned: false,
            sentiment: "Neutral",
            raw_response_preview: "Error: Falta TAVILY_API_KEY",
            competitors_mentioned: []
        };
    }

    try {
        console.log(`DEBUG_SOV: Advanced searching for "${query}" looking for brand "${brand}"`);

        // 1. Advanced Search for deeper discovery
        const response = await tavilyClient.search(query, {
            search_depth: "advanced",
            max_results: 10,
            include_domains: [],
            include_answer: true
        });

        // 2. AI Judgment 2.0 (The "Expert" Auditor)
        const { object: judgment } = await generateObject({
            model: MODEL_FAST,
            schema: z.object({
                is_mentioned: z.boolean().describe("Is the brand present in top 10?"),
                bucket: z.enum(["Top 3", "Top 10", "None"]).describe("Position bucket"),
                sentiment: z.enum(["Positive", "Neutral", "Negative"]).describe("Framing of the mention"),
                evidence: z.string().describe("Evidence / Source URL found"),
                competitors_found: z.array(z.string()).describe("Which competitors from the list were found?")
            }),
            prompt: `
            You are an EVS methodology auditor.
            Query: "${query}"
            Target Brand: "${brand}" (alias "La Caja Seguros", "Caja Seguros" also valid)
            Competitors to track: ${competitors.join(", ")}
            
            Search Results:
            ${JSON.stringify(response.results.map((r: any, i: number) => ({ p: i + 1, t: r.title, s: r.content, u: r.url })))}
            
            Tasks:
            1. If "${brand}" or alias appears in result 1-3 -> Bucket "Top 3".
            2. If appears in 4-10 -> Bucket "Top 10".
            3. If it appears in Top 3 or Top 10, set is_mentioned = true.
            4. Otherwise -> "None".
            5. Identify if competitors are present.
            6. Note the sentiment/framing.
            `
        });

        console.log(`DEBUG_SOV_EVS: Bucket: ${judgment.bucket} | Evidence: ${judgment.evidence}`);

        const mentioned = judgment.is_mentioned;

        let preview = "";
        if (mentioned) {
            preview = `📍 [${judgment.bucket}] ${judgment.evidence}`;
        } else {
            const top3 = response.results.slice(0, 3).map((r: any) => `"${r.title}"`).join(", ");
            preview = `❌ No detectado. Top 3 actual: ${top3}...`;
        }

        return {
            mentioned,
            sentiment: judgment.sentiment,
            raw_response_preview: preview,
            competitors_mentioned: judgment.competitors_found
        };

    } catch (e) {
        console.error("SoV Search Error", e);
        return {
            mentioned: false,
            sentiment: "Neutral",
            raw_response_preview: "Error en búsqueda EVS: " + String(e),
            competitors_mentioned: []
        };
    }
}

export async function analyzeQuery(query: string, brand: string, engine: string) {
    const sov = await checkShareOfVoice(query, brand, []);
    return { mentioned: sov.mentioned, reason: sov.raw_response_preview, sources: [] };
}

/**
 * EVS v2.0: Direct LLM Query (Multi-Engine)
 * Queries the AI engine directly and returns the raw response + analysis.
 */
export async function checkLLMAnswer(
    query: string,
    engine: AIEngine,
    brand: string,
    competitors: string[] = []
): Promise<LLMCheckResult> {
    const result: LLMCheckResult = {
        engine,
        query,
        raw_response: '',
        is_mentioned: false,
        bucket: 'Not Found',
        sentiment: 'Neutral',
    };

    try {
        let rawResponse = '';

        // 1. Query the specific AI engine
        switch (engine) {
            case 'ChatGPT':
                if (!openaiClient) {
                    result.error = 'Missing OPENAI_API_KEY';
                    return result;
                }
                const chatGPTRes = await openaiClient.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [{ role: 'user', content: query }],
                    max_tokens: 1000
                });
                rawResponse = chatGPTRes.choices[0]?.message?.content || '';
                break;

            case 'Claude':
                if (!anthropicClient) {
                    result.error = 'Missing ANTHROPIC_API_KEY';
                    return result;
                }
                const claudeRes = await anthropicClient.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1000,
                    messages: [{ role: 'user', content: query }]
                });
                rawResponse = claudeRes.content[0]?.type === 'text' ? claudeRes.content[0].text : '';
                break;

            case 'Gemini':
                if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
                    result.error = 'Missing GOOGLE_GENERATIVE_AI_API_KEY';
                    return result;
                }
                const geminiRes = await generateText({
                    model: MODEL_FAST,
                    prompt: query
                });
                rawResponse = geminiRes.text;
                break;

            case 'Perplexity':
                if (!perplexityClient) {
                    result.error = 'Missing PERPLEXITY_API_KEY';
                    return result;
                }
                const perplexityRes = await perplexityClient.chat.completions.create({
                    model: 'sonar',
                    messages: [{ role: 'user', content: query }],
                    max_tokens: 1000
                });
                rawResponse = perplexityRes.choices[0]?.message?.content || '';
                break;
        }

        result.raw_response = rawResponse;

        // 2. Analyze the response for brand mention
        if (rawResponse) {
            const { object: analysis } = await generateObject({
                model: MODEL_FAST,
                schema: z.object({
                    is_mentioned: z.boolean().describe('Is the brand mentioned in the response?'),
                    bucket: z.enum(['Top Answer', 'Mentioned', 'Cited', 'Not Found']).describe('How prominently is it featured?'),
                    sentiment: z.enum(['Positive', 'Neutral', 'Negative']).describe('Framing/sentiment'),
                    citation_url: z.string().optional().describe('If cited, the URL'),
                    competitors_found: z.array(z.string()).describe('List of competitor names from the provided list that appear in the response')
                }),
                prompt: `
                Analyze this AI-generated response for the brand "${brand}".
                Also check for aliases like "${brand} Seguros", "Caja Seguros", etc.
                
                IMPORTANT: Identify which of these competitors appear in the response:
                Competitors to track: ${competitors.join(', ')}
                
                Response to analyze:
                """
                ${rawResponse}
                """
                
                Bucket definitions:
                - "Top Answer": Brand is the primary recommendation or first mentioned
                - "Mentioned": Brand appears in a list or comparison
                - "Cited": Brand is mentioned with a source URL
                - "Not Found": Brand does not appear
                
                For competitors_found: Return an array with the names of competitors that appear in the response.
                Only include competitors from the provided list. If none appear, return empty array [].
                `
            });

            result.is_mentioned = analysis.is_mentioned;
            result.bucket = analysis.bucket;
            result.sentiment = analysis.sentiment;
            result.citation_url = analysis.citation_url;
            result.competitors_mentioned = analysis.competitors_found; // NEW: Add competitors
        }

        console.log(`[EVS v2.0] ${engine}: ${result.bucket} | Brand: ${brand}`);
        return result;

    } catch (e) {
        console.error(`[EVS v2.0] ${engine} Error:`, e);
        result.error = e instanceof Error ? e.message : String(e);
        return result;
    }
}

/**
 * EVS v2.0: Check All Engines in Parallel
 * Queries all 4 engines simultaneously for a single query.
 */
export async function checkAllEngines(
    query: string,
    brand: string,
    competitors: string[] = []
): Promise<LLMCheckResult[]> {
    const engines: AIEngine[] = ['ChatGPT', 'Claude', 'Gemini', 'Perplexity'];

    const results = await Promise.allSettled(
        engines.map(engine => checkLLMAnswer(query, engine, brand, competitors))
    );

    return results.map((res, i) => {
        if (res.status === 'fulfilled') {
            return res.value;
        } else {
            return {
                engine: engines[i],
                query,
                raw_response: '',
                is_mentioned: false,
                bucket: 'Not Found' as const,
                sentiment: 'Neutral' as const,
                error: res.reason?.message || 'Unknown error'
            };
        }
    });
}

// ============================================
// EVS v3.0: AI-POWERED AUDIT REPORTS
// ============================================

export interface AuditReportData {
    executive_summary: string;
    top3_hallazgos: string[]; // NEW: Top 3 findings
    evs_score: number;
    score_onsite: number;
    score_offsite: number;
    status_badge: '🔴' | '🟠' | '🟢' | '🟣';

    // Benchmark (REAL data)
    benchmark: {
        brand: string;
        brand_sov: number;
        brand_engines: { chatgpt: boolean; claude: boolean; gemini: boolean; perplexity: boolean }; // NEW
        competitors: Array<{
            name: string;
            sov: number;
            engines: { chatgpt: boolean; claude: boolean; gemini: boolean; perplexity: boolean };
        }>;
    };

    // Gap Analysis (REAL data)
    gaps: Array<{
        query: string;
        engine: string;
        competitors_found: string[];
    }>;

    // Recommendations (AI-generated from real data)
    recommendations: Array<{
        priority: number;
        emoji: string;
        title: string;
        description: string;
        impact: 'alto' | 'medio' | 'bajo';
        difficulty: 'facil' | 'media' | 'dificil';
        estimated_time: string;
    }>;

    // Evidence
    onsite_evidence: {
        readiness: { score: number; evidence: string };
        structure: { score: number; evidence: string };
        authority: { score: number; evidence: string };
    };

    // NEW: Query details for per-query breakdown
    queries_detail: Array<{
        query: string;
        engines: {
            chatgpt: { mentioned: boolean; bucket: string };
            claude: { mentioned: boolean; bucket: string };
            gemini: { mentioned: boolean; bucket: string };
            perplexity: { mentioned: boolean; bucket: string };
        };
    }>;

    generated_at: string;
}

// Helper: Sanitize text to fix encoding issues
function sanitizeText(text: string): string {
    if (!text) return '';
    // Fix common corrupted accent patterns
    return text
        // Pattern: vowel followed by ! should be accented vowel
        .replace(/a!/g, 'á')
        .replace(/e!/g, 'é')
        .replace(/i!/g, 'í')
        .replace(/o!/g, 'ó')
        .replace(/u!/g, 'ú')
        .replace(/A!/g, 'Á')
        .replace(/E!/g, 'É')
        .replace(/I!/g, 'Í')
        .replace(/O!/g, 'Ó')
        .replace(/U!/g, 'Ú')
        .replace(/n~/g, 'ñ')
        .replace(/N~/g, 'Ñ')
        // Fix unicode escapes
        .replace(/\\u00ed/g, 'í')
        .replace(/\\u00e1/g, 'á')
        .replace(/\\u00e9/g, 'é')
        .replace(/\\u00f3/g, 'ó')
        .replace(/\\u00fa/g, 'ú')
        .replace(/\\u00f1/g, 'ñ');
}

/**
 * EVS v3.0: Generate AI-Powered Audit Report
 * Uses ONLY real data from the audit - ZERO MOCK DATA.
 */
export async function generateAuditReport(
    auditId: string,
    clientId: string,
    clientName: string,
    competidores: string[]
): Promise<{ success: boolean; report?: AuditReportData; markdown?: string; error?: string }> {

    // Import supabase dynamically to avoid circular deps
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    try {
        // 1. Fetch REAL audit data
        const { data: audit, error: auditError } = await supabase
            .from('audits')
            .select('*')
            .eq('id', auditId)
            .single();

        if (auditError || !audit) throw new Error('Audit not found');

        // 2. Fetch REAL onsite results
        const { data: onsite } = await supabase
            .from('onsite_results')
            .select('*')
            .eq('audit_id', auditId)
            .single();

        // 3. Fetch REAL offsite results
        const { data: offsite } = await supabase
            .from('offsite_results')
            .select('*')
            .eq('audit_id', auditId)
            .single();

        // 4. Fetch REAL offsite queries
        const { data: queries } = await supabase
            .from('offsite_queries')
            .select('*')
            .eq('audit_id', auditId);

        // Check if we have enough data
        if (!queries || queries.length === 0) {
            return {
                success: false,
                error: 'No hay queries ejecutadas en esta auditoría. Ejecutá al menos 5 queries antes de generar el reporte.'
            };
        }

        // 5. Calculate REAL Share of Voice
        const totalQueries = queries.length;
        const brandMentions = queries.filter(q => q.mentioned).length;
        const brandSoV = Math.round((brandMentions / totalQueries) * 100);

        // NEW: Calculate brand engines from REAL query data
        const brandEngines = {
            chatgpt: queries.some(q => q.engine === 'ChatGPT' && q.mentioned),
            claude: queries.some(q => q.engine === 'Claude' && q.mentioned),
            gemini: queries.some(q => q.engine === 'Gemini' && q.mentioned),
            perplexity: queries.some(q => q.engine === 'Perplexity' && q.mentioned)
        };

        // Calculate competitor SoV from REAL data
        const competitorSoV = competidores.map(comp => {
            const mentions = queries.filter(q =>
                q.competitors_mentioned?.includes(comp)
            ).length;

            // Count by engine
            const engines = {
                chatgpt: queries.some(q => q.engine === 'ChatGPT' && q.competitors_mentioned?.includes(comp)),
                claude: queries.some(q => q.engine === 'Claude' && q.competitors_mentioned?.includes(comp)),
                gemini: queries.some(q => q.engine === 'Gemini' && q.competitors_mentioned?.includes(comp)),
                perplexity: queries.some(q => q.engine === 'Perplexity' && q.competitors_mentioned?.includes(comp))
            };

            return {
                name: comp,
                sov: Math.round((mentions / totalQueries) * 100),
                engines
            };
        });

        // 6. Calculate REAL Gap Analysis
        const gaps = queries
            .filter(q => !q.mentioned && q.competitors_mentioned && q.competitors_mentioned.length > 0)
            .map(q => ({
                query: q.query_text,
                engine: q.engine,
                competitors_found: q.competitors_mentioned || []
            }));

        // 7. Determine status badge
        const evsScore = audit.score_total || 0;
        const statusBadge = evsScore >= 80 ? '🟣' : evsScore >= 60 ? '🟢' : evsScore >= 40 ? '🟠' : '🔴';

        // 8. Prepare evidence from REAL data
        // Use simple string parsing instead of regex 's' flag for ES6 compatibility
        const notas = onsite?.notas || '';
        const extractEvidence = (key: string, nextKeys: string[]): string => {
            const startIdx = notas.indexOf(key);
            if (startIdx === -1) return 'Sin evidencia';
            let endIdx = notas.length;
            for (const nextKey of nextKeys) {
                const idx = notas.indexOf(nextKey, startIdx + key.length);
                if (idx !== -1 && idx < endIdx) endIdx = idx;
            }
            return notas.substring(startIdx, endIdx).trim() || 'Sin evidencia';
        };

        const onsiteEvidence = {
            readiness: {
                score: onsite?.answer_box_score || 0,
                evidence: sanitizeText(extractEvidence('Readiness', ['Structure', 'Authority']))
            },
            structure: {
                score: onsite?.h1_h2_structure_score || 0,
                evidence: sanitizeText(extractEvidence('Structure', ['Authority']))
            },
            authority: {
                score: onsite?.authority_signals_score || 0,
                evidence: sanitizeText(extractEvidence('Authority', []))
            }
        };

        // NEW: Generate Top 3 Hallazgos based on real data
        const hallazgos: string[] = [];
        // Find lowest score
        const scores = [
            { name: 'Readiness', score: onsiteEvidence.readiness.score },
            { name: 'Structure', score: onsiteEvidence.structure.score },
            { name: 'Authority', score: onsiteEvidence.authority.score },
        ].sort((a, b) => a.score - b.score);
        if (scores[0].score < 5) {
            hallazgos.push(`Score crítico en ${scores[0].name}: ${scores[0].score}/10`);
        }
        // Gap finding
        if (gaps.length > 0) {
            hallazgos.push(`${gaps.length} queries donde competidores aparecen pero la marca no`);
        }
        // SoV comparison
        const topCompetitor = competitorSoV.reduce((max, c) => c.sov > max.sov ? c : max, { name: '', sov: 0 });
        if (topCompetitor.sov > brandSoV) {
            hallazgos.push(`Competidor ${topCompetitor.name} tiene mayor SoV (${topCompetitor.sov}% vs ${brandSoV}%)`);
        } else if (brandSoV >= 80) {
            hallazgos.push(`SoV líder en categoría: ${brandSoV}%`);
        }

        // 9. Generate AI recommendations using ONLY real data
        const aiPrompt = `
Sos un consultor experto en visibilidad en IA (Answer Engine Optimization).
Basándote ÚNICAMENTE en estos datos REALES de la auditoría de "${clientName}":

EVS Score: ${evsScore}/100 (${statusBadge})
- On-site: ${audit.score_onsite || 0}/50
- Off-site: ${audit.score_offsite || 0}/50

SCORES REALES:
- Readiness: ${onsiteEvidence.readiness.score}/10
- Structure: ${onsiteEvidence.structure.score}/10
- Authority: ${onsiteEvidence.authority.score}/10
- Entity Consistency: ${offsite?.entity_consistency_score || 0}/10
- Reputation: ${offsite?.reputation_score || 0}/10

SHARE OF VOICE REAL:
- ${clientName}: ${brandSoV}%
${competitorSoV.map(c => `- ${c.name}: ${c.sov}%`).join('\n')}

GAPS (queries donde competidores aparecen pero ${clientName} no):
${gaps.slice(0, 5).map(g => `- "${g.query}" (${g.engine}): ${g.competitors_found.join(', ')}`).join('\n') || 'Sin gaps detectados'}

Generá exactamente 5 recomendaciones priorizadas.
Para cada una, usá este formato JSON exacto:
{
  "priority": 1-5,
  "emoji": "🚀" o "⚙️" o "📈" o "🔧",
  "title": "Título corto y accionable",
  "description": "Descripción detallada basada en la evidencia real",
  "impact": "alto" o "medio" o "bajo",
  "difficulty": "facil" o "media" o "dificil",
  "estimated_time": "1-2 horas" o "1 semana" etc
}

Criterios:
- 🚀 = Quick Win (alto impacto, baja dificultad)
- ⚙️ = Mejora técnica (medio impacto)
- 📈 = Iniciativa de autoridad (alto impacto, alta dificultad)
- 🔧 = Fix menor

Respondé SOLO con un array JSON de 5 objetos. Sin explicación adicional.
`;

        const aiResult = await generateObject({
            model: MODEL_FAST,
            schema: z.object({
                recommendations: z.array(z.object({
                    priority: z.number(),
                    emoji: z.string(),
                    title: z.string(),
                    description: z.string(),
                    impact: z.enum(['alto', 'medio', 'bajo']),
                    difficulty: z.enum(['facil', 'media', 'dificil']),
                    estimated_time: z.string()
                }))
            }),
            prompt: aiPrompt
        });

        // 10. Generate Executive Summary with AI
        const summaryPrompt = `
Escribí un resumen ejecutivo de 2-3 oraciones para este reporte de auditoría EVS:
- Cliente: ${clientName}
- EVS Score: ${evsScore}/100
- Share of Voice: ${brandSoV}%
- Principal gap: ${gaps[0]?.query || 'Sin gaps críticos'}
- Score más bajo: ${Math.min(onsiteEvidence.readiness.score, onsiteEvidence.structure.score, onsiteEvidence.authority.score)}/10

Sé directo y profesional. En español argentino.
`;

        const summaryResult = await generateText({
            model: MODEL_FAST,
            prompt: summaryPrompt
        });

        // NEW: Generate per-query detail breakdown
        const uniqueQueries = [...new Set(queries.map(q => q.query_text))];
        const queriesDetail = uniqueQueries.map(queryText => {
            const queryResults = queries.filter(q => q.query_text === queryText);
            const getEngineResult = (engine: string) => {
                const result = queryResults.find(q => q.engine === engine);
                return {
                    mentioned: result?.mentioned || false,
                    bucket: result?.bucket || 'Not Found'
                };
            };
            return {
                query: queryText,
                engines: {
                    chatgpt: getEngineResult('ChatGPT'),
                    claude: getEngineResult('Claude'),
                    gemini: getEngineResult('Gemini'),
                    perplexity: getEngineResult('Perplexity')
                }
            };
        });

        // 11. Build report data
        const reportData: AuditReportData = {
            executive_summary: summaryResult.text,
            top3_hallazgos: hallazgos.slice(0, 3),
            evs_score: evsScore,
            score_onsite: audit.score_onsite || 0,
            score_offsite: audit.score_offsite || 0,
            status_badge: statusBadge as AuditReportData['status_badge'],
            benchmark: {
                brand: clientName,
                brand_sov: brandSoV,
                brand_engines: brandEngines,
                competitors: competitorSoV
            },
            gaps,
            recommendations: aiResult.object.recommendations,
            onsite_evidence: onsiteEvidence,
            queries_detail: queriesDetail, // NEW
            generated_at: new Date().toISOString()
        };

        // 12. Generate Markdown report
        const markdown = generateReportMarkdown(reportData, clientName);

        return { success: true, report: reportData, markdown };

    } catch (error) {
        console.error('[generateAuditReport] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido al generar el reporte'
        };
    }
}

/**
 * Helper: Generate Markdown report from data
 */
function generateReportMarkdown(data: AuditReportData, clientName: string): string {
    const be = data.benchmark.brand_engines;

    return `# Reporte EVS: ${clientName}

## ${data.status_badge} Executive Summary

**EVS Score: ${data.evs_score}/100**
- On-site: ${data.score_onsite}/50
- Off-site: ${data.score_offsite}/50

${data.executive_summary}

${data.top3_hallazgos.length > 0 ? `### 🎯 Top 3 Hallazgos

${data.top3_hallazgos.map((h, i) => `${i + 1}. ${h}`).join('\n')}
` : ''}
---

## 📊 Benchmark Competitivo

| Marca | SoV | ChatGPT | Claude | Gemini | Perplexity |
|:---|:---:|:---:|:---:|:---:|:---:|
| **${data.benchmark.brand}** | **${data.benchmark.brand_sov}%** | ${be.chatgpt ? '✅' : '❌'} | ${be.claude ? '✅' : '❌'} | ${be.gemini ? '✅' : '❌'} | ${be.perplexity ? '✅' : '❌'} |
${data.benchmark.competitors.map(c =>
        `| ${c.name} | ${c.sov}% | ${c.engines.chatgpt ? '✅' : '❌'} | ${c.engines.claude ? '✅' : '❌'} | ${c.engines.gemini ? '✅' : '❌'} | ${c.engines.perplexity ? '✅' : '❌'} |`
    ).join('\n')}

> **Nota:** El SoV (Share of Voice) indica el % de queries en las que cada marca fue mencionada por los motores de IA.

---

## 🔍 Gap Analysis

${data.gaps.length > 0 ? data.gaps.slice(0, 5).map(g =>
        `- **"${g.query}"** (${g.engine})\n  - ❌ ${clientName}: No aparece\n  - ✅ Competidores: ${g.competitors_found.join(', ')}`
    ).join('\n\n') : '_Sin gaps detectados. ¡Buen trabajo!_'}

---

## 🎯 Top 5 Recomendaciones

${data.recommendations.map(r =>
        `### ${r.emoji} ${r.priority}. ${r.title}\n\n${r.description}\n\n**Impacto:** ${r.impact.charAt(0).toUpperCase() + r.impact.slice(1)} | **Dificultad:** ${r.difficulty.charAt(0).toUpperCase() + r.difficulty.slice(1)} | **Tiempo:** ${r.estimated_time}`
    ).join('\n\n---\n\n')}

---

## 📋 Evidencia On-site

| Métrica | Score | Evidencia |
|:---|:---:|:---|
| Readiness | ${data.onsite_evidence.readiness.score}/10 | ${data.onsite_evidence.readiness.evidence.substring(0, 150)}... |
| Structure | ${data.onsite_evidence.structure.score}/10 | ${data.onsite_evidence.structure.evidence.substring(0, 150)}... |
| Authority | ${data.onsite_evidence.authority.score}/10 | ${data.onsite_evidence.authority.evidence.substring(0, 150)}... |

---

## 🔎 Detalle por Query

${data.queries_detail && data.queries_detail.length > 0 ? `
| Query | ChatGPT | Claude | Gemini | Perplexity |
|:---|:---:|:---:|:---:|:---:|
${data.queries_detail.map(q => {
        const formatEngine = (e: { mentioned: boolean; bucket: string }) =>
            e.mentioned ? `✅ ${e.bucket}` : '❌';
        return `| ${q.query.length > 50 ? q.query.substring(0, 47) + '...' : q.query} | ${formatEngine(q.engines.chatgpt)} | ${formatEngine(q.engines.claude)} | ${formatEngine(q.engines.gemini)} | ${formatEngine(q.engines.perplexity)} |`;
    }).join('\n')}

> **Leyenda:** ✅ = Mencionado | ❌ = No aparece | Bucket = Top Answer, Mentioned, Cited
` : '_No hay queries detalladas disponibles._'}

---

## 📖 Metodología EVS

### ¿Qué es el Exista Visibility Score?

El **EVS (Exista Visibility Score)** es una métrica 0–100 que mide qué tan probable es que tu marca sea encontrada, entendida y citada por buscadores tradicionales y motores de respuesta basados en IA (ChatGPT, Claude, Gemini, Perplexity).

**Fórmula:** EVS = 50% On-site Readiness + 50% Off-site Visibility

### Interpretación de Rangos

| Rango | Estado | Interpretación |
|:---:|:---:|:---|
| 0–39 | 🔴 Crítico | No sos "recuperable/citable" de forma consistente |
| 40–59 | 🟠 Ámbar | Aparecés "a veces", pero con inestabilidad |
| 60–79 | 🟢 Verde | Base sólida; faltan palancas de autoridad |
| 80–100 | 🟣 Elite | Alto potencial de citación consistente |

### On-site Readiness (50%)

Tu web como fuente citable:
- **Readiness:** Respuestas directas, meta descripción, H1 descriptivo
- **Structure:** Jerarquía H1-H3, Schema JSON-LD, FAQs estructuradas
- **Authority:** Señales E-E-A-T, fuentes citadas, autoría clara

### Off-site Visibility (50%)

Tu marca como entidad confiable:
- **Entity Consistency:** Nombre consistente, perfiles oficiales
- **Canonical Sources:** Presencia en Wikipedia, directorios
- **Reputation:** Menciones, reviews, earned media
- **Share of Voice:** % de aparición en respuestas de IA

### Glosario

| Término | Definición |
|:---|:---|
| **SoV** | Share of Voice: % de queries donde la marca es mencionada |
| **AEO** | Answer Engine Optimization: optimización para motores de respuesta IA |
| **Money Queries** | Consultas con intención comercial ("mejores", "alternativas", "precio") |
| **Bucket** | Clasificación de mención: Top Answer, Mentioned, Cited, Not Found |
| **E-E-A-T** | Experience, Expertise, Authoritativeness, Trustworthiness |

---

*Generado por **Exista.io** EVS v3.0 el ${new Date(data.generated_at).toLocaleDateString('es-AR')}*

*Metodología basada en Exista Visibility Score v1.0 - Argentina (AR)*

---

**Exista.io** — Especialistas en Visibilidad en IA
`;
}


