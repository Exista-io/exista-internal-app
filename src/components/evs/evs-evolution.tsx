'use client'

import { Audit } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart
} from 'recharts'

interface EVSEvolutionProps {
    audits: Audit[]
}

export function EVSEvolution({ audits }: EVSEvolutionProps) {
    // Need at least 2 audits to show evolution
    if (audits.length < 2) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Evolución EVS</CardTitle>
                    <CardDescription className="text-xs">
                        Se requieren al menos 2 auditorías para ver la evolución
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-center py-8 text-muted-foreground text-sm">
                    Guardá más auditorías para ver el gráfico de evolución
                </CardContent>
            </Card>
        )
    }

    // Prepare data for chart (oldest first)
    const chartData = [...audits].reverse().map(audit => ({
        version: `v${audit.version}`,
        fecha: new Date(audit.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
        total: Math.round(audit.score_total || 0),
        onsite: Math.round(audit.score_onsite || 0),
        offsite: Math.round(audit.score_offsite || 0),
    }))

    // Calculate delta from previous audit
    const latest = audits[0] // Most recent
    const previous = audits[1] // Second most recent
    const delta = latest && previous
        ? Math.round((latest.score_total || 0) - (previous.score_total || 0))
        : 0

    // Determine trend
    const trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable'

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base">Evolución EVS</CardTitle>
                        <CardDescription className="text-xs">
                            Tracking de {audits.length} auditorías
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {trend === 'up' && (
                            <Badge variant="default" className="bg-green-600 text-white">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                +{delta}
                            </Badge>
                        )}
                        {trend === 'down' && (
                            <Badge variant="destructive">
                                <TrendingDown className="h-3 w-3 mr-1" />
                                {delta}
                            </Badge>
                        )}
                        {trend === 'stable' && (
                            <Badge variant="secondary">
                                <Minus className="h-3 w-3 mr-1" />
                                Sin cambio
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                            <defs>
                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                                dataKey="version"
                                tick={{ fontSize: 10 }}
                                tickLine={false}
                            />
                            <YAxis
                                domain={[0, 100]}
                                tick={{ fontSize: 10 }}
                                tickLine={false}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload
                                        return (
                                            <div className="bg-background border rounded-lg p-2 shadow-lg text-xs">
                                                <p className="font-medium">{label} - {data.fecha}</p>
                                                <p className="text-blue-600">Total: {data.total}</p>
                                                <p className="text-green-600">On-site: {data.onsite}/50</p>
                                                <p className="text-purple-600">Off-site: {data.offsite}/50</p>
                                            </div>
                                        )
                                    }
                                    return null
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="total"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="url(#colorTotal)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Metric breakdown comparison */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-green-50 dark:bg-green-950/30 p-2 rounded">
                        <div className="text-muted-foreground">On-site</div>
                        <div className="font-medium text-green-700 dark:text-green-400">
                            {chartData[chartData.length - 1]?.onsite}/50
                        </div>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-950/30 p-2 rounded">
                        <div className="text-muted-foreground">Off-site</div>
                        <div className="font-medium text-purple-700 dark:text-purple-400">
                            {chartData[chartData.length - 1]?.offsite}/50
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
