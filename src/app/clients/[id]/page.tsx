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
import { Plus, Trash2, ArrowLeft, Save, Loader2, Sparkles, Bot } from 'lucide-react'
import { toast } from 'sonner'
import { analyzeQuery, scanWebsite, suggestQueries, checkShareOfVoice, analyzeOffsiteQualitative } from '@/app/actions'
import { Switch } from '@/components/ui/switch'

// Helper type for Offsite Query UI
type QueryUI = {
    id?: string
    query_text: string
    engine: string
    mentioned: boolean
    status: 'pending' | 'checking' | 'done'
    competitors_mentioned?: string[]
    sentiment?: string
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

    const [scanning, setScanning] = useState(false)
    const [auditType, setAuditType] = useState<'mini' | 'full' | 'retainer'>('full')
    const [onSite, setOnSite] = useState({
        robots_ok: false,
        sitemap_ok: false,
        schema_type: '',
        canonical_ok: false,      // Phase 1
        llms_txt_present: false,  // Phase 1
        answer_box_score: 0,      // 0-10
        h1_h2_structure_score: 0, // 0-10 Phase 1
        authority_signals_score: 0, // 0-10 Phase 1
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

        // Fetch Last Audit for display
        const { data: auditData } = await supabase
            .from('audits')
            .select('*')
            .eq('client_id', id)
            .order('fecha', { ascending: false })
            .limit(1)
            .single()

        if (auditData) {
            setLastAudit(auditData)
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
        const newQueries = [...offsiteQueries]
        // @ts-ignore dynamic field access
        newQueries[index] = { ...newQueries[index], [field]: value }
        setOffsiteQueries(newQueries)
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
                // If schema found, we set a generic type or keep existing if manually typed
                schema_type: results.schema_ok ? (prev.schema_type || "JSON-LD Detectado") : prev.schema_type,

                // Phase 3 Heuristics
                answer_box_score: results.readiness_score,
                h1_h2_structure_score: results.structure_score,
                authority_signals_score: results.authority_score,

                notas: results.summary
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
            // Updated to use checkShareOfVoice logic or robust analyzeQuery
            // We use analyzeQuery for now but expect it to return extra fields if we updated it,
            // or checkShareOfVoice directly.
            // Let's use checkShareOfVoice directly if imported? Yes.
            const result = await checkShareOfVoice(query.query_text, client.nombre, client.competidores || [])

            updateQuery(index, 'mentioned', result.mentioned)
            updateQuery(index, 'competitors_mentioned', result.competitors_mentioned)
            updateQuery(index, 'sentiment', result.sentiment)

            // Optional: You could show the 'reason' in a toast or tooltip
            console.log('AI Result:', result.raw_response_preview)
        } catch (error) {
            console.error('AI Check failed:', error)
        } finally {
            setAnalyzingIndex(null)
        }
    }

    // Phase 3: Off-site Analysis Handler (Queries + Qualitative)
    const handleOffsiteAnalysis = async () => {
        if (!client) return;
        setSuggesting(true);
        try {
            // 1. Suggest Queries
            // Heuristic: If market is likely a country code (e.g. "AR") or "Argentina", default service to "Servicios".
            let service = client.mercado || "Servicios";
            const location = "Argentina";

            const ignoredMarkets = ["ar", "argentina", "latam", "global", "mx", "us", "es", "cl"];
            if (service.length <= 3 || ignoredMarkets.includes(service.toLowerCase())) {
                service = "Servicios";
            }

            const suggestions = await suggestQueries(service, location, client.nombre);

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

            // 2. Run Qualitative Analysis (Auto-fill)
            const qualResults = await analyzeOffsiteQualitative(client.nombre, service);

            setOffSiteResult(prev => ({
                ...prev,
                entity_consistency_score: qualResults.entity_consistency_score,
                canonical_sources_presence: qualResults.canonical_sources_presence,
                reputation_score: qualResults.reputation_score,
                notas: qualResults.notas
            }));

            toast.success(`Análisis Off-site Completo.`);
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
            // 1. Insert Audit Header
            const { data: audit, error: auditError } = await supabase
                .from('audits')
                .insert({
                    client_id: client.id,
                    version: '1.2', // Incremented for Phase 3
                    type: auditType, // Phase 1
                    score_total: evs.total,
                    score_onsite: evs.onSiteScore,
                    score_offsite: evs.offSiteScore,
                    fecha: new Date().toISOString()
                } as any) // Type assertion bypass until types perfectly match
                .select()
                .single()

            if (auditError || !audit) throw auditError || new Error('Failed to create audit')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const auditRecord = audit as any; // Explicit cast to allow access to ID

            // 2. Insert Onsite Results
            const { error: onsiteError } = await supabase
                .from('onsite_results')
                .insert({
                    audit_id: auditRecord.id,
                    robots_ok: onSite.robots_ok,
                    sitemap_ok: onSite.sitemap_ok,
                    schema_type: onSite.schema_type,
                    answer_box_score: onSite.answer_box_score,
                    canonical_ok: onSite.canonical_ok, // Phase 1
                    llms_txt_present: onSite.llms_txt_present, // Phase 1
                    h1_h2_structure_score: onSite.h1_h2_structure_score, // Phase 1
                    authority_signals_score: onSite.authority_signals_score, // Phase 1
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

            // 4. Insert Offsite Queries
            const validQueries = offsiteQueries.filter(q => q.query_text.trim() !== '')
            if (validQueries.length > 0) {
                const { error: offsiteError } = await supabase
                    .from('offsite_queries')
                    .insert(validQueries.map(q => ({
                        audit_id: auditRecord.id,
                        query_text: q.query_text,
                        engine: q.engine,
                        mentioned: q.mentioned,
                        position: q.mentioned ? 'top' : 'none',
                        competitors_mentioned: q.competitors_mentioned || [], // Phase 3
                        sentiment: q.sentiment // Phase 3
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    })) as any)

                if (offsiteError) throw offsiteError
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
                                        {/* Audit Type */}
                                        <div className="space-y-2">
                                            <Label>Tipo de Auditoría</Label>
                                            <Select value={auditType} onValueChange={(v: any) => setAuditType(v)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Seleccionar tipo" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="mini">Mini Audit</SelectItem>
                                                    <SelectItem value="full">Full Audit</SelectItem>
                                                    <SelectItem value="retainer">Retainer Check</SelectItem>
                                                </SelectContent>
                                            </Select>
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
                                                <Label htmlFor="robots">Robots.txt OK</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <Checkbox
                                                    id="sitemap"
                                                    checked={onSite.sitemap_ok}
                                                    onCheckedChange={(c) => setOnSite({ ...onSite, sitemap_ok: c as boolean })}
                                                />
                                                <Label htmlFor="sitemap">Sitemap.xml OK</Label>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="canonical" className="text-sm">Canonical Tags</Label>
                                                <Switch
                                                    id="canonical"
                                                    checked={onSite.canonical_ok}
                                                    onCheckedChange={(c) => setOnSite({ ...onSite, canonical_ok: c })}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="llms" className="text-sm">llms.txt Present</Label>
                                                <Switch
                                                    id="llms"
                                                    checked={onSite.llms_txt_present}
                                                    onCheckedChange={(c) => setOnSite({ ...onSite, llms_txt_present: c })}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Schema Markup</Label>
                                            <Input
                                                placeholder="Ej: Organization, Product..."
                                                value={onSite.schema_type}
                                                onChange={(e) => setOnSite({ ...onSite, schema_type: e.target.value })}
                                            />
                                        </div>

                                        <Separator />

                                        {/* Sliders */}
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <Label>Readiness</Label>
                                                    <span className="text-xs text-muted-foreground">{onSite.answer_box_score}/10</span>
                                                </div>
                                                <Slider
                                                    value={[onSite.answer_box_score]}
                                                    min={0} max={10} step={1}
                                                    onValueChange={(vals) => setOnSite({ ...onSite, answer_box_score: vals[0] })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <Label>Estructura H1/H2</Label>
                                                    <span className="text-xs text-muted-foreground">{onSite.h1_h2_structure_score}/10</span>
                                                </div>
                                                <Slider
                                                    value={[onSite.h1_h2_structure_score]}
                                                    min={0} max={10} step={1}
                                                    onValueChange={(vals) => setOnSite({ ...onSite, h1_h2_structure_score: vals[0] })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <Label>Autoridad</Label>
                                                    <span className="text-xs text-muted-foreground">{onSite.authority_signals_score}/10</span>
                                                </div>
                                                <Slider
                                                    value={[onSite.authority_signals_score]}
                                                    min={0} max={10} step={1}
                                                    onValueChange={(vals) => setOnSite({ ...onSite, authority_signals_score: vals[0] })}
                                                />
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
                                                            <SelectItem value="Google">Google</SelectItem>
                                                        </SelectContent>
                                                    </Select>

                                                    <div className="flex items-center space-x-2">
                                                        <div className={`h-2 w-2 rounded-full ${query.mentioned ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                        <span className="text-xs">{query.mentioned ? 'Detectado' : 'No'}</span>
                                                    </div>

                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => handleAutoCheck(index)}
                                                            disabled={analyzingIndex === index || !query.query_text}
                                                            title="Auto-Check"
                                                        >
                                                            {analyzingIndex === index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-purple-600" />}
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveQuery(index)}>
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <Separator className="my-4" />

                                    {/* Off-site Qualitative Inputs (Phase 3) */}
                                    <div className="space-y-4">
                                        <h4 className="font-semibold text-sm">Cualitativo Off-site</h4>

                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <Label className="text-xs">Consistencia de Entidad</Label>
                                                <span className="text-xs text-muted-foreground">{offSiteResult.entity_consistency_score}/10</span>
                                            </div>
                                            <Slider
                                                value={[offSiteResult.entity_consistency_score]}
                                                min={0} max={10} step={1}
                                                onValueChange={(vals) => setOffSiteResult({ ...offSiteResult, entity_consistency_score: vals[0] })}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs">Fuentes Canónicas (Wiki/Wikidata)</Label>
                                            <Switch
                                                checked={offSiteResult.canonical_sources_presence}
                                                onCheckedChange={(c) => setOffSiteResult({ ...offSiteResult, canonical_sources_presence: c })}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <Label className="text-xs">Reputación / Earned Media</Label>
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

                            <Button className="w-full text-lg mt-6" size="lg" onClick={handleSaveAudit} disabled={saving}>
                                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="mr-2 h-4 w-4" /> Guardar Auditoría</>}
                            </Button>

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
        </div >
    )
}
