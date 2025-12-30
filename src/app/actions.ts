'use server'

import * as cheerio from 'cheerio';
import { generateObject, generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

// --- CONFIGURATION ---
// Roleplaying "Gemini 3 Flash" as requested (mapping to 1.5 Flash for availability)
// In "Dec 2025", we assume 'gemini-1.5-flash' is the stable fast model or we use the latest alias.
const MODEL_FAST = google('gemini-1.5-flash');
const MODEL_REASONING = google('gemini-1.5-pro'); // For complex off-site

// --- TOOLS ---

// Real Web Search Tool (Tavily or Perplexity)
// If APIs are missing, we perform a "Poor Man's Search" via direct fetch if URL is known, 
// or strictly fail. We DO NOT mock with Math.random.
// Define Schema separately for type inference
const searchSchema = z.object({
    query: z.string().describe('The search query to execute')
});

const searchWebTool = tool({
    description: 'Search the live web for information about a brand, market, or entity.',
    parameters: searchSchema,
    execute: async ({ query }: z.infer<typeof searchSchema>) => {
        const apiKey = process.env.TAVILY_API_KEY || process.env.PERPLEXITY_API_KEY;
        const provider = process.env.TAVILY_API_KEY ? 'tavily' : 'perplexity';

        console.log(`[Agent] Searching: "${query}" using ${provider || 'No Key'}`);

        if (!apiKey) {
            return JSON.stringify({ error: "CONFIGURATION_ERROR: API Key for Tavily or Perplexity is missing." });
        }

        try {
            if (provider === 'tavily') {
                const res = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ api_key: apiKey, query, search_depth: "basic", max_results: 3 })
                });
                const data = await res.json();
                const results = Array.isArray(data.results) ? data.results.map((r: any) => ({ title: r.title, url: r.url, snippet: r.content })) : [];
                return JSON.stringify({ source: "Tavily", results });
            }
            if (provider === 'perplexity') {
                const res = await fetch("https://api.perplexity.ai/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "sonar-reasoning",
                        messages: [{ role: "user", content: query }]
                    })
                });
                const data = await res.json();
                const summary = data.choices?.[0]?.message?.content || "No content";
                return JSON.stringify({ source: "Perplexity", summary });
            }
        } catch (error) {
            console.error("Search API Error", error);
            return JSON.stringify({ error: "External Search API Failed." });
        }
        return JSON.stringify({ error: "Unknown Provider" });
    }
});


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
 * Action: Semantic On-site Analysis
 * Uses Gemini 3 (Fast) to read HTML and judge quality.
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

    try {
        // 1. Technical Fetch (Real Request)
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
        const textContent = $('body').text().replace(/\s+/g, ' ').substring(0, 10000); // Increased context for Gemini 3
        const headings = $('h1, h2, h3').map((i, el) => $(el).text()).get().join(' > ');

        // 3. GENERATE OBJECT (Semantic Analysis)
        // Agent judges the content quality naturally.
        const analysis = await generateObject({
            model: MODEL_FAST,
            schema: z.object({
                readiness_score: z.number().min(0).max(10).describe("Score mostly based on Answer Boxes presence and high content density."),
                structure_score: z.number().min(0).max(10).describe("Score based on logical H1-H2-H3 hierarchy matching user intent."),
                authority_score: z.number().min(0).max(10).describe("Score based on E-E-A-T signals (Authorship, Contact, Socials)."),
                justification: z.string().describe("Concise explanation of the scores citing specific elements found.")
            }),
            prompt: `
            Analyze this webpage content for AI/LLM Optimization (AIO).
            
            Headings Structure: ${headings}
            Content Sample: ${textContent.substring(0, 3000)}...

            Criteria:
            - Readiness: Do concise <p> definitions follow headings? Is it 'citation-ready'?
            - Structure: Does it answer Questions (What is, How to)?
            - Authority: Are there clear trust signals?

            Be strict. This is for an expert audit.
            `
        });

        results.readiness_score = analysis.object.readiness_score;
        results.structure_score = analysis.object.structure_score;
        results.authority_score = analysis.object.authority_score;
        results.notas = `🤖 **Análisis Semántico (Gemini 3)**:\n${analysis.object.justification}`;
        summaryPoints.push("✅ Análisis Semántico completado.");

    } catch (e) {
        console.error("Scan Error", e);
        summaryPoints.push("❌ Error en análisis (Verificar Keys/URL).");
        results.notas = "Error: No se pudo realizar el análisis semántico. Verifique API Keys.";
    }

    results.summary = summaryPoints.join('\n');
    return results;
}

