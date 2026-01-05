'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Cadence, CadenceStep, Lead } from '@/types/database'

// ================================================
// CADENCE CRUD
// ================================================

/**
 * Get all active cadences
 */
export async function getCadences(): Promise<{
    success: boolean;
    cadences?: Cadence[];
    error?: string;
}> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('cadences')
        .select('*')
        .eq('is_active', true)
        .order('name')

    if (error) {
        return { success: false, error: error.message }
    }

    return { success: true, cadences: data as Cadence[] }
}

/**
 * Get cadence with all steps
 */
export async function getCadenceWithSteps(cadenceId: string): Promise<{
    success: boolean;
    cadence?: Cadence;
    steps?: CadenceStep[];
    error?: string;
}> {
    const supabase = await createClient()

    const { data: cadence, error: cadenceError } = await supabase
        .from('cadences')
        .select('*')
        .eq('id', cadenceId)
        .single()

    if (cadenceError) {
        return { success: false, error: cadenceError.message }
    }

    const { data: steps, error: stepsError } = await supabase
        .from('cadence_steps')
        .select('*')
        .eq('cadence_id', cadenceId)
        .order('step_number')

    if (stepsError) {
        return { success: false, error: stepsError.message }
    }

    return {
        success: true,
        cadence: cadence as Cadence,
        steps: steps as CadenceStep[]
    }
}

/**
 * Create a new cadence
 */
export async function createCadence(data: {
    name: string;
    description?: string;
}): Promise<{
    success: boolean;
    cadence?: Cadence;
    error?: string;
}> {
    const supabase = await createClient()

    const { data: cadence, error } = await supabase
        .from('cadences')
        .insert({
            name: data.name,
            description: data.description || null,
            is_active: true,
            total_steps: 0,
        })
        .select()
        .single()

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath('/cadences')
    return { success: true, cadence: cadence as Cadence }
}

/**
 * Add a step to a cadence
 */
export async function addCadenceStep(data: {
    cadence_id: string;
    step_number: number;
    action_type: 'email' | 'linkedin_connect' | 'linkedin_message' | 'wait' | 'call';
    wait_days?: number;
    email_template_id?: string;
    linkedin_message_type?: 'connection' | 'followup' | 'pitch';
    notes?: string;
}): Promise<{
    success: boolean;
    step?: CadenceStep;
    error?: string;
}> {
    const supabase = await createClient()

    const { data: step, error } = await supabase
        .from('cadence_steps')
        .insert({
            cadence_id: data.cadence_id,
            step_number: data.step_number,
            action_type: data.action_type,
            wait_days: data.wait_days || 0,
            email_template_id: data.email_template_id || null,
            linkedin_message_type: data.linkedin_message_type || null,
            notes: data.notes || null,
        })
        .select()
        .single()

    if (error) {
        return { success: false, error: error.message }
    }

    // Update total_steps
    await supabase
        .from('cadences')
        .update({ total_steps: data.step_number, updated_at: new Date().toISOString() })
        .eq('id', data.cadence_id)

    revalidatePath('/cadences')
    return { success: true, step: step as CadenceStep }
}

// ================================================
// LEAD CADENCE ASSIGNMENT
// ================================================

/**
 * Assign a lead to a cadence
 */
