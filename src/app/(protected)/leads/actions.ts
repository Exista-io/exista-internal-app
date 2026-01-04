'use server'

import { createClient } from '@/lib/supabase/server'
import { quickScanDomain, bulkQuickScan, QuickScanResult } from '@/lib/leads/quick-scan'
import { hunterDomainSearch, getHunterAccountInfo } from '@/lib/leads/hunter'
import { revalidatePath } from 'next/cache'

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
    senderName?: string
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

        const prompt = `Sos un experto en cold email marketing B2B. Tu tarea es mejorar el siguiente email para MAXIMIZAR:
1. Open rate (asunto cautivador, curiosidad)
2. Click-through rate (CTA claro, urgencia sutil)
3. Reply rate (pregunta específica, personalización)

**Contexto del lead:**
- Empresa: ${leadContext.company_name || leadContext.domain}
- Contacto: ${leadContext.contact_name || 'Decisor'}
- Dominio: ${leadContext.domain}
- Problemas detectados: ${leadContext.quick_issues?.join(', ') || 'Optimización técnica'}

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
