'use client'

import { useRef, useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Client, Audit } from '@/types/database'
import { calculateEVSScore } from '@/lib/evs-engine'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, ArrowLeft, Save, Loader2, Sparkles, Bot, FileText, Download, X } from 'lucide-react'
import { toast } from 'sonner'
import { analyzeQuery, scanWebsite, suggestQueries, checkShareOfVoice, analyzeOffsiteQualitative, checkAllEngines, LLMCheckResult, AIEngine, detectIndustry, generateAuditReport, AuditReportData } from '@/app/actions'
import { Switch } from '@/components/ui/switch'
import { HelpTooltip } from '@/components/evs/help-tooltip'
import { EVSEvolution } from '@/components/evs/evs-evolution'

// Helper type for Offsite Query UI
type QueryUI = {
    id?: string
    query_text: string
    engine: string
    mentioned: boolean
    status: 'pending' | 'checking' | 'done'
    competitors_mentioned?: string[]
    sentiment?: string
    // EVS v2.0: Multi-engine results
    engineResults?: LLMCheckResult[]
    raw_response?: string
}

export default function ClientDetailPage() {
    const params = useParams()
    // Handle potential string[] case for id (though unusual in this route config)
    const id = Array.isArray(params?.id) ? params.id[0] : params?.id


    const router = useRouter()

    const [client, setClient] = useState<Client | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [lastAudit, setLastAudit] = useState<Audit | null>(null)
    const [allAudits, setAllAudits] = useState<Audit[]>([])

    // Report Generation State
    const [generatingReport, setGeneratingReport] = useState(false)
    const [reportData, setReportData] = useState<AuditReportData | null>(null)
    const [reportMarkdown, setReportMarkdown] = useState<string>('')
    const [showReportModal, setShowReportModal] = useState(false)

    const [scanning, setScanning] = useState(false)
    const [auditType, setAuditType] = useState<'mini' | 'full' | 'retainer'>('full')
    const [onSite, setOnSite] = useState({
        robots_ok: false,
        sitemap_ok: false,
        schema_type: '',
        canonical_ok: false,
        llms_txt_present: false,
        answer_box_score: 0,        // Readiness 0-10
        h1_h2_structure_score: 0,   // Structure 0-10
        authority_signals_score: 0, // Authority 0-10
        // EVS v3.0: Evidence per variable
        readiness_evidence: '',
        structure_evidence: '',
        authority_evidence: '',
        notas: ''
    })

    // Offsite State (Phase 3 Expansion)
    const [offSiteResult, setOffSiteResult] = useState({
        entity_consistency_score: 0, // 0-10
        canonical_sources_presence: false,
        reputation_score: 0, // 0-10
        sov_score: 0, // Calculated 0-100
        notas: ''
    })

    const [offsiteQueries, setOffsiteQueries] = useState<QueryUI[]>([])
    const [suggesting, setSuggesting] = useState(false) // Phase 3 loading state

    // Real-time EVS Calculation removed from here, moved to body to include new offsite logic overrides


    useEffect(() => {
        fetchClientData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Remove id dependency to avoid infinite loop if simple mount. id is stable from params.

    const fetchClientData = async () => {
        if (!id || Array.isArray(id)) return // Handle undefined or array case

        setLoading(true)
        // Fetch Client
        const { data: clientData, error: clientError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', id)
            .single()

        if (clientError) {
            console.error('Error fetching client:', clientError)
        } else {
            console.log("Client fetched", clientData)
            setClient(clientData)
        }

        // Fetch All Audits for history display
        const { data: auditData } = await supabase
            .from('audits')
            .select('*')
            .eq('client_id', id)
            .order('fecha', { ascending: false })

        if (auditData && auditData.length > 0) {
            setAllAudits(auditData)
            setLastAudit(auditData[0]) // First one is most recent
        }

        setLoading(false)
    }

    const handleAddQuery = () => {
        setOffsiteQueries([
            ...offsiteQueries,
            { id: Math.random().toString(36), query_text: '', engine: 'ChatGPT', mentioned: false, status: 'pending' }
        ])
    }

    const handleRemoveQuery = (index: number) => {
        const newQueries = [...offsiteQueries]
        newQueries.splice(index, 1)
        setOffsiteQueries(newQueries)
    }

    const updateQuery = (index: number, field: keyof QueryUI, value: string | boolean | string[]) => {
        setOffsiteQueries(prev => {
            const newQueries = [...prev];
            if (!newQueries[index]) return prev;
            // @ts-ignore dynamic field access
            newQueries[index] = { ...newQueries[index], [field]: value };
            return newQueries;
        });
    }

    const [analyzingIndex, setAnalyzingIndex] = useState<number | null>(null)

    const handleScanSite = async () => {
        if (!client || !client.dominio) {
            toast.error("El cliente no tiene un dominio configurado.");
            return;
        }

        setScanning(true);
        try {
            const results = await scanWebsite(client.dominio);

            setOnSite(prev => ({
                ...prev,
                robots_ok: results.robots_ok,
                sitemap_ok: results.sitemap_ok,
                llms_txt_present: results.llms_txt_present,
                canonical_ok: results.canonical_ok,
                schema_type: results.schema_ok ? (prev.schema_type || "JSON-LD Detectado") : prev.schema_type,

                // EVS v3.0 Scores with Evidence
                answer_box_score: results.readiness_score,
                h1_h2_structure_score: results.structure_score,
                authority_signals_score: results.authority_score,
                readiness_evidence: results.readiness_evidence || '',
                structure_evidence: results.structure_evidence || '',
                authority_evidence: results.authority_evidence || '',

                notas: results.notas || results.summary
            }));

            toast.success("Escaneo completado. Verificá los resultados.");
        } catch (error) {
            console.error("Scan error:", error);
            toast.error("Error al escanear el sitio.");
        } finally {
            setScanning(false);
        }
    }

    const handleAutoCheck = async (index: number) => {
        if (!client) return
        const query = offsiteQueries[index]
        if (!query.query_text) return

        setAnalyzingIndex(index)
        try {
            // EVS v2.0: Query all 4 engines in parallel
            const results = await checkAllEngines(query.query_text, client.nombre, client.competidores || [])

            // Check if ANY engine found the brand
            const anyMentioned = results.some(r => r.is_mentioned)

            // Find the best result (Top Answer > Mentioned > Cited > Not Found)
            const bucketPriority = { 'Top Answer': 3, 'Mentioned': 2, 'Cited': 1, 'Not Found': 0 }
            const bestResult = results.reduce((best, current) =>
                (bucketPriority[current.bucket] > bucketPriority[best.bucket]) ? current : best
                , results[0])

            // Aggregate competitors found across ALL engines
            const allCompetitorsMentioned = results
                .flatMap(r => r.competitors_mentioned || [])
                .filter((c, i, arr) => arr.indexOf(c) === i); // Remove duplicates

            // Update query with multi-engine results
            setOffsiteQueries(prev => {
                const newQueries = [...prev]
                newQueries[index] = {
                    ...newQueries[index],
                    mentioned: anyMentioned,
                    sentiment: bestResult.sentiment,
                    engineResults: results,
                    raw_response: bestResult.raw_response?.substring(0, 500) + '...',
                    competitors_mentioned: allCompetitorsMentioned // NEW: Save competitors from all engines
                }
                return newQueries
            })

            // Log all engine results
            console.log('EVS v2.0 Multi-Engine Results:', results.map(r => `${r.engine}: ${r.bucket}`))
            toast.success(`Revisado en 4 motores: ${results.filter(r => r.is_mentioned).length}/4 detectaron la marca`)
        } catch (error) {
            console.error('Multi-Engine Check failed:', error)
            toast.error('Error al consultar los motores de IA')
        } finally {
            setAnalyzingIndex(null)
        }
    }

    // EVS v3.0: Off-site Analysis Handler with Industry Detection
    const handleOffsiteAnalysis = async () => {
        if (!client) return;
        setSuggesting(true);
        try {
            // 1. Detect Industry from domain (AI-powered)
            toast.info('Detectando industria del sitio...');
            const industryData = await detectIndustry(client.dominio);

            console.log('[EVS v3.0] Industry Detection:', industryData);

            // Use detected industry or fallback
            const industria = industryData.industria !== 'Desconocida'
                ? industryData.industria
                : (client.mercado || 'Servicios');

            // Merge detected competitors with client-defined ones
            const allCompetidores = [
                ...(client.competidores || []),
                ...industryData.competidores_sugeridos.filter(c =>
                    !(client.competidores || []).includes(c)
                )
            ].slice(0, 5);

            // 2. Generate Money Queries with full context
            toast.info(`Generando Money Queries para ${industria}...`);
            const suggestions = await suggestQueries(
                industria,
                'Argentina',
                client.nombre,
                allCompetidores,
                industryData.productos
            );

            const newQueries: QueryUI[] = suggestions.map(q => ({
                query_text: q,
                engine: 'ChatGPT', // Default
                mentioned: false,
                status: 'pending'
            }));

            setOffsiteQueries(prev => {
                const existingTexts = new Set(prev.map(p => p.query_text));
                const uniqueNew = newQueries.filter(n => !existingTexts.has(n.query_text));
                return [...prev, ...uniqueNew];
            });

            // 3. Run Qualitative Analysis (Auto-fill)
            const qualResults = await analyzeOffsiteQualitative(client.nombre, industria);

            setOffSiteResult(prev => ({
                ...prev,
                entity_consistency_score: qualResults.entity_consistency_score,
                canonical_sources_presence: qualResults.canonical_sources_presence,
                reputation_score: qualResults.reputation_score,
                notas: `Industria detectada: ${industria}\n${industryData.descripcion}\n\n${qualResults.notas}`
            }));

            toast.success(`Análisis Off-site Completo. Industria: ${industria}`);
        } catch (error) {
            console.error(error);
            toast.error("Error al realizar el análisis off-site.");
        } finally {
            setSuggesting(false);
        }
    }

    // Phase 3: Suggest Queries Handler
    const handleSuggestQueries = async () => {
        if (!client) return;
        setSuggesting(true);
        try {
            const suggestions = await suggestQueries(
                client.mercado || "Servicios", // Service/Product proxy
                "Argentina", // Market proxy (should be client.mercado if it was Country/Region)
                client.nombre
            );

            const newQueries: QueryUI[] = suggestions.map(q => ({
                query_text: q,
                engine: 'ChatGPT', // Default
                mentioned: false,
                status: 'pending'
            }));

            setOffsiteQueries(prev => [...prev, ...newQueries]);
            toast.success(`Se agregaron ${suggestions.length} queries sugeridas.`);
        } catch (error) {
            console.error(error);
            toast.error("Error al sugerir queries.");
        } finally {
            setSuggesting(false);
        }
    }

    const resultEvs = calculateEVSScore(onSite, { queries: offsiteQueries.filter(q => q.query_text.trim() !== '') })
    const { total, onSiteScore } = resultEvs

    // User Instructions: "El offSiteScore (50 pts) debe calcularse ahora combinando: 25 pts por el Share of Voice relativo y 25 pts por los pilares cualitativos"
    // We override the engine's offsite score with the new logic here for the View.
    // (Ideally we update the engine, but for now we do it here to meet the requirement immediately visually)


    // Quick local calc override for UI visualization until Engine is updated
    const sovPercentage = offsiteQueries.length > 0
        ? Math.round((offsiteQueries.filter(q => q.mentioned).length / offsiteQueries.length) * 100)
        : 0;

    // Approximate new score (Visualization & Save)
    // 1. Qualitative (Max 25): Entity (10) + Rep (10) + Canonical (5)
    const qualScore = offSiteResult.entity_consistency_score + offSiteResult.reputation_score + (offSiteResult.canonical_sources_presence ? 5 : 0);
    // 2. SoV (Max 25)
    const sovScorePoints = Math.round((sovPercentage / 100) * 25);

    const newOffSiteScore = Math.min(qualScore + sovScorePoints, 50);

    const currentEvs = {
        total: onSiteScore + newOffSiteScore, // Recalculate total with new offsite
        onSiteScore,
        offSiteScore: newOffSiteScore
    }
    const handleSaveAudit = async () => {
        if (!client) return
        setSaving(true)

        // Calculate Score for Save
        const evs = currentEvs

        try {
            // Calculate next version number
            const nextVersion = allAudits.length > 0
                ? `1.${allAudits.length}`
                : '1.0';

            // 1. Insert Audit Header
            const { data: audit, error: auditError } = await supabase
                .from('audits')
                .insert({
                    client_id: client.id,
                    version: nextVersion,
                    type: auditType,
                    score_total: evs.total,
                    score_onsite: evs.onSiteScore,
                    score_offsite: evs.offSiteScore,
                    fecha: new Date().toISOString()
                } as any)
                .select()
                .single()

            if (auditError || !audit) throw auditError || new Error('Failed to create audit')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const auditRecord = audit as any; // Explicit cast to allow access to ID

            // 2. Insert Onsite Results (round scores to integers for DB)
            const { error: onsiteError } = await supabase
                .from('onsite_results')
                .insert({
                    audit_id: auditRecord.id,
                    robots_ok: onSite.robots_ok,
                    sitemap_ok: onSite.sitemap_ok,
                    schema_type: onSite.schema_type,
                    answer_box_score: Math.round(onSite.answer_box_score),
                    canonical_ok: onSite.canonical_ok,
                    llms_txt_present: onSite.llms_txt_present,
                    h1_h2_structure_score: Math.round(onSite.h1_h2_structure_score),
                    authority_signals_score: Math.round(onSite.authority_signals_score),
                    notas: onSite.notas
                } as any)

            if (onsiteError) throw onsiteError

            // 3. Insert Offsite Results (Phase 3)
            const { error: offsiteResError } = await supabase
                .from('offsite_results')
                .insert({
                    audit_id: auditRecord.id,
                    entity_consistency_score: offSiteResult.entity_consistency_score,
                    canonical_sources_presence: offSiteResult.canonical_sources_presence,
                    reputation_score: offSiteResult.reputation_score,
                    sov_score: sovPercentage, // Storing Percentage (0-100)
                    notas: offSiteResult.notas
                } as any)

            if (offsiteResError) throw offsiteResError

            // 4. Insert Offsite Queries - Save ONE ROW PER ENGINE
            const validQueries = offsiteQueries.filter(q => q.query_text.trim() !== '')
            if (validQueries.length > 0) {
                // Expand each query into multiple rows (one per engine result)
                const queryRows: Array<{
                    audit_id: string;
                    query_text: string;
                    engine: string;
                    mentioned: boolean;
                    bucket: string;
                    position: string;
                    competitors_mentioned: string[];
                    sentiment: string;
                }> = [];

                for (const q of validQueries) {
                    if (q.engineResults && q.engineResults.length > 0) {
                        // Save each engine result as a separate row
                        for (const engineResult of q.engineResults) {
                            queryRows.push({
                                audit_id: auditRecord.id,
                                query_text: q.query_text,
                                engine: engineResult.engine,
                                mentioned: engineResult.is_mentioned,
                                bucket: engineResult.bucket,
                                position: engineResult.is_mentioned ? 'top' : 'none',
                                competitors_mentioned: engineResult.competitors_mentioned || [],
                                sentiment: engineResult.sentiment || 'Neutral'
                            });
                        }
                    } else {
                        // Fallback: save single row with default data
                        queryRows.push({
                            audit_id: auditRecord.id,
                            query_text: q.query_text,
                            engine: q.engine || 'ChatGPT',
                            mentioned: q.mentioned,
                            bucket: q.mentioned ? 'Mentioned' : 'Not Found',
                            position: q.mentioned ? 'top' : 'none',
                            competitors_mentioned: q.competitors_mentioned || [],
                            sentiment: q.sentiment || 'Neutral'
                        });
                    }
                }

                if (queryRows.length > 0) {
                    const { error: offsiteError } = await supabase
                        .from('offsite_queries')
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .insert(queryRows as any)

                    if (offsiteError) throw offsiteError
                }
            }

            // Success
            toast.success(`Auditoría Guardada! Score EVS: ${evs.total}/100`)
            fetchClientData() // Refresh refresh header and audit list if we had one

        } catch (e: unknown) {
            console.error('Save error:', e)
            const message = e instanceof Error ? e.message : 'Unknown error'
            toast.error('Error al guardar la auditoría: ' + message)
        } finally {
            setSaving(false)
        }
    }

    // ========== Report Generation ==========
    const handleGenerateReport = async () => {
        if (!client || !lastAudit) {
            toast.error('Guardá la auditoría primero antes de generar el reporte.')
            return
        }

        setGeneratingReport(true)
        try {
            const result = await generateAuditReport(
                lastAudit.id,
                client.id,
                client.nombre,
                client.competidores || []
            )

            if (result.success && result.report && result.markdown) {
                setReportData(result.report)
                setReportMarkdown(result.markdown)
                setShowReportModal(true)
                toast.success('Reporte generado exitosamente!')
            } else {
                toast.error(result.error || 'Error al generar el reporte')
            }
        } catch (e) {
            console.error('Report generation error:', e)
            toast.error('Error al generar el reporte')
        } finally {
            setGeneratingReport(false)
        }
    }

    const handleDownloadReport = () => {
        if (!reportMarkdown || !client) return

        const blob = new Blob([reportMarkdown], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `reporte-evs-${client.nombre.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.md`
        a.click()
        URL.revokeObjectURL(url)
    }

    if (loading) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
    }

    if (!client) {
        return <div className="p-8">Cliente no encontrado.</div>
    }

    return (
        <div className="container mx-auto py-8 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <Button variant="ghost" className="pl-0 mb-2" onClick={() => router.push('/clients')}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Clientes
                    </Button>
                    <h1 className="text-3xl font-bold tracking-tight">{client.nombre}</h1>
                    <div className="flex space-x-2 text-muted-foreground">
                        <Badge variant="outline">{client.mercado}</Badge>
                        <span>{client.dominio}</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-sm font-medium text-muted-foreground">EVS Score Actual</div>
                    <div className="text-4xl font-bold text-primary">
                        {lastAudit ? Math.round(lastAudit.score_total || 0) : '--'}
                    </div>
                    {lastAudit && <div className="text-xs text-muted-foreground">Última: {new Date(lastAudit.fecha).toLocaleDateString()}</div>}
                </div>
                {/* Real-time Score Simulation */}
                <div className="bg-muted/30 p-4 rounded-lg border flex justify-between items-center">
                    <div className="space-y-1">
                        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Simulación en vivo</span>
                        <div className="flex gap-4 text-sm">
                            <span>On-site: <strong>{currentEvs.onSiteScore}/50</strong></span>
                            <span>Off-site: <strong>{currentEvs.offSiteScore}/50</strong></span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-5xl font-extrabold text-blue-600">
                            {currentEvs.total}
                        </div>
                        <span className="text-xs text-muted-foreground">Puntaje EVS Estimado</span>
                    </div>
                </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Main Audit Form */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border-2 border-primary/10">
                        <CardHeader>
                            <CardTitle>Nueva Auditoría EVS v1.2</CardTitle>
                            <CardDescription>Completa los checklist On-site y Off-site para calcular el score.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">

                            {/* Audit Form Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                {/* On-site Column */}
                                <Card className="p-4 h-fit border shadow-sm">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-semibold text-lg">On-site (Técnico)</h3>
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="secondary" onClick={handleScanSite} disabled={scanning || !client.dominio}>
                                                {scanning ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Bot className="mr-2 h-3 w-3" />}
                                                {scanning ? 'Escaneando...' : 'Escanear'}
                                            </Button>
                                            <Badge variant={currentEvs.onSiteScore >= 40 ? 'default' : currentEvs.onSiteScore >= 25 ? 'secondary' : 'destructive'}>
                                                {currentEvs.onSiteScore}/50
                                            </Badge>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        {/* Audit Type with Service Descriptions */}
                                        <div className="space-y-2">
                                            <Label>Tipo de Auditoría <HelpTooltip term="money_queries" /></Label>
                                            <Select value={auditType} onValueChange={(v: any) => setAuditType(v)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Seleccionar tipo" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="mini">
                                                        <div className="flex items-center gap-2">
                                                            <span>🔍 Mini Audit</span>
                                                            <Badge variant="outline" className="text-[9px]">5 queries</Badge>
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="full">
                                                        <div className="flex items-center gap-2">
                                                            <span>📊 Full Audit</span>
                                                            <Badge variant="outline" className="text-[9px]">20+ queries</Badge>
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="retainer">
                                                        <div className="flex items-center gap-2">
                                                            <span>🔄 Retainer</span>
                                                            <Badge variant="outline" className="text-[9px]">tracking</Badge>
                                                        </div>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-[10px] text-muted-foreground">
                                                {auditType === 'mini' && '5 queries rápidas, análisis técnico básico.'}
                                                {auditType === 'full' && '20+ queries, análisis completo On-site + Off-site.'}
                                                {auditType === 'retainer' && 'Check mensual, tracking de evolución EVS.'}
                                            </p>
                                        </div>
                                        <Separator />

                                        {/* Binaries */}
                                        <div className="space-y-3">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox
                                                    id="robots"
                                                    checked={onSite.robots_ok}
                                                    onCheckedChange={(c) => setOnSite({ ...onSite, robots_ok: c as boolean })}
                                                />
                                                <Label htmlFor="robots">Robots.txt OK <HelpTooltip term="robots_ok" /></Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <Checkbox
                                                    id="sitemap"
                                                    checked={onSite.sitemap_ok}
                                                    onCheckedChange={(c) => setOnSite({ ...onSite, sitemap_ok: c as boolean })}
                                                />
                                                <Label htmlFor="sitemap">Sitemap.xml OK <HelpTooltip term="sitemap_ok" /></Label>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="canonical" className="text-sm">Canonical Tags <HelpTooltip term="canonical_ok" /></Label>
                                                <Switch
                                                    id="canonical"
                                                    checked={onSite.canonical_ok}
                                                    onCheckedChange={(c) => setOnSite({ ...onSite, canonical_ok: c })}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="llms" className="text-sm">llms.txt Present <HelpTooltip term="llms_txt_present" /></Label>
                                                <Switch
                                                    id="llms"
                                                    checked={onSite.llms_txt_present}
                                                    onCheckedChange={(c) => setOnSite({ ...onSite, llms_txt_present: c })}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Schema Markup <HelpTooltip term="schema_type" /></Label>
                                            <Input
                                                placeholder="Ej: Organization, Product..."
                                                value={onSite.schema_type}
                                                onChange={(e) => setOnSite({ ...onSite, schema_type: e.target.value })}
                                            />
                                        </div>

                                        <Separator />

                                        {/* Sliders with Evidence */}
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <Label>Readiness (Answer Box) <HelpTooltip term="answer_box_score" /></Label>
                                                    <span className="text-xs text-muted-foreground">{onSite.answer_box_score}/10</span>
                                                </div>
                                                <Slider
                                                    value={[onSite.answer_box_score]}
                                                    min={0} max={10} step={1}
                                                    onValueChange={(vals) => setOnSite({ ...onSite, answer_box_score: vals[0] })}
                                                />
                                                {onSite.readiness_evidence && (
                                                    <details className="text-xs">
                                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">📋 Ver evidencia</summary>
                                                        <p className="mt-1 p-2 bg-muted rounded text-[11px]">{onSite.readiness_evidence}</p>
                                                    </details>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <Label>Estructura H1/H2 <HelpTooltip term="h1_h2_structure_score" /></Label>
                                                    <span className="text-xs text-muted-foreground">{onSite.h1_h2_structure_score}/10</span>
                                                </div>
                                                <Slider
                                                    value={[onSite.h1_h2_structure_score]}
                                                    min={0} max={10} step={1}
                                                    onValueChange={(vals) => setOnSite({ ...onSite, h1_h2_structure_score: vals[0] })}
                                                />
                                                {onSite.structure_evidence && (
                                                    <details className="text-xs">
                                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">📋 Ver evidencia</summary>
                                                        <p className="mt-1 p-2 bg-muted rounded text-[11px]">{onSite.structure_evidence}</p>
                                                    </details>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <Label>Autoridad <HelpTooltip term="authority_signals_score" /></Label>
                                                    <span className="text-xs text-muted-foreground">{onSite.authority_signals_score}/10</span>
                                                </div>
                                                <Slider
                                                    value={[onSite.authority_signals_score]}
                                                    min={0} max={10} step={1}
                                                    onValueChange={(vals) => setOnSite({ ...onSite, authority_signals_score: vals[0] })}
                                                />
                                                {onSite.authority_evidence && (
                                                    <details className="text-xs">
                                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">📋 Ver evidencia</summary>
                                                        <p className="mt-1 p-2 bg-muted rounded text-[11px]">{onSite.authority_evidence}</p>
                                                    </details>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Notas del Agente / Auditor</Label>
                                            <textarea
                                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                placeholder="Resultados del escaneo automático..."
                                                value={onSite.notas}
                                                onChange={(e) => setOnSite({ ...onSite, notas: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </Card>

                                {/* Off-site Column */}
                                <Card className="p-4 h-fit border shadow-sm">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-semibold">Money Queries & AI</h3>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={handleOffsiteAnalysis}
                                                disabled={suggesting}
                                            >
                                                {suggesting ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Bot className="h-3 w-3 mr-2" />}
                                                Analizar IA
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={handleAddQuery}><Plus className="h-4 w-4" /></Button>
                                        </div>
                                    </div>

                                    {/* SoV Visualization */}
                                    <div className="mb-4 space-y-1">
                                        <div className="flex justify-between text-xs font-medium">
                                            <span>Share of Voice (SoV)</span>
                                            <span>{sovPercentage}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary transition-all duration-500 ease-in-out"
                                                style={{ width: `${sovPercentage}%` }}
                                            />
                                        </div>
                                        <p className="text-[10px] text-muted-foreground text-right">{offsiteQueries.filter(q => q.mentioned).length} de {offsiteQueries.length} ganadas</p>
                                    </div>

                                    <div className="space-y-4">
                                        {offsiteQueries.map((query, index) => (
                                            <div key={query.id || index} className="flex flex-col gap-2 border p-3 rounded-md bg-muted/20">
                                                <Input
                                                    className="h-8 text-sm"
                                                    placeholder="Query..."
                                                    value={query.query_text}
                                                    onChange={(e) => updateQuery(index, 'query_text', e.target.value)}
                                                />
                                                <div className="flex gap-2 items-center justify-between">
                                                    {/* EVS v2.0: Multi-Engine Status Badges */}
                                                    <div className="flex gap-1">
                                                        {query.engineResults ? (
                                                            // Show results for all 4 engines
                                                            query.engineResults.map((result) => (
                                                                <Badge
                                                                    key={result.engine}
                                                                    variant={result.is_mentioned ? 'default' : 'secondary'}
                                                                    className={`text-[10px] px-1.5 py-0.5 ${result.is_mentioned ? 'bg-green-600' : 'bg-gray-400'}`}
                                                                    title={`${result.engine}: ${result.bucket}${result.error ? ` (${result.error})` : ''}`}
                                                                >
                                                                    {result.engine.substring(0, 1)}
                                                                </Badge>
                                                            ))
                                                        ) : (
                                                            // Default: Show single engine selector
                                                            <Select
                                                                value={query.engine}
                                                                onValueChange={(v) => updateQuery(index, 'engine', v)}
                                                            >
                                                                <SelectTrigger className="w-[90px] h-8 text-xs">
                                                                    <SelectValue placeholder="Motor" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="ChatGPT">ChatGPT</SelectItem>
                                                                    <SelectItem value="Claude">Claude</SelectItem>
                                                                    <SelectItem value="Gemini">Gemini</SelectItem>
                                                                    <SelectItem value="Perplexity">Perplexity</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center space-x-2">
                                                        <div className={`h-2 w-2 rounded-full ${query.mentioned ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                        <span className="text-xs">
                                                            {query.engineResults
                                                                ? `${query.engineResults.filter(r => r.is_mentioned).length}/4`
                                                                : (query.mentioned ? 'Detectado' : 'No')}
                                                        </span>
                                                    </div>

                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => handleAutoCheck(index)}
                                                            disabled={analyzingIndex === index || !query.query_text}
                                                            title="Auto-Check (4 Motores)"
                                                        >
                                                            {analyzingIndex === index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-purple-600" />}
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveQuery(index)}>
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                {/* EVS v3.0: Show individual engine responses */}
                                                {query.engineResults && query.engineResults.length > 0 && (
                                                    <details className="text-xs text-muted-foreground">
                                                        <summary className="cursor-pointer hover:text-foreground font-medium">
                                                            Ver respuestas por motor ({query.engineResults.filter(r => r.is_mentioned).length}/4 detectaron)
                                                        </summary>
                                                        <div className="mt-2 space-y-2">
                                                            {query.engineResults.map((result) => (
                                                                <div key={result.engine} className={`p-2 rounded border ${result.is_mentioned ? 'border-green-500/30 bg-green-50 dark:bg-green-950/20' : 'border-gray-300/30 bg-gray-50 dark:bg-gray-900/20'}`}>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <span className="font-semibold text-[11px]">
                                                                            {result.engine}
                                                                            <Badge variant={result.is_mentioned ? 'default' : 'secondary'} className="ml-1 text-[9px] px-1">
                                                                                {result.bucket}
                                                                            </Badge>
                                                                        </span>
                                                                        {result.error && <span className="text-red-500 text-[10px]">{result.error}</span>}
                                                                    </div>
                                                                    {result.raw_response && (
                                                                        <p className="text-[10px] text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap">
                                                                            {result.raw_response.substring(0, 500)}{result.raw_response.length > 500 ? '...' : ''}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <Separator className="my-4" />

                                    {/* Off-site Qualitative Inputs (Phase 3) */}
                                    <div className="space-y-4">
                                        <h4 className="font-semibold text-sm">Cualitativo Off-site</h4>

                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <Label className="text-xs">Consistencia de Entidad <HelpTooltip term="entity_consistency_score" /></Label>
                                                <span className="text-xs text-muted-foreground">{offSiteResult.entity_consistency_score}/10</span>
                                            </div>
                                            <Slider
                                                value={[offSiteResult.entity_consistency_score]}
                                                min={0} max={10} step={1}
                                                onValueChange={(vals) => setOffSiteResult({ ...offSiteResult, entity_consistency_score: vals[0] })}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs">Fuentes Canónicas (Wiki/Wikidata) <HelpTooltip term="canonical_sources_presence" /></Label>
                                            <Switch
                                                checked={offSiteResult.canonical_sources_presence}
                                                onCheckedChange={(c) => setOffSiteResult({ ...offSiteResult, canonical_sources_presence: c })}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <Label className="text-xs">Reputación / Earned Media <HelpTooltip term="reputation_score" /></Label>
                                                <span className="text-xs text-muted-foreground">{offSiteResult.reputation_score}/10</span>
                                            </div>
                                            <Slider
                                                value={[offSiteResult.reputation_score]}
                                                min={0} max={10} step={1}
                                                onValueChange={(vals) => setOffSiteResult({ ...offSiteResult, reputation_score: vals[0] })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Notas Off-site</Label>
                                            <textarea
                                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                placeholder="Observaciones de reputación e IA..."
                                                value={offSiteResult.notas}
                                                onChange={(e) => setOffSiteResult({ ...offSiteResult, notas: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </Card>
                            </div>

                            <div className="flex gap-2 mt-6">
                                <Button className="flex-1 text-lg" size="lg" onClick={handleSaveAudit} disabled={saving}>
                                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="mr-2 h-4 w-4" /> Guardar Auditoría</>}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="lg"
                                    onClick={handleGenerateReport}
                                    disabled={generatingReport || !lastAudit}
                                    title={!lastAudit ? 'Guardá la auditoría primero' : 'Generar reporte AI'}
                                >
                                    {generatingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                </Button>
                            </div>

                        </CardContent>
                    </Card>
                </div >

                {/* Sidebar / Info */}
                < div className="space-y-6" >
                    <Card>
                        <CardHeader>
                            <CardTitle>Competidores</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                {client.competidores && client.competidores.length > 0 ? (
                                    client.competidores.map((comp: string, i: number) => (
                                        <Badge key={i} variant="secondary">{comp}</Badge>
                                    ))
                                ) : (
                                    <span className="text-sm text-muted-foreground">No definidos</span>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Audit History */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Historial de Auditorías</CardTitle>
                            <CardDescription className="text-xs">
                                {allAudits.length} auditoría{allAudits.length !== 1 ? 's' : ''} registrada{allAudits.length !== 1 ? 's' : ''}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="max-h-64 overflow-y-auto">
                            {allAudits.length > 0 ? (
                                <div className="space-y-2">
                                    {allAudits.map((audit) => (
                                        <div
                                            key={audit.id}
                                            className={`flex items-center justify-between p-2 rounded border ${audit.id === lastAudit?.id ? 'bg-primary/5 border-primary/30' : 'bg-muted/50'
                                                }`}
                                        >
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm">v{audit.version}</span>
                                                    <Badge variant="outline" className="text-[10px] px-1.5">
                                                        {audit.type || 'full'}
                                                    </Badge>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {new Date(audit.fecha).toLocaleDateString('es-AR', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    })}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-lg font-bold ${(audit.score_total || 0) >= 60 ? 'text-green-600' :
                                                    (audit.score_total || 0) >= 40 ? 'text-yellow-600' : 'text-red-600'
                                                    }`}>
                                                    {Math.round(audit.score_total || 0)}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    EVS Score
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Sin auditorías previas. Guardá la primera!
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* EVS Evolution Chart */}
                    <EVSEvolution audits={allAudits} />

                    <Card>
                        <CardHeader>
                            <CardTitle>Metodología EVS</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2 text-muted-foreground">
                            <p><strong>On-site (50%):</strong> Salud técnica, schema y legibilidad para máquinas.</p>
                            <p><strong>Off-site (50%):</strong> Autoridad semántica y presencia en respuestas generativas (LLMs).</p>
                        </CardContent>
                    </Card>
                </div >

            </div >

            {/* Report Modal */}
            {showReportModal && reportData && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-background rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b">
                            <div>
                                <h2 className="text-xl font-bold">
                                    {reportData.status_badge} Reporte EVS: {client?.nombre}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Generado el {new Date(reportData.generated_at).toLocaleDateString('es-AR')}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={handleDownloadReport}>
                                    <Download className="h-4 w-4 mr-1" /> Descargar .md
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setShowReportModal(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {/* Executive Summary */}
                            <div className="mb-6">
                                <h3 className="text-2xl font-bold mb-2">
                                    EVS Score: {reportData.evs_score}/100
                                </h3>
                                <div className="flex gap-4 mb-3 text-sm">
                                    <span>On-site: <strong>{reportData.score_onsite}/50</strong></span>
                                    <span>Off-site: <strong>{reportData.score_offsite}/50</strong></span>
                                </div>
                                <p className="text-muted-foreground">{reportData.executive_summary}</p>

                                {/* Top 3 Hallazgos - NEW */}
                                {reportData.top3_hallazgos && reportData.top3_hallazgos.length > 0 && (
                                    <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-900">
                                        <h4 className="font-semibold text-sm mb-2">🎯 Top 3 Hallazgos</h4>
                                        <ol className="text-sm space-y-1 list-decimal list-inside">
                                            {reportData.top3_hallazgos.map((h, i) => (
                                                <li key={i}>{h}</li>
                                            ))}
                                        </ol>
                                    </div>
                                )}
                            </div>

                            {/* Benchmark */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold mb-2">📊 Benchmark Competitivo</h3>
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted">
                                            <tr>
                                                <th className="text-left p-2">Marca</th>
                                                <th className="text-center p-2">SoV</th>
                                                <th className="text-center p-2">ChatGPT</th>
                                                <th className="text-center p-2">Claude</th>
                                                <th className="text-center p-2">Gemini</th>
                                                <th className="text-center p-2">Perplexity</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="border-t bg-primary/5">
                                                <td className="p-2 font-medium">{reportData.benchmark.brand}</td>
                                                <td className="text-center p-2 font-bold">{reportData.benchmark.brand_sov}%</td>
                                                <td className="text-center p-2">{reportData.benchmark.brand_engines?.chatgpt ? '✅' : '❌'}</td>
                                                <td className="text-center p-2">{reportData.benchmark.brand_engines?.claude ? '✅' : '❌'}</td>
                                                <td className="text-center p-2">{reportData.benchmark.brand_engines?.gemini ? '✅' : '❌'}</td>
                                                <td className="text-center p-2">{reportData.benchmark.brand_engines?.perplexity ? '✅' : '❌'}</td>
                                            </tr>
                                            {reportData.benchmark.competitors.map((c, i) => (
                                                <tr key={i} className="border-t">
                                                    <td className="p-2">{c.name}</td>
                                                    <td className="text-center p-2">{c.sov}%</td>
                                                    <td className="text-center p-2">{c.engines.chatgpt ? '✅' : '❌'}</td>
                                                    <td className="text-center p-2">{c.engines.claude ? '✅' : '❌'}</td>
                                                    <td className="text-center p-2">{c.engines.gemini ? '✅' : '❌'}</td>
                                                    <td className="text-center p-2">{c.engines.perplexity ? '✅' : '❌'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Gap Analysis */}
                            {reportData.gaps.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="text-lg font-semibold mb-2">🔍 Gap Analysis</h3>
                                    <div className="space-y-2">
                                        {reportData.gaps.slice(0, 5).map((gap, i) => (
                                            <div key={i} className="p-3 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-900">
                                                <p className="font-medium text-sm">"{gap.query}" ({gap.engine})</p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    ❌ {client?.nombre}: No aparece | ✅ Competidores: {gap.competitors_found.join(', ')}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recommendations */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold mb-2">🎯 Top 5 Recomendaciones</h3>
                                <div className="space-y-4">
                                    {reportData.recommendations.map((rec, i) => (
                                        <div key={i} className="p-4 border rounded-lg">
                                            <div className="flex items-start gap-2">
                                                <span className="text-2xl">{rec.emoji}</span>
                                                <div className="flex-1">
                                                    <h4 className="font-semibold">{rec.priority}. {rec.title}</h4>
                                                    <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                                                    <div className="flex gap-4 mt-2 text-xs">
                                                        <Badge variant={rec.impact === 'alto' ? 'default' : 'secondary'}>
                                                            Impacto: {rec.impact}
                                                        </Badge>
                                                        <Badge variant="outline">
                                                            Dificultad: {rec.difficulty}
                                                        </Badge>
                                                        <span className="text-muted-foreground">⏱️ {rec.estimated_time}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    )
}
