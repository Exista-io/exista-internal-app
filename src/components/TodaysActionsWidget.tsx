'use client'

import { useEffect, useState } from 'react'
import { getTodaysActions, TodaysAction } from '@/app/(protected)/cadences/actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Mail, Linkedin, Clock, Phone, ChevronRight, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const actionTypeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    email: { label: 'Email', icon: <Mail className="h-4 w-4" />, color: 'text-blue-500' },
    linkedin_connect: { label: 'Conectar', icon: <Linkedin className="h-4 w-4" />, color: 'text-sky-600' },
    linkedin_message: { label: 'Mensaje', icon: <Linkedin className="h-4 w-4" />, color: 'text-sky-500' },
    wait: { label: 'Esperar', icon: <Clock className="h-4 w-4" />, color: 'text-gray-400' },
    call: { label: 'Llamar', icon: <Phone className="h-4 w-4" />, color: 'text-green-500' },
}

interface TodaysActionsWidgetProps {
    maxItems?: number
}

export function TodaysActionsWidget({ maxItems = 5 }: TodaysActionsWidgetProps) {
    const [actions, setActions] = useState<TodaysAction[]>([])
    const [summary, setSummary] = useState({ total: 0, emails: 0, linkedin: 0, overdue: 0 })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchActions = async () => {
            const result = await getTodaysActions()
            if (result.success) {
                setActions(result.actions || [])
                setSummary(result.summary || { total: 0, emails: 0, linkedin: 0, overdue: 0 })
            }
            setLoading(false)
        }
        fetchActions()
    }, [])

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Acciones de Hoy
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Acciones de Hoy
                        </CardTitle>
                        <CardDescription>
                            {summary.total} acciones pendientes
                        </CardDescription>
                    </div>
                    {summary.total > 0 && (
                        <div className="flex gap-2">
                            {summary.emails > 0 && (
                                <Badge variant="secondary" className="gap-1">
                                    <Mail className="h-3 w-3" /> {summary.emails}
                                </Badge>
                            )}
                            {summary.linkedin > 0 && (
                                <Badge variant="secondary" className="gap-1">
                                    <Linkedin className="h-3 w-3" /> {summary.linkedin}
                                </Badge>
                            )}
                            {summary.overdue > 0 && (
                                <Badge variant="destructive" className="gap-1">
                                    <AlertCircle className="h-3 w-3" /> {summary.overdue} atrasadas
                                </Badge>
                            )}
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {actions.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No hay acciones pendientes para hoy</p>
                        <p className="text-xs mt-1">Asigná leads a una cadencia para empezar</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {actions.slice(0, maxItems).map((action) => {
                            const config = actionTypeConfig[action.action_type] || actionTypeConfig.email
                            return (
                                <Link
                                    key={action.lead.id}
                                    href="/leads"
                                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                                >
                                    <div className={`flex-shrink-0 ${config.color}`}>
                                        {config.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">
                                            {action.lead.company_name || action.lead.domain}
                                        </div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                                            <span>{config.label}</span>
                                            <span>•</span>
                                            <span>{action.cadence_name}</span>
                                            {action.is_overdue && (
                                                <>
                                                    <span>•</span>
                                                    <span className="text-red-500 font-medium">Atrasada</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                </Link>
                            )
                        })}
                        {actions.length > maxItems && (
                            <Link href="/leads">
                                <Button variant="ghost" className="w-full mt-2">
                                    Ver todas ({actions.length - maxItems} más)
                                </Button>
                            </Link>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
