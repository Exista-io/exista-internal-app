
export interface OnSiteData {
    robots_ok: boolean;
    sitemap_ok: boolean;
    schema_type: string | null;
    canonical_ok: boolean; // Not in original request but mentioned in Schema
    answer_box_score: number; // 0-10
}

export interface OffSiteData {
    queries: {
        engine: string;
        mentioned: boolean;
    }[];
}

/**
 * Calculates the EVS v1.0 Score
 * Weighted 50% On-site / 50% Off-site
 */
export function calculateEVSScore(onSite: OnSiteData, offSite: OffSiteData): {
    total: number;
    onSiteScore: number;
    offSiteScore: number;
} {
    // --- On-site Calculation (Max 50 points) ---
    // User Request:
    // "Sumá puntos por Robots.txt, Sitemap y validación de Schema."
    // "El 'Readiness Score (0-10)' debe ponderarse para llegar a los 25 puntos restantes."

    // 1. Binaries (Robots, Sitemap, Schema): 25 points total.
    //    ~8.33 points each.
    const BINARY_WEIGHT = 25 / 3;

    let onSiteRaw = 0;
    if (onSite.robots_ok) onSiteRaw += BINARY_WEIGHT;
    if (onSite.sitemap_ok) onSiteRaw += BINARY_WEIGHT;
    if (onSite.schema_type && onSite.schema_type.length > 0) onSiteRaw += BINARY_WEIGHT;

    // 2. Answer Box Readiness (0-10 scale): 25 points max.
    //    Score 0-10 -> 0-25 pts (Multiply by 2.5)
    const answerBoxPoints = (onSite.answer_box_score || 0) * 2.5;
    onSiteRaw += answerBoxPoints;

    // Cap at 50 just in case
    const onSiteScore = Math.min(Math.round(onSiteRaw), 50);


    // --- Off-site Calculation (Max 50 points) ---
    // "Por cada 'Money Query', si la marca es mencionada y está en el 'Top Bucket', suma puntaje proporcional."
    // Logic: Percentage of "mentioned" queries vs total queries checked * 50.

    let offSiteScore = 0;
    if (offSite.queries.length > 0) {
        const totalChecks = offSite.queries.length;
        const mentions = offSite.queries.filter(q => q.mentioned).length;
        const ratio = mentions / totalChecks;
        offSiteScore = Math.round(ratio * 50);
    }

    const total = onSiteScore + offSiteScore;

    return {
        total,
        onSiteScore,
        offSiteScore
    };
}
