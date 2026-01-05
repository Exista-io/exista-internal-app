'use server'

import { createClient } from '@/lib/supabase/server'
import { quickScanDomain, bulkQuickScan, QuickScanResult } from '@/lib/leads/quick-scan'
import { hunterDomainSearch, getHunterAccountInfo } from '@/lib/leads/hunter'
import { revalidatePath } from 'next/cache'
import OpenAI from 'openai'
import { scanWebsite } from '@/app/actions'

// Initialize Perplexity Client (uses OpenAI-compatible API)
const perplexityClient = process.env.PERPLEXITY_API_KEY
    ? new OpenAI({
        apiKey: process.env.PERPLEXITY_API_KEY,
        baseURL: 'https://api.perplexity.ai'
    })
    : null

/**
 * Create a new lead
 */
export async function createLead(data: {
    domain: string;
    company_name?: string;
    contact_name?: string;
    contact_email?: string;
    contact_role?: string;
    linkedin_url?: string;
    notes?: string;
    source?: string;
}): Promise<{ success: boolean; error?: string; leadId?: string }> {
    const supabase = await createClient()

    // Normalize domain
    let domain = data.domain.trim().toLowerCase()
    domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')

    const { data: lead, error } = await supabase
        .from('leads')
        .insert({
            domain,
            company_name: data.company_name || null,
            contact_name: data.contact_name || null,
            contact_email: data.contact_email || null,
            contact_role: data.contact_role || null,
            linkedin_url: data.linkedin_url || null,
            notes: data.notes || null,
            source: data.source || 'manual',
            outreach_status: 'new',
            outreach_channel: 'email',
            market: 'AR',
        })
        .select('id')
        .single()

    if (error) {
        console.error('Error creating lead:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/leads')
    return { success: true, leadId: lead?.id }
}

/**
 * Scan a lead and update its quick scan results
 */
export async function scanLead(leadId: string): Promise<{ success: boolean; error?: string; result?: QuickScanResult }> {
    const supabase = await createClient()

    // Get the lead
    const { data: lead, error: fetchError } = await supabase
        .from('leads')
        .select('domain')
        .eq('id', leadId)
        .single()

    if (fetchError || !lead) {
        return { success: false, error: 'Lead not found' }
    }

    // Perform quick scan
    const result = await quickScanDomain(lead.domain)

    // Update the lead with scan results
    const { error: updateError } = await supabase
        .from('leads')
        .update({
            quick_scan_done: true,
            quick_scan_at: new Date().toISOString(),
            robots_ok: result.robots_ok,
            sitemap_ok: result.sitemap_ok,
            schema_ok: result.schema_ok,
            llms_txt_ok: result.llms_txt_ok,
            canonical_ok: result.canonical_ok,
            blocks_gptbot: result.blocks_gptbot,
            quick_score: result.quick_score,
            quick_issues: result.quick_issues,
            outreach_status: 'scanned',
            updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    revalidatePath('/leads')
    return { success: true, result }
}

/**
 * Bulk import leads from a list of domains
 */
export async function bulkImportLeads(domains: string[]): Promise<{
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
}> {
    const supabase = await createClient()
    const errors: string[] = []
    let imported = 0
    let skipped = 0

    // Normalize and dedupe domains
    const normalizedDomains = [...new Set(
        domains
            .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''))
            .filter(d => d.length > 0 && d.includes('.'))
    )]

    for (const domain of normalizedDomains) {
        // Check if lead already exists
        const { data: existing } = await supabase
            .from('leads')
            .select('id')
            .eq('domain', domain)
            .single()

        if (existing) {
            skipped++
            continue
        }

        // Insert new lead
        const { error } = await supabase
            .from('leads')
            .insert({
                domain,
                source: 'csv_import',
                outreach_status: 'new',
                outreach_channel: 'email',
                market: 'AR',
            })

        if (error) {
            errors.push(`${domain}: ${error.message}`)
        } else {
            imported++
        }
    }

    revalidatePath('/leads')
    return { success: true, imported, skipped, errors }
}

/**
 * Bulk scan leads that haven't been scanned yet
 */
export async function bulkScanLeads(leadIds: string[]): Promise<{
    success: boolean;
    scanned: number;
    errors: string[];
}> {
    const supabase = await createClient()
    const errors: string[] = []
    let scanned = 0

    // Get all leads
    const { data: leads, error: fetchError } = await supabase
        .from('leads')
        .select('id, domain')
        .in('id', leadIds)

    if (fetchError || !leads) {
        return { success: false, scanned: 0, errors: ['Failed to fetch leads'] }
    }

    // Bulk scan domains
    const domains = leads.map(l => l.domain)
    const results = await bulkQuickScan(domains)

    // Update each lead with its results
    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i]
        const result = results[i]

        if (!result) continue

        const { error: updateError } = await supabase
            .from('leads')
            .update({
                quick_scan_done: true,
                quick_scan_at: new Date().toISOString(),
                robots_ok: result.robots_ok,
                sitemap_ok: result.sitemap_ok,
                schema_ok: result.schema_ok,
                llms_txt_ok: result.llms_txt_ok,
                canonical_ok: result.canonical_ok,
                blocks_gptbot: result.blocks_gptbot,
                quick_score: result.quick_score,
                quick_issues: result.quick_issues,
                outreach_status: 'scanned',
                updated_at: new Date().toISOString(),
            })
            .eq('id', lead.id)

        if (updateError) {
            errors.push(`${lead.domain}: ${updateError.message}`)
        } else {
            scanned++
        }
    }

    revalidatePath('/leads')
    return { success: true, scanned, errors }
}

