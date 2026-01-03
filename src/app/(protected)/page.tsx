'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { Client, Audit } from '@/types/database'
import { Users, Activity, CalendarDays, TrendingUp, TrendingDown, Minus, LogOut, ListChecks, AlertTriangle } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts'
import { Link } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { logout } from '@/app/login/actions'

// Helper Types
type ClientWithLatestAudit = Client & {
  latestAudit?: Audit;
  previousAudit?: Audit;
  status: 'Elite' | 'Verde' | 'Ambar' | 'Rojo' | 'Sin Auditoría';
};

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalClients: 0,
    avgEvs: 0,
    auditsThisMonth: 0,
    pendingActions: 0,
    overdueActions: 0,
  })
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({ prospect: 0, mini: 0, full: 0, retainer: 0 })
  const [auditList, setAuditList] = useState<(Audit & { client_name: string })[]>([])
  const [distribution, setDistribution] = useState<{ name: string; value: number; color: string }[]>([])
  const [clientsWithEvolution, setClientsWithEvolution] = useState<ClientWithLatestAudit[]>([])
  // Risk clients for alerts
  const [riskClients, setRiskClients] = useState<{ id: string; name: string; reason: string }[]>([])

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // 1. Fetch Clients (exclude archived)
      const { data: clientsData, error: clientsError } = await supabase.from('clients').select('*').or('archived.is.null,archived.eq.false')
      if (clientsError) throw clientsError;

      // 2. Fetch All Audits
      const { data: auditsData, error: auditsError } = await supabase.from('audits').select('*').order('fecha', { ascending: false })
      if (auditsError) throw auditsError;

      // 3. Fetch All Actions
      const { data: actionsData } = await supabase.from('audit_actions').select('*')

      // Explicit casting if needed, though with types it should work. 
      // If it failed, let's cast to ensure safety.
      const clients: Client[] = (clientsData as any) || []
      const audits: Audit[] = (auditsData as any) || []
      const actions = actionsData || []

      if (!clients || !audits) return

      // Calculate stage counts
      const counts: Record<string, number> = { prospect: 0, mini: 0, full: 0, retainer: 0 }
      clients.forEach(c => {
        const stage = (c as any).stage || 'prospect'
        if (counts[stage] !== undefined) counts[stage]++
      })
      setStageCounts(counts)

      // Filter actions by active clients only
      const activeClientIds = new Set(clients.map(c => c.id))
      const activeActions = actions.filter((a: any) => activeClientIds.has(a.client_id))
      const pendingActions = activeActions.filter((a: any) => a.status !== 'done').length
      const currentDate = new Date()
      const overdueActions = activeActions.filter((a: any) => {
        if (a.status === 'done' || !a.due_date) return false
        return new Date(a.due_date) < currentDate
      }).length

      // --- Process Logic ---

      // A. Recent Audits List (Top 5)
      // Need to map client_id to name
      const clientMap = new Map<string, string>();
      clients.forEach(c => clientMap.set(c.id, c.nombre))

      const recentAudits = audits.slice(0, 5).map(a => ({
        ...a,
        client_name: clientMap.get(a.client_id) || 'Desconocido'
      }))
      setAuditList(recentAudits)


      // B. Client Status & Evolution
      const distributionCounts = { Elite: 0, Verde: 0, Ambar: 0, Rojo: 0, 'Sin Auditoría': 0 }
      let totalEvsSum = 0;
      let totalEvsCount = 0;
      let auditsThisMonthCount = 0;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const processedClients: ClientWithLatestAudit[] = clients.map(client => {
        const clientAudits = audits.filter(a => a.client_id === client.id).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        const latest = clientAudits[0];
        const previous = clientAudits[1];

        let status: ClientWithLatestAudit['status'] = 'Sin Auditoría';

        if (latest) {
          const score = latest.score_total || 0;
          totalEvsSum += score;
          totalEvsCount++;

          // Count audits this month (count all audits from this client in current month)
          clientAudits.forEach(audit => {
            const auditDate = new Date(audit.fecha);
            if (auditDate >= startOfMonth) {
              auditsThisMonthCount++;
            }
          })

          // Categorize
          if (score >= 90) status = 'Elite';
          else if (score >= 70) status = 'Verde';
          else if (score >= 50) status = 'Ambar';
          else status = 'Rojo';
        }

        distributionCounts[status]++;

        return {
          ...client,
          latestAudit: latest,
          previousAudit: previous,
          status
        }
      });

      setClientsWithEvolution(processedClients)

      // Compute risk clients (EVS < 50 or no audit in 90+ days)
      const riskNow = new Date()
      const ninetyDaysAgo = new Date(riskNow.getTime() - 90 * 24 * 60 * 60 * 1000)
      const risks: { id: string; name: string; reason: string }[] = []

      processedClients.forEach(c => {
        if (c.latestAudit) {
          const score = c.latestAudit.score_total || 0
          const auditDate = new Date(c.latestAudit.fecha)

          if (score < 50) {
            risks.push({ id: c.id, name: c.nombre, reason: `EVS ${score}/100 🔴` })
          } else if (auditDate < ninetyDaysAgo) {
            risks.push({ id: c.id, name: c.nombre, reason: 'Sin auditoría en +90 días' })
          }
        } else {
          risks.push({ id: c.id, name: c.nombre, reason: 'Sin auditoría' })
        }
      })
      setRiskClients(risks)

      // C. Stats
      setStats({
        totalClients: clients.length,
        avgEvs: totalEvsCount > 0 ? Math.round(totalEvsSum / totalEvsCount) : 0,
        auditsThisMonth: auditsThisMonthCount,
        pendingActions,
        overdueActions
      })

      // D. Chart Data
      setDistribution([
        { name: 'Elite (90+)', value: distributionCounts['Elite'], color: '#16a34a' }, // Green-600
        { name: 'Verde (70-89)', value: distributionCounts['Verde'], color: '#4ade80' }, // Green-400
        { name: 'Ámbar (50-69)', value: distributionCounts['Ambar'], color: '#fbbf24' }, // Amber-400
        { name: 'Rojo (<50)', value: distributionCounts['Rojo'], color: '#ef4444' }, // Red-500
        { name: 'Sin Data', value: distributionCounts['Sin Auditoría'], color: '#9ca3af' }, // Gray-400
      ])

    } catch (error) {
      console.error('Error fetching dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Torre de Control</h1>
          <p className="text-muted-foreground mt-1">Resumen ejecutivo del performance de la cartera.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/clients')}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            <Users className="mr-2 h-4 w-4" /> Gestionar Clientes
          </button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => logout()}
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClients}</div>
            <p className="text-xs text-muted-foreground">Activos en plataforma</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promedio EVS</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgEvs}/100</div>
            <p className="text-xs text-muted-foreground">Calidad general de la cartera</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auditorías (Mes)</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.auditsThisMonth}</div>
            <p className="text-xs text-muted-foreground">Realizadas este mes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Acciones Pendientes</CardTitle>
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingActions}</div>
            {stats.overdueActions > 0 ? (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {stats.overdueActions} vencidas
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Todas al día ✓</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Visualization */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pipeline de Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
              <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{stageCounts.prospect}</div>
              <div className="text-xs text-muted-foreground">🟡 Prospect</div>
            </div>
            <div className="text-muted-foreground">→</div>
            <div className="flex-1 text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stageCounts.mini}</div>
              <div className="text-xs text-muted-foreground">🔵 Mini</div>
            </div>
            <div className="text-muted-foreground">→</div>
            <div className="flex-1 text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">{stageCounts.full}</div>
              <div className="text-xs text-muted-foreground">🟢 Full</div>
            </div>
            <div className="text-muted-foreground">→</div>
            <div className="flex-1 text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{stageCounts.retainer}</div>
              <div className="text-xs text-muted-foreground">🟣 Retainer</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Clients Alert */}
      {riskClients.length > 0 && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Clientes que Requieren Acción ({riskClients.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {riskClients.slice(0, 10).map(c => (
                <a
                  key={c.id}
                  href={`/clients/${c.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-red-200 dark:border-red-700 hover:border-red-400 dark:hover:border-red-500 transition-colors text-sm"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">({c.reason})</span>
                </a>
              ))}
              {riskClients.length > 10 && (
                <span className="text-xs text-muted-foreground self-center">+{riskClients.length - 10} más</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">

        {/* Evolution Table (Clients) */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Evolución de Cartera</CardTitle>
            <CardDescription>Estado actual y cambio respecto a la última auditoría.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {clientsWithEvolution.slice(0, 5).map((client) => {
                const latestScore = client.latestAudit?.score_total || 0
                const prevScore = client.previousAudit?.score_total || 0
                const diff = latestScore - prevScore

                return (
                  <div key={client.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{client.nombre}</p>
                      <p className="text-xs text-muted-foreground">{client.dominio}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={
                        client.status === 'Elite' ? 'default' :
                          client.status === 'Verde' ? 'secondary' :
                            client.status === 'Ambar' ? 'outline' : 'destructive'
                      }>
                        {client.status}
                      </Badge>

                      <div className="flex items-center gap-2 w-16 justify-end">
                        <span className="font-bold">{client.latestAudit ? latestScore : '-'}</span>
                        {client.latestAudit && client.previousAudit ? (
                          diff > 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> :
                            diff < 0 ? <TrendingDown className="h-4 w-4 text-red-500" /> :
                              <Minus className="h-4 w-4 text-muted-foreground" />
                        ) : <span className="w-4" />}

                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Distribution Chart & Recent Audits */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Distribución EVS</CardTitle>
            <CardDescription>Clientes por rango de puntaje.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution}>
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} hide />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-8">
              <h4 className="border-b pb-2 mb-4 text-sm font-semibold">Últimas Auditorías</h4>
              <div className="space-y-4">
                {auditList.map((audit) => (
                  <div key={audit.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${(audit.score_total || 0) >= 90 ? 'bg-green-600' :
                        (audit.score_total || 0) >= 70 ? 'bg-green-400' :
                          (audit.score_total || 0) >= 50 ? 'bg-yellow-400' : 'bg-red-500'
                        }`} />
                      <span>{audit.client_name}</span>
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(audit.fecha).toLocaleDateString()}
                    </div>
                  </div>
                ))}
                {auditList.length === 0 && <p className="text-muted-foreground text-sm">No hay auditorías recientes.</p>}
              </div>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  )
}
