/**
 * Resend Email SDK Wrapper
 * Handles email sending with template variable replacement
 */

import { Lead, EmailTemplate } from '@/types/database'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const SENDER_EMAIL = process.env.RESEND_FROM_EMAIL || 'gaby@exista.io'
const SENDER_NAME = process.env.RESEND_FROM_NAME || 'Gaby'
const CALENDLY_URL = process.env.CALENDLY_URL || 'https://calendly.com/exista'

export interface SendEmailResult {
    success: boolean
    messageId?: string
    error?: string
}

/**
 * Replace template variables with lead data (internal)
 */
function replaceTemplateVariables(
    template: string,
    lead: Lead
): string {
    const variables: Record<string, string> = {
        '{{company_name}}': lead.company_name || lead.domain,
        '{{contact_name}}': lead.contact_name || 'Equipo',
        '{{domain}}': lead.domain,
        '{{quick_issues}}': formatQuickIssues(lead.quick_issues || []),
        '{{quick_issue_1}}': lead.quick_issues?.[0] || 'problemas técnicos',
        '{{top_competitor}}': lead.top_competitor || 'tu competencia',
        '{{calendly_link}}': CALENDLY_URL,
        '{{sender_name}}': SENDER_NAME,
        '{{evs_score}}': lead.evs_score?.toString() || 'N/A',
    }

    let result = template
    for (const [key, value] of Object.entries(variables)) {
        result = result.replaceAll(key, value)
    }
    return result
}

/**
 * Format quick issues for email display
 */
function formatQuickIssues(issues: string[]): string {
    if (issues.length === 0) return 'algunos problemas técnicos'
    return issues
        .slice(0, 3)
        .map(issue => `• ${issue}`)
        .join('\n')
}

/**
 * Convert markdown to simple HTML
 * (Basic conversion - upgrade to 'marked' if needed)
 */
function markdownToHtml(markdown: string): string {
    return markdown
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold and italic
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        // Wrap in paragraph
        .replace(/^(.+)$/, '<p>$1</p>')
}

/**
 * Send email via Resend API
 */
export async function sendEmail(params: {
    to: string
    subject: string
    htmlBody: string
    textBody?: string
    senderName?: string
    tags?: Array<{ name: string; value: string }>
    attachments?: Array<{ filename: string; content: string }> // base64 content
}): Promise<SendEmailResult> {
    if (!RESEND_API_KEY) {
        return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    const fromName = params.senderName || SENDER_NAME

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: `${fromName} <${SENDER_EMAIL}>`,
                to: [params.to],
                subject: params.subject,
                html: params.htmlBody,
                text: params.textBody,
                tags: params.tags,
                attachments: params.attachments,
            }),
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            return {
                success: false,
                error: errorData.message || `HTTP ${response.status}`,
            }
        }

        const data = await response.json()
        return {
            success: true,
            messageId: data.id,
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

/**
 * Send email to a lead using a template
 */
export async function sendEmailWithTemplate(
    lead: Lead,
    template: EmailTemplate
): Promise<SendEmailResult> {
    // Validate lead has email
    if (!lead.contact_email) {
        return { success: false, error: 'Lead has no contact email' }
    }

    // Replace variables in subject and body
    const subject = replaceTemplateVariables(template.subject, lead)
    const bodyMarkdown = replaceTemplateVariables(template.body_markdown, lead)
    const htmlBody = markdownToHtml(bodyMarkdown)

    // Send with tags for tracking
    return sendEmail({
        to: lead.contact_email,
        subject,
        htmlBody,
        textBody: bodyMarkdown, // Plain text fallback
        tags: [
            { name: 'lead_id', value: lead.id },
            { name: 'template_id', value: template.id },
            { name: 'template_type', value: template.template_type || 'custom' },
        ],
    })
}
