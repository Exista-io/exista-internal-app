'use server'

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
