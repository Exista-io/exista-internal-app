'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Eye, Search, Filter, Archive } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Client, Audit } from '@/types/database'
import { archiveClient } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'

// Extended client with computed fields
type ClientWithStats = Client & {
    lastAudit?: Audit;
    lastAuditDate?: string;
    evsScore?: number;
    pendingActions?: number;
    existaActions?: number;  // Actions owned by Exista
    clientActions?: number;  // Actions owned by Client
}

// Stage config for badges
const STAGE_CONFIG = {
    prospect: { label: 'Prospect', emoji: '🟡', variant: 'outline' as const },
    mini: { label: 'Mini', emoji: '🔵', variant: 'secondary' as const },
    full: { label: 'Full', emoji: '🟢', variant: 'default' as const },
    retainer: { label: 'Retainer', emoji: '🟣', variant: 'default' as const },
    churned: { label: 'Churned', emoji: '⚫', variant: 'destructive' as const },
}

export default function ClientsPage() {
    const [clients, setClients] = useState<ClientWithStats[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    // Filters
    const [searchQuery, setSearchQuery] = useState('')
    const [stageFilter, setStageFilter] = useState<string>('all')

    // Form State
    const [newClient, setNewClient] = useState({
        nombre: '',
        dominio: '',
        mercado: 'AR',
        competidores: '',
        stage: 'prospect',
        notes: '',
    })
    const [isSubmitting, setIsSubmitting] = useState(false)

    const fetchClients = useCallback(async () => {
        setLoading(true)

        // Fetch clients (exclude archived)
        const { data: clientsData, error: clientsError } = await supabase
            .from('clients')
            .select('*')
            .or('archived.is.null,archived.eq.false')
            .order('created_at', { ascending: false })

        if (clientsError) {
            console.error('Error fetching clients:', clientsError)
            setLoading(false)
            return
        }

        // Fetch all audits for stats
        const { data: auditsData } = await supabase
            .from('audits')
            .select('*')
            .order('fecha', { ascending: false })

        // Fetch all actions for counts
        const { data: actionsData } = await supabase
            .from('audit_actions')
            .select('client_id, status, owner_type')

        // Explicit type casts for Supabase data
        const clients = (clientsData || []) as Client[]
        const audits = (auditsData || []) as Array<{ client_id: string; fecha: string; score_total?: number }>
        const actions = (actionsData || []) as Array<{ client_id: string; status: string; owner_type?: string }>

        // Process clients with stats
        const clientsWithStats: ClientWithStats[] = clients.map(client => {
            // Find latest audit
            const clientAudits = audits.filter(a => a.client_id === client.id)
            const lastAudit = clientAudits[0] as Audit | undefined

            // Count pending actions by owner type
            const clientActionsList = actions.filter(a => a.client_id === client.id && a.status !== 'done')
            const pendingActions = clientActionsList.length
            const existaActions = clientActionsList.filter(a => (a.owner_type || 'exista') === 'exista').length
            const clientOwnedActions = clientActionsList.filter(a => a.owner_type === 'client').length

            return {
                ...client,
                stage: client.stage || 'prospect',
                lastAudit,
                lastAuditDate: lastAudit?.fecha,
                evsScore: lastAudit?.score_total,
                pendingActions,
                existaActions,
                clientActions: clientOwnedActions
            }
        })

        setClients(clientsWithStats)
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchClients()
    }, [fetchClients])

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        // Process competitors from string to array
        const competidoresArray = newClient.competidores
            .split(',')
            .map((c) => c.trim())
            .filter((c) => c.length > 0)

        const { error } = await supabase.from('clients').insert({
            nombre: newClient.nombre,
            dominio: newClient.dominio,
            mercado: newClient.mercado,
            competidores: competidoresArray,
            stage: newClient.stage,
            notes: newClient.notes || null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)

        if (error) {
            console.error('Error creating client:', error)
            alert('Error al crear el cliente')
        } else {
            setIsDialogOpen(false)
            setNewClient({ nombre: '', dominio: '', mercado: 'AR', competidores: '', stage: 'prospect', notes: '' })
            fetchClients()
        }
        setIsSubmitting(false)
    }

    // Filter clients
    const filteredClients = clients.filter(client => {
        const matchesSearch = client.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
            client.dominio.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesStage = stageFilter === 'all' || client.stage === stageFilter
        return matchesSearch && matchesStage
    })

    // Get EVS badge color
    const getEvsColor = (score?: number) => {
        if (!score) return 'text-muted-foreground'
        if (score >= 80) return 'text-purple-600'
        if (score >= 60) return 'text-green-600'
        if (score >= 40) return 'text-yellow-600'
        return 'text-red-600'
    }

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Gestión de Clientes</h1>
                    <p className="text-muted-foreground mt-1">{clients.length} clientes en total</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="font-semibold">
                            <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Agregar Nuevo Cliente</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreateClient} className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="nombre" className="text-right">
                                    Empresa
                                </Label>
                                <Input
                                    id="nombre"
                                    value={newClient.nombre}
                                    onChange={(e) => setNewClient({ ...newClient, nombre: e.target.value })}
                                    className="col-span-3"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="dominio" className="text-right">
                                    Dominio
                                </Label>
                                <Input
                                    id="dominio"
                                    value={newClient.dominio}
                                    onChange={(e) => setNewClient({ ...newClient, dominio: e.target.value })}
                                    className="col-span-3"
                                    placeholder="https://example.com"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="mercado" className="text-right">
                                    Mercado
                                </Label>
                                <Select
                                    value={newClient.mercado}
                                    onValueChange={(value) => setNewClient({ ...newClient, mercado: value })}
                                >
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue placeholder="Seleccionar mercado" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AR">Argentina (AR)</SelectItem>
                                        <SelectItem value="MX">México (MX)</SelectItem>
                                        <SelectItem value="ES">España (ES)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="stage" className="text-right">
                                    Stage
                                </Label>
                                <Select
                                    value={newClient.stage}
                                    onValueChange={(value) => setNewClient({ ...newClient, stage: value })}
                                >
                                    <SelectTrigger className="col-span-3">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="prospect">🟡 Prospect</SelectItem>
                                        <SelectItem value="mini">🔵 Mini Audit</SelectItem>
                                        <SelectItem value="full">🟢 Full Audit</SelectItem>
                                        <SelectItem value="retainer">🟣 Retainer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="competidores" className="text-right">
                                    Competidores
                                </Label>
                                <Input
                                    id="competidores"
                                    value={newClient.competidores}
                                    onChange={(e) => setNewClient({ ...newClient, competidores: e.target.value })}
                                    className="col-span-3"
                                    placeholder="Comp1, Comp2, Comp3"
                                />
                            </div>
                            <div className="grid grid-cols-4 items-start gap-4">
                                <Label htmlFor="notes" className="text-right mt-2">
                                    Notas
                                </Label>
                                <Textarea
                                    id="notes"
                                    value={newClient.notes}
                                    onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                                    className="col-span-3"
                                    placeholder="Cómo llegó, qué necesita, contexto..."
                                    rows={3}
                                />
                            </div>
                            <div className="flex justify-end pt-4">
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? 'Guardando...' : 'Guardar Cliente'}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nombre o dominio..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="w-[180px]">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Filtrar por stage" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los stages</SelectItem>
                        <SelectItem value="prospect">🟡 Prospect</SelectItem>
                        <SelectItem value="mini">🔵 Mini</SelectItem>
                        <SelectItem value="full">🟢 Full</SelectItem>
                        <SelectItem value="retainer">🟣 Retainer</SelectItem>
                        <SelectItem value="churned">⚫ Churned</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Listado de Clientes</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">
                            {searchQuery || stageFilter !== 'all'
                                ? 'No hay clientes que coincidan con los filtros.'
                                : 'No hay clientes registrados aún.'}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Stage</TableHead>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>EVS</TableHead>
                                    <TableHead>Última Auditoría</TableHead>
                                    <TableHead>Acciones</TableHead>
                                    <TableHead className="text-right">Ver</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClients.map((client) => {
                                    const stageConfig = STAGE_CONFIG[client.stage as keyof typeof STAGE_CONFIG] || STAGE_CONFIG.prospect
                                    return (
                                        <TableRow key={client.id}>
                                            <TableCell>
                                                <Badge variant={stageConfig.variant} className="text-xs">
                                                    {stageConfig.emoji} {stageConfig.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium">{client.nombre}</div>
                                                <div className="text-xs text-muted-foreground">{client.dominio}</div>
                                            </TableCell>
                                            <TableCell>
                                                {client.evsScore ? (
                                                    <span className={`font-bold ${getEvsColor(client.evsScore)}`}>
                                                        {client.evsScore}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {client.lastAuditDate ? (
                                                    <span className="text-sm">
                                                        {new Date(client.lastAuditDate).toLocaleDateString('es-AR', {
                                                            day: '2-digit', month: 'short', year: 'numeric'
                                                        })}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">Sin auditorías</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {client.pendingActions && client.pendingActions > 0 ? (
                                                    <div className="flex gap-1.5">
                                                        {(client.existaActions || 0) > 0 && (
                                                            <Badge variant="default" className="text-[10px]">
                                                                🏢 {client.existaActions}
                                                            </Badge>
                                                        )}
                                                        {(client.clientActions || 0) > 0 && (
                                                            <Badge variant="secondary" className="text-[10px]">
                                                                👤 {client.clientActions}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                ) : client.lastAudit ? (
                                                    <Badge variant="outline" className="text-green-600 text-[10px]">
                                                        ✅ 0
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <Link href={`/clients/${client.id}`}>
                                                        <Button variant="outline" size="sm">
                                                            <Eye className="mr-2 h-4 w-4" /> Ver
                                                        </Button>
                                                    </Link>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-muted-foreground hover:text-red-500"
                                                        onClick={async () => {
                                                            if (confirm(`¿Archivar "${client.nombre}"? No aparecerá más en el listado.`)) {
                                                                const result = await archiveClient(client.id)
                                                                if (result.success) {
                                                                    setClients(prev => prev.filter(c => c.id !== client.id))
                                                                }
                                                            }
                                                        }}
                                                        title="Archivar cliente"
                                                    >
                                                        <Archive className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
