import { BrowserWindow, dialog } from 'electron'
import * as fs from 'fs'

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(secs: number | null): string {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${s}s`
}

function parseSummary(text: string | null): any {
  if (!text) return null
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0])
  } catch { /* ignore */ }
  return null
}

function renderPdfHtml(meeting: any, clientName: string | null): string {
  const summary = parseSummary(meeting.summary_text)
  const transcript: any[] = Array.isArray(meeting.transcript) ? meeting.transcript : []
  const coachingPrompts: any[] = Array.isArray(meeting.coaching_prompts) ? meeting.coaching_prompts : []

  const transcriptHtml = transcript.map(line => {
    const isClient = !/(^|\W)you(\W|:|$)/i.test(line.speaker || '')
    return `<div class="line"><span class="speaker${isClient ? ' client' : ''}">${escapeHtml(line.speaker)}</span><span class="text">${escapeHtml(line.text)}</span></div>`
  }).join('')

  const actionItemsHtml = (summary?.actionItems ?? []).map((a: any) => `
    <li>
      <strong>${escapeHtml(a.assignee || '')}</strong>: ${escapeHtml(a.task || '')}
      ${a.deadline ? `<em class="deadline">— due ${escapeHtml(a.deadline)}</em>` : ''}
    </li>
  `).join('')

  const decisionsHtml = (summary?.keyDecisions ?? []).map((d: string) => `<li>${escapeHtml(d)}</li>`).join('')
  const followUpsHtml = (summary?.followUps ?? []).map((f: string) => `<li>${escapeHtml(f)}</li>`).join('')
  const preferencesHtml = (summary?.clientPreferences ?? []).map((p: string) => `<li>${escapeHtml(p)}</li>`).join('')
  const redFlagsHtml = (summary?.redFlags ?? []).map((r: string) => `<li>🚩 ${escapeHtml(r)}</li>`).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: Letter; margin: 0.75in; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
    color: #1e293b;
    line-height: 1.55;
    font-size: 11pt;
    margin: 0;
  }

  /* Header — gradient block, never broken */
  .header {
    background: linear-gradient(90deg, #2563eb, #a855f7);
    color: white;
    padding: 18pt 22pt;
    border-radius: 6pt;
    margin-bottom: 18pt;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header h1 { margin: 0 0 4pt 0; font-size: 18pt; font-weight: 700; }
  .header .meta { font-size: 9pt; opacity: 0.9; }
  .header .meta span { margin-right: 14pt; }

  /* Section headings — keep with their first content */
  h2 {
    color: #2563eb;
    font-size: 12pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4pt;
    margin-top: 18pt;
    margin-bottom: 10pt;
    page-break-after: avoid;
    break-after: avoid;
  }
  h2 .badge {
    display: inline-block;
    background: #eff6ff;
    color: #2563eb;
    padding: 1pt 6pt;
    border-radius: 4pt;
    font-size: 8pt;
    margin-left: 6pt;
    text-transform: none;
    letter-spacing: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Summary box — single block, don't break */
  .summary-box {
    background: #f8fafc;
    border-left: 3px solid #2563eb;
    padding: 10pt 14pt;
    border-radius: 0 4pt 4pt 0;
    font-size: 10.5pt;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Lists — break between items, never inside an item */
  ul { margin: 6pt 0; padding-left: 20pt; }
  li {
    margin-bottom: 6pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .deadline {
    color: #64748b;
    font-style: italic;
    font-size: 9.5pt;
    margin-left: 4pt;
  }

  /* TRANSCRIPT — let it flow across pages naturally.
     No outer bordered box — that was getting cut.
     Each line is its own atomic unit that won't break. */
  .transcript-wrap {
    font-size: 9.75pt;
  }
  .line {
    padding: 5pt 0;
    border-bottom: 1px solid #f1f5f9;
    page-break-inside: avoid;
    break-inside: avoid;
    line-height: 1.5;
  }
  .line:last-child { border-bottom: 0; }
  .speaker {
    display: inline-block;
    background: #eff6ff;
    color: #2563eb;
    padding: 1pt 6pt;
    border-radius: 3pt;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-right: 6pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .speaker.client {
    background: #faf5ff;
    color: #a855f7;
  }

  .footer {
    margin-top: 24pt;
    padding-top: 10pt;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    color: #94a3b8;
    font-size: 8.5pt;
  }
  .empty {
    color: #94a3b8;
    font-style: italic;
    font-size: 9.5pt;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>BuzzyHive AI · Meeting Report</h1>
    <div class="meta">
      ${clientName ? `<span><strong>Client:</strong> ${escapeHtml(clientName)}</span>` : ''}
      <span><strong>Date:</strong> ${fmtDate(meeting.started_at)}</span>
      <span><strong>Duration:</strong> ${fmtDuration(meeting.duration_seconds)}</span>
    </div>
  </div>

  ${summary?.summary ? `
    <h2>Summary</h2>
    <div class="summary-box">${escapeHtml(summary.summary)}</div>
  ` : ''}

  ${actionItemsHtml ? `
    <h2>Action Items <span class="badge">${(summary?.actionItems ?? []).length}</span></h2>
    <ul>${actionItemsHtml}</ul>
  ` : ''}

  ${decisionsHtml ? `
    <h2>Key Decisions</h2>
    <ul>${decisionsHtml}</ul>
  ` : ''}

  ${followUpsHtml ? `
    <h2>Follow-ups</h2>
    <ul>${followUpsHtml}</ul>
  ` : ''}

  ${preferencesHtml ? `
    <h2>Client Preferences</h2>
    <ul>${preferencesHtml}</ul>
  ` : ''}

  ${redFlagsHtml ? `
    <h2>Red Flags</h2>
    <ul>${redFlagsHtml}</ul>
  ` : ''}

  ${transcriptHtml ? `
    <h2>Full Transcript <span class="badge">${transcript.length} lines</span></h2>
    <div class="transcript-wrap">${transcriptHtml}</div>
  ` : '<h2>Transcript</h2><p class="empty">No transcript captured.</p>'}

  <div class="footer">
    BuzzyHive AI · Meeting captured ${fmtDate(meeting.created_at)}
  </div>
</body>
</html>`
}

export async function exportMeetingPdf(meeting: any, clientName: string | null): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const html = renderPdfHtml(meeting, clientName)

    // Suggest a filename based on client + date
    const dateStr = meeting.started_at
      ? new Date(meeting.started_at).toISOString().slice(0, 10)
      : 'meeting'
    const slug = clientName
      ? clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      : 'meeting'
    const suggestedName = `hivemind-${slug}-${dateStr}.pdf`

    const result = await dialog.showSaveDialog({
      title: 'Save meeting as PDF',
      defaultPath: suggestedName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled' }
    }

    // Render the HTML in an offscreen window and print to PDF
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        offscreen: true,
      },
    })

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    })

    fs.writeFileSync(result.filePath, pdfBuffer)
    win.close()

    return { success: true, path: result.filePath }
  } catch (err) {
    console.error('[PDF] Export error:', err)
    return { success: false, error: String(err) }
  }
}
