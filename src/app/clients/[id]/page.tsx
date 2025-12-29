'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
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
import { Plus, Trash2, ArrowLeft, Save, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { analyzeQuery } from '@/app/actions'

// Helper type for Offsite Query UI
type OffsiteQueryInput = {
    id: string; // temp id for UI
    query_text: string;
    engine: string;
    mentioned: boolean;
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter()
    // React 18+ way to unwrap params
    const { id } = use(params)

    const [client, setClient] = useState<Client | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [lastAudit, setLastAudit] = useState<Audit | null>(null)

    // Audit Form State
    const [onSite, setOnSite] = useState({
        robots_ok: false,
        sitemap_ok: false,
        schema_type: '',
        answer_box_score: 0, // 0-10
    })

    // Offsite State
    const [offsiteQueries, setOffsiteQueries] = useState<OffsiteQueryInput[]>([
        { id: '1', query_text: '', engine: 'ChatGPT', mentioned: false }
    ])

    // Real-time EVS Calculation
    const currentEvs = calculateEVSScore(
        { ...onSite, canonical_ok: true },
        { queries: offsiteQueries.filter(q => q.query_text.trim() !== '') }
    )

    useEffect(() => {
        fetchClientData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Remove id dependency to avoid infinite loop if simple mount. id is stable from params.

    const fetchClientData = async () => {
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
            { id: Math.random().toString(36), query_text: '', engine: 'ChatGPT', mentioned: false }
        ])
    }

    const handleRemoveQuery = (index: number) => {
        const newQueries = [...offsiteQueries]
        newQueries.splice(index, 1)
        setOffsiteQueries(newQueries)
    }

    const updateQuery = (index: number, field: keyof OffsiteQueryInput, value: string | boolean) => {
        const newQueries = [...offsiteQueries]
        newQueries[index] = { ...newQueries[index], [field]: value }
        setOffsiteQueries(newQueries)
    }

    const [analyzingIndex, setAnalyzingIndex] = useState<number | null>(null)

    const handleAutoCheck = async (index: number) => {
        if (!client) return
        const query = offsiteQueries[index]
        if (!query.query_text) return

        setAnalyzingIndex(index)
        try {
            const result = await analyzeQuery(query.query_text, client.nombre, query.engine)
            updateQuery(index, 'mentioned', result.mentioned)
            // Optional: You could show the 'reason' in a toast or tooltip
            console.log('AI Result:', result.reason)
        } catch (error) {
            console.error('AI Check failed:', error)
        } finally {
            setAnalyzingIndex(null)
        }
    }

    const handleSaveAudit = async () => {
        if (!client) return
        setSaving(true)

        // Calculate Score for Save
        const evs = calculateEVSScore(
            { ...onSite, canonical_ok: true },
            { queries: offsiteQueries.filter(q => q.query_text.trim() !== '') }
        )

        try {
            // 1. Create Audit Record
            const { data: audit, error: auditError } = await supabase
                .from('audits')
                .insert({
                    client_id: client.id,
                    version: '1.0',
                    score_total: evs.total,
                    score_onsite: evs.onSiteScore,
                    score_offsite: evs.offSiteScore,
                    fecha: new Date().toISOString()
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                    canonical_ok: true
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any)

            if (onsiteError) throw onsiteError

            // 3. Insert Offsite Queries
            const validQueries = offsiteQueries.filter(q => q.query_text.trim() !== '')
            if (validQueries.length > 0) {
                const { error: offsiteError } = await supabase
                    .from('offsite_queries')
                    .insert(validQueries.map(q => ({
                        audit_id: auditRecord.id,
                        query_text: q.query_text,
                        engine: q.engine,
                        mentioned: q.mentioned,
                        position: q.mentioned ? 'top' : 'none'
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
                            <CardTitle>Nueva Auditoría EVS v1.0</CardTitle>
                            <CardDescription>Completa los checklist On-site y Off-site para calcular el score.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">

                            <Tabs defaultValue="onsite" className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="onsite">On-site (Técnico)</TabsTrigger>
                                    <TabsTrigger value="offsite">Off-site (Autoridad)</TabsTrigger>
                                </TabsList>

                                {/* ON-SITE TAB */}
                                <TabsContent value="onsite" className="space-y-6 py-4">
                                    <div className="grid gap-4 border p-4 rounded-md">
                                        <h3 className="font-semibold mb-2">Fundamentos Técnicos</h3>

                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="robots"
                                                checked={onSite.robots_ok}
                                                onCheckedChange={(c) => setOnSite({ ...onSite, robots_ok: !!c })}
                                            />
                                            <Label htmlFor="robots">Robots.txt optimizado y sin bloqueos críticos</Label>
                                        </div>

                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="sitemap"
                                                checked={onSite.sitemap_ok}
                                                onCheckedChange={(c) => setOnSite({ ...onSite, sitemap_ok: !!c })}
                                            />
                                            <Label htmlFor="sitemap">Sitemap.xml actualizado y enviado</Label>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="schema">Schema Markup Principal Detectado</Label>
                                            <Input
                                                id="schema"
                                                placeholder="ej. Organization, LocalBusiness, Product..."
                                                value={onSite.schema_type}
                                                onChange={(e) => setOnSite({ ...onSite, schema_type: e.target.value })}
                                            />
                                            <p className="text-xs text-muted-foreground">Dejar vacío si no se detecta nada.</p>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 border p-4 rounded-md">
                                        <div className="flex justify-between">
                                            <Label>Answer Box Readiness (0-10)</Label>
                                            <span className="font-bold">{onSite.answer_box_score}</span>
                                        </div>
                                        <Slider
                                            defaultValue={[0]}
                                            max={10}
                                            step={1}
                                            value={[onSite.answer_box_score]}
                                            onValueChange={(vals) => setOnSite({ ...onSite, answer_box_score: vals[0] })}
                                        />
                                        <p className="text-xs text-muted-foreground">Evaluar estructura de contenido, uso de listas, tablas y definiciones claras.</p>
                                    </div>
                                </TabsContent>

                                {/* OFF-SITE TAB */}
                                <TabsContent value="offsite" className="space-y-6 py-4">
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h3 className="font-semibold">Money Queries & AI Presence</h3>
                                            <Button size="sm" variant="outline" onClick={handleAddQuery}><Plus className="h-4 w-4 mr-2" /> Agregar Query</Button>
                                        </div>
                                        <p className="text-sm text-muted-foreground">Ingresa las keywords principales y verifica si la marca aparece en las respuestas de la IA.</p>

                                        {offsiteQueries.map((query, index) => (
                                            <div key={query.id} className="flex gap-4 items-start border p-3 rounded-md bg-muted/20">
                                                <div className="flex-1 space-y-2">
                                                    <Input
                                                        placeholder="Query (ej. 'Mejor seguro de auto')"
                                                        value={query.query_text}
                                                        onChange={(e) => updateQuery(index, 'query_text', e.target.value)}
                                                    />
                                                    <div className="flex gap-2">
                                                        <Select
                                                            value={query.engine}
                                                            onValueChange={(v) => updateQuery(index, 'engine', v)}
                                                        >
                                                            <SelectTrigger className="w-[180px]">
                                                                <SelectValue placeholder="Motor" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="ChatGPT">ChatGPT</SelectItem>
                                                                <SelectItem value="Claude">Claude</SelectItem>
                                                                <SelectItem value="Gemini">Gemini</SelectItem>
                                                                <SelectItem value="Perplexity">Perplexity</SelectItem>
                                                            </SelectContent>
                                                        </Select>

                                                        <div className="flex items-center space-x-2 border px-3 rounded-md bg-background">
                                                            <Checkbox
                                                                id={`q-mentioned-${index}`}
                                                                checked={query.mentioned}
                                                                onCheckedChange={(c) => updateQuery(index, 'mentioned', !!c)}
                                                            />
                                                            <Label htmlFor={`q-mentioned-${index}`} className="cursor-pointer">Mencionada</Label>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    onClick={() => handleAutoCheck(index)}
                                                    disabled={analyzingIndex === index || !query.query_text}
                                                    title="Auto-Check con IA"
                                                >
                                                    {analyzingIndex === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-purple-600" />}
                                                </Button>
                                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleRemoveQuery(index)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </TabsContent>
                            </Tabs>

                            <Button className="w-full text-lg" size="lg" onClick={handleSaveAudit} disabled={saving}>
                                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="mr-2 h-4 w-4" /> Guardar Auditoría</>}
                            </Button>

                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar / Info */}
                <div className="space-y-6">
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
                </div>

            </div>
        </div>
    )
}
