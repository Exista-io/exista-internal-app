'use client'

import { Info } from 'lucide-react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

// EVS Glosario - Definiciones del EVS Methodology v1.0
export const EVS_GLOSARIO = {
    // On-site variables
    robots_ok: "Archivo robots.txt accesible y configurado para permitir crawling de bots de IA (GPTBot, ClaudeBot, etc).",
    sitemap_ok: "Sitemap XML accesible, sin errores de formato, con URLs canónicas de páginas clave.",
    canonical_ok: "URL canónica consistente en cada página, sin duplicados que dispersen señales.",
    llms_txt_present: "Archivo llms.txt para ayudar a motores de IA a priorizar contenido (formato emergente).",
    schema_type: "Schema.org markup (JSON-LD) para clarificar qué es la empresa, qué ofrece (Organization, Service, FAQ).",
    answer_box_score: "Citabilidad: Respuestas directas (2-4 líneas) que pueden ser citadas literalmente por IAs.",
    h1_h2_structure_score: "Jerarquía H1→H2→H3 lógica con subtítulos que responden intenciones reales.",
    authority_signals_score: "Señales E-E-A-T: autoría clara, fuentes y referencias, política editorial.",
    readiness_score: "Capacidad general del sitio para ser encontrado y citado por IAs.",
    structure_score: "Estructura del contenido para ser entendido y procesado por IAs.",
    authority_score: "Señales de autoridad y confiabilidad del contenido.",

    // Off-site variables
    entity_consistency_score: "Tu marca como concepto único: nombre/branding consistente, perfiles oficiales, datos estructurados.",
    canonical_sources_presence: "Presencia en fuentes canónicas: Wikipedia/Wikidata, directorios de industria, repos oficiales.",
    reputation_score: "Sentimiento/reputación en menciones, reviews y earned media encontrados.",
    sov_score: "Share of Voice: % de queries donde tu marca aparece vs. competidores en IAs.",

    // Query/Engine variables
    money_queries: "Consultas con intención comercial: 'mejores X', 'alternativas a Y', 'precio de Z'.",
    bucket_top_answer: "La marca es la recomendación principal o primera mencionada.",
    bucket_mentioned: "La marca aparece en una lista o comparación.",
    bucket_cited: "La marca es mencionada con URL de fuente.",
    bucket_not_found: "La marca no aparece en la respuesta.",
} as const

interface HelpTooltipProps {
    term: keyof typeof EVS_GLOSARIO
    className?: string
}

export function HelpTooltip({ term, className = '' }: HelpTooltipProps) {
    const definition = EVS_GLOSARIO[term]

    if (!definition) return null

    return (
        <TooltipProvider>
            <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                    <Info className={`h-3.5 w-3.5 text-muted-foreground cursor-help inline-block ml-1 ${className}`} />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                    <p>{definition}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

// Simple inline help without icon for use in labels
export function HelpLabel({
    children,
    term
}: {
    children: React.ReactNode
    term: keyof typeof EVS_GLOSARIO
}) {
    return (
        <span className="flex items-center gap-1">
            {children}
            <HelpTooltip term={term} />
        </span>
    )
}
