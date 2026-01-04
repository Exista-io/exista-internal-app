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
