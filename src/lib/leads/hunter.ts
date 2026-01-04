'use server'

/**
 * Hunter.io API Integration
 * Free tier: 50 requests/month
 */

export interface HunterEmail {
    value: string;
    type: 'personal' | 'generic';
    confidence: number;
    first_name: string | null;
    last_name: string | null;
    position: string | null;
    seniority: string | null;
    department: string | null;
    linkedin: string | null;
    twitter: string | null;
    phone_number: string | null;
    verification: {
        date: string;
        status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown';
    } | null;
}

export interface HunterDomainSearchResult {
    domain: string;
    organization: string | null;
    pattern: string | null;
    emails: HunterEmail[];
    error?: string;
}

const HUNTER_API_KEY = process.env.HUNTER_API_KEY;

/**
 * Search for emails associated with a domain using Hunter.io
 * This consumes 1 credit per call (50/month free)
 */
export async function hunterDomainSearch(domain: string): Promise<HunterDomainSearchResult> {
    if (!HUNTER_API_KEY) {
        return {
            domain,
            organization: null,
            pattern: null,
            emails: [],
            error: 'HUNTER_API_KEY not configured'
        };
    }

    try {
        const response = await fetch(
            `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return {
                domain,
                organization: null,
                pattern: null,
                emails: [],
                error: errorData.errors?.[0]?.details || `HTTP ${response.status}`
            };
        }

        const data = await response.json();

        return {
            domain: data.data.domain,
            organization: data.data.organization,
            pattern: data.data.pattern,
            emails: data.data.emails || [],
        };
    } catch (error) {
        return {
            domain,
            organization: null,
            pattern: null,
            emails: [],
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get the best contact from Hunter results (internal use only)
 * Prioritizes by seniority and confidence
 */
function getBestContact(result: HunterDomainSearchResult): HunterEmail | null {
    if (!result.emails || result.emails.length === 0) return null;

    // Priority order for seniority
    const seniorityOrder = ['c_suite', 'executive', 'vp', 'director', 'manager', 'senior', 'entry'];

    // Priority order for department (marketing/sales first for our use case)
    const departmentOrder = ['marketing', 'executive', 'sales', 'management', 'communication'];

    // Sort by seniority, then department, then confidence
    const sorted = [...result.emails]
        .filter(e => e.verification?.status === 'valid' || e.confidence >= 80)
        .sort((a, b) => {
            // First by seniority
            const aSeniority = seniorityOrder.indexOf(a.seniority || '') !== -1
                ? seniorityOrder.indexOf(a.seniority || '')
                : 999;
            const bSeniority = seniorityOrder.indexOf(b.seniority || '') !== -1
                ? seniorityOrder.indexOf(b.seniority || '')
                : 999;

            if (aSeniority !== bSeniority) return aSeniority - bSeniority;

            // Then by department
            const aDept = departmentOrder.indexOf(a.department || '') !== -1
                ? departmentOrder.indexOf(a.department || '')
                : 999;
            const bDept = departmentOrder.indexOf(b.department || '') !== -1
                ? departmentOrder.indexOf(b.department || '')
                : 999;

            if (aDept !== bDept) return aDept - bDept;

            // Finally by confidence
            return b.confidence - a.confidence;
        });

    return sorted[0] || null;
}

/**
 * Check remaining Hunter.io credits
 */
export async function getHunterAccountInfo(): Promise<{
    available: boolean;
    remaining?: number;
    used?: number;
    error?: string;
}> {
    if (!HUNTER_API_KEY) {
        return { available: false, error: 'HUNTER_API_KEY not configured' };
    }

    try {
        const response = await fetch(
            `https://api.hunter.io/v2/account?api_key=${HUNTER_API_KEY}`,
            { method: 'GET' }
        );

        if (!response.ok) {
            return { available: false, error: `HTTP ${response.status}` };
        }

        const data = await response.json();
        const requests = data.data.requests;

        return {
            available: true,
            remaining: requests.searches.available - requests.searches.used,
            used: requests.searches.used,
        };
    } catch (error) {
        return { available: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
