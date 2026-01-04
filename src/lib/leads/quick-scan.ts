'use server'

/**
 * Quick Scan - Fast HTTP-only pre-qualification
 * Runs in 2-3 seconds without AI, just HTTP requests
 */

export interface QuickScanResult {
    domain: string;
    robots_ok: boolean;
    sitemap_ok: boolean;
    schema_ok: boolean;
    llms_txt_ok: boolean;
    canonical_ok: boolean;
    blocks_gptbot: boolean;
    bot_blocked: boolean;  // Site blocks server requests (403/503)
    quick_score: number;
    quick_issues: string[];
    scan_duration_ms: number;
    error?: string;
}

/**
 * Perform a quick scan on a domain to check for common AI-visibility issues
 * This is HTTP-only, no AI calls, meant to be fast and cheap
 */
export async function quickScanDomain(rawDomain: string): Promise<QuickScanResult> {
    const startTime = Date.now();
    const issues: string[] = [];

    // Normalize domain
    let domain = rawDomain.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    let url = `https://${domain}`;

    try {
        // Parallel checks for speed
        const [robotsCheck, sitemapCheck, llmsCheck, homeCheck] = await Promise.allSettled([
            fetchWithTimeout(`${url}/robots.txt`, 5000),
            fetchWithTimeout(`${url}/sitemap.xml`, 5000, 'HEAD'),
            fetchWithTimeout(`${url}/llms.txt`, 5000, 'HEAD'),
            fetchWithTimeout(url, 8000),
        ]);

        // Check if site is blocking bot requests (403/503)
        let bot_blocked = false;
        if (homeCheck.status === 'fulfilled') {
            const status = homeCheck.value.status;
            if (status === 403 || status === 503) {
                bot_blocked = true;
                issues.push('🛡️ Sitio bloquea requests de servidor (anti-bot)');
            }
        }

        // 1. robots.txt check
        let robots_ok = false;
        let blocks_gptbot = false;
        if (robotsCheck.status === 'fulfilled' && robotsCheck.value.ok) {
            robots_ok = true;
            const robotsText = await robotsCheck.value.text();

            // Check if GPTBot is blocked
            const lowerText = robotsText.toLowerCase();
            if (lowerText.includes('user-agent: gptbot') || lowerText.includes('user-agent: chatgpt')) {
                // Check if there's a disallow after the user-agent
                const lines = robotsText.split('\n');
                let inGptBotBlock = false;
                for (const line of lines) {
                    const trimmed = line.trim().toLowerCase();
                    if (trimmed.startsWith('user-agent:') && (trimmed.includes('gptbot') || trimmed.includes('chatgpt'))) {
                        inGptBotBlock = true;
                    } else if (trimmed.startsWith('user-agent:')) {
                        inGptBotBlock = false;
                    } else if (inGptBotBlock && trimmed.startsWith('disallow:') && (trimmed.includes('/') || trimmed === 'disallow: /')) {
                        blocks_gptbot = true;
                        break;
                    }
                }

                // Also check for blanket block
                if (lowerText.includes('user-agent: *') && lowerText.includes('disallow: /')) {
                    // Check if it's a complete block
                    if (!lowerText.includes('allow:')) {
                        blocks_gptbot = true;
                    }
                }
            }

            if (blocks_gptbot) {
                issues.push('🚫 Bloquea GPTBot en robots.txt');
            }
        } else {
            issues.push('⚠️ robots.txt no accesible');
        }

        // 2. sitemap.xml check
        const sitemap_ok = sitemapCheck.status === 'fulfilled' && sitemapCheck.value.ok;
        if (!sitemap_ok) {
            issues.push('❌ No tiene sitemap.xml');
        }

        // 3. llms.txt check
        const llms_txt_ok = llmsCheck.status === 'fulfilled' && llmsCheck.value.ok;
        if (!llms_txt_ok) {
            issues.push('❌ No tiene llms.txt');
        }

        // 4. HTML parsing for schema and canonical
        let schema_ok = false;
        let canonical_ok = false;

        if (homeCheck.status === 'fulfilled' && homeCheck.value.ok) {
            const html = await homeCheck.value.text();

            // Check for Schema.org (JSON-LD)
            schema_ok = html.includes('application/ld+json');
            if (!schema_ok) {
                issues.push('❌ No tiene Schema.org (JSON-LD)');
            }

            // Check for canonical
            canonical_ok = html.includes('rel="canonical"') || html.includes("rel='canonical'");
            if (!canonical_ok) {
                issues.push('⚠️ No tiene canonical URL');
            }
        } else {
            issues.push('❌ No se pudo cargar la página principal');
        }

        // Calculate Quick Score
        // Note: Lower score = MORE problems = HOTTER lead
        // If bot_blocked, we can't accurately assess, so give neutral score
        const quick_score = bot_blocked ? -1 :
            (robots_ok && !blocks_gptbot ? 20 : 0) +
            (sitemap_ok ? 20 : 0) +
            (schema_ok ? 20 : 0) +
            (llms_txt_ok ? 20 : 0) +
            (canonical_ok ? 20 : 0);

        return {
            domain,
            robots_ok: robots_ok && !blocks_gptbot,
            sitemap_ok,
            schema_ok,
            llms_txt_ok,
            canonical_ok,
            blocks_gptbot,
            bot_blocked,
            quick_score,
            quick_issues: issues,
            scan_duration_ms: Date.now() - startTime,
        };

    } catch (error) {
        return {
            domain,
            robots_ok: false,
            sitemap_ok: false,
            schema_ok: false,
            llms_txt_ok: false,
            canonical_ok: false,
            blocks_gptbot: false,
            bot_blocked: false,
            quick_score: 0,
            quick_issues: ['❌ Error durante el scan'],
            scan_duration_ms: Date.now() - startTime,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Fetch with timeout helper
 */
async function fetchWithTimeout(
    url: string,
    timeout: number,
    method: 'GET' | 'HEAD' = 'GET'
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            method,
            signal: controller.signal,
            headers: {
                // Use a realistic browser User-Agent to avoid bot detection
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            redirect: 'follow',
        });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Bulk scan multiple domains
 */
export async function bulkQuickScan(domains: string[]): Promise<QuickScanResult[]> {
    // Limit concurrent scans to avoid overwhelming servers
    const BATCH_SIZE = 10;
    const results: QuickScanResult[] = [];

    for (let i = 0; i < domains.length; i += BATCH_SIZE) {
        const batch = domains.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(domain => quickScanDomain(domain))
        );
        results.push(...batchResults);
    }

    return results;
}
