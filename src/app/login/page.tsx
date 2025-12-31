'use client'

import { useState } from 'react'
import { login } from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        setError(null)

        const result = await login(formData)

        if (result?.error) {
            setError(result.error)
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <Card className="w-full max-w-md mx-4 border-slate-700 bg-slate-800/50 backdrop-blur">
                <CardHeader className="text-center space-y-4">
                    {/* Logo */}
                    <div className="flex justify-center">
                        <h1 className="text-3xl font-bold tracking-tight">
                            <span className="text-white" style={{ fontFamily: 'Helvetica Neue, sans-serif' }}>
                                Exista
                            </span>
                            <span className="text-blue-500" style={{ fontFamily: 'Helvetica Neue, sans-serif' }}>
                                .io
                            </span>
                        </h1>
                    </div>
                    <CardTitle className="text-xl text-white">EVS Command Center</CardTitle>
                    <CardDescription className="text-slate-400">
                        Ingresá con tu cuenta de Exista
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-slate-200">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="tu@email.com"
                                required
                                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-200">Contraseña</Label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                placeholder="••••••••"
                                required
                                className="bg-slate-700 border-slate-600 text-white"
                            />
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Ingresando...
                                </>
                            ) : (
                                'Ingresar'
                            )}
                        </Button>
                    </form>

                    <div className="mt-6 text-center text-xs text-slate-500">
                        Exista Visibility Score v3.0
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