/**
 * Action: Suggest Queries (Business Analysis)
 */
export async function suggestQueries(service: string, market: string, brand: string): Promise<string[]> {
    try {
        const { object } = await generateObject({
            model: MODEL_FAST,
            schema: z.object({
                queries: z.array(z.string()).length(6)
            }),
            prompt: `
            Generate 6 high-value "Money Queries" for the brand "${brand}" offering "${service}" in "${market}".
            Focus on what users ACTUALLY search to buy or compare.
            Include:
            - 2 Informational (Definition/Guide)
            - 2 Comparative (Best X, Vs Y)
            - 2 Transactional (Price, Agency)
            `
        });
        return object.queries;
    } catch (e) {
        console.error("Query Gen Error", e);
        return [`Error: Configurar API Key`];
    }
}

/**
 * Action: Real Off-site Research (Agentic Loop)
 * Uses Search Tool to Find Evidence.
 */
export async function analyzeOffsiteQualitative(brand: string, market: string): Promise<{
    entity_consistency_score: number;
    canonical_sources_presence: boolean;
    reputation_score: number;
    notas: string;
}> {
    try {
        // Multi-step Agent searching for evidence
        const { object } = await generateObject({
            model: MODEL_REASONING, // Slower but smarter
            tools: { searchWebTool },
            maxSteps: 5, // Allow agent to search multiple times if needed
            schema: z.object({
                consistency: z.number().min(0).max(10),
                canonical: z.boolean(),
                reputation: z.number().min(0).max(10),
                justification: z.string().describe("Detailed notes including URLs and sources found.")
            }),
            system: `You are an Auditor. You MUST search the web to find evidence. Do not hallucinate scores.
            If searching fails or returns no results for the brand, score 0 and state 'No evidence found'.`,
            prompt: `
            Investigate the brand "${brand}" in "${market}".
            1. Search for "${brand} reviews" or "opiniones".
            2. Search for "${brand} wikipedia" or "crunchbase".
            3. Search for "${brand} pricing" or "servicios".

            Determine:
            - Entity Consistency: Is the brand message consistent across results?
            - Canonical: Did you find Wikipedia/Wikidata/Crunchbase?
            - Reputation: What is the sentiment of the top 5 results?

            Return the scores and citation-rich notes.
            `
        });

        return {
            entity_consistency_score: object.consistency,
            canonical_sources_presence: object.canonical,
            reputation_score: object.reputation,
            notas: `🕵️ **Investigación Real (Agent)**:\n${object.justification}`
        };

    } catch (e) {
        console.error("Offsite Agent Error", e);
        return {
            entity_consistency_score: 0,
            canonical_sources_presence: false,
            reputation_score: 0,
            notas: "⚠️ **Error de Agente**: No se pudo completar la investigación real. Verifique TAVILY_API_KEY o PERPLEXITY_API_KEY."
        };
    }
}

/**
 * Action: Share of Voice (Agentic Search)
 */
export async function checkShareOfVoice(query: string, brand: string, competitors: string[]) {
    try {
        const { object } = await generateObject({
            model: MODEL_REASONING,
            tools: { searchWebTool },
            maxSteps: 3,
            schema: z.object({
                mentioned: z.boolean(),
                sentiment: z.enum(['Positive', 'Neutral', 'Negative']),
                preview: z.string()
            }),
            prompt: `
            Search for "${query}".
            Look at the top results.
            Does the brand "${brand}" appear in the top summaries or organic results?
            
            Return brief preview of what was found.
            `
        });

        return {
            mentioned: object.mentioned,
            sentiment: object.sentiment,
            raw_response_preview: object.preview,
            competitors_mentioned: []
        };
    } catch (e) {
        return {
            mentioned: false,
            sentiment: "Neutral",
            raw_response_preview: "Error: Search capabilities unavailable.",
            competitors_mentioned: []
        };
    }
}

export async function analyzeQuery(query: string, brand: string, engine: string) {
    const sov = await checkShareOfVoice(query, brand, []);
    return { mentioned: sov.mentioned, reason: sov.raw_response_preview, sources: [] };
}
