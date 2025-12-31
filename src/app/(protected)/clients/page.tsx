'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Eye } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Client } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ClientsPage() {
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    // Form State
    const [newClient, setNewClient] = useState({
        nombre: '',
        dominio: '',
        mercado: 'AR',
        competidores: '',
    })
    const [isSubmitting, setIsSubmitting] = useState(false)

    const fetchClients = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching clients:', error)
        } else {
            setClients(data || [])
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)

        if (error) {
            console.error('Error creating client:', error)
            alert('Error al crear el cliente')
        } else {
            setIsDialogOpen(false)
            setNewClient({ nombre: '', dominio: '', mercado: 'AR', competidores: '' })
            fetchClients()
        }
        setIsSubmitting(false)
    }

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Gestión de Clientes</h1>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="font-semibold">
                            <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
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
                            <div className="flex justify-end pt-4">
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? 'Guardando...' : 'Guardar Cliente'}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
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
                    ) : clients.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">
                            No hay clientes registrados aún.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Dominio</TableHead>
                                    <TableHead>Mercado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {clients.map((client) => (
                                    <TableRow key={client.id}>
                                        <TableCell className="font-medium">{client.nombre}</TableCell>
                                        <TableCell className="text-blue-500 hover:underline">
                                            <a href={client.dominio} target="_blank" rel="noreferrer">
                                                {client.dominio}
                                            </a>
                                        </TableCell>
                                        <TableCell>{client.mercado}</TableCell>
                                        <TableCell className="text-right">
                                            <Link href={`/clients/${client.id}`}>
                                                <Button variant="outline" size="sm">
                                                    <Eye className="mr-2 h-4 w-4" /> Ver Auditorías
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
