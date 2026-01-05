'use client'

import { useEffect, useState, useCallback } from 'react'
import { getCadences, getCadenceWithSteps, createCadence, addCadenceStep } from './actions'
import { Cadence, CadenceStep } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, ArrowLeft, Mail, Linkedin, Clock, Phone, ChevronRight, Loader2 } from 'lucide-react'
import Link from 'next/link'

const actionTypeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    email: { label: 'Email', icon: <Mail className="h-4 w-4" />, color: 'bg-blue-500' },
    linkedin_connect: { label: 'LinkedIn Connect', icon: <Linkedin className="h-4 w-4" />, color: 'bg-sky-600' },
    linkedin_message: { label: 'LinkedIn Message', icon: <Linkedin className="h-4 w-4" />, color: 'bg-sky-500' },
    wait: { label: 'Esperar', icon: <Clock className="h-4 w-4" />, color: 'bg-gray-400' },
    call: { label: 'Llamada', icon: <Phone className="h-4 w-4" />, color: 'bg-green-500' },
}

export default function CadencesPage() {
    const [cadences, setCadences] = useState<Cadence[]>([])
    const [selectedCadence, setSelectedCadence] = useState<Cadence | null>(null)
    const [selectedSteps, setSelectedSteps] = useState<CadenceStep[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingSteps, setLoadingSteps] = useState(false)

    // Create dialog state
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [newCadenceName, setNewCadenceName] = useState('')
    const [newCadenceDescription, setNewCadenceDescription] = useState('')
    const [creating, setCreating] = useState(false)

    // Add step dialog state
    const [isAddStepDialogOpen, setIsAddStepDialogOpen] = useState(false)
    const [newStepType, setNewStepType] = useState<string>('email')
    const [newStepWaitDays, setNewStepWaitDays] = useState('0')
    const [newStepLinkedInType, setNewStepLinkedInType] = useState<string>('connection')
    const [newStepNotes, setNewStepNotes] = useState('')
    const [addingStep, setAddingStep] = useState(false)

    const fetchCadences = useCallback(async () => {
        setLoading(true)
        const result = await getCadences()
        if (result.success && result.cadences) {
            setCadences(result.cadences)
        }
        setLoading(false)
    }, [])

    const fetchCadenceSteps = useCallback(async (cadenceId: string) => {
        setLoadingSteps(true)
        const result = await getCadenceWithSteps(cadenceId)
        if (result.success && result.cadence && result.steps) {
            setSelectedCadence(result.cadence)
            setSelectedSteps(result.steps)
        }
        setLoadingSteps(false)
    }, [])

    useEffect(() => {
        fetchCadences()
    }, [fetchCadences])

    const handleCreateCadence = async () => {
        if (!newCadenceName.trim()) return
        setCreating(true)
        const result = await createCadence({
            name: newCadenceName.trim(),
            description: newCadenceDescription.trim() || undefined,
        })
        if (result.success) {
            setIsCreateDialogOpen(false)
            setNewCadenceName('')
            setNewCadenceDescription('')
            fetchCadences()
        } else {
            alert('Error: ' + result.error)
        }
        setCreating(false)
    }

    const handleAddStep = async () => {
        if (!selectedCadence) return
        setAddingStep(true)
        const nextStepNumber = selectedSteps.length + 1
        const result = await addCadenceStep({
            cadence_id: selectedCadence.id,
            step_number: nextStepNumber,
            action_type: newStepType as 'email' | 'linkedin_connect' | 'linkedin_message' | 'wait' | 'call',
            wait_days: parseInt(newStepWaitDays) || 0,
            linkedin_message_type: ['linkedin_connect', 'linkedin_message'].includes(newStepType)
                ? newStepLinkedInType as 'connection' | 'followup' | 'pitch'
                : undefined,
            notes: newStepNotes.trim() || undefined,
        })
        if (result.success) {
            setIsAddStepDialogOpen(false)
            setNewStepType('email')
            setNewStepWaitDays('0')
            setNewStepNotes('')
            fetchCadenceSteps(selectedCadence.id)
        } else {
            alert('Error: ' + result.error)
        }
        setAddingStep(false)
    }

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link href="/leads">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Leads
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold">Cadencias</h1>
                        <p className="text-muted-foreground">Secuencias automatizadas de outreach</p>
                    </div>
                </div>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Nueva Cadencia
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Crear Nueva Cadencia</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div>
                                <Label>Nombre</Label>
                                <Input
                                    placeholder="Ej: Prospección B2B"
                                    value={newCadenceName}
                                    onChange={(e) => setNewCadenceName(e.target.value)}
                                />
                            </div>
                            <div>
                                <Label>Descripción</Label>
                                <Input
                                    placeholder="Descripción opcional"
                                    value={newCadenceDescription}
                                    onChange={(e) => setNewCadenceDescription(e.target.value)}
                                />
                            </div>
                            <Button onClick={handleCreateCadence} disabled={creating || !newCadenceName.trim()} className="w-full">
                                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                                Crear Cadencia
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cadences List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Todas las Cadencias</CardTitle>
                        <CardDescription>{cadences.length} cadencias activas</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : cadences.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No hay cadencias. Creá una para empezar.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {cadences.map((cadence) => (
                                    <div
                                        key={cadence.id}
                                        className={`p-4 rounded-lg border cursor-pointer transition-colors hover:bg-accent ${selectedCadence?.id === cadence.id ? 'bg-accent border-primary' : ''
                                            }`}
                                        onClick={() => fetchCadenceSteps(cadence.id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-medium">{cadence.name}</h3>
                                                {cadence.description && (
                                                    <p className="text-sm text-muted-foreground">{cadence.description}</p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary">{cadence.total_steps} pasos</Badge>
                                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Steps Editor */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>{selectedCadence?.name || 'Seleccioná una cadencia'}</CardTitle>
                                <CardDescription>
                                    {selectedCadence ? `${selectedSteps.length} pasos` : 'Click en una cadencia para ver sus pasos'}
                                </CardDescription>
                            </div>
                            {selectedCadence && (
                                <Dialog open={isAddStepDialogOpen} onOpenChange={setIsAddStepDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm">
                                            <Plus className="h-4 w-4 mr-1" />
                                            Paso
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Agregar Paso #{selectedSteps.length + 1}</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4 pt-4">
                                            <div>
                                                <Label>Tipo de Acción</Label>
                                                <Select value={newStepType} onValueChange={setNewStepType}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="email">📧 Email</SelectItem>
                                                        <SelectItem value="linkedin_connect">🔗 LinkedIn Connect</SelectItem>
                                                        <SelectItem value="linkedin_message">💬 LinkedIn Message</SelectItem>
                                                        <SelectItem value="wait">⏳ Esperar</SelectItem>
                                                        <SelectItem value="call">📞 Llamada</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {newStepType === 'wait' && (
                                                <div>
                                                    <Label>Días a esperar</Label>
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        value={newStepWaitDays}
                                                        onChange={(e) => setNewStepWaitDays(e.target.value)}
                                                    />
                                                </div>
                                            )}
                                            {['linkedin_connect', 'linkedin_message'].includes(newStepType) && (
                                                <div>
                                                    <Label>Tipo de Mensaje LinkedIn</Label>
                                                    <Select value={newStepLinkedInType} onValueChange={setNewStepLinkedInType}>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="connection">Conexión</SelectItem>
                                                            <SelectItem value="followup">Seguimiento</SelectItem>
                                                            <SelectItem value="pitch">Pitch</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                            <div>
                                                <Label>Notas (opcional)</Label>
                                                <Input
                                                    placeholder="Notas sobre este paso..."
                                                    value={newStepNotes}
                                                    onChange={(e) => setNewStepNotes(e.target.value)}
                                                />
                                            </div>
                                            <Button onClick={handleAddStep} disabled={addingStep} className="w-full">
                                                {addingStep ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                                                Agregar Paso
                                            </Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loadingSteps ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : !selectedCadence ? (
                            <div className="text-center py-12 text-muted-foreground">
                                👈 Seleccioná una cadencia de la lista
                            </div>
                        ) : selectedSteps.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Esta cadencia no tiene pasos. Agregá el primero.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {selectedSteps.map((step, index) => {
                                    const config = actionTypeConfig[step.action_type] || actionTypeConfig.email
                                    return (
                                        <div key={step.id} className="flex items-center gap-3">
                                            {/* Step number */}
                                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                                {step.step_number}
                                            </div>

                                            {/* Connector line */}
                                            {index < selectedSteps.length - 1 && (
                                                <div className="absolute left-4 top-10 w-0.5 h-8 bg-border" />
                                            )}

                                            {/* Step card */}
                                            <div className="flex-1 flex items-center gap-3 p-3 rounded-lg border bg-card">
                                                <div className={`p-2 rounded-full ${config.color} text-white`}>
                                                    {config.icon}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-medium">
                                                        {config.label}
                                                        {step.action_type === 'wait' && step.wait_days > 0 && (
                                                            <span className="text-muted-foreground ml-1">({step.wait_days} días)</span>
                                                        )}
                                                    </div>
                                                    {step.notes && (
                                                        <p className="text-sm text-muted-foreground">{step.notes}</p>
                                                    )}
                                                    {step.linkedin_message_type && (
                                                        <Badge variant="outline" className="mt-1">{step.linkedin_message_type}</Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
