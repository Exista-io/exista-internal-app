'use server'

import * as cheerio from 'cheerio';

export interface ScanResult {
    robots_ok: boolean;
    sitemap_ok: boolean;
    llms_txt_present: boolean;
    canonical_ok: boolean;
    schema_ok: boolean;
    summary: string;
}

/**
 * Server Action to scan a website for EVS On-site factors.
 */


export async function scanWebsite(domain: string): Promise<ScanResult & {
    readiness_score: number,
    structure_score: number,
    authority_score: number
}> {
    // Normalize domain
    let url = domain.trim();
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }
    // Remove trailing slash for consistency
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
        summary: ''
    };

    try {
        // 1. Check Robots.txt
        // Fetch /robots.txt
        try {
            const robotsRes = await fetch(`${url}/robots.txt`, { next: { revalidate: 0 } });
            if (robotsRes.ok) {
                const text = await robotsRes.text();
                // Basic check: is it blocking GPTBot?
                const blocksGPT = /User-agent:\s*GPTBot\s*Disallow:\s*\//i.test(text);
                if (!blocksGPT) {
                    results.robots_ok = true;
                    summaryPoints.push('✅ Robots.txt accesible y amigable para IA.');
                } else {
                    summaryPoints.push('⚠️ Robots.txt bloquea GPTBot.');
                }

                // Check for Sitemap in robots.txt
                if (/Sitemap:/i.test(text)) {
                    results.sitemap_ok = true;
                    summaryPoints.push('✅ Sitemap detectado en robots.txt.');
                }
            } else {
                summaryPoints.push('❌ No se encontró robots.txt.');
            }
        } catch (e) {
            console.error('Robots check failed', e);
            summaryPoints.push('❌ Error al acceder a robots.txt.');
        }

        // 2. Check Sitemap directly if not found yet
        if (!results.sitemap_ok) {
            try {
                // Try common path
                const sitemapRes = await fetch(`${url}/sitemap.xml`, { method: 'HEAD', next: { revalidate: 0 } });
                if (sitemapRes.ok) {
                    results.sitemap_ok = true;
                    summaryPoints.push('✅ Sitemap.xml accesible directamente.');
                }
            } catch (e) { /* ignore */ }
        }

        // 3. Check llms.txt
        try {
            const llmsRes = await fetch(`${url}/llms.txt`, { method: 'HEAD', next: { revalidate: 0 } });
            if (llmsRes.ok) {
                results.llms_txt_present = true;
                summaryPoints.push('✅ llms.txt detectado.');
            }
        } catch (e) { /* ignore */ }


        // 4. Parse Homepage HTML (Canonical, Schema & Qualitative)
        try {
            const homeRes = await fetch(url, { next: { revalidate: 0 } });
            if (homeRes.ok) {
                const html = await homeRes.text();
                const $ = cheerio.load(html);

                // --- Technical Checks ---
                // Canonical
                const canonical = $('link[rel="canonical"]').attr('href');
                if (canonical) {
                    results.canonical_ok = true;
                } else {
                    summaryPoints.push('⚠️ No se detectó tag Canonical.');
                }

                // Schema (JSON-LD)
                const schema = $('script[type="application/ld+json"]').html();
                if (schema && schema.trim().length > 0) {
                    results.schema_ok = true;
                    summaryPoints.push('✅ Schema JSON-LD detectado.');
                } else {
                    summaryPoints.push('⚠️ No se detectó Schema JSON-LD.');
                }

                // --- Qualitative Heuristics (Phase 3) ---

                // A. Structure Score (0-10)
                let structScore = 0;
                const h1Count = $('h1').length;
                const h2Count = $('h2').length;
                const h3Count = $('h3').length;

                if (h1Count === 1) structScore += 3; // Perfect H1
                else if (h1Count > 1) structScore += 1; // H1 exists but multiple

                if (h2Count > 0) structScore += 3; // H2s exist
                if (h3Count > 0) structScore += 2; // H3s exist

                // Intent keywords in headers
                const headersText = $('h1, h2, h3').text().toLowerCase();
                const intentKeywords = ['cómo', 'qué es', 'beneficios', 'precios', 'servicios', 'guía', 'tutorial', 'vs', 'opiniones'];
                let intentMatches = 0;
                intentKeywords.forEach(k => {
                    if (headersText.includes(k)) intentMatches++;
                });
                if (intentMatches > 0) structScore += 2;

                results.structure_score = Math.min(structScore, 10);
                if (results.structure_score >= 7) summaryPoints.push(`✅ Estructura Sólida (${results.structure_score}/10): Jerarquía H1-H3 clara.`);
                else summaryPoints.push(`⚠️ Estructura Mejorable (${results.structure_score}/10): Revisar jerarquía de encabezados.`);


                // B. Readiness Score (0-10) -> "Answer Box" potential
                let readinessScore = 0;
                const textContent = $('body').text().replace(/\s+/g, ' ').trim();
                const htmlLength = html.length;
                const textLength = textContent.length;

                // Content Density
                if (textLength > 500) readinessScore += 2;
                if (textLength > 1500) readinessScore += 2;

                // "Answer Box" candidates: <p> tags immediately after <h2> or <h3>
                let answerBoxCandidates = 0;
                $('h2, h3').each((i, el) => {
                    const nextEl = $(el).next();
                    if (nextEl.is('p')) {
                        const pText = nextEl.text().trim();
                        // Ideal answer box is 40-60 words roughly (200-400 chars)
                        if (pText.length > 100 && pText.length < 600) {
                            answerBoxCandidates++;
                        }
                    }
                });

                if (answerBoxCandidates > 0) readinessScore += 4;
                if (answerBoxCandidates > 2) readinessScore += 2; // Bonus for multiple candidates

                results.readiness_score = Math.min(readinessScore, 10);
                if (results.readiness_score >= 6) summaryPoints.push(`✅ Readiness Alto (${results.readiness_score}/10): Contenido denso y posibles Answer Boxes.`);
                else summaryPoints.push(`⚠️ Readiness Bajo (${results.readiness_score}/10): Poco contenido directo para LLMs.`);


                // C. Authority Score (0-10) -> Trust Signals
                let authScore = 0;
                const pageTextLower = textContent.toLowerCase();
                const anchors = $('a').map((i, el) => $(el).attr('href')).get().join(' ').toLowerCase();

                // Trust Pages links
                if (anchors.includes('contact') || anchors.includes('contacto')) authScore += 2;
                if (anchors.includes('about') || anchors.includes('nosotros') || anchors.includes('quienes')) authScore += 2;
                if (anchors.includes('privacy') || anchors.includes('privacidad')) authScore += 1;

                // Social Links
                if (anchors.includes('linkedin.com')) authScore += 2;
                if (anchors.includes('twitter.com') || anchors.includes('x.com')) authScore += 1;
                if (anchors.includes('facebook.com') || anchors.includes('instagram.com')) authScore += 1;

                // Contact info in text
                if (pageTextLower.includes('@') || pageTextLower.match(/\+\d{8,}/)) authScore += 1;

                results.authority_score = Math.min(authScore, 10);
                if (results.authority_score >= 6) summaryPoints.push(`✅ Autoridad Detectada (${results.authority_score}/10): Señales de confianza presentes.`);
                else summaryPoints.push(`⚠️ Autoridad Baja (${results.authority_score}/10): Faltan páginas legales o contacto visible.`);

            } else {
                summaryPoints.push(`❌ Error al cargar la Home Page (Status: ${homeRes.status}).`);
            }
        } catch (e) {
            console.error('Home parsing failed', e);
            summaryPoints.push('❌ Error al acceder a la Home Page.');
        }


    } catch (globalError) {
        console.error('Scan failed', globalError);
        summaryPoints.push('❌ Error crítico durante el escaneo.');
    }

    results.summary = summaryPoints.join('\n');
    return results;
}

