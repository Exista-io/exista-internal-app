// Service Type Limits Configuration
// Separated from actions.ts to avoid 'use server' restrictions

export type AuditType = 'mini' | 'full' | 'retainer';
export type AIEngine = 'ChatGPT' | 'Claude' | 'Gemini' | 'Perplexity';

export const SERVICE_LIMITS = {
    mini: {
        maxQueries: 5,
        engines: ['ChatGPT', 'Gemini'] as AIEngine[],
        recommendations: 3,
        includeMethodology: false,
        includeQueryDetail: false,
        includeGapAnalysis: false
    },
    full: {
        maxQueries: 20,
        engines: ['ChatGPT', 'Claude', 'Gemini', 'Perplexity'] as AIEngine[],
        recommendations: 5,
        includeMethodology: true,
        includeQueryDetail: true,
        includeGapAnalysis: true
    },
    retainer: {
        maxQueries: 15,
        engines: ['ChatGPT', 'Claude', 'Gemini', 'Perplexity'] as AIEngine[],
        recommendations: 5,
        includeMethodology: true,
        includeQueryDetail: true,
        includeGapAnalysis: true,
        includeDeltaComparison: true
    }
} as const;
