'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Search, Filter, ArrowLeft, Globe, Users, Mail, Linkedin, Zap, Trash2, UserPlus, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Lead } from '@/types/database'
import { scanLead, deleteLead, convertLeadToClient } from './actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Status config for badges
const STATUS_CONFIG: Record<string, { label: string; emoji: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    new: { label: 'Nuevo', emoji: '🆕', variant: 'outline' },
    scanned: { label: 'Escaneado', emoji: '🔍', variant: 'secondary' },
    qualified: { label: 'Calificado', emoji: '✅', variant: 'default' },
    disqualified: { label: 'Descartado', emoji: '❌', variant: 'destructive' },
    intro_sent: { label: 'Intro Enviado', emoji: '📧', variant: 'secondary' },
    intro_opened: { label: 'Intro Abierto', emoji: '👀', variant: 'secondary' },
    intro_replied: { label: 'Respondió', emoji: '💬', variant: 'default' },
    meeting_booked: { label: 'Meeting', emoji: '📅', variant: 'default' },
    converted: { label: 'Convertido', emoji: '🎉', variant: 'default' },
    lost: { label: 'Perdido', emoji: '😢', variant: 'destructive' },
    cold: { label: 'Frío', emoji: '🥶', variant: 'outline' },
}

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    // Filters
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')

    // Form State
    const [newLead, setNewLead] = useState({
        domain: '',
        company_name: '',
        contact_name: '',
        contact_email: '',
        linkedin_url: '',
        notes: '',
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [scanningIds, setScanningIds] = useState<Set<string>>(new Set())

    // Stats
    const stats = {
        total: leads.length,
        new: leads.filter(l => l.outreach_status === 'new').length,
        qualified: leads.filter(l => ['qualified', 'intro_sent', 'intro_opened'].includes(l.outreach_status)).length,
        meetings: leads.filter(l => l.outreach_status === 'meeting_booked').length,
    }

    const fetchLeads = useCallback(async () => {
        setLoading(true)

        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching leads:', error)
        } else {
            setLeads((data || []) as Lead[])
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchLeads()
    }, [fetchLeads])

    const handleCreateLead = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        // Normalize domain
        let domain = newLead.domain.trim()
        domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')

        const { error } = await supabase.from('leads').insert({
            domain,
            company_name: newLead.company_name || null,
            contact_name: newLead.contact_name || null,
            contact_email: newLead.contact_email || null,
            linkedin_url: newLead.linkedin_url || null,
            notes: newLead.notes || null,
            source: 'manual',
            outreach_status: 'new',
            outreach_channel: 'email',
            market: 'AR',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)

        if (error) {
            console.error('Error creating lead:', error)
            alert('Error al crear el lead: ' + error.message)
        } else {
            setIsDialogOpen(false)
            setNewLead({ domain: '', company_name: '', contact_name: '', contact_email: '', linkedin_url: '', notes: '' })
            fetchLeads()
        }
        setIsSubmitting(false)
    }

    // Filter leads
    const filteredLeads = leads.filter(lead => {
        const matchesSearch =
            lead.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (lead.company_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (lead.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()))
        const matchesStatus = statusFilter === 'all' || lead.outreach_status === statusFilter
        return matchesSearch && matchesStatus
    })

    // Get Quick Score badge color
    const getScoreDisplay = (score?: number | null) => {
        if (score === null || score === undefined) return { text: '-', color: 'text-muted-foreground' }
        if (score === -1) return { text: '🛡️', color: 'text-purple-600' } // Bot blocked
        if (score <= 40) return { text: String(score), color: 'text-red-600 font-bold' } // Hot lead
        if (score <= 60) return { text: String(score), color: 'text-orange-500 font-bold' }
        if (score <= 80) return { text: String(score), color: 'text-yellow-600' }
        return { text: String(score), color: 'text-green-600' }
    }

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Lead Generation</h1>
                    <p className="text-muted-foreground mt-1">Prospección y outreach automatizado</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/">
                        <Button variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
                        </Button>
                    </Link>
                    <Link href="/clients">
                        <Button variant="outline">
                            <Users className="mr-2 h-4 w-4" /> Clientes
                        </Button>
                    </Link>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="font-semibold">
                                <Plus className="mr-2 h-4 w-4" /> Agregar Lead
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Agregar Nuevo Lead</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleCreateLead} className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="domain" className="text-right">
                                        Dominio *
                                    </Label>
                                    <Input
                                        id="domain"
                                        value={newLead.domain}
                                        onChange={(e) => setNewLead({ ...newLead, domain: e.target.value })}
                                        className="col-span-3"
                                        placeholder="ejemplo.com"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="company_name" className="text-right">
                                        Empresa
                                    </Label>
                                    <Input
                                        id="company_name"
                                        value={newLead.company_name}
                                        onChange={(e) => setNewLead({ ...newLead, company_name: e.target.value })}
                                        className="col-span-3"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="contact_name" className="text-right">
                                        Contacto
                                    </Label>
                                    <Input
                                        id="contact_name"
                                        value={newLead.contact_name}
                                        onChange={(e) => setNewLead({ ...newLead, contact_name: e.target.value })}
                                        className="col-span-3"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="contact_email" className="text-right">
                                        Email
                                    </Label>
                                    <Input
                                        id="contact_email"
                                        type="email"
                                        value={newLead.contact_email}
                                        onChange={(e) => setNewLead({ ...newLead, contact_email: e.target.value })}
                                        className="col-span-3"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="linkedin_url" className="text-right">
                                        LinkedIn
                                    </Label>
                                    <Input
                                        id="linkedin_url"
                                        value={newLead.linkedin_url}
                                        onChange={(e) => setNewLead({ ...newLead, linkedin_url: e.target.value })}
                                        className="col-span-3"
                                        placeholder="https://linkedin.com/in/..."
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-start gap-4">
                                    <Label htmlFor="notes" className="text-right mt-2">
                                        Notas
                                    </Label>
                                    <Textarea
                                        id="notes"
                                        value={newLead.notes}
                                        onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                                        className="col-span-3"
                                        placeholder="Fuente, contexto, etc."
                                        rows={3}
                                    />
                                </div>
                                <div className="flex justify-end pt-4">
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting ? 'Guardando...' : 'Guardar Lead'}
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                        <Globe className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Nuevos</CardTitle>
                        <Zap className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.new}</div>
                        <p className="text-xs text-muted-foreground">Pendientes de Quick Scan</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">En Outreach</CardTitle>
                        <Mail className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.qualified}</div>
                        <p className="text-xs text-muted-foreground">Email/LinkedIn activo</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Meetings</CardTitle>
                        <Linkedin className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.meetings}</div>
                        <p className="text-xs text-muted-foreground">Reuniones agendadas</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por dominio, empresa o contacto..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[200px]">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Filtrar por estado" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los estados</SelectItem>
                        <SelectItem value="new">🆕 Nuevo</SelectItem>
                        <SelectItem value="scanned">🔍 Escaneado</SelectItem>
                        <SelectItem value="qualified">✅ Calificado</SelectItem>
                        <SelectItem value="intro_sent">📧 Intro Enviado</SelectItem>
                        <SelectItem value="meeting_booked">📅 Meeting</SelectItem>
                        <SelectItem value="converted">🎉 Convertido</SelectItem>
                        <SelectItem value="lost">😢 Perdido</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Listado de Leads</CardTitle>
                    <CardDescription>
                        {filteredLeads.length} leads encontrados
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
                        </div>
                    ) : filteredLeads.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">
                            {searchQuery || statusFilter !== 'all'
                                ? 'No hay leads que coincidan con los filtros.'
                                : 'No hay leads registrados. Agregá uno para comenzar.'}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Dominio</TableHead>
                                    <TableHead>Contacto</TableHead>
                                    <TableHead>Quick Score</TableHead>
                                    <TableHead>Issues</TableHead>
                                    <TableHead>Canal</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLeads.map((lead) => {
                                    const statusConfig = STATUS_CONFIG[lead.outreach_status] || STATUS_CONFIG.new
                                    return (
                                        <TableRow key={lead.id}>
                                            <TableCell>
                                                <Badge variant={statusConfig.variant} className="text-xs">
                                                    {statusConfig.emoji} {statusConfig.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium">{lead.domain}</div>
                                                {lead.company_name && (
                                                    <div className="text-xs text-muted-foreground">{lead.company_name}</div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {lead.contact_name ? (
                                                    <div>
                                                        <div className="text-sm">{lead.contact_name}</div>
                                                        {lead.contact_email && (
                                                            <div className="text-xs text-muted-foreground">{lead.contact_email}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {lead.quick_scan_done ? (
                                                    <span className={getScoreDisplay(lead.quick_score).color}>
                                                        {getScoreDisplay(lead.quick_score).text}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">Sin scan</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {lead.quick_issues && lead.quick_issues.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {lead.quick_issues.slice(0, 2).map((issue, i) => (
                                                            <Badge key={i} variant="outline" className="text-[10px]">
                                                                {issue.slice(0, 20)}...
                                                            </Badge>
                                                        ))}
                                                        {lead.quick_issues.length > 2 && (
                                                            <Badge variant="outline" className="text-[10px]">
                                                                +{lead.quick_issues.length - 2}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    {(lead.outreach_channel === 'email' || lead.outreach_channel === 'both') && (
                                                        <Mail className="h-4 w-4 text-blue-500" />
                                                    )}
                                                    {(lead.outreach_channel === 'linkedin' || lead.outreach_channel === 'both') && (
                                                        <Linkedin className="h-4 w-4 text-blue-700" />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-1 justify-end">
                                                    <TooltipProvider>
                                                        {!lead.quick_scan_done && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        disabled={scanningIds.has(lead.id)}
                                                                        onClick={async () => {
                                                                            setScanningIds(prev => new Set([...prev, lead.id]))
                                                                            const result = await scanLead(lead.id)
                                                                            if (result.success) {
                                                                                fetchLeads()
                                                                            } else {
                                                                                alert('Error: ' + result.error)
                                                                            }
                                                                            setScanningIds(prev => {
                                                                                const next = new Set(prev)
                                                                                next.delete(lead.id)
                                                                                return next
                                                                            })
                                                                        }}
                                                                    >
                                                                        {scanningIds.has(lead.id) ? (
                                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                                        ) : (
                                                                            <><Zap className="mr-1 h-3 w-3" /> Scan</>
                                                                        )}
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Quick Scan del sitio</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                        {lead.quick_scan_done && lead.outreach_status !== 'converted' && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={async () => {
                                                                            if (confirm(`¿Convertir ${lead.domain} a cliente?`)) {
                                                                                const result = await convertLeadToClient(lead.id)
                                                                                if (result.success) {
                                                                                    fetchLeads()
                                                                                    alert('Lead convertido a cliente')
                                                                                } else {
                                                                                    alert('Error: ' + result.error)
                                                                                }
                                                                            }
                                                                        }}
                                                                    >
                                                                        <UserPlus className="h-3 w-3" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Convertir a Cliente</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-muted-foreground hover:text-red-500"
                                                            title="Eliminar"
                                                            onClick={async () => {
                                                                if (confirm(`¿Eliminar lead ${lead.domain}?`)) {
                                                                    const result = await deleteLead(lead.id)
                                                                    if (result.success) {
                                                                        setLeads(prev => prev.filter(l => l.id !== lead.id))
                                                                    } else {
                                                                        alert('Error al eliminar: ' + (result.error || 'Error desconocido'))
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </TooltipProvider>
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