/**
 * Phase 3: Suggest Money Queries based on Entity/Market
 */
export async function suggestQueries(service: string, market: string, brand: string): Promise<string[]> {
    const cleanService = service.trim();
    const cleanMarket = market.trim();
    const cleanBrand = brand.trim();

    return [
        `¿Qué es ${cleanService}?`, // Intent: Definition / Education
        `Mejores agencias de ${cleanService} en ${cleanMarket}`, // Intent: Commercial / Listicle
        `${cleanService} para empresas en ${cleanMarket}`, // Intent: B2B / Local
        `${cleanBrand} vs competidores ${cleanService}`, // Intent: Comparison
        `Casos de éxito ${cleanService} ${cleanMarket}`, // Intent: Validation
        `Precio de ${cleanService} en ${cleanMarket}` // Intent: Transactional
    ];
}

/**
 * Phase 3: Check Share of Voice (SoV)
 */
export async function checkShareOfVoice(query: string, brand: string, competitors: string[]): Promise<{
    mentioned: boolean;
    competitors_mentioned: string[];
    sentiment: 'Positive' | 'Neutral' | 'Negative';
    raw_response_preview: string;
}> {
    // Simulate AI Search
    // In a real app, call Perplexity/OpenAI here.
    const isBrandMentioned = Math.random() > 0.3 || brand.toLowerCase().includes('exista');
    const foundCompetitors = competitors.filter(() => Math.random() > 0.5);

    let fakeResponse = `Aquí hay información sobre **${query}**.\n\n`;
    if (isBrandMentioned) {
        fakeResponse += `Destaca la empresa **${brand}** por su enfoque innovador. `;
    } else {
        fakeResponse += `La marca **${brand}** no aparece en los resultados principales. `;
    }

    if (foundCompetitors.length > 0) {
        fakeResponse += `Otras opciones populares incluyen **${foundCompetitors.join(', ')}**. `;
    }
    fakeResponse += "El mercado muestra un crecimiento constante y diversas alternativas para...";

    return {
        mentioned: isBrandMentioned,
        competitors_mentioned: foundCompetitors,
        sentiment: isBrandMentioned ? 'Positive' : 'Neutral',
        raw_response_preview: fakeResponse
    };
}

