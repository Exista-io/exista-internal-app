'use server'

import * as cheerio from 'cheerio';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { tavily } from '@tavily/core';
import { z } from 'zod';

// --- CONFIGURATION ---
// December 2025 Stack: Vercel AI SDK 6 + Gemini 3 Flash
// --- CONFIGURATION ---
// "Gemini 3 Flash" requested -> Using latest stable Flash.
// Switching Reasoning model to Flash as well to avoid "1.5-pro not found" error.
// --- CONFIGURATION ---
// STRICT DIRECTIVE: Gemini 3 Flash.
// Using preview model ID for Dec 2025 availability.
const MODEL_FAST = google('gemini-3-flash-preview');
const MODEL_REASONING = google('gemini-3-flash-preview');

// Initialize Tavily Client (Zero Mock Search)
const tavilyClient = process.env.TAVILY_API_KEY
    ? tavily({ apiKey: process.env.TAVILY_API_KEY })
    : null;

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
 * Action: Semantic On-site Analysis (EVS v1.0)
 * Uses Gemini 3 to read HTML and judge quality based on Readiness, Structure, Authority.
 */
export async function scanWebsite(domain: string): Promise<ScanResult & {
    readiness_score: number,
    structure_score: number,
    authority_score: number,
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
        const textContent = $('body').text().replace(/\s+/g, ' ').substring(0, 15000);
        const headings = $('h1, h2, h3').map((i, el) => $(el).text()).get().join(' > ');
        const metaDesc = $('meta[name="description"]').attr('content') || '';

        // 3. GENERATE OBJECT (EVS v1.0 Analysis)
        const analysis = await generateObject({
            model: MODEL_FAST,
            schema: z.object({
                readiness_score: z.number().min(0).max(10),
                structure_score: z.number().min(0).max(10),
                authority_score: z.number().min(0).max(10),
                justification: z.string()
            }),
            prompt: `
            Role: EVS (Expert Visibility System) Audit AI.
            Target: Analyze webpage content for AI Optimization.
            
            Context:
            - Headings: ${headings}
            - Meta: ${metaDesc}
            - Content Sample: ${textContent.substring(0, 5000)}...

            Evaluate 3 Pillars (Strict Scoring 0-10):
            1. READINESS:
               - Are there clear "Answer Boxes" definitions (e.g. <p> directly after <h2>)?
               - Is the content dense and factual?
               - Is it citation-ready for LLMs?
            
            2. STRUCTURE:
               - Do H1-H2-H3 follow a logical hierarchy?
               - Does it answer specific Intent Questions (What is, How to, Pricing)?
            
            3. AUTHORITY (E-E-A-T):
               - Are there real trust signals (Author bios, Physical Address, Phone Numbers, Social Links)?
               - Does the content feel expert-written?

            Output: Scores and a concise technical justification (in Spanish).
            `
        });

        results.readiness_score = analysis.object.readiness_score;
        results.structure_score = analysis.object.structure_score;
        results.authority_score = analysis.object.authority_score;
        results.notas = `🤖 **Análisis Gemini 3 (On-site)**:\n${analysis.object.justification}`;
        summaryPoints.push("✅ Análisis Semántico EVS v1.0 completado.");

    } catch (e) {
        console.error("Scan Error", e);
        results.notas = "Error: Falló el análisis semántico. " + (e instanceof Error ? e.message : String(e));
    }

    results.summary = summaryPoints.join('\n');
    return results;
}

/**
 * Action: Suggest Queries
 * Uses Gemini to analyze the business and suggest high-intent queries.
 */
export async function suggestQueries(service: string, market: string, brand: string): Promise<string[]> {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return ["Error: Configurar API Key"];

    try {
        const { object } = await generateObject({
            model: MODEL_FAST,
            schema: z.object({
                queries: z.array(z.string()).length(6)
            }),
            prompt: `
            Analyze the business: "${brand}" offering "${service}" in "${market}".
            Generate 6 High-Value Search Queries that users would realistically type into Google/AI to find this service.
            
            Types:
            - 2 Informational (e.g. "Que es [service]...", "Guia de...")
            - 2 Comparative (e.g. "Mejores agencias de...", "[Brand] vs...")
            - 2 Transactional (e.g. "Precio de...", "Contratar [service]...")
            
            Return ONLY the queries.
            `
        });
        return object.queries;
    } catch (e) {
        console.error("Query Gen Error", e);
        return ["Error al generar queries."];
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
        console.log(`DEBUG_SOV: Searching for "${query}" looking for brand "${brand}"`);

        // Real Search
        const response = await tavilyClient.search(query, {
            search_depth: "basic",
            max_results: 10,
            include_domains: []
        });

        // Debug: Log simplified results for inspection
        console.log("DEBUG_TAVILY_RESPONSE:", JSON.stringify(response.results.map((r: any) => ({ t: r.title, u: r.url })), null, 2));

        // Analyze Results
        const brandLower = brand.trim().toLowerCase();

        // Robust Matching: Check Title, Content, and URL
        const foundItem = response.results.find((r: any) => {
            const titleMatch = r.title.toLowerCase().includes(brandLower);
            const contentMatch = r.content?.toLowerCase().includes(brandLower);
            const urlMatch = r.url.toLowerCase().includes(brandLower);

            if (titleMatch || contentMatch || urlMatch) {
                console.log(`DEBUG_SOV_MATCH: Found "${brand}" in:`, r.title);
                return true;
            }
            return false;
        });

        const mentioned = !!foundItem;

        let preview = "";
        if (mentioned) {
            preview = `✅ Encontrado en: ${foundItem.title} (${foundItem.url})`; // Return URL as proof
        } else {
            // Provide Evidence of absence: List top 3 results found instead
            const top3 = response.results.slice(0, 3).map((r: any) => `"${r.title}"`).join(", ");
            preview = `❌ No encontrado. Top 3: ${top3}...`;
            console.log("DEBUG_SOV_FAIL: Brand not found in top 10 results.");
        }

        return {
            mentioned,
            sentiment: "Neutral",
            raw_response_preview: preview,
            competitors_mentioned: []
        };

    } catch (e) {
        console.error("SoV Search Error", e);
        return {
            mentioned: false,
            sentiment: "Neutral",
            raw_response_preview: "Error en búsqueda Tavily: " + String(e),
            competitors_mentioned: []
        };
    }
}

export async function analyzeQuery(query: string, brand: string, engine: string) {
    const sov = await checkShareOfVoice(query, brand, []);
    return { mentioned: sov.mentioned, reason: sov.raw_response_preview, sources: [] };
}