/**
 * Update lead status
 */
export async function updateLeadStatus(
    leadId: string,
    status: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('leads')
        .update({
            outreach_status: status,
            updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath('/leads')
    return { success: true }
}

/**
 * Delete a lead
 */
export async function deleteLead(leadId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId)

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath('/leads')
    return { success: true }
}

/**
 * Update lead information
 */
export async function updateLead(
    leadId: string,
    data: {
        company_name?: string;
        contact_name?: string;
        contact_email?: string;
        contact_role?: string;
        linkedin_url?: string;
        notes?: string;
        outreach_channel?: string;
    }
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('leads')
        .update({
            ...data,
            updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath('/leads')
    return { success: true }
}

/**
 * Bulk delete leads
 */
export async function bulkDeleteLeads(leadIds: string[]): Promise<{
    success: boolean;
    deleted: number;
    error?: string;
}> {
    const supabase = await createClient()

    const { error, count } = await supabase
        .from('leads')
        .delete()
        .in('id', leadIds)

    if (error) {
        return { success: false, deleted: 0, error: error.message }
    }

    revalidatePath('/leads')
    return { success: true, deleted: count || leadIds.length }
}

/**
 * Bulk update lead status
 */
export async function bulkUpdateStatus(
    leadIds: string[],
    status: string
): Promise<{ success: boolean; updated: number; error?: string }> {
    const supabase = await createClient()

    const { error, count } = await supabase
        .from('leads')
        .update({
            outreach_status: status,
            updated_at: new Date().toISOString()
        })
        .in('id', leadIds)

    if (error) {
        return { success: false, updated: 0, error: error.message }
    }

    revalidatePath('/leads')
    return { success: true, updated: count || leadIds.length }
}

/**
 * Convert lead to client
 */
export async function convertLeadToClient(leadId: string): Promise<{ success: boolean; clientId?: string; error?: string }> {
    const supabase = await createClient()

    // Get the lead
    const { data: lead, error: fetchError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()

    if (fetchError || !lead) {
        return { success: false, error: 'Lead not found' }
    }

    // Create a new client
    const insertData: Record<string, unknown> = {
        nombre: lead.company_name || lead.domain,
        dominio: `https://${lead.domain}`,
        mercado: lead.market || 'AR',
        competidores: [],
    }

    // Add optional fields if they exist in schema (phase9)
    if (lead.notes) insertData.notes = lead.notes

    const { data: client, error: insertError } = await supabase
        .from('clients')
        .insert(insertData)
        .select('id')
        .single()

    if (insertError || !client) {
        console.error('Error creating client from lead:', insertError)
        return { success: false, error: insertError?.message || 'Failed to create client' }
    }

    // Update the lead to mark as converted
    await supabase
        .from('leads')
        .update({
            outreach_status: 'converted',
            converted_to_client_id: client.id,
            updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

    revalidatePath('/leads')
    revalidatePath('/clients')
    return { success: true, clientId: client.id }
}

/**
 * Enrich a lead with Hunter.io data (optional, uses credits)
 */
export async function enrichLeadWithHunter(leadId: string): Promise<{
    success: boolean;
    error?: string;
    contactFound?: boolean;
}> {
    const supabase = await createClient()

    // Get the lead
    const { data: lead, error: fetchError } = await supabase
        .from('leads')
        .select('domain')
        .eq('id', leadId)
        .single()

    if (fetchError || !lead) {
        return { success: false, error: 'Lead not found' }
    }

    // Call Hunter.io API
    const result = await hunterDomainSearch(lead.domain)

    if (result.error) {
        return { success: false, error: result.error }
    }

    // Get the best contact from results (inline logic)
    const seniorityOrder = ['c_suite', 'executive', 'vp', 'director', 'manager', 'senior', 'entry']
    const departmentOrder = ['marketing', 'executive', 'sales', 'management', 'communication']

    const sortedEmails = [...(result.emails || [])]
        .filter(e => e.verification?.status === 'valid' || e.confidence >= 80)
        .sort((a, b) => {
            const aSeniority = seniorityOrder.indexOf(a.seniority || '') !== -1
                ? seniorityOrder.indexOf(a.seniority || '') : 999
            const bSeniority = seniorityOrder.indexOf(b.seniority || '') !== -1
                ? seniorityOrder.indexOf(b.seniority || '') : 999
            if (aSeniority !== bSeniority) return aSeniority - bSeniority

            const aDept = departmentOrder.indexOf(a.department || '') !== -1
                ? departmentOrder.indexOf(a.department || '') : 999
            const bDept = departmentOrder.indexOf(b.department || '') !== -1
                ? departmentOrder.indexOf(b.department || '') : 999
            if (aDept !== bDept) return aDept - bDept

            return b.confidence - a.confidence
        })

    const bestContact = sortedEmails[0] || null

    if (!bestContact) {
        return { success: true, contactFound: false }
    }

    // Update lead with Hunter data
    const { error: updateError } = await supabase
        .from('leads')
        .update({
            company_name: result.organization || undefined,
            contact_name: bestContact.first_name && bestContact.last_name
                ? `${bestContact.first_name} ${bestContact.last_name}`
                : bestContact.first_name || undefined,
            contact_email: bestContact.value,
            contact_role: bestContact.position || undefined,
            linkedin_url: bestContact.linkedin || undefined,
            source: 'hunter',
            updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    revalidatePath('/leads')
    return { success: true, contactFound: true }
}

/**
 * Get Hunter.io remaining credits
 */
export async function getHunterCredits(): Promise<{
    available: boolean;
    remaining?: number;
    used?: number;
    error?: string;
}> {
    return await getHunterAccountInfo()
}

/**
 * Get all active email templates
 */
export async function getEmailTemplates(): Promise<{
    success: boolean;
    templates?: Array<{
        id: string;
        name: string;
        subject: string;
        body_markdown: string;
        template_type: string | null;
    }>;
    error?: string;
}> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('email_templates')
        .select('id, name, subject, body_markdown, template_type')
        .eq('is_active', true)
        .order('template_type')

    if (error) {
        return { success: false, error: error.message }
    }

    return { success: true, templates: data }
}

/**
 * Get email preview with variables replaced for a lead
 */
export async function getEmailPreview(
    leadId: string,
    templateId: string
): Promise<{
    success: boolean;
    subject?: string;
    body?: string;
    error?: string;
}> {
    const supabase = await createClient()

    // Get lead
    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()

    if (leadError || !lead) {
        return { success: false, error: 'Lead not found' }
    }

    // Get template
    const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', templateId)
        .single()

    if (templateError || !template) {
        return { success: false, error: 'Template not found' }
    }

    // Replace variables using inline logic (same as resend.ts)
    const CALENDLY_URL = process.env.CALENDLY_URL || 'https://calendly.com/exista'
    const SENDER_NAME = process.env.RESEND_FROM_NAME || 'Juan'

    const formatQuickIssues = (issues: string[]): string => {
        if (issues.length === 0) return '• Optimización técnica pendiente'
        return issues.slice(0, 3).map(issue => `• ${issue}`).join('\n')
    }

    const variables: Record<string, string> = {
        '{{company_name}}': lead.company_name || lead.domain,
        '{{contact_name}}': lead.contact_name || 'Equipo',
        '{{domain}}': lead.domain,
        '{{quick_issues}}': formatQuickIssues(lead.quick_issues || []),
        '{{quick_issue_1}}': lead.quick_issues?.[0] || 'optimización técnica SEO',
        '{{top_competitor}}': lead.top_competitor || 'tu competencia directa',
        '{{calendly_link}}': CALENDLY_URL,
        '{{sender_name}}': SENDER_NAME,
        '{{evs_score}}': lead.evs_score?.toString() || 'pendiente',
    }

    let subject = template.subject
    let body = template.body_markdown

    for (const [key, value] of Object.entries(variables)) {
        subject = subject.replaceAll(key, value)
        body = body.replaceAll(key, value)
    }

    return { success: true, subject, body }
}

/**
 * Send email to a lead using a template
 */
export async function sendEmailToLead(
    leadId: string,
    templateId: string
): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}> {
    const supabase = await createClient()

    // Get lead
    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()

    if (leadError || !lead) {
        return { success: false, error: 'Lead not found' }
    }

    if (!lead.contact_email) {
        return { success: false, error: 'Lead has no contact email' }
    }

    // Get template
    const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', templateId)
        .single()

    if (templateError || !template) {
        return { success: false, error: 'Template not found' }
    }

    // Send email via Resend
    const { sendEmailWithTemplate } = await import('@/lib/email/resend')
    const result = await sendEmailWithTemplate(lead, template)

    if (!result.success) {
        // Log failure
        await supabase.from('outreach_logs').insert({
            lead_id: leadId,
            action_type: 'email_failed',
            channel: 'email',
            template_id: templateId,
            message_preview: template.subject,
            success: false,
            error_message: result.error,
        })
        return { success: false, error: result.error }
    }

    // Log success
    await supabase.from('outreach_logs').insert({
        lead_id: leadId,
        action_type: 'email_sent',
        channel: 'email',
        template_id: templateId,
        message_preview: template.subject,
        success: true,
    })

    // Update lead stats
    await supabase
        .from('leads')
        .update({
            emails_sent: (lead.emails_sent || 0) + 1,
            last_email_at: new Date().toISOString(),
            outreach_status: lead.outreach_status === 'new' || lead.outreach_status === 'qualified'
                ? 'intro_sent'
                : lead.outreach_status,
            updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

    // Update template usage
    await supabase
        .from('email_templates')
        .update({ times_used: (template.times_used || 0) + 1 })
        .eq('id', templateId)

    revalidatePath('/leads')
    return { success: true, messageId: result.messageId }
}

/**
 * Send custom email to a lead (with edited subject/body/sender)
 */
export async function sendCustomEmailToLead(
    leadId: string,
    templateId: string,
    customSubject: string,
    customBody: string,
    senderName?: string,
    attachments?: Array<{ filename: string; content: string }> // base64 content
): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}> {
    const supabase = await createClient()

    // Get lead
    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()

    if (leadError || !lead) {
        return { success: false, error: 'Lead not found' }
    }

    if (!lead.contact_email) {
        return { success: false, error: 'Lead has no contact email' }
    }

    // Send email via Resend with custom content
    const { sendEmail } = await import('@/lib/email/resend')

    // Convert markdown to HTML (simple conversion)
    const htmlBody = customBody
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^(.+)$/, '<p>$1</p>')

    const result = await sendEmail({
        to: lead.contact_email,
        subject: customSubject,
        htmlBody,
        textBody: customBody,
        senderName: senderName,
        attachments: attachments,
        tags: [
            { name: 'lead_id', value: leadId },
            { name: 'template_id', value: templateId },
            { name: 'custom', value: 'true' },
        ],
    })

    if (!result.success) {
        await supabase.from('outreach_logs').insert({
            lead_id: leadId,
            action_type: 'email_failed',
            channel: 'email',
            template_id: templateId,
            message_preview: `Subject: ${customSubject}\n\n${customBody}`,
            success: false,
            error_message: result.error,
        })
        return { success: false, error: result.error }
    }

    // Log success with full email content
    await supabase.from('outreach_logs').insert({
        lead_id: leadId,
        action_type: 'email_sent',
        channel: 'email',
        template_id: templateId,
        message_preview: `De: ${senderName || 'Gaby'}\nPara: ${lead.contact_email}\nAsunto: ${customSubject}\n\n${customBody}`,
        success: true,
    })

    // Update lead stats
    await supabase
        .from('leads')
        .update({
            emails_sent: (lead.emails_sent || 0) + 1,
            last_email_at: new Date().toISOString(),
            outreach_status: lead.outreach_status === 'new' || lead.outreach_status === 'qualified'
                ? 'intro_sent'
                : lead.outreach_status,
            updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

    // Update template usage
    await supabase
        .from('email_templates')
        .update({ times_used: (await supabase.from('email_templates').select('times_used').eq('id', templateId).single()).data?.times_used + 1 || 1 })
        .eq('id', templateId)

    revalidatePath('/leads')
    return { success: true, messageId: result.messageId }
}

/**
 * Get activity logs for a lead (for history modal)
 */
export async function getLeadActivityLogs(leadId: string): Promise<{
    success: boolean;
    logs?: Array<{
        id: string;
        action_type: string;
        channel: string;
        message_preview: string | null;
        success: boolean;
        error_message: string | null;
        created_at: string;
    }>;
    error?: string;
}> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('outreach_logs')
        .select('id, action_type, channel, message_preview, success, error_message, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(50)

    if (error) {
        return { success: false, error: error.message }
    }

    return { success: true, logs: data }
}

/**
 * Improve email with AI (Gemini) for maximum engagement
 */
export async function improveEmailWithAI(
    subject: string,
    body: string,
    leadContext: {
        company_name?: string;
        contact_name?: string;
        domain: string;
        quick_issues?: string[];
        // AI Research context
        company_description?: string;
        company_industry?: string;
        company_stage?: string;
        pain_points?: string[];
        recent_news?: string;
        // Deep Scan data
        evs_score_estimate?: number;
        deep_scan_results?: {
            readiness_score: number;
            structure_score: number;
            authority_score: number;
            readiness_evidence: string;
            structure_evidence: string;
            authority_evidence: string;
        };
    }
): Promise<{
    success: boolean;
    improved_subject?: string;
    improved_body?: string;
    error?: string;
}> {
    try {
        const { generateText } = await import('ai')
        const { google } = await import('@ai-sdk/google')

        const model = google('gemini-3-flash-preview')

        // Build context string with all available data
        const contextParts = []
        contextParts.push(`- Empresa: ${leadContext.company_name || leadContext.domain}`)
        contextParts.push(`- Contacto: ${leadContext.contact_name || 'Decisor'}`)
        if (leadContext.company_description) contextParts.push(`- Qué hacen: ${leadContext.company_description}`)
        if (leadContext.company_industry) contextParts.push(`- Industria: ${leadContext.company_industry}`)
        if (leadContext.company_stage) contextParts.push(`- Stage: ${leadContext.company_stage}`)
        if (leadContext.recent_news) contextParts.push(`- Noticia reciente: ${leadContext.recent_news}`)
        if (leadContext.pain_points?.length) contextParts.push(`- Dolores potenciales: ${leadContext.pain_points.join(', ')}`)
        if (leadContext.quick_issues?.length) contextParts.push(`- Issues técnicos Quick Scan: ${leadContext.quick_issues.join(', ')}`)
        // Deep Scan EVS data
        if (leadContext.evs_score_estimate) contextParts.push(`- EVS Score estimado: ${leadContext.evs_score_estimate}/100`)
        if (leadContext.deep_scan_results) {
            const ds = leadContext.deep_scan_results
            contextParts.push(`- Readiness (citabilidad): ${ds.readiness_score}/10 - ${ds.readiness_evidence}`)
            contextParts.push(`- Structure (jerarquía): ${ds.structure_score}/10 - ${ds.structure_evidence}`)
            contextParts.push(`- Authority (E-E-A-T): ${ds.authority_score}/10 - ${ds.authority_evidence}`)
        }

        const prompt = `Sos un experto en cold email marketing B2B. Tu tarea es mejorar el siguiente email para MAXIMIZAR:
1. Open rate (asunto cautivador, curiosidad)
2. Click-through rate (CTA claro, urgencia sutil)
3. Reply rate (pregunta específica, personalización)

**Contexto del lead (usá estos datos para personalizar):**
${contextParts.join('\n')}

**Email actual:**
Asunto: ${subject}

${body}

**Instrucciones:**
1. Mantené el tono profesional pero cercano
2. Usá datos específicos del contexto (especialmente industria, dolores, noticias)
3. El asunto debe generar curiosidad sin ser clickbait
4. Incluí un solo CTA claro
5. Máximo 150 palabras en el body

**Email actual:**
Asunto: ${subject}

${body}

**Instrucciones:**
1. Mantené el tono profesional pero cercano
2. Usá datos específicos del contexto
3. El asunto debe generar curiosidad sin ser clickbait
4. Incluí un solo CTA claro
5. Máximo 150 palabras en el body
6. Usá markdown para links

**Respondé SOLO con este formato exacto:**
ASUNTO: [nuevo asunto aquí]
---
[nuevo body del email aquí]`

        const result = await generateText({
            model,
            prompt,
        })

        const text = result.text.trim()

        // Parse response
        const asuntoMatch = text.match(/ASUNTO:\s*([^\n]+)/)
        const bodyMatch = text.split('---')[1]

        if (!asuntoMatch || !bodyMatch) {
            return { success: false, error: 'Could not parse AI response' }
        }

        return {
            success: true,
            improved_subject: asuntoMatch[1].trim(),
            improved_body: bodyMatch.trim(),
        }
    } catch (error) {
        console.error('AI improvement error:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'AI error'
        }
    }
}

/**
 * Research a lead using Perplexity AI
 * Returns company context for personalized outreach
 */
export async function researchLead(leadId: string): Promise<{
    success: boolean;
    data?: {
        company_description: string;
        company_industry: string;
        company_stage: string;
        employee_count: string;
        recent_news: string;
        tech_stack: string[];
        pain_points: string[];
        competitors: string[];
    };
    error?: string;
}> {
    if (!perplexityClient) {
        return { success: false, error: 'PERPLEXITY_API_KEY not configured' }
    }

    const supabase = await createClient()

    // Get lead
    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id, domain, company_name')
        .eq('id', leadId)
        .single()

    if (leadError || !lead) {
        return { success: false, error: 'Lead not found' }
    }

    const companyIdentifier = lead.company_name || lead.domain

    try {
        const prompt = `Investigate the company "${companyIdentifier}" (website: ${lead.domain}) and respond ONLY with valid JSON, no markdown, no explanation:

{
  "company_description": "What the company does in 1-2 sentences in Spanish",
  "company_industry": "Specific industry in Spanish (e.g., 'Software de contabilidad', 'E-commerce de moda')",
  "company_stage": "startup OR growth OR enterprise (pick one)",
  "employee_count": "Estimated range (e.g., '10-50', '50-200', '200+')",
  "recent_news": "One recent relevant news or achievement, or 'Sin noticias recientes' if none found",
  "tech_stack": ["list", "of", "technologies", "they", "use"],
  "pain_points": ["potential", "pain", "points", "based", "on", "their", "business"],
  "competitors": ["main", "competitors"]
}

Be concise. Focus on information useful for B2B sales outreach. Respond ONLY with the JSON object.`

        const response = await perplexityClient.chat.completions.create({
            model: 'sonar',
            messages: [
                {
                    role: 'system',
                    content: 'You are a business research assistant. Respond only with valid JSON, no markdown formatting.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 1000,
        })

        const content = response.choices[0]?.message?.content || ''

        // Parse JSON response
        let researchData
        try {
            // Remove potential markdown code blocks
            const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
            researchData = JSON.parse(cleanContent)
        } catch {
            console.error('Failed to parse Perplexity response:', content)
            return { success: false, error: 'Failed to parse AI response' }
        }

        // Update lead with research data
        const { error: updateError } = await supabase
            .from('leads')
            .update({
                company_description: researchData.company_description,
                company_industry: researchData.company_industry,
                company_stage: researchData.company_stage,
                employee_count: researchData.employee_count,
                recent_news: researchData.recent_news,
                tech_stack: researchData.tech_stack,
                pain_points: researchData.pain_points,
                competitors: researchData.competitors,
                ai_research_done: true,
                ai_research_at: new Date().toISOString(),
                ai_research_source: 'perplexity',
            })
            .eq('id', leadId)

        if (updateError) {
            console.error('Failed to update lead:', updateError)
            return { success: false, error: 'Failed to save research data' }
        }

        revalidatePath('/leads')

        return {
            success: true,
            data: researchData
        }
    } catch (error) {
        console.error('Perplexity research error:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Research failed'
        }
    }
}

/**
 * Research multiple leads in parallel using Perplexity AI
 */
export async function bulkResearchLeads(leadIds: string[]): Promise<{
    success: boolean;
    results: Array<{ leadId: string; success: boolean; error?: string }>;
}> {
    const results = await Promise.all(
        leadIds.map(async (leadId) => {
            const result = await researchLead(leadId)
            return {
                leadId,
                success: result.success,
                error: result.error,
            }
        })
    )

    revalidatePath('/leads')

    return {
        success: results.every(r => r.success),
        results,
    }
}

/**
 * Deep Scan a lead using the same Onsite Audit as clients
 * Returns EVS scores and detailed analysis
 */
export async function deepScanLead(leadId: string): Promise<{
    success: boolean;
    data?: {
        evs_score_estimate: number;
        readiness_score: number;
        structure_score: number;
        authority_score: number;
        readiness_evidence: string;
        structure_evidence: string;
        authority_evidence: string;
    };
    error?: string;
}> {
    const supabase = await createClient()

    // Get lead
    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id, domain')
        .eq('id', leadId)
        .single()

    if (leadError || !lead) {
        return { success: false, error: 'Lead not found' }
    }

    try {
        // Run same scan as used for clients
        const scanResult = await scanWebsite(lead.domain)

        // Calculate EVS estimate (average of 3 pillars, scaled to 100)
        const evsEstimate = Math.round(
            ((scanResult.readiness_score + scanResult.structure_score + scanResult.authority_score) / 30) * 100
        )

        // Update lead with deep scan results
        const { error: updateError } = await supabase
            .from('leads')
            .update({
                deep_scan_done: true,
                deep_scan_at: new Date().toISOString(),
                evs_score_estimate: evsEstimate,
                deep_scan_results: {
                    readiness_score: scanResult.readiness_score,
                    structure_score: scanResult.structure_score,
                    authority_score: scanResult.authority_score,
                    readiness_evidence: scanResult.readiness_evidence,
                    structure_evidence: scanResult.structure_evidence,
                    authority_evidence: scanResult.authority_evidence,
                    robots_ok: scanResult.robots_ok,
                    sitemap_ok: scanResult.sitemap_ok,
                    canonical_ok: scanResult.canonical_ok,
                    schema_ok: scanResult.schema_ok,
                    llms_txt_present: scanResult.llms_txt_present,
                    notas: scanResult.notas,
                    scanned_at: new Date().toISOString(),
                },
            })
            .eq('id', leadId)

        if (updateError) {
            console.error('Failed to update lead:', updateError)
            return { success: false, error: 'Failed to save deep scan data' }
        }

        revalidatePath('/leads')

        return {
            success: true,
            data: {
                evs_score_estimate: evsEstimate,
                readiness_score: scanResult.readiness_score,
                structure_score: scanResult.structure_score,
                authority_score: scanResult.authority_score,
                readiness_evidence: scanResult.readiness_evidence,
                structure_evidence: scanResult.structure_evidence,
                authority_evidence: scanResult.authority_evidence,
            }
        }
    } catch (error) {
        console.error('Deep scan error:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Deep scan failed'
        }
    }
}