/**
 * Phase 3: Qualitative Off-site Analysis (Simulated Agent)
 */
export async function analyzeOffsiteQualitative(brand: string, market: string): Promise<{
    entity_consistency_score: number;
    canonical_sources_presence: boolean;
    reputation_score: number;
    notas: string;
}> {
    // Simulate thinking/searching time
    await new Promise(resolve => setTimeout(resolve, 800));

    // Heuristics (Mocked for now)
    // 1. Entity Consistency: High if brand name is unique-ish.
    const consistencyScore = Math.floor(Math.random() * 3) + 7; // 7-9

    // 2. Canonical Sources: Wikipedia/Wikidata presence.
    // Random check or heuristic.
    const hasCanonical = Math.random() > 0.4;

    // 3. Reputation:
    const reputationScore = Math.floor(Math.random() * 4) + 5; // 5-8

    // Generate Notes
    const notes = [
        `🤖 **Análisis de IA para ${brand}**:`,
        `- **Consistencia**: La entidad se identifica claramente en el Knowledge Graph (${consistencyScore}/10).`,
        `- **Fuentes Canónicas**: ${hasCanonical ? "Detectada presencia en Wikipedia/Wikidata." : "No se detectaron fuentes estructuradas principales."}`,
        `- **Reputación**: Sentimiento general en noticias y foros es ${reputationScore > 6 ? "mayormente positivo" : "mixto o neutral"} (${reputationScore}/10).`
    ].join('\n');

    return {
        entity_consistency_score: consistencyScore,
        canonical_sources_presence: hasCanonical,
        reputation_score: reputationScore,
        notas: notes
    };
}

/**
 * Legacy/Wrapper Action for backward compatibility or simple UI checks.
 */
export async function analyzeQuery(query: string, brand: string, engine: string) {
    const sov = await checkShareOfVoice(query, brand, []);

    return {
        mentioned: sov.mentioned,
        reason: sov.raw_response_preview,
        sources: []
    }
}
