'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Search, Filter, ArrowLeft, Globe, Users, Mail, Linkedin, Zap, Trash2, UserPlus, Loader2, Upload, Sparkles, Pencil, CheckSquare, Download, Send, History, Wand2, ListTodo } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Lead, Cadence } from '@/types/database'
import { scanLead, deleteLead, convertLeadToClient, enrichLeadWithHunter, bulkImportLeads, getHunterCredits, updateLead, bulkDeleteLeads, bulkUpdateStatus, getEmailTemplates, sendEmailToLead, getEmailPreview, sendCustomEmailToLead, getLeadActivityLogs, improveEmailWithAI, researchLead, bulkResearchLeads, deepScanLead, generateLinkedInMessage, exportLeadsToCSV, researchPerson } from './actions'
import { getCadences, bulkAssignToCadence } from '../cadences/actions'
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
    const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set())
    const [researchingIds, setResearchingIds] = useState<Set<string>>(new Set())
    const [deepScanningIds, setDeepScanningIds] = useState<Set<string>>(new Set())

    // Bulk Import State
    const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
    const [bulkDomainsText, setBulkDomainsText] = useState('')
    const [bulkImporting, setBulkImporting] = useState(false)
    const [bulkResult, setBulkResult] = useState<{ imported: number; skipped: number } | null>(null)

    // Hunter Credits
    const [hunterCredits, setHunterCredits] = useState<number | null>(null)

    // Bulk Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkActioning, setBulkActioning] = useState(false)

    // Edit Modal State
    const [editingLead, setEditingLead] = useState<Lead | null>(null)
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [editForm, setEditForm] = useState({
        company_name: '',
        contact_name: '',
        contact_email: '',
        contact_role: '',
        linkedin_url: '',
        notes: '',
        outreach_channel: 'email',
    })
    const [isSavingEdit, setIsSavingEdit] = useState(false)

    // Email Dialog State
    const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
    const [emailingLead, setEmailingLead] = useState<Lead | null>(null)
    const [emailTemplates, setEmailTemplates] = useState<Array<{ id: string; name: string; subject: string; body_markdown: string; template_type: string | null }>>([])
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
    const [sendingEmail, setSendingEmail] = useState(false)
    const [emailPreview, setEmailPreview] = useState<{ subject: string; body: string } | null>(null)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [senderName, setSenderName] = useState('Gaby')
    const [improvingWithAI, setImprovingWithAI] = useState(false)
    const [emailAttachments, setEmailAttachments] = useState<Array<{ filename: string; content: string }>>([])
    const [uploadingFile, setUploadingFile] = useState(false)

    // History Modal State
    const [isHistoryOpen, setIsHistoryOpen] = useState(false)
    const [historyLead, setHistoryLead] = useState<Lead | null>(null)
    const [activityLogs, setActivityLogs] = useState<Array<{
        id: string;
        action_type: string;
        channel: string;
        message_preview: string | null;
        success: boolean;
        error_message: string | null;
        created_at: string;
    }>>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    // LinkedIn Dialog State
    const [isLinkedInDialogOpen, setIsLinkedInDialogOpen] = useState(false)
    const [linkedInLead, setLinkedInLead] = useState<Lead | null>(null)
    const [linkedInMessage, setLinkedInMessage] = useState('')
    const [generatingLinkedIn, setGeneratingLinkedIn] = useState(false)
    const [linkedInMessageType, setLinkedInMessageType] = useState<'connection' | 'followup' | 'pitch'>('connection')
    const [researchingPersonIds, setResearchingPersonIds] = useState<Set<string>>(new Set())

    // Cadences State
    const [cadences, setCadences] = useState<Cadence[]>([])
    const [assigningCadence, setAssigningCadence] = useState(false)

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

    // Fetch Hunter credits on mount
    useEffect(() => {
        getHunterCredits().then(result => {
            if (result.available && result.remaining !== undefined) {
                setHunterCredits(result.remaining)
            }
        })
    }, [])

    // Fetch cadences on mount
    useEffect(() => {
        getCadences().then(result => {
            if (result.success && result.cadences) {
                setCadences(result.cadences)
            }
        })
    }, [])

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

    // Export leads to CSV for LinkedIn automation (Expandi, HeyReach, etc)
    const exportLeadsToCSVLocal = () => {
        // Filter leads with LinkedIn URLs
        const leadsToExport = selectedIds.size > 0
            ? filteredLeads.filter(l => selectedIds.has(l.id))
            : filteredLeads.filter(l => l.linkedin_url)

        if (leadsToExport.length === 0) {
            alert('No hay leads con LinkedIn URL para exportar. Usá Hunter.io para enriquecer primero.')
            return
        }

        // CSV Header - Expandi compatible format
        const headers = [
            'LinkedIn URL',
            'First Name',
            'Last Name',
            'Company',
            'Email',
            'Title',
            'Domain',
            'Quick Score',
            'Issues',
            'Custom Message'
        ]

        // Generate personalized message based on issues
        const generateMessage = (lead: Lead) => {
            const issues = lead.quick_issues || []
            if (issues.length === 0) return ''

            const issueHooks: Record<string, string> = {
                'no-robots': 'Vi que no tienen robots.txt configurado',
                'no-sitemap': 'Noté que falta un sitemap.xml',
                'no-schema': 'Detecté que no tienen schema markup',
                'no-canonical': 'Encontré issues con canonical URLs',
                'no-llms': 'No están preparados para AI search (llms.txt)',
            }

            for (const issue of issues) {
                for (const [key, hook] of Object.entries(issueHooks)) {
                    if (issue.toLowerCase().includes(key.replace('-', ' ').replace('no ', ''))) {
                        return hook
                    }
                }
            }
            return `Analicé ${lead.domain} y encontré ${issues.length} oportunidades de mejora`
        }

        // Build CSV rows
        const rows = leadsToExport.map(lead => {
            const names = (lead.contact_name || '').split(' ')
            const firstName = names[0] || ''
            const lastName = names.slice(1).join(' ') || ''

            return [
                lead.linkedin_url || '',
                firstName,
                lastName,
                lead.company_name || '',
                lead.contact_email || '',
                lead.contact_role || '',
                lead.domain,
                lead.quick_score?.toString() || '',
                (lead.quick_issues || []).join('; '),
                generateMessage(lead)
            ]
        })

        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n')

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `leads-linkedin-export-${new Date().toISOString().split('T')[0]}.csv`
        link.click()
        URL.revokeObjectURL(url)
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

                    {/* Bulk Import Dialog */}
                    <Dialog open={isBulkImportOpen} onOpenChange={setIsBulkImportOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline">
                                <Upload className="mr-2 h-4 w-4" /> Bulk Import
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px]">
                            <DialogHeader>
                                <DialogTitle>Importar Dominios en Bulk</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label>Pegar lista de dominios (uno por línea o separados por coma)</Label>
                                    <Textarea
                                        value={bulkDomainsText}
                                        onChange={(e) => setBulkDomainsText(e.target.value)}
                                        placeholder="ejemplo1.com&#10;ejemplo2.com&#10;ejemplo3.com"
                                        rows={10}
                                        className="font-mono text-sm"
                                    />
                                </div>
                                {bulkResult && (
                                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-md text-sm">
                                        ✅ Importados: <strong>{bulkResult.imported}</strong> |
                                        ⏭️ Duplicados: <strong>{bulkResult.skipped}</strong>
                                    </div>
                                )}
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setIsBulkImportOpen(false)
                                            setBulkDomainsText('')
                                            setBulkResult(null)
                                        }}
                                    >
                                        Cerrar
                                    </Button>
                                    <Button
                                        disabled={bulkImporting || !bulkDomainsText.trim()}
                                        onClick={async () => {
                                            setBulkImporting(true)
                                            // Parse domains from text
                                            const domains = bulkDomainsText
                                                .split(/[\n,;]+/)
                                                .map(d => d.trim())
                                                .filter(d => d.length > 0 && d.includes('.'))

                                            const result = await bulkImportLeads(domains)
                                            setBulkResult({ imported: result.imported, skipped: result.skipped })
                                            setBulkImporting(false)
                                            fetchLeads()
                                        }}
                                    >
                                        {bulkImporting ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando...</>
                                        ) : (
                                            <>Importar {bulkDomainsText.split(/[\n,;]+/).filter(d => d.trim().includes('.')).length} dominios</>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Export LinkedIn CSV Button */}
                    <Button
                        variant="outline"
                        onClick={exportLeadsToCSVLocal}
                        title="Exportar leads con LinkedIn URL a CSV para Expandi/HeyReach"
                    >
                        <Download className="mr-2 h-4 w-4" /> Export LinkedIn
                    </Button>
                </div>
            </div>

            {/* Edit Lead Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Editar Lead: {editingLead?.domain}</DialogTitle>
                    </DialogHeader>
                    <form
                        onSubmit={async (e) => {
                            e.preventDefault()
                            if (!editingLead) return
                            setIsSavingEdit(true)
                            const result = await updateLead(editingLead.id, editForm)
                            if (result.success) {
                                setIsEditDialogOpen(false)
                                fetchLeads()
                            } else {
                                alert('Error: ' + result.error)
                            }
                            setIsSavingEdit(false)
                        }}
                        className="grid gap-4 py-4"
                    >
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Empresa</Label>
                            <Input
                                value={editForm.company_name}
                                onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Contacto</Label>
                            <Input
                                value={editForm.contact_name}
                                onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Email</Label>
                            <Input
                                type="email"
                                value={editForm.contact_email}
                                onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Cargo</Label>
                            <Input
                                value={editForm.contact_role}
                                onChange={(e) => setEditForm({ ...editForm, contact_role: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">LinkedIn</Label>
                            <Input
                                value={editForm.linkedin_url}
                                onChange={(e) => setEditForm({ ...editForm, linkedin_url: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Canal</Label>
                            <Select
                                value={editForm.outreach_channel}
                                onValueChange={(v) => setEditForm({ ...editForm, outreach_channel: v })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="email">📧 Email</SelectItem>
                                    <SelectItem value="linkedin">💼 LinkedIn</SelectItem>
                                    <SelectItem value="both">📧💼 Ambos</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Notas</Label>
                            <Textarea
                                value={editForm.notes}
                                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                className="col-span-3"
                                rows={3}
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSavingEdit}>
                                {isSavingEdit ? 'Guardando...' : 'Guardar Cambios'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Send Email Dialog */}
            <Dialog open={isEmailDialogOpen} onOpenChange={(open) => {
                setIsEmailDialogOpen(open)
                if (!open) {
                    setEmailingLead(null)
                    setSelectedTemplateId('')
                    setEmailPreview(null)
                    setEmailAttachments([])
                }
            }}>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>📧 Enviar Email a {emailingLead?.contact_name || emailingLead?.domain}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="text-sm text-muted-foreground">
                            <strong>Destinatario:</strong> {emailingLead?.contact_email}
                        </div>

                        {/* Sender Name */}
                        <div className="grid gap-2">
                            <Label htmlFor="sender-name">Remitente (nombre)</Label>
                            <Input
                                id="sender-name"
                                value={senderName}
                                onChange={(e) => setSenderName(e.target.value)}
                                placeholder="Juan"
                                className="max-w-xs"
                            />
                            <p className="text-xs text-muted-foreground">
                                El email se enviará como: {senderName} &lt;gaby@exista.io&gt;
                            </p>
                        </div>

                        {/* Template Selector */}
                        <div className="grid gap-2">
                            <Label>1. Seleccionar Template</Label>
                            <Select
                                value={selectedTemplateId}
                                onValueChange={async (value) => {
                                    setSelectedTemplateId(value)
                                    setEmailPreview(null)
                                    if (value && emailingLead) {
                                        setLoadingPreview(true)
                                        const result = await getEmailPreview(emailingLead.id, value)
                                        if (result.success && result.subject && result.body) {
                                            setEmailPreview({ subject: result.subject, body: result.body })
                                        }
                                        setLoadingPreview(false)
                                    }
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Elegir template..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {emailTemplates.map(t => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Preview Loading */}
                        {loadingPreview && (
                            <div className="flex items-center justify-center p-4">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Cargando preview...</span>
                            </div>
                        )}

                        {/* Email Preview & Edit */}
                        {emailPreview && !loadingPreview && (
                            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                                <Label>2. Revisar y Editar Email</Label>

                                <div className="space-y-2">
                                    <Label htmlFor="email-subject" className="text-sm">Asunto</Label>
                                    <Input
                                        id="email-subject"
                                        value={emailPreview.subject}
                                        onChange={(e) => setEmailPreview({ ...emailPreview, subject: e.target.value })}
                                        className="font-medium"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email-body" className="text-sm">Cuerpo del Email (Markdown)</Label>
                                    <Textarea
                                        id="email-body"
                                        value={emailPreview.body}
                                        onChange={(e) => setEmailPreview({ ...emailPreview, body: e.target.value })}
                                        rows={12}
                                        className="font-mono text-sm"
                                    />
                                </div>

                                <p className="text-xs text-muted-foreground">
                                    💡 Podés editar el asunto y cuerpo antes de enviar. Los links [texto](url) se convertirán a HTML.
                                </p>

                                {/* AI Improve Button */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={improvingWithAI}
                                    onClick={async () => {
                                        if (!emailingLead || !emailPreview) return
                                        setImprovingWithAI(true)
                                        const result = await improveEmailWithAI(
                                            emailPreview.subject,
                                            emailPreview.body,
                                            emailingLead.id,
                                            {
                                                company_name: emailingLead.company_name || undefined,
                                                contact_name: emailingLead.contact_name || undefined,
                                                domain: emailingLead.domain,
                                                quick_issues: emailingLead.quick_issues || undefined,
                                                // AI Research context
                                                company_description: emailingLead.company_description || undefined,
                                                company_industry: emailingLead.company_industry || undefined,
                                                company_stage: emailingLead.company_stage || undefined,
                                                pain_points: emailingLead.pain_points || undefined,
                                                recent_news: emailingLead.recent_news || undefined,
                                                // Deep Scan data
                                                evs_score_estimate: emailingLead.evs_score_estimate || undefined,
                                                deep_scan_results: emailingLead.deep_scan_results as {
                                                    readiness_score: number;
                                                    structure_score: number;
                                                    authority_score: number;
                                                    readiness_evidence: string;
                                                    structure_evidence: string;
                                                    authority_evidence: string;
                                                } | undefined,
                                                // Person Research data
                                                person_background: emailingLead.person_background || undefined,
                                                person_recent_activity: emailingLead.person_recent_activity || undefined,
                                                person_interests: emailingLead.person_interests || undefined,
                                                person_talking_points: emailingLead.person_talking_points || undefined,
                                                person_research_done: emailingLead.person_research_done || false,
                                            }
                                        )
                                        if (result.success && result.improved_subject && result.improved_body) {
                                            setEmailPreview({
                                                subject: result.improved_subject,
                                                body: result.improved_body,
                                            })
                                        } else {
                                            alert('Error: ' + (result.error || 'No se pudo mejorar'))
                                        }
                                        setImprovingWithAI(false)
                                    }}
                                    className="mt-2"
                                >
                                    {improvingWithAI ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mejorando con IA...</>
                                    ) : (
                                        <><Wand2 className="mr-2 h-4 w-4" /> Mejorar con IA (Gemini)</>
                                    )}
                                </Button>

                                {/* File Attachments */}
                                <div className="mt-4 space-y-2">
                                    <Label className="text-sm">Adjuntar archivos (opcional)</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="file"
                                            id="email-attachment"
                                            className="max-w-xs"
                                            disabled={uploadingFile}
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (!file) return

                                                if (file.size > 5 * 1024 * 1024) {
                                                    alert('Archivo muy grande. Máximo 5MB.')
                                                    return
                                                }

                                                setUploadingFile(true)
                                                try {
                                                    const reader = new FileReader()
                                                    reader.onload = () => {
                                                        const base64 = (reader.result as string).split(',')[1]
                                                        setEmailAttachments([...emailAttachments, {
                                                            filename: file.name,
                                                            content: base64
                                                        }])
                                                    }
                                                    reader.readAsDataURL(file)
                                                } catch (error) {
                                                    alert('Error al cargar archivo')
                                                }
                                                setUploadingFile(false)
                                                e.target.value = '' // Reset input
                                            }}
                                        />
                                        {uploadingFile && <Loader2 className="h-4 w-4 animate-spin" />}
                                    </div>
                                    {emailAttachments.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {emailAttachments.map((att, i) => (
                                                <div key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm">
                                                    <span>📎 {att.filename}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEmailAttachments(emailAttachments.filter((_, idx) => idx !== i))}
                                                        className="text-red-500 hover:text-red-700 ml-1"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        Máximo 5MB por archivo. PDFs, imágenes, documentos.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                disabled={!emailPreview || sendingEmail}
                                onClick={async () => {
                                    if (!emailingLead || !selectedTemplateId || !emailPreview) return
                                    setSendingEmail(true)
                                    // Send with edited content and attachments
                                    const result = await sendCustomEmailToLead(
                                        emailingLead.id,
                                        selectedTemplateId,
                                        emailPreview.subject,
                                        emailPreview.body,
                                        senderName,
                                        emailAttachments.length > 0 ? emailAttachments : undefined
                                    )
                                    if (result.success) {
                                        alert(`✅ Email enviado correctamente!${emailAttachments.length > 0 ? ` (con ${emailAttachments.length} adjunto/s)` : ''}`)
                                        setIsEmailDialogOpen(false)
                                        setEmailPreview(null)
                                        setEmailAttachments([])
                                        fetchLeads()
                                    } else {
                                        alert('❌ Error: ' + result.error)
                                    }
                                    setSendingEmail(false)
                                }}
                            >
                                {sendingEmail ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
                                ) : (
                                    <><Send className="mr-2 h-4 w-4" /> Enviar Email</>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* LinkedIn Message Dialog */}
            <Dialog open={isLinkedInDialogOpen} onOpenChange={(open) => {
                setIsLinkedInDialogOpen(open)
                if (!open) {
                    setLinkedInLead(null)
                    setLinkedInMessage('')
                }
            }}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>💼 Mensaje LinkedIn: {linkedInLead?.contact_name || linkedInLead?.domain}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <Button
                                variant={linkedInMessageType === 'connection' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setLinkedInMessageType('connection')}
                            >
                                🤝 Conexión
                            </Button>
                            <Button
                                variant={linkedInMessageType === 'followup' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setLinkedInMessageType('followup')}
                            >
                                💬 Seguimiento
                            </Button>
                            <Button
                                variant={linkedInMessageType === 'pitch' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setLinkedInMessageType('pitch')}
                            >
                                🎯 Pitch
                            </Button>
                        </div>

                        <Button
                            className="w-full"
                            disabled={generatingLinkedIn || !linkedInLead}
                            onClick={async () => {
                                if (!linkedInLead) return
                                setGeneratingLinkedIn(true)
                                const result = await generateLinkedInMessage(linkedInLead.id, linkedInMessageType)
                                if (result.success && result.message) {
                                    setLinkedInMessage(result.message)
                                } else {
                                    alert('Error: ' + (result.error || 'No se pudo generar'))
                                }
                                setGeneratingLinkedIn(false)
                            }}
                        >
                            {generatingLinkedIn ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando...</>
                            ) : (
                                <><Wand2 className="mr-2 h-4 w-4" /> Generar mensaje</>
                            )}
                        </Button>

                        {linkedInMessage && (
                            <div className="space-y-2">
                                <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap text-sm">
                                    {linkedInMessage}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        className="flex-1"
                                        variant="outline"
                                        onClick={() => {
                                            navigator.clipboard.writeText(linkedInMessage)
                                            alert('✅ Copiado al portapapeles!')
                                        }}
                                    >
                                        📋 Copiar mensaje
                                    </Button>
                                    {linkedInLead?.linkedin_url && (
                                        <Button
                                            className="flex-1"
                                            variant="default"
                                            onClick={() => {
                                                window.open(linkedInLead.linkedin_url!, '_blank')
                                            }}
                                        >
                                            <Linkedin className="mr-2 h-4 w-4" /> Abrir LinkedIn
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* History Modal */}
            <Dialog open={isHistoryOpen} onOpenChange={(open) => {
                setIsHistoryOpen(open)
                if (!open) {
                    setHistoryLead(null)
                    setActivityLogs([])
                }
            }}>
                <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>📋 Historial de Actividad: {historyLead?.domain}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        {loadingHistory ? (
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                                <span className="ml-2">Cargando historial...</span>
                            </div>
                        ) : activityLogs.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">No hay actividad registrada</p>
                        ) : (
                            <div className="space-y-4">
                                {activityLogs.map(log => (
                                    <div key={log.id} className={`border rounded-lg p-4 ${log.success ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                {log.action_type === 'email_sent' && <Send className="h-4 w-4 text-blue-500" />}
                                                {log.action_type === 'email_opened' && <span>👁</span>}
                                                {log.action_type === 'email_clicked' && <span>🔗</span>}
                                                {log.action_type === 'email_failed' && <span>❌</span>}
                                                {log.action_type === 'email_bounced' && <span>⚠️</span>}
                                                <span className="font-medium">
                                                    {log.action_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                </span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(log.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        {log.message_preview && (
                                            <pre className="text-xs bg-muted/50 p-3 rounded-md whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                                                {log.message_preview}
                                            </pre>
                                        )}
                                        {log.error_message && (
                                            <p className="text-xs text-red-600 mt-2">Error: {log.error_message}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

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
                <Link href="/cadences">
                    <Card className="cursor-pointer hover:bg-accent transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Cadencias</CardTitle>
                            <ListTodo className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{cadences.length}</div>
                            <p className="text-xs text-muted-foreground">Secuencias activas →</p>
                        </CardContent>
                    </Card>
                </Link>
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
                {/* Bulk Action Bar */}
                {selectedIds.size > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border-b px-4 py-3 flex items-center justify-between">
                        <span className="text-sm font-medium">
                            {selectedIds.size} lead{selectedIds.size > 1 ? 's' : ''} seleccionado{selectedIds.size > 1 ? 's' : ''}
                        </span>
                        <div className="flex gap-2">
                            <Select
                                onValueChange={async (status) => {
                                    setBulkActioning(true)
                                    await bulkUpdateStatus([...selectedIds], status)
                                    setSelectedIds(new Set())
                                    fetchLeads()
                                    setBulkActioning(false)
                                }}
                            >
                                <SelectTrigger className="w-[160px] h-8 text-sm">
                                    <SelectValue placeholder="Cambiar estado" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                                        <SelectItem key={value} value={value}>
                                            {config.emoji} {config.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={bulkActioning}
                                onClick={async () => {
                                    setBulkActioning(true)
                                    const result = await bulkResearchLeads([...selectedIds])
                                    const successCount = result.results.filter(r => r.success).length
                                    alert(`✅ Investigados: ${successCount}/${selectedIds.size}`)
                                    setSelectedIds(new Set())
                                    fetchLeads()
                                    setBulkActioning(false)
                                }}
                            >
                                {bulkActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                                Investigar
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={bulkActioning}
                                onClick={async () => {
                                    setBulkActioning(true)
                                    const result = await exportLeadsToCSV([...selectedIds])
                                    if (result.success && result.csv && result.filename) {
                                        // Download CSV
                                        const blob = new Blob([result.csv], { type: 'text/csv' })
                                        const url = URL.createObjectURL(blob)
                                        const a = document.createElement('a')
                                        a.href = url
                                        a.download = result.filename
                                        a.click()
                                        URL.revokeObjectURL(url)
                                    } else {
                                        alert('Error: ' + (result.error || 'Export failed'))
                                    }
                                    setBulkActioning(false)
                                }}
                            >
                                {bulkActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                                Exportar CSV
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={bulkActioning}
                                onClick={async () => {
                                    if (confirm(`¿Eliminar ${selectedIds.size} leads?`)) {
                                        setBulkActioning(true)
                                        await bulkDeleteLeads([...selectedIds])
                                        setSelectedIds(new Set())
                                        fetchLeads()
                                        setBulkActioning(false)
                                    }
                                }}
                            >
                                {bulkActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                                Eliminar
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedIds(new Set())}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </div>
                )}
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
                                    <TableHead className="w-10">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300"
                                            checked={selectedIds.size === filteredLeads.length && filteredLeads.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedIds(new Set(filteredLeads.map(l => l.id)))
                                                } else {
                                                    setSelectedIds(new Set())
                                                }
                                            }}
                                        />
                                    </TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Dominio</TableHead>
                                    <TableHead>Contacto</TableHead>
                                    <TableHead>Quick Score</TableHead>
                                    <TableHead>Issues</TableHead>
                                    <TableHead>Canal</TableHead>
                                    <TableHead>Email Stats</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLeads.map((lead) => {
                                    const statusConfig = STATUS_CONFIG[lead.outreach_status] || STATUS_CONFIG.new
                                    return (
                                        <TableRow key={lead.id} className={selectedIds.has(lead.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}>
                                            <TableCell>
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-300"
                                                    checked={selectedIds.has(lead.id)}
                                                    onChange={(e) => {
                                                        const next = new Set(selectedIds)
                                                        if (e.target.checked) {
                                                            next.add(lead.id)
                                                        } else {
                                                            next.delete(lead.id)
                                                        }
                                                        setSelectedIds(next)
                                                    }}
                                                />
                                            </TableCell>
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
                                            {/* Email Stats Column */}
                                            <TableCell>
                                                {lead.emails_sent > 0 ? (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center gap-2 cursor-default">
                                                                <div className="flex items-center text-xs">
                                                                    <Send className="h-3 w-3 mr-1 text-blue-500" />
                                                                    <span>{lead.emails_sent}</span>
                                                                </div>
                                                                {lead.email_opens > 0 && (
                                                                    <div className="flex items-center text-xs text-green-600">
                                                                        <span>👁 {lead.email_opens}</span>
                                                                    </div>
                                                                )}
                                                                {lead.email_clicks > 0 && (
                                                                    <div className="flex items-center text-xs text-purple-600">
                                                                        <span>🔗 {lead.email_clicks}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <div className="text-xs">
                                                                <p>Enviados: {lead.emails_sent}</p>
                                                                <p>Abiertos: {lead.email_opens}</p>
                                                                <p>Clicks: {lead.email_clicks}</p>
                                                                {lead.last_email_at && (
                                                                    <p className="mt-1 text-muted-foreground">
                                                                        Último: {new Date(lead.last_email_at).toLocaleDateString()}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-1 justify-end">
                                                    <TooltipProvider>
                                                        {/* Edit Button */}
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setEditingLead(lead)
                                                                        setEditForm({
                                                                            company_name: lead.company_name || '',
                                                                            contact_name: lead.contact_name || '',
                                                                            contact_email: lead.contact_email || '',
                                                                            contact_role: lead.contact_role || '',
                                                                            linkedin_url: lead.linkedin_url || '',
                                                                            notes: lead.notes || '',
                                                                            outreach_channel: lead.outreach_channel || 'email',
                                                                        })
                                                                        setIsEditDialogOpen(true)
                                                                    }}
                                                                >
                                                                    <Pencil className="h-3 w-3" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Editar</TooltipContent>
                                                        </Tooltip>
                                                        {/* Send Email Button - only if has email */}
                                                        {lead.contact_email && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-blue-600 hover:text-blue-700"
                                                                        onClick={async () => {
                                                                            // Fetch templates if not loaded
                                                                            if (emailTemplates.length === 0) {
                                                                                const result = await getEmailTemplates()
                                                                                if (result.success && result.templates) {
                                                                                    setEmailTemplates(result.templates)
                                                                                }
                                                                            }
                                                                            setEmailingLead(lead)
                                                                            setIsEmailDialogOpen(true)
                                                                        }}
                                                                    >
                                                                        <Send className="h-3 w-3" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Enviar Email</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                        {/* LinkedIn Button */}
                                                        {lead.linkedin_url && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-blue-600 hover:text-blue-700"
                                                                        onClick={() => {
                                                                            setLinkedInLead(lead)
                                                                            setLinkedInMessage('')
                                                                            setLinkedInMessageType('connection')
                                                                            setIsLinkedInDialogOpen(true)
                                                                        }}
                                                                    >
                                                                        <Linkedin className="h-3 w-3" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Generar mensaje LinkedIn</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                        {/* History Button */}
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-purple-600 hover:text-purple-700"
                                                                    onClick={async () => {
                                                                        setHistoryLead(lead)
                                                                        setIsHistoryOpen(true)
                                                                        setLoadingHistory(true)
                                                                        const result = await getLeadActivityLogs(lead.id)
                                                                        if (result.success && result.logs) {
                                                                            setActivityLogs(result.logs)
                                                                        }
                                                                        setLoadingHistory(false)
                                                                    }}
                                                                >
                                                                    <History className="h-3 w-3" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Ver Historial</TooltipContent>
                                                        </Tooltip>
                                                        {/* Investigar (AI Research) Button */}
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className={lead.ai_research_done ? "text-green-600" : "text-orange-600 hover:text-orange-700"}
                                                                    disabled={researchingIds.has(lead.id)}
                                                                    onClick={async () => {
                                                                        setResearchingIds(prev => new Set(prev).add(lead.id))
                                                                        const result = await researchLead(lead.id)
                                                                        if (result.success) {
                                                                            fetchLeads()
                                                                        } else {
                                                                            alert('Error: ' + result.error)
                                                                        }
                                                                        setResearchingIds(prev => {
                                                                            const next = new Set(prev)
                                                                            next.delete(lead.id)
                                                                            return next
                                                                        })
                                                                    }}
                                                                >
                                                                    {researchingIds.has(lead.id) ? (
                                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                                    ) : (
                                                                        <Search className="h-3 w-3" />
                                                                    )}
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent className={lead.ai_research_done ? "max-w-sm" : ""}>
                                                                {lead.ai_research_done ? (
                                                                    <div className="space-y-1 text-xs">
                                                                        <div className="font-bold text-green-500">✓ Investigado</div>
                                                                        {lead.company_description && <div><span className="text-muted-foreground">📝</span> {lead.company_description}</div>}
                                                                        {lead.company_industry && <div><span className="text-muted-foreground">🏢</span> {lead.company_industry}</div>}
                                                                        {lead.company_stage && <div><span className="text-muted-foreground">📊</span> {lead.company_stage}</div>}
                                                                        {lead.employee_count && <div><span className="text-muted-foreground">👥</span> {lead.employee_count} empleados</div>}
                                                                        {lead.pain_points && lead.pain_points.length > 0 && (
                                                                            <div><span className="text-muted-foreground">⚠️</span> {lead.pain_points.slice(0, 2).join(', ')}</div>
                                                                        )}
                                                                        {/* Person Research */}
                                                                        {lead.person_research_done && (
                                                                            <>
                                                                                <div className="mt-2 pt-2 border-t font-bold text-blue-500">👤 Info de {lead.contact_name?.split(' ')[0] || 'Contacto'}</div>
                                                                                {lead.person_background && <div className="text-xs">{lead.person_background}</div>}
                                                                                {lead.person_interests && lead.person_interests.length > 0 && (
                                                                                    <div><span className="text-muted-foreground">💡</span> {lead.person_interests.slice(0, 2).join(', ')}</div>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                ) : 'Investigar (Perplexity)'}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                        {/* Investigar Persona Button */}
                                                        {lead.ai_research_done && lead.contact_name && !lead.person_research_done && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-blue-600 hover:text-blue-700"
                                                                        disabled={researchingPersonIds.has(lead.id)}
                                                                        onClick={async () => {
                                                                            setResearchingPersonIds(prev => new Set(prev).add(lead.id))
                                                                            const result = await researchPerson(lead.id)
                                                                            if (result.success) {
                                                                                fetchLeads()
                                                                            } else {
                                                                                alert('Error: ' + (result.error || 'No se pudo investigar'))
                                                                            }
                                                                            setResearchingPersonIds(prev => {
                                                                                const next = new Set(prev)
                                                                                next.delete(lead.id)
                                                                                return next
                                                                            })
                                                                        }}
                                                                    >
                                                                        {researchingPersonIds.has(lead.id) ? (
                                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                                        ) : (
                                                                            <span>👤</span>
                                                                        )}
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Investigar Persona (Perplexity)</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                        {lead.person_research_done && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <span className="text-xs text-blue-600 font-medium px-1">👤✓</span>
                                                                </TooltipTrigger>
                                                                <TooltipContent className="max-w-sm">
                                                                    <div className="space-y-1 text-xs">
                                                                        <div className="font-bold text-blue-500">👤 {lead.contact_name}</div>
                                                                        {lead.person_background && <div>{lead.person_background}</div>}
                                                                        {lead.person_recent_activity && <div><span className="text-muted-foreground">📰</span> {lead.person_recent_activity}</div>}
                                                                        {lead.person_interests && lead.person_interests.length > 0 && (
                                                                            <div><span className="text-muted-foreground">💡</span> {lead.person_interests.join(', ')}</div>
                                                                        )}
                                                                        {lead.person_talking_points && lead.person_talking_points.length > 0 && (
                                                                            <div><span className="text-muted-foreground">💬</span> {lead.person_talking_points.join(', ')}</div>
                                                                        )}
                                                                    </div>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        )}
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
                                                        {/* Deep Scan Button - shows after quick scan */}
                                                        {lead.quick_scan_done && !lead.deep_scan_done && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-blue-600 hover:text-blue-700"
                                                                        disabled={deepScanningIds.has(lead.id)}
                                                                        onClick={async () => {
                                                                            setDeepScanningIds(prev => new Set(prev).add(lead.id))
                                                                            const result = await deepScanLead(lead.id)
                                                                            if (result.success) {
                                                                                fetchLeads()
                                                                            } else {
                                                                                alert('Error: ' + result.error)
                                                                            }
                                                                            setDeepScanningIds(prev => {
                                                                                const next = new Set(prev)
                                                                                next.delete(lead.id)
                                                                                return next
                                                                            })
                                                                        }}
                                                                    >
                                                                        {deepScanningIds.has(lead.id) ? (
                                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                                        ) : (
                                                                            <>🔬 Deep</>
                                                                        )}
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Deep Scan (Audit completo)</TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                        {lead.deep_scan_done && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <span className="text-xs text-green-600 px-2">EVS: {lead.evs_score_estimate || '?'}</span>
                                                                </TooltipTrigger>
                                                                <TooltipContent className="max-w-sm">
                                                                    <div className="space-y-1 text-xs">
                                                                        <div className="font-bold text-green-500">✓ Deep Scan Completo</div>
                                                                        <div>EVS Estimado: {lead.evs_score_estimate}/100</div>
                                                                        {lead.deep_scan_results && (
                                                                            <>
                                                                                <div>📚 Readiness: {(lead.deep_scan_results as Record<string, number>).readiness_score}/10</div>
                                                                                <div>📐 Structure: {(lead.deep_scan_results as Record<string, number>).structure_score}/10</div>
                                                                                <div>🏛️ Authority: {(lead.deep_scan_results as Record<string, number>).authority_score}/10</div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </TooltipContent>
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
                                                        {/* Enrich with Hunter - only if no contact email yet */}
                                                        {!lead.contact_email && hunterCredits !== null && hunterCredits > 0 && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="text-purple-600 border-purple-200 hover:bg-purple-50"
                                                                        disabled={enrichingIds.has(lead.id)}
                                                                        onClick={async () => {
                                                                            setEnrichingIds(prev => new Set([...prev, lead.id]))
                                                                            const result = await enrichLeadWithHunter(lead.id)
                                                                            if (result.success) {
                                                                                if (result.contactFound) {
                                                                                    setHunterCredits(prev => prev !== null ? prev - 1 : null)
                                                                                }
                                                                                fetchLeads()
                                                                            } else {
                                                                                alert('Error: ' + result.error)
                                                                            }
                                                                            setEnrichingIds(prev => {
                                                                                const next = new Set(prev)
                                                                                next.delete(lead.id)
                                                                                return next
                                                                            })
                                                                        }}
                                                                    >
                                                                        {enrichingIds.has(lead.id) ? (
                                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                                        ) : (
                                                                            <Sparkles className="h-3 w-3" />
                                                                        )}
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Enriquecer con Hunter ({hunterCredits} créditos)</TooltipContent>
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
