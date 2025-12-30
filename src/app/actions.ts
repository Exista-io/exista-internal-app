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
export async function scanWebsite(domain: string): Promise<ScanResult> {
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


        // 4. Parse Homepage HTML (Canonical & Schema)
        try {
            const homeRes = await fetch(url, { next: { revalidate: 0 } });
            if (homeRes.ok) {
                const html = await homeRes.text();
                const $ = cheerio.load(html);

                // Canonical
                const canonical = $('link[rel="canonical"]').attr('href');
                if (canonical) {
                    results.canonical_ok = true;
                    // summaryPoints.push(`✅ Canonical tag presente: ${canonical}`);
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
 * Server Action to simulate/perform AI analysis for a query.
 * In a real scenario, this would call Perplexity or OpenAI API.
 */
export async function analyzeQuery(query: string, brand: string, engine: string) {
    // Simulate network delay (1-2 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock Logic:
    // If the brand is "Test Company" or if the query contains "bueno", it's mentioned.
    // Otherwise it's random-ish but deterministic for demo purposes.

    // Simple deterministic mock based on string length to seem "real" but consistent
    const isMockMentioned = brand.toLowerCase().includes('test') || query.length % 2 === 0;

    return {
        mentioned: isMockMentioned,
        reason: isMockMentioned
            ? `La marca "${brand}" aparece en los resultados de ${engine} como una de las opciones recomendadas.`
            : `La marca "${brand}" no fue mencionada en los primeros resultados de ${engine}.`
    }
}
