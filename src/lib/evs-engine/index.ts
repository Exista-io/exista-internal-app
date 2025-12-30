
export interface OnSiteData {
    robots_ok: boolean;
    sitemap_ok: boolean;
    schema_type: string | null;
    canonical_ok: boolean;
    llms_txt_present: boolean;       // New Phase 1
    answer_box_score: number;        // 0-10 (Readiness)
    h1_h2_structure_score: number;   // 0-10 (New Phase 1)
    authority_signals_score: number; // 0-10 (New Phase 1)
}

export interface OffSiteData {
    queries: {
        engine: string;
        mentioned: boolean;
    }[];
}

/**
 * Calculates the EVS v1.0 Score (Phase 1 Expansion)
 * Weighted 50% On-site / 50% Off-site
 */
export function calculateEVSScore(onSite: OnSiteData, offSite: OffSiteData): {
    total: number;
    onSiteScore: number;
    offSiteScore: number;
} {
    // --- On-site Calculation (Max 50 points) ---
    // Methodology Update Phase 1:
    // A. Binary Factors (Total 25 pts -> 5 pts each)
    //    1. Robots.txt
    //    2. Sitemap
    //    3. Schema
    //    4. Canonical
    //    5. llms.txt

    const BINARY_ITEM_VALUE = 5;
    let onSiteRaw = 0;

    if (onSite.robots_ok) onSiteRaw += BINARY_ITEM_VALUE;
    if (onSite.sitemap_ok) onSiteRaw += BINARY_ITEM_VALUE;
    if (onSite.schema_type && onSite.schema_type.length > 0) onSiteRaw += BINARY_ITEM_VALUE;
    if (onSite.canonical_ok) onSiteRaw += BINARY_ITEM_VALUE;
    if (onSite.llms_txt_present) onSiteRaw += BINARY_ITEM_VALUE;

    // B. Scale Factors (Total 25 pts / 3 items = ~8.33 pts each)
    //    1. Readiness (Answer Box) (0-10)
    //    2. Structure (H1/H2) (0-10)
    //    3. Authority Signals (0-10)

    // Each 0-10 score contributes to a max of 8.333... points.
    // Factor = 25 / 30 = 0.8333...

    const SCALE_FACTOR = 25 / 30; // approx 0.8333

    const readinessPoints = (onSite.answer_box_score || 0) * SCALE_FACTOR;
    const structurePoints = (onSite.h1_h2_structure_score || 0) * SCALE_FACTOR;
    const authorityPoints = (onSite.authority_signals_score || 0) * SCALE_FACTOR;

    onSiteRaw += readinessPoints + structurePoints + authorityPoints;

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