export async function assignLeadToCadence(
    leadId: string,
    cadenceId: string
): Promise<{
    success: boolean;
    error?: string;
}> {
    const supabase = await createClient()

    // Get first actionable step of cadence (skip initial waits)
    const { data: steps, error: stepsError } = await supabase
        .from('cadence_steps')
        .select('*')
        .eq('cadence_id', cadenceId)
        .order('step_number')

    if (stepsError || !steps?.length) {
        return { success: false, error: 'Cadence not found or has no steps' }
    }

    // Find first actionable step and calculate wait time
    let totalWaitDays = 0
    let firstStep = steps[0]

    for (const step of steps) {
        if (step.action_type === 'wait') {
            totalWaitDays += step.wait_days
        } else {
            firstStep = step
            break
        }
    }

    // Calculate next action time
    const nextActionAt = new Date()
    nextActionAt.setDate(nextActionAt.getDate() + totalWaitDays)

    // Update lead
    const { error: updateError } = await supabase
        .from('leads')
        .update({
            cadence_id: cadenceId,
            cadence_started_at: new Date().toISOString(),
            cadence_paused: false,
            cadence_completed_at: null,
            sequence_step: firstStep.step_number,
            next_action_at: nextActionAt.toISOString(),
            next_action_type: firstStep.action_type,
            updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    revalidatePath('/leads')
    return { success: true }
}

/**
 * Bulk assign leads to a cadence
 */
export async function bulkAssignToCadence(
    leadIds: string[],
    cadenceId: string
): Promise<{
    success: boolean;
    assigned: number;
    error?: string;
}> {
    let assigned = 0

    for (const leadId of leadIds) {
        const result = await assignLeadToCadence(leadId, cadenceId)
        if (result.success) assigned++
    }

    revalidatePath('/leads')
    return { success: true, assigned }
}

/**
 * Advance a lead to the next step in their cadence
 * Called after completing an action (email sent, LinkedIn message sent, etc.)
 */
export async function advanceLeadInCadence(leadId: string): Promise<{
    success: boolean;
    completed?: boolean; // true if cadence is now complete
    nextStep?: CadenceStep;
    error?: string;
}> {
    const supabase = await createClient()

    // Get lead with current state
    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()

    if (leadError || !lead) {
        return { success: false, error: 'Lead not found' }
    }

    if (!lead.cadence_id) {
        return { success: false, error: 'Lead is not in a cadence' }
    }

    // Get all steps for this cadence
    const { data: allSteps, error: stepsError } = await supabase
        .from('cadence_steps')
        .select('*')
        .eq('cadence_id', lead.cadence_id)
        .order('step_number')

    if (stepsError || !allSteps?.length) {
        return { success: false, error: 'Cadence steps not found' }
    }

    // Find current step index and next actionable step
    const currentStepIndex = allSteps.findIndex(s => s.step_number === lead.sequence_step)

    if (currentStepIndex === -1) {
        return { success: false, error: 'Current step not found' }
    }

    // Look for next actionable step (skip waits but accumulate wait time)
    let totalWaitDays = 0
    let nextActionableStep: CadenceStep | null = null

    for (let i = currentStepIndex + 1; i < allSteps.length; i++) {
        const step = allSteps[i]
        if (step.action_type === 'wait') {
            totalWaitDays += step.wait_days
        } else {
            nextActionableStep = step as CadenceStep
            break
        }
    }

    if (!nextActionableStep) {
        // Cadence completed
        await supabase
            .from('leads')
            .update({
                cadence_completed_at: new Date().toISOString(),
                next_action_at: null,
                next_action_type: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', leadId)

        revalidatePath('/leads')
        return { success: true, completed: true }
    }

    // Calculate next action time
    const nextActionAt = new Date()
    nextActionAt.setDate(nextActionAt.getDate() + totalWaitDays)

    // Update lead
    await supabase
        .from('leads')
        .update({
            sequence_step: nextActionableStep.step_number,
            next_action_at: nextActionAt.toISOString(),
            next_action_type: nextActionableStep.action_type,
            updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

    revalidatePath('/leads')
    return { success: true, completed: false, nextStep: nextActionableStep }
}

/**
 * Pause a lead's cadence (e.g., they replied, meeting booked)
 */
export async function pauseLeadCadence(leadId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('leads')
        .update({
            cadence_paused: true,
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
 * Resume a paused cadence
 */
export async function resumeLeadCadence(leadId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const supabase = await createClient()

    // Get lead
    const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()

    if (leadError || !lead || !lead.cadence_id) {
        return { success: false, error: 'Lead not found or not in cadence' }
    }

    // Set next action to now
    const { error } = await supabase
        .from('leads')
        .update({
            cadence_paused: false,
            next_action_at: new Date().toISOString(), // Action due now
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
 * Remove a lead from their cadence
 */
export async function removeLeadFromCadence(leadId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('leads')
        .update({
            cadence_id: null,
            cadence_started_at: null,
            cadence_paused: false,
            cadence_completed_at: null,
            sequence_step: 0,
            next_action_at: null,
            next_action_type: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath('/leads')
    return { success: true }
}

// ================================================
// TODAY'S ACTIONS
// ================================================

export interface TodaysAction {
    lead: Lead;
    step: CadenceStep;
    cadence_name: string;
    action_type: string;
    due_at: string;
    is_overdue: boolean;
}

/**
 * Get all actions due today or overdue
 */
export async function getTodaysActions(): Promise<{
    success: boolean;
    actions?: TodaysAction[];
    summary?: {
        total: number;
        emails: number;
        linkedin: number;
        overdue: number;
    };
    error?: string;
}> {
    const supabase = await createClient()

    // Get end of today
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    // Get leads with pending actions (not paused, has next_action_at <= end of today)
    const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('*')
        .not('cadence_id', 'is', null)
        .eq('cadence_paused', false)
        .is('cadence_completed_at', null)
        .lte('next_action_at', endOfToday.toISOString())
        .order('next_action_at')

    if (leadsError) {
        return { success: false, error: leadsError.message }
    }

    if (!leads?.length) {
        return {
            success: true,
            actions: [],
            summary: { total: 0, emails: 0, linkedin: 0, overdue: 0 }
        }
    }

    // Get cadence info for each lead
    const cadenceIds = [...new Set(leads.map(l => l.cadence_id))]
    const { data: cadences } = await supabase
        .from('cadences')
        .select('id, name')
        .in('id', cadenceIds)

    const cadenceMap = new Map(cadences?.map(c => [c.id, c.name]) || [])

    // Get current step for each lead
    const now = new Date()
    const actions: TodaysAction[] = []

    for (const lead of leads) {
        const { data: step } = await supabase
            .from('cadence_steps')
            .select('*')
            .eq('cadence_id', lead.cadence_id)
            .eq('step_number', lead.sequence_step)
            .single()

        if (step) {
            const dueAt = new Date(lead.next_action_at!)
            actions.push({
                lead: lead as Lead,
                step: step as CadenceStep,
                cadence_name: cadenceMap.get(lead.cadence_id) || 'Unknown',
                action_type: step.action_type,
                due_at: lead.next_action_at!,
                is_overdue: dueAt < now,
            })
        }
    }

    // Calculate summary
    const summary = {
        total: actions.length,
        emails: actions.filter(a => a.action_type === 'email').length,
        linkedin: actions.filter(a => ['linkedin_connect', 'linkedin_message'].includes(a.action_type)).length,
        overdue: actions.filter(a => a.is_overdue).length,
    }

    return { success: true, actions, summary }
}
