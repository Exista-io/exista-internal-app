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
import { Plus, Trash2, ArrowLeft, Save, Loader2, Sparkles, Bot, FileText, Download, X, Eye, Archive, ListChecks, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { analyzeQuery, scanWebsite, suggestQueries, checkShareOfVoice, analyzeOffsiteQualitative, checkAllEngines, LLMCheckResult, detectIndustry, generateAuditReport, AuditReportData, archiveAudit, getAuditDetails, createAction, updateActionStatus, getActionsForClient, updateActionDetails, Action } from '@/app/actions'
import { SERVICE_LIMITS, AuditType, AIEngine } from '@/lib/service-limits'
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

    // Historical Audit View State
    const [showAuditDetailModal, setShowAuditDetailModal] = useState(false)
    const [selectedAuditDetail, setSelectedAuditDetail] = useState<{
        audit: { id: string; fecha: string; version: string; type: string; score_onsite: number; score_offsite: number; evs_score: number; onsite_data: Record<string, unknown>; offsite_data: Record<string, unknown> };
        queries: Array<{ id: string; query_text: string; engine: string; raw_response: string; is_mentioned: boolean; bucket: string; sentiment: string; competitors_mentioned: string[] }>;
    } | null>(null)
    const [loadingAuditDetail, setLoadingAuditDetail] = useState(false)

    // Archive Confirmation State
    const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
    const [auditToArchive, setAuditToArchive] = useState<string | null>(null)
    const [archiving, setArchiving] = useState(false)

    // Action Tracker State
    const [clientActions, setClientActions] = useState<Action[]>([])
    const [loadingActions, setLoadingActions] = useState(false)
    const [showActionsPanel, setShowActionsPanel] = useState(false)
    const [creatingAction, setCreatingAction] = useState(false)
    const [selectedActionForEdit, setSelectedActionForEdit] = useState<Action | null>(null)
    const [showActionEditModal, setShowActionEditModal] = useState(false)
    const [savingActionEdit, setSavingActionEdit] = useState(false)

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
            // Also fetch actions for this client
            fetchClientActions(id)
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

    // Fetch actions for displaying in Actions Card
    const fetchClientActions = async (clientId: string) => {
        setLoadingActions(true)
        try {
            const result = await getActionsForClient(clientId)
            if (result.success && result.actions) {
                setClientActions(result.actions)
            }
        } catch (e) {
            console.error('Error fetching actions:', e)
        } finally {
            setLoadingActions(false)
        }
    }

    const handleAddQuery = () => {
        // Check if we've reached the limit for this audit type
        const maxQueries = SERVICE_LIMITS[auditType].maxQueries;
        if (offsiteQueries.length >= maxQueries) {
            toast.warning(`Límite alcanzado: ${auditType} permite máximo ${maxQueries} queries`);
            return;
        }

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
            // Get allowed engines for current audit type
            const allowedEngines = SERVICE_LIMITS[auditType].engines;

            // EVS v2.0: Query only allowed engines in parallel
            const results = await checkAllEngines(
                query.query_text,
                client.nombre,
                client.competidores || [],
                [...allowedEngines] // Pass as mutable array
            )

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
                    competitors_mentioned: allCompetitorsMentioned
                }
                return newQueries
            })

            // Log engine results
            const engineCount = allowedEngines.length;
            console.log(`EVS ${auditType}: ${engineCount}-Engine Results:`, results.map(r => `${r.engine}: ${r.bucket}`))
            toast.success(`Revisado en ${engineCount} motores: ${results.filter(r => r.is_mentioned).length}/${engineCount} detectaron la marca`)
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

            // Get limit for current audit type
            const maxQueries = SERVICE_LIMITS[auditType].maxQueries;

            const newQueries: QueryUI[] = suggestions.slice(0, maxQueries).map(q => ({
                query_text: q,
                engine: 'ChatGPT', // Default
                mentioned: false,
                status: 'pending'
            }));

            setOffsiteQueries(prev => {
                const existingTexts = new Set(prev.map(p => p.query_text));
                const uniqueNew = newQueries.filter(n => !existingTexts.has(n.query_text));
                // Also respect limit when adding to existing queries
                const combined = [...prev, ...uniqueNew];
                return combined.slice(0, maxQueries);
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
                    raw_response: string;
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
                                sentiment: engineResult.sentiment || 'Neutral',
                                raw_response: engineResult.raw_response || ''
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
                            sentiment: q.sentiment || 'Neutral',
                            raw_response: ''
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
            // For retainer audits, pass the previous audit ID for Delta Comparison
            const previousAuditId = auditType === 'retainer' && allAudits.length > 1
                ? allAudits[1]?.id  // Second audit (first is current)
                : undefined;

            const result = await generateAuditReport(
                lastAudit.id,
                client.id,
                client.nombre,
                client.competidores || [],
                auditType,
                previousAuditId
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

    // ========== Historical Audit Handlers ==========
    const handleViewAudit = async (auditId: string) => {
        setLoadingAuditDetail(true)
        try {
            const result = await getAuditDetails(auditId)
            if (result.success && result.audit && result.queries) {
                setSelectedAuditDetail({
                    audit: result.audit,
                    queries: result.queries
                })
                setShowAuditDetailModal(true)
            } else {
                toast.error(result.error || 'Error al cargar los detalles')
            }
        } catch (e) {
            console.error('View audit error:', e)
            toast.error('Error al cargar la auditoría')
        } finally {
            setLoadingAuditDetail(false)
        }
    }

    const handleArchiveConfirm = (auditId: string) => {
        setAuditToArchive(auditId)
        setShowArchiveConfirm(true)
    }

    const handleArchiveAudit = async () => {
        if (!auditToArchive) return

        setArchiving(true)
        try {
            const result = await archiveAudit(auditToArchive)
            if (result.success) {
                toast.success('Auditoría archivada')
                // Remove from local state
                setAllAudits(prev => prev.filter(a => a.id !== auditToArchive))
                // If archived was the last audit, update lastAudit
                if (lastAudit?.id === auditToArchive) {
                    const remaining = allAudits.filter(a => a.id !== auditToArchive)
                    setLastAudit(remaining.length > 0 ? remaining[0] : null)
                }
            } else {
                toast.error(result.error || 'Error al archivar')
            }
        } catch (e) {
            console.error('Archive audit error:', e)
            toast.error('Error al archivar la auditoría')
        } finally {
            setArchiving(false)
            setShowArchiveConfirm(false)
            setAuditToArchive(null)
        }
    }

    // Handle Action status change (cycle through states)
    const handleActionStatusChange = async (actionId: string, currentStatus: string) => {
        const statusOrder: Array<'pending' | 'in_progress' | 'done' | 'blocked'> = ['pending', 'in_progress', 'done']
        const currentIndex = statusOrder.indexOf(currentStatus as 'pending' | 'in_progress' | 'done')
        const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length]

        try {
            const result = await updateActionStatus(actionId, nextStatus)
            if (result.success) {
                // Update local state
                setClientActions(prev => prev.map(a =>
                    a.id === actionId
                        ? { ...a, status: nextStatus, completed_at: nextStatus === 'done' ? new Date().toISOString() : undefined }
                        : a
                ))
                toast.success(`Estado actualizado a ${nextStatus === 'pending' ? 'Pendiente' : nextStatus === 'in_progress' ? 'En Progreso' : 'Completado'}`)
            } else {
                toast.error(result.error || 'Error al actualizar estado')
            }
        } catch (e) {
            console.error('Update action status error:', e)
            toast.error('Error al actualizar estado')
        }
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

                                    {/* Load Previous Queries Banner (for Retainer) */}
                                    {auditType === 'retainer' && allAudits.length > 0 && offsiteQueries.length === 0 && (
                                        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                                            <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                                💡 Cliente con auditoría previa (v{allAudits[0]?.version})
                                            </p>
                                            <p className="text-xs text-muted-foreground mb-3">
                                                Podés cargar las mismas queries del mes anterior para comparar evolución.
                                            </p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={async () => {
                                                    if (!allAudits[0]?.id) return;
                                                    toast.info('Cargando queries previas...');

                                                    const { data: prevQueries } = await supabase
                                                        .from('offsite_queries')
                                                        .select('query_text')
                                                        .eq('audit_id', allAudits[0].id);

                                                    if (!prevQueries || prevQueries.length === 0) {
                                                        toast.error('No se encontraron queries en la auditoría anterior');
                                                        return;
                                                    }

                                                    // Get unique queries and limit to current audit type max
                                                    const uniqueQueries = [...new Set(prevQueries.map((q: { query_text: string }) => q.query_text))];
                                                    const maxQueries = SERVICE_LIMITS[auditType].maxQueries;
                                                    const limitedQueries = uniqueQueries.slice(0, maxQueries);

                                                    setOffsiteQueries(limitedQueries.map(text => ({
                                                        id: Math.random().toString(36),
                                                        query_text: text,
                                                        engine: 'ChatGPT',
                                                        mentioned: false,
                                                        status: 'pending' as const
                                                    })));

                                                    toast.success(`${limitedQueries.length} queries cargadas de v${allAudits[0].version}`);
                                                }}
                                            >
                                                📥 Cargar {allAudits[0]?.version ? `queries de v${allAudits[0].version}` : 'queries previas'}
                                            </Button>
                                        </div>
                                    )}

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
                                            <div className="flex items-center gap-2">
                                                <div className="text-right mr-2">
                                                    <div className={`text-lg font-bold ${(audit.score_total || 0) >= 60 ? 'text-green-600' :
                                                        (audit.score_total || 0) >= 40 ? 'text-yellow-600' : 'text-red-600'
                                                        }`}>
                                                        {Math.round(audit.score_total || 0)}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        EVS Score
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    onClick={() => handleViewAudit(audit.id)}
                                                    disabled={loadingAuditDetail}
                                                    title="Ver detalle"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                                    onClick={() => handleArchiveConfirm(audit.id)}
                                                    title="Archivar"
                                                >
                                                    <Archive className="h-4 w-4" />
                                                </Button>
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

                    {/* Actions Tracker Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <ListChecks className="h-4 w-4" />
                                        Acciones Pendientes
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        {clientActions.filter(a => a.status !== 'done').length} pendientes | {clientActions.filter(a => a.status === 'done').length} completadas
                                    </CardDescription>
                                </div>
                                <div className="flex gap-1">
                                    {clientActions.length > 0 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            title="Exportar acciones CSV"
                                            onClick={() => {
                                                const headers = ['Prioridad', 'Título', 'Descripción', 'Impacto', 'Dificultad', 'Tiempo Est.', 'Estado', 'Asignado', 'Fecha Límite', 'Notas'];
                                                const rows = clientActions.map(a => [
                                                    a.priority,
                                                    `"${a.title.replace(/"/g, '""')}"`,
                                                    `"${a.description.replace(/"/g, '""')}"`,
                                                    a.impact,
                                                    a.difficulty,
                                                    a.estimated_time,
                                                    a.status === 'pending' ? 'Pendiente' : a.status === 'in_progress' ? 'En Progreso' : a.status === 'done' ? 'Completado' : 'Bloqueado',
                                                    a.assigned_to || '',
                                                    a.due_date ? new Date(a.due_date).toLocaleDateString('es-AR') : '',
                                                    `"${(a.notes || '').replace(/"/g, '""')}"`
                                                ]);
                                                const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                                                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `acciones-${client?.nombre || 'cliente'}-${new Date().toISOString().split('T')[0]}.csv`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                                toast.success('Acciones exportadas');
                                            }}
                                        >
                                            <Download className="h-4 w-4" />
                                        </Button>
                                    )}
                                    {clientActions.length > 3 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowActionsPanel(!showActionsPanel)}
                                        >
                                            {showActionsPanel ? 'Menos' : 'Ver todas'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className={`space-y-2 ${showActionsPanel ? 'max-h-96' : 'max-h-48'} overflow-y-auto`}>
                            {loadingActions ? (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : clientActions.length > 0 ? (
                                <>
                                    {clientActions
                                        .filter(a => a.status !== 'done' || showActionsPanel)
                                        .slice(0, showActionsPanel ? undefined : 5)
                                        .map((action) => (
                                            <div
                                                key={action.id}
                                                className={`flex items-start justify-between p-2 rounded border ${action.status === 'done'
                                                    ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
                                                    : action.status === 'in_progress'
                                                        ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900'
                                                        : action.status === 'blocked'
                                                            ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                                                            : 'bg-muted/50'
                                                    }`}
                                            >
                                                <div
                                                    className="flex-1 min-w-0 cursor-pointer"
                                                    onClick={() => {
                                                        setSelectedActionForEdit(action)
                                                        setShowActionEditModal(true)
                                                    }}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        <span>{action.emoji}</span>
                                                        <Badge variant="outline" className="text-[10px] shrink-0">
                                                            P{action.priority}
                                                        </Badge>
                                                        <span className="font-medium text-sm truncate hover:underline">{action.title}</span>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                                        {action.description.substring(0, 60)}...
                                                    </div>
                                                    {(action.due_date || action.assigned_to) && (
                                                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-1">
                                                            {action.due_date && (
                                                                <span className="flex items-center gap-1">
                                                                    <Clock className="h-3 w-3" />
                                                                    {new Date(action.due_date).toLocaleDateString('es-AR')}
                                                                </span>
                                                            )}
                                                            {action.assigned_to && (
                                                                <span>👤 {action.assigned_to}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 shrink-0"
                                                    onClick={() => handleActionStatusChange(action.id, action.status)}
                                                    title="Cambiar estado"
                                                >
                                                    {action.status === 'pending' && (
                                                        <span className="text-xs text-muted-foreground">⬜ Pendiente</span>
                                                    )}
                                                    {action.status === 'in_progress' && (
                                                        <span className="text-xs text-blue-600">🔄 En progreso</span>
                                                    )}
                                                    {action.status === 'done' && (
                                                        <span className="text-xs text-green-600 flex items-center gap-1">
                                                            <CheckCircle2 className="h-3 w-3" /> Hecho
                                                        </span>
                                                    )}
                                                    {action.status === 'blocked' && (
                                                        <span className="text-xs text-red-600 flex items-center gap-1">
                                                            <AlertCircle className="h-3 w-3" /> Bloqueado
                                                        </span>
                                                    )}
                                                </Button>
                                            </div>
                                        ))
                                    }
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    Sin acciones. Generá un reporte para crear acciones.
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

                            {/* Gap Analysis - Only show for Full/Retainer */}
                            {SERVICE_LIMITS[auditType].includeGapAnalysis && reportData.gaps.length > 0 && (
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

                            {/* Recommendations - Limited by audit type */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold mb-2">🎯 Top {SERVICE_LIMITS[auditType].recommendations} Recomendaciones</h3>
                                <div className="space-y-4">
                                    {reportData.recommendations.slice(0, SERVICE_LIMITS[auditType].recommendations).map((rec, i) => (
                                        <div key={i} className="p-4 border rounded-lg">
                                            <div className="flex items-start gap-2">
                                                <span className="text-2xl">{rec.emoji}</span>
                                                <div className="flex-1">
                                                    <h4 className="font-semibold">{rec.priority}. {rec.title}</h4>
                                                    <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                                                    <div className="flex gap-4 mt-2 text-xs items-center">
                                                        <Badge variant={rec.impact === 'alto' ? 'default' : 'secondary'}>
                                                            Impacto: {rec.impact}
                                                        </Badge>
                                                        <Badge variant="outline">
                                                            Dificultad: {rec.difficulty}
                                                        </Badge>
                                                        <span className="text-muted-foreground">⏱️ {rec.estimated_time}</span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 px-2 text-xs ml-auto"
                                                            disabled={creatingAction || clientActions.some(a => a.title === rec.title)}
                                                            onClick={async () => {
                                                                if (!client?.id || !lastAudit?.id) return
                                                                setCreatingAction(true)
                                                                try {
                                                                    const result = await createAction({
                                                                        auditId: lastAudit.id,
                                                                        clientId: client.id,
                                                                        priority: rec.priority,
                                                                        emoji: rec.emoji,
                                                                        title: rec.title,
                                                                        description: rec.description,
                                                                        impact: rec.impact as 'alto' | 'medio' | 'bajo',
                                                                        difficulty: rec.difficulty as 'facil' | 'media' | 'dificil',
                                                                        estimatedTime: rec.estimated_time
                                                                    })
                                                                    if (result.success && result.action) {
                                                                        setClientActions(prev => [...prev, result.action!])
                                                                        toast.success(`Acción "${rec.title}" creada`)
                                                                    } else {
                                                                        toast.error(result.error || 'Error al crear acción')
                                                                    }
                                                                } catch (e) {
                                                                    console.error('Create action error:', e)
                                                                    toast.error('Error al crear acción')
                                                                } finally {
                                                                    setCreatingAction(false)
                                                                }
                                                            }}
                                                        >
                                                            {clientActions.some(a => a.title === rec.title)
                                                                ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Creada</>
                                                                : <><Plus className="h-3 w-3 mr-1" /> Crear Acción</>
                                                            }
                                                        </Button>
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
            {/* Archive Confirmation Dialog */}
            {showArchiveConfirm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-background rounded-lg shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold mb-2">¿Archivar esta auditoría?</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            La auditoría se ocultará del historial pero los datos se conservarán en la base de datos.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => { setShowArchiveConfirm(false); setAuditToArchive(null); }}
                                disabled={archiving}
                            >
                                Cancelar
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleArchiveAudit}
                                disabled={archiving}
                            >
                                {archiving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Archive className="h-4 w-4 mr-1" />}
                                Archivar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Audit Detail Modal */}
            {showAuditDetailModal && selectedAuditDetail && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-background rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <FileText className="h-5 w-5" />
                                    Auditoría v{selectedAuditDetail.audit.version}
                                    <Badge variant="outline">{selectedAuditDetail.audit.type}</Badge>
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {new Date(selectedAuditDetail.audit.fecha).toLocaleDateString('es-AR', {
                                        day: '2-digit', month: 'long', year: 'numeric'
                                    })}
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setShowAuditDetailModal(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Scores Summary */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-4 border rounded-lg text-center">
                                    <div className={`text-3xl font-bold ${selectedAuditDetail.audit.evs_score >= 60 ? 'text-green-600' : selectedAuditDetail.audit.evs_score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                                        {selectedAuditDetail.audit.evs_score}
                                    </div>
                                    <div className="text-sm text-muted-foreground">EVS Score</div>
                                </div>
                                <div className="p-4 border rounded-lg text-center">
                                    <div className="text-2xl font-bold">{selectedAuditDetail.audit.score_onsite}</div>
                                    <div className="text-sm text-muted-foreground">On-site /50</div>
                                </div>
                                <div className="p-4 border rounded-lg text-center">
                                    <div className="text-2xl font-bold">{selectedAuditDetail.audit.score_offsite}</div>
                                    <div className="text-sm text-muted-foreground">Off-site /50</div>
                                </div>
                            </div>

                            {/* On-site Technical Details */}
                            {selectedAuditDetail.audit.onsite_data && Object.keys(selectedAuditDetail.audit.onsite_data).length > 0 && (() => {
                                const od = selectedAuditDetail.audit.onsite_data as Record<string, string | number | boolean>;
                                const hasEvidence = od.readiness_evidence || od.structure_evidence || od.authority_evidence;
                                return (
                                    <div>
                                        <h3 className="text-lg font-semibold mb-3">🔧 On-site (Técnico)</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {/* Technical checks */}
                                            <div className="p-3 border rounded-lg space-y-2">
                                                <h4 className="font-medium text-sm">Checks técnicos</h4>
                                                <div className="text-xs space-y-1">
                                                    <div className="flex justify-between">
                                                        <span>Robots.txt</span>
                                                        <span>{od.robots_ok ? '✅' : '❌'}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Sitemap.xml</span>
                                                        <span>{od.sitemap_ok ? '✅' : '❌'}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Canonical Tags</span>
                                                        <span>{od.canonical_ok ? '✅' : '❌'}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>llms.txt</span>
                                                        <span>{od.llms_txt_present ? '✅' : '❌'}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Schema Markup</span>
                                                        <span className="text-right">{String(od.schema_type || 'No detectado')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Scores */}
                                            <div className="p-3 border rounded-lg space-y-2">
                                                <h4 className="font-medium text-sm">Scores EVS</h4>
                                                <div className="text-xs space-y-1">
                                                    <div className="flex justify-between">
                                                        <span>Readiness (Answer Box)</span>
                                                        <span className="font-bold">{Number(od.answer_box_score || 0)}/10</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Structure (H1/H2)</span>
                                                        <span className="font-bold">{Number(od.h1_h2_structure_score || 0)}/10</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Authority</span>
                                                        <span className="font-bold">{Number(od.authority_signals_score || 0)}/10</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Evidence */}
                                        {hasEvidence && (
                                            <details className="mt-3">
                                                <summary className="text-sm font-medium cursor-pointer">📋 Ver evidencia On-site</summary>
                                                <div className="mt-2 p-3 bg-muted/50 rounded text-xs space-y-2">
                                                    {od.readiness_evidence && (
                                                        <div><strong>Readiness:</strong> {String(od.readiness_evidence)}</div>
                                                    )}
                                                    {od.structure_evidence && (
                                                        <div><strong>Structure:</strong> {String(od.structure_evidence)}</div>
                                                    )}
                                                    {od.authority_evidence && (
                                                        <div><strong>Authority:</strong> {String(od.authority_evidence)}</div>
                                                    )}
                                                </div>
                                            </details>
                                        )}
                                        {/* On-site Notes */}
                                        {od.notas && (
                                            <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded border border-yellow-200 dark:border-yellow-900">
                                                <h4 className="font-medium text-sm mb-1">📝 Notas On-site</h4>
                                                <p className="text-xs whitespace-pre-wrap">{String(od.notas)}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Off-site Qualitative Details */}
                            {selectedAuditDetail.audit.offsite_data && Object.keys(selectedAuditDetail.audit.offsite_data).length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-3">🌐 Off-site (Cualitativo)</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 border rounded-lg space-y-2">
                                            <h4 className="font-medium text-sm">Scores Cualitativos</h4>
                                            <div className="text-xs space-y-1">
                                                <div className="flex justify-between">
                                                    <span>Entity Consistency</span>
                                                    <span className="font-bold">{(selectedAuditDetail.audit.offsite_data as Record<string, unknown>).entity_consistency_score as number || 0}/10</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Canonical Sources</span>
                                                    <span>{(selectedAuditDetail.audit.offsite_data as Record<string, unknown>).canonical_sources_presence ? '✅ Presente' : '❌ Ausente'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Reputation Score</span>
                                                    <span className="font-bold">{(selectedAuditDetail.audit.offsite_data as Record<string, unknown>).reputation_score as number || 0}/10</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Share of Voice</span>
                                                    <span className="font-bold">{(selectedAuditDetail.audit.offsite_data as Record<string, unknown>).sov_score as number || 0}%</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-3 border rounded-lg">
                                            <h4 className="font-medium text-sm mb-2">📝 Notas Off-site</h4>
                                            <p className="text-xs whitespace-pre-wrap">{(selectedAuditDetail.audit.offsite_data as Record<string, unknown>).notas as string || 'Sin notas'}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Queries */}
                            {selectedAuditDetail.queries.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-3">
                                        📝 Queries Analizadas ({selectedAuditDetail.queries.length})
                                    </h3>
                                    <div className="space-y-3">
                                        {selectedAuditDetail.queries.map((query, i) => (
                                            <div key={query.id || i} className="p-3 border rounded-lg">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex-1">
                                                        <p className="font-medium text-sm">{query.query_text}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Badge variant="outline" className="text-[10px]">{query.engine}</Badge>
                                                            <span className={`text-xs ${query.is_mentioned ? 'text-green-600' : 'text-red-600'}`}>
                                                                {query.is_mentioned ? '✅ Mencionado' : '❌ No aparece'}
                                                            </span>
                                                            {query.bucket && (
                                                                <Badge variant="secondary" className="text-[10px]">{query.bucket}</Badge>
                                                            )}
                                                            {query.sentiment && (
                                                                <Badge variant={query.sentiment === 'Positive' ? 'default' : query.sentiment === 'Negative' ? 'destructive' : 'outline'} className="text-[10px]">
                                                                    {query.sentiment}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {query.competitors_mentioned && query.competitors_mentioned.length > 0 && (
                                                            <div className="text-xs text-muted-foreground mt-1">
                                                                Competidores: {query.competitors_mentioned.join(', ')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {query.raw_response && (
                                                    <details className="mt-2">
                                                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                                            Ver respuesta completa del motor
                                                        </summary>
                                                        <div className="mt-2 p-2 bg-muted/50 rounded text-xs max-h-60 overflow-y-auto whitespace-pre-wrap">
                                                            {query.raw_response}
                                                        </div>
                                                    </details>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedAuditDetail.queries.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-8">
                                    No hay queries guardadas para esta auditoría.
                                </p>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t flex justify-between">
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        // Export audit as JSON
                                        const exportData = {
                                            audit: selectedAuditDetail.audit,
                                            queries: selectedAuditDetail.queries,
                                            exported_at: new Date().toISOString()
                                        }
                                        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
                                        const url = URL.createObjectURL(blob)
                                        const a = document.createElement('a')
                                        a.href = url
                                        a.download = `auditoria-v${selectedAuditDetail.audit.version}-${new Date(selectedAuditDetail.audit.fecha).toISOString().split('T')[0]}.json`
                                        a.click()
                                        URL.revokeObjectURL(url)
                                        toast.success('Auditoría exportada como JSON')
                                    }}
                                >
                                    <Download className="h-4 w-4 mr-1" />
                                    JSON
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const audit = selectedAuditDetail.audit;
                                        const od = audit.onsite_data as Record<string, string | number | boolean>;
                                        const ofd = audit.offsite_data as Record<string, string | number | boolean>;

                                        // Build comprehensive CSV with multiple sections
                                        let csvContent = '\uFEFF'; // BOM for Excel

                                        // Section 1: Audit Summary
                                        csvContent += 'RESUMEN DE AUDITORÍA\n';
                                        csvContent += `Versión,${audit.version}\n`;
                                        csvContent += `Tipo,${audit.type}\n`;
                                        csvContent += `Fecha,${new Date(audit.fecha).toLocaleDateString('es-AR')}\n`;
                                        csvContent += `EVS Score Total,${audit.evs_score}\n`;
                                        csvContent += `Score On-site,${audit.score_onsite}\n`;
                                        csvContent += `Score Off-site,${audit.score_offsite}\n`;
                                        csvContent += '\n';

                                        // Section 2: On-site Technical
                                        if (od && Object.keys(od).length > 0) {
                                            csvContent += 'ON-SITE TÉCNICO\n';
                                            csvContent += `Robots.txt,${od.robots_ok ? 'OK' : 'No'}\n`;
                                            csvContent += `Sitemap.xml,${od.sitemap_ok ? 'OK' : 'No'}\n`;
                                            csvContent += `Canonical Tags,${od.canonical_ok ? 'OK' : 'No'}\n`;
                                            csvContent += `llms.txt,${od.llms_txt_present ? 'Presente' : 'Ausente'}\n`;
                                            csvContent += `Schema Markup,${od.schema_type || 'No detectado'}\n`;
                                            csvContent += `Readiness Score,${od.answer_box_score || 0}/10\n`;
                                            csvContent += `Structure Score,${od.h1_h2_structure_score || 0}/10\n`;
                                            csvContent += `Authority Score,${od.authority_signals_score || 0}/10\n`;
                                            if (od.readiness_evidence) csvContent += `Evidencia Readiness,"${String(od.readiness_evidence).replace(/"/g, '""')}"\n`;
                                            if (od.structure_evidence) csvContent += `Evidencia Structure,"${String(od.structure_evidence).replace(/"/g, '""')}"\n`;
                                            if (od.authority_evidence) csvContent += `Evidencia Authority,"${String(od.authority_evidence).replace(/"/g, '""')}"\n`;
                                            if (od.notas) csvContent += `Notas On-site,"${String(od.notas).replace(/"/g, '""')}"\n`;
                                            csvContent += '\n';
                                        }

                                        // Section 3: Off-site Qualitative
                                        if (ofd && Object.keys(ofd).length > 0) {
                                            csvContent += 'OFF-SITE CUALITATIVO\n';
                                            csvContent += `Entity Consistency,${ofd.entity_consistency_score || 0}/10\n`;
                                            csvContent += `Canonical Sources,${ofd.canonical_sources_presence ? 'Presente' : 'Ausente'}\n`;
                                            csvContent += `Reputation Score,${ofd.reputation_score || 0}/10\n`;
                                            csvContent += `Share of Voice,${ofd.sov_score || 0}%\n`;
                                            if (ofd.notas) csvContent += `Notas Off-site,"${String(ofd.notas).replace(/"/g, '""')}"\n`;
                                            csvContent += '\n';
                                        }

                                        // Section 4: Queries
                                        csvContent += 'QUERIES ANALIZADAS\n';
                                        csvContent += 'Query,Engine,Mencionado,Bucket,Sentiment,Competidores,Respuesta Completa\n';
                                        selectedAuditDetail.queries.forEach(q => {
                                            const row = [
                                                `"${q.query_text.replace(/"/g, '""')}"`,
                                                q.engine,
                                                q.is_mentioned ? 'Sí' : 'No',
                                                q.bucket || '',
                                                q.sentiment || '',
                                                (q.competitors_mentioned || []).join('; '),
                                                `"${(q.raw_response || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
                                            ];
                                            csvContent += row.join(',') + '\n';
                                        });

                                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `auditoria-completa-v${audit.version}-${new Date(audit.fecha).toISOString().split('T')[0]}.csv`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                        toast.success('Auditoría completa exportada como CSV');
                                    }}
                                >
                                    <FileText className="h-4 w-4 mr-1" />
                                    CSV
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setShowAuditDetailModal(false)}>
                                    Cerrar
                                </Button>
                                <Button onClick={() => {
                                    const type = selectedAuditDetail.audit.type as 'mini' | 'full' | 'retainer'
                                    setAuditType(type || 'full')
                                    setShowAuditDetailModal(false)
                                    toast.info(`Tipo de auditoría cambiado a ${type || 'full'}`)
                                }}>
                                    Usar este tipo
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Edit Modal */}
            {showActionEditModal && selectedActionForEdit && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-background rounded-lg shadow-2xl max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <span>{selectedActionForEdit.emoji}</span>
                                Editar Acción
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => setShowActionEditModal(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <h4 className="font-medium">{selectedActionForEdit.title}</h4>
                                <p className="text-sm text-muted-foreground">{selectedActionForEdit.description}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Estado</Label>
                                    <Select
                                        value={selectedActionForEdit.status}
                                        onValueChange={(v) => setSelectedActionForEdit({ ...selectedActionForEdit, status: v as 'pending' | 'in_progress' | 'done' | 'blocked' })}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="pending">⬜ Pendiente</SelectItem>
                                            <SelectItem value="in_progress">🔄 En Progreso</SelectItem>
                                            <SelectItem value="done">✅ Completado</SelectItem>
                                            <SelectItem value="blocked">🚫 Bloqueado</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs">Fecha Límite</Label>
                                    <Input
                                        type="date"
                                        className="mt-1"
                                        value={selectedActionForEdit.due_date?.split('T')[0] || ''}
                                        onChange={(e) => setSelectedActionForEdit({ ...selectedActionForEdit, due_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <Label className="text-xs">Asignado a</Label>
                                <Input
                                    className="mt-1"
                                    placeholder="Nombre del responsable"
                                    value={selectedActionForEdit.assigned_to || ''}
                                    onChange={(e) => setSelectedActionForEdit({ ...selectedActionForEdit, assigned_to: e.target.value })}
                                />
                            </div>

                            <div>
                                <Label className="text-xs">Notas</Label>
                                <textarea
                                    className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    placeholder="Notas adicionales..."
                                    value={selectedActionForEdit.notes || ''}
                                    onChange={(e) => setSelectedActionForEdit({ ...selectedActionForEdit, notes: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <Button variant="outline" onClick={() => setShowActionEditModal(false)}>
                                Cancelar
                            </Button>
                            <Button
                                disabled={savingActionEdit}
                                onClick={async () => {
                                    setSavingActionEdit(true)
                                    try {
                                        // Update status
                                        const statusResult = await updateActionStatus(
                                            selectedActionForEdit.id,
                                            selectedActionForEdit.status,
                                            selectedActionForEdit.notes
                                        )

                                        // Update details
                                        const detailsResult = await updateActionDetails(selectedActionForEdit.id, {
                                            assignedTo: selectedActionForEdit.assigned_to,
                                            dueDate: selectedActionForEdit.due_date,
                                            notes: selectedActionForEdit.notes
                                        })

                                        if (statusResult.success && detailsResult.success) {
                                            // Update local state
                                            setClientActions(prev => prev.map(a =>
                                                a.id === selectedActionForEdit.id ? selectedActionForEdit : a
                                            ))
                                            toast.success('Acción actualizada')
                                            setShowActionEditModal(false)
                                        } else {
                                            toast.error('Error al guardar cambios')
                                        }
                                    } catch (e) {
                                        console.error('Save action error:', e)
                                        toast.error('Error al guardar')
                                    } finally {
                                        setSavingActionEdit(false)
                                    }
                                }}
                            >
                                {savingActionEdit ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                                Guardar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    )
}
