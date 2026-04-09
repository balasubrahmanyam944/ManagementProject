import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import React from 'react';

/**
 * Exports a chart element as an image
 * @param elementId The ID of the element to export
 * @param fileName The name of the file to save (without extension)
 */
export const exportChartAsImage = async (elementId: string, fileName: string): Promise<void> => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`);
    }

    const canvas = await html2canvas(element, {
      scale: 2, // Higher scale for better quality
      backgroundColor: '#ffffff',
      logging: false,
    });

    canvas.toBlob((blob: Blob | null) => {
      if (blob) {
        saveAs(blob, `${fileName}.png`);
      }
    });
  } catch (error) {
    console.error('Error exporting chart as image:', error);
    throw error;
  }
};

/**
 * Exports a chart element as a PDF
 * @param elementId The ID of the element to export
 * @param fileName The name of the file to save (without extension)
 * @param title Optional title to include in the PDF
 */
export const exportChartAsPDF = async (
  elementId: string,
  fileName: string,
  title?: string
): Promise<void> => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`);
    }

    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
    });

    // Add title if provided
    if (title) {
      pdf.setFontSize(16);
      pdf.text(title, 14, 15);
      pdf.setFontSize(12);
      pdf.text(new Date().toLocaleDateString(), 14, 22);
      // Add image below the title
      const imgWidth = 280;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 14, 30, imgWidth, imgHeight);
    } else {
      // Add image without title
      const imgWidth = 280;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 14, 14, imgWidth, imgHeight);
    }

    pdf.save(`${fileName}.pdf`);
  } catch (error) {
    console.error('Error exporting chart as PDF:', error);
    throw error;
  }
};

/**
 * Exports a table of issues as a CSV file
 * @param issues The issues to export
 * @param fileName The name of the file to save (without extension)
 */
export const exportIssuesAsCSV = (issues: any[], fileName: string): void => {
  try {
    if (!issues || issues.length === 0) {
      throw new Error('No issues to export');
    }

    // Get all unique keys from all issues
    const allKeys = new Set<string>();
    issues.forEach((issue) => {
      Object.keys(issue).forEach((key) => {
        // Skip complex objects that wouldn't translate well to CSV
        if (
          typeof issue[key] !== 'object' ||
          issue[key] === null ||
          key === 'status' ||
          key === 'issuetype' ||
          key === 'assignee' ||
          key === 'priority'
        ) {
          allKeys.add(key);
        }
      });
    });

    // Add special keys for flattened objects
    allKeys.delete('status');
    allKeys.delete('issuetype');
    allKeys.delete('assignee');
    allKeys.delete('priority');
    allKeys.add('status');
    allKeys.add('issueType');
    allKeys.add('assignee');
    allKeys.add('priority');

    // Convert keys to array and create header row
    const keys = Array.from(allKeys);
    let csv = keys.join(',') + '\n';

    // Add data rows
    issues.forEach((issue) => {
      const row = keys.map((key) => {
        let value = '';
        
        // Handle special flattened keys
        if (key === 'status' && issue.status) {
          value = issue.status.name || '';
        } else if (key === 'issueType' && issue.issuetype) {
          value = issue.issuetype.name || '';
        } else if (key === 'assignee' && issue.assignee) {
          value = issue.assignee.displayName || '';
        } else if (key === 'priority' && issue.priority) {
          value = issue.priority.name || '';
        } else if (issue[key] !== undefined && issue[key] !== null) {
          value = issue[key].toString();
        }
        
        // Escape quotes and wrap in quotes if contains comma
        if (value.includes('"')) {
          value = value.replace(/"/g, '""');
        }
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = `"${value}"`;
        }
        
        return value;
      });
      
      csv += row.join(',') + '\n';
    });

    // Create and download the file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `${fileName}.csv`);
  } catch (error) {
    console.error('Error exporting issues as CSV:', error);
    throw error;
  }
};

/**
 * Converts Gantt chart issues to table format for printing/exporting
 * @param issues Array of issues (JiraDashboardIssue or similar)
 * @returns HTML table string
 */
const convertGanttIssuesToTable = (issues: any[]): string => {
  if (!issues || issues.length === 0) {
    return '<p>No tasks available</p>';
  }

  let tableHTML = '<table style="width: 100%; border-collapse: collapse; margin-top: 20px;">';
  tableHTML += '<thead><tr>';
  tableHTML += '<th style="border: 1px solid #333; padding: 8px; background: #f0f0f0; text-align: left;">Task</th>';
  tableHTML += '<th style="border: 1px solid #333; padding: 8px; background: #f0f0f0; text-align: left;">Key</th>';
  tableHTML += '<th style="border: 1px solid #333; padding: 8px; background: #f0f0f0; text-align: left;">Status</th>';
  tableHTML += '<th style="border: 1px solid #333; padding: 8px; background: #f0f0f0; text-align: left;">Type</th>';
  tableHTML += '<th style="border: 1px solid #333; padding: 8px; background: #f0f0f0; text-align: left;">Assignee</th>';
  tableHTML += '<th style="border: 1px solid #333; padding: 8px; background: #f0f0f0; text-align: left;">Start Date</th>';
  tableHTML += '<th style="border: 1px solid #333; padding: 8px; background: #f0f0f0; text-align: left;">Due Date</th>';
  tableHTML += '<th style="border: 1px solid #333; padding: 8px; background: #f0f0f0; text-align: left;">Priority</th>';
  tableHTML += '</tr></thead><tbody>';

  issues.forEach((issue) => {
    const summary = issue.summary || issue.name || 'N/A';
    const key = issue.key || issue.id || 'N/A';
    const status = issue.status?.name || issue.status || 'N/A';
    const type = issue.issuetype?.name || issue.type || 'N/A';
    const assignee = issue.assignee?.displayName || issue.assignee || 'Unassigned';
    
    // Extract dates
    let startDate = 'N/A';
    let dueDate = 'N/A';
    
    if (issue.customfield_10018) {
      startDate = new Date(issue.customfield_10018).toLocaleDateString();
    } else if (issue.customfield_10015) {
      startDate = new Date(issue.customfield_10015).toLocaleDateString();
    } else if (issue.created) {
      startDate = new Date(issue.created).toLocaleDateString();
    }
    
    if (issue.duedate) {
      dueDate = new Date(issue.duedate).toLocaleDateString();
    } else if (issue.resolutiondate) {
      dueDate = new Date(issue.resolutiondate).toLocaleDateString();
    }
    
    const priority = issue.priority?.name || 'Medium';

    tableHTML += '<tr>';
    tableHTML += `<td style="border: 1px solid #333; padding: 8px;">${summary}</td>`;
    tableHTML += `<td style="border: 1px solid #333; padding: 8px;">${key}</td>`;
    tableHTML += `<td style="border: 1px solid #333; padding: 8px;">${status}</td>`;
    tableHTML += `<td style="border: 1px solid #333; padding: 8px;">${type}</td>`;
    tableHTML += `<td style="border: 1px solid #333; padding: 8px;">${assignee}</td>`;
    tableHTML += `<td style="border: 1px solid #333; padding: 8px;">${startDate}</td>`;
    tableHTML += `<td style="border: 1px solid #333; padding: 8px;">${dueDate}</td>`;
    tableHTML += `<td style="border: 1px solid #333; padding: 8px;">${priority}</td>`;
    tableHTML += '</tr>';
  });

  tableHTML += '</tbody></table>';
  return tableHTML;
};

/**
 * Exports Gantt chart issues as CSV
 * @param issues Array of issues
 * @param fileName The name of the file to save
 */
export const exportGanttAsCSV = (issues: any[], fileName: string): void => {
  if (!issues || issues.length === 0) {
    throw new Error('No issues to export');
  }

  // CSV headers
  const headers = ['Task', 'Key', 'Status', 'Type', 'Assignee', 'Start Date', 'Due Date', 'Priority'];
  let csv = headers.join(',') + '\n';

  issues.forEach((issue) => {
    const summary = (issue.summary || issue.name || 'N/A').replace(/"/g, '""');
    const key = (issue.key || issue.id || 'N/A').replace(/"/g, '""');
    const status = (issue.status?.name || issue.status || 'N/A').replace(/"/g, '""');
    const type = (issue.issuetype?.name || issue.type || 'N/A').replace(/"/g, '""');
    const assignee = (issue.assignee?.displayName || issue.assignee || 'Unassigned').replace(/"/g, '""');
    
    let startDate = 'N/A';
    let dueDate = 'N/A';
    
    if (issue.customfield_10018) {
      startDate = new Date(issue.customfield_10018).toLocaleDateString();
    } else if (issue.customfield_10015) {
      startDate = new Date(issue.customfield_10015).toLocaleDateString();
    } else if (issue.created) {
      startDate = new Date(issue.created).toLocaleDateString();
    }
    
    if (issue.duedate) {
      dueDate = new Date(issue.duedate).toLocaleDateString();
    } else if (issue.resolutiondate) {
      dueDate = new Date(issue.resolutiondate).toLocaleDateString();
    }
    
    const priority = (issue.priority?.name || 'Medium').replace(/"/g, '""');

    const row = [
      `"${summary}"`,
      `"${key}"`,
      `"${status}"`,
      `"${type}"`,
      `"${assignee}"`,
      `"${startDate}"`,
      `"${dueDate}"`,
      `"${priority}"`
    ];
    
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${fileName}.csv`);
};

/**
 * Prints a specific element
 * @param elementId The ID of the element to print
 * @param title Optional title to include in the print
 * @param issuesData Optional issues data for Gantt charts to convert to table
 */
export const printElement = async (elementId: string, title?: string, issuesData?: any[]): Promise<void> => {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`);
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Could not open print window');
    }

    // Clone the element to avoid modifying the original
    const clonedElement = element.cloneNode(true) as HTMLElement;
    
    // Remove non-printable elements
    const nonPrintableSelectors = [
      'button',
      '.no-print',
      '[class*="hover:"]',
      '[class*="animate-"]',
      'nav',
      'header:not(.print-keep)',
      'footer:not(.print-keep)'
    ];
    
    nonPrintableSelectors.forEach(selector => {
      const elements = clonedElement.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });

    printWindow.document.write('<html><head><title>' + (title || 'Print') + '</title>');
    printWindow.document.write('<meta charset="utf-8">');
    printWindow.document.write('<style>');
    printWindow.document.write(`
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      @page {
        margin: 1cm;
        size: A4 landscape;
      }
      
      body {
        font-family: Arial, sans-serif;
        font-size: 10pt;
        line-height: 1.4;
        color: #000;
        background: #fff;
        margin: 0;
        padding: 20px;
      }
      
      .print-header {
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid #000;
      }
      
      .print-title {
        font-size: 20pt;
        font-weight: bold;
        color: #000;
        margin-bottom: 5px;
      }
      
      .print-date {
        font-size: 10pt;
        color: #666;
      }
      
      .print-content {
        margin-top: 20px;
      }
      
      /* Tables */
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 10px 0;
        page-break-inside: auto;
      }
      
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      
      thead {
        display: table-header-group;
      }
      
      tfoot {
        display: table-footer-group;
      }
      
      th, td {
        border: 1px solid #333;
        padding: 6px 8px;
        text-align: left;
        font-size: 9pt;
      }
      
      th {
        background-color: #f0f0f0 !important;
        font-weight: bold;
        color: #000 !important;
      }
      
      /* Gantt Chart Styles */
      .gantt-chart,
      [id*="gantt"],
      [class*="gantt"] {
        page-break-inside: avoid;
        overflow: visible !important;
        width: 100%;
      }
      
      .gantt-task,
      [class*="task-bar"],
      [class*="gantt-bar"],
      [class*="bar"] {
        border: 1px solid #333 !important;
        background: #e0e0e0 !important;
        color: #000 !important;
        padding: 2px 4px;
        margin: 1px 0;
      }
      
      /* Cards */
      [class*="card"],
      .card {
        border: 1px solid #ccc !important;
        background: white !important;
        page-break-inside: avoid;
        margin-bottom: 10px;
        padding: 10px;
      }
      
      /* Charts and SVGs */
      canvas,
      svg {
        max-width: 100% !important;
        height: auto !important;
        page-break-inside: avoid;
      }
      
      /* Headings */
      h1, h2, h3, h4, h5, h6 {
        color: #000 !important;
        page-break-after: avoid;
        margin: 10px 0 5px 0;
      }
      
      h1 { font-size: 18pt; }
      h2 { font-size: 16pt; }
      h3 { font-size: 14pt; }
      h4 { font-size: 12pt; }
      
      /* Links */
      a {
        color: #000 !important;
        text-decoration: underline;
      }
      
      /* Badges and labels */
      [class*="badge"],
      [class*="Badge"],
      .badge {
        border: 1px solid #333 !important;
        background: #f0f0f0 !important;
        color: #000 !important;
        padding: 2px 6px;
        display: inline-block;
        font-size: 8pt;
        margin: 2px;
      }
      
      /* Progress bars */
      [class*="progress"],
      [class*="Progress"],
      .progress {
        border: 1px solid #333 !important;
        background: #f0f0f0 !important;
        height: 20px;
        margin: 5px 0;
      }
      
      [class*="progress-bar"],
      [class*="progress-fill"],
      [class*="fill"] {
        background: #666 !important;
        color: #fff !important;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8pt;
      }
      
      /* Text colors - force black for print */
      [class*="text-"],
      p, span, div, li, td, th {
        color: #000 !important;
      }
      
      /* Backgrounds - force white for print */
      [class*="bg-"],
      [class*="background"] {
        background: white !important;
      }
      
      /* Grid layouts */
      [class*="grid"] {
        display: table !important;
        width: 100%;
      }
      
      [class*="grid"] > * {
        display: table-cell !important;
        vertical-align: top;
      }
      
      /* Flex layouts */
      [class*="flex"] {
        display: block !important;
      }
      
      /* Hide scrollbars and overflow */
      * {
        overflow: visible !important;
      }
      
      /* Print footer */
      .print-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 10px;
        border-top: 1px solid #000;
        background: white !important;
        text-align: center;
        font-size: 8pt;
      }
      
      @media print {
        body {
          margin: 0;
          padding: 0;
        }
        
        .print-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: white !important;
        }
        
        .print-content {
          margin-top: 60px;
        }
      }
    `);
    printWindow.document.write('</style></head><body>');

    if (title) {
      printWindow.document.write('<div class="print-header">');
      printWindow.document.write(`<div class="print-title">${title}</div>`);
      printWindow.document.write(`<div class="print-date">Generated on ${new Date().toLocaleString()}</div>`);
      printWindow.document.write('</div>');
    }

    printWindow.document.write('<div class="print-content">');
    
    // Check if this is a drilldown modal or Gantt chart
    const isDrilldown = elementId.includes('drilldown');
    const isGanttChart = elementId.includes('gantt') || 
                        element.querySelector('[class*="gantt"]') !== null;
    
    // If we have issues data, always convert to table format (for both Gantt charts and drilldown modals)
    if (issuesData && issuesData.length > 0) {
      // Convert issues to table format
      const tableHTML = convertGanttIssuesToTable(issuesData);
      printWindow.document.write(tableHTML);
    } else {
      // Try to extract table from cloned element
      const tableElement = clonedElement.querySelector('table');
      if (tableElement) {
        // Check if table has data rows (more than just header)
        const tbody = tableElement.querySelector('tbody');
        const hasDataRows = tbody && tbody.rows.length > 0;
        
        if (hasDataRows) {
          // Table has data, use it
          printWindow.document.write(clonedElement.outerHTML);
        } else {
          // Table exists but no data rows, show message
          printWindow.document.write('<p style="padding: 20px; text-align: center; color: #666;">No data available</p>');
        }
      } else {
        // No table found, try to use the element as-is
        printWindow.document.write(clonedElement.outerHTML);
      }
    }
    
    printWindow.document.write('</div>');
    
    printWindow.document.write('<div class="print-footer">');
    printWindow.document.write(`Page 1 | ${new Date().toLocaleString()}`);
    printWindow.document.write('</div>');
    
    printWindow.document.write('</body></html>');

    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load before printing
    setTimeout(() => {
      printWindow.print();
      // Don't close immediately - let user see preview
      // printWindow.close();
    }, 500);
  } catch (error) {
    console.error('Error printing element:', error);
    throw error;
  }
};

/**
 * Exports multiple charts as a single PDF
 * @param charts Array of chart references with names
 * @param fileName The name of the file to save (without extension)
 */
export const exportChartsAsPDF = async (
  charts: Array<{ ref: React.RefObject<HTMLElement> | { current: HTMLElement | null }; name: string }>,
  fileName: string
): Promise<void> => {
  try {
    if (!charts || charts.length === 0) {
      throw new Error('No charts to export');
    }

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
    });

    let yPosition = 20;
    const pageWidth = 280;
    const margin = 14;
    const maxPageHeight = 190;

    for (let i = 0; i < charts.length; i++) {
      const chart = charts[i];
      const element = chart.ref?.current;
      
      if (!element) {
        console.warn(`Chart "${chart.name}" element not found, skipping...`);
        continue;
      }

      // Check if we need a new page
      if (yPosition > maxPageHeight && i > 0) {
        pdf.addPage();
        yPosition = 20;
      }

      // Add chart title
      pdf.setFontSize(14);
      pdf.text(chart.name, margin, yPosition);
      yPosition += 8;

      // Capture chart as image
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Check if chart fits on current page
      if (yPosition + imgHeight > maxPageHeight) {
        pdf.addPage();
        yPosition = 20;
        pdf.setFontSize(14);
        pdf.text(chart.name, margin, yPosition);
        yPosition += 8;
      }

      // Add image to PDF
      pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
      yPosition += imgHeight + 10; // Add spacing between charts
    }

    pdf.save(`${fileName}.pdf`);
  } catch (error) {
    console.error('Error exporting charts as PDF:', error);
    throw error;
  }
};
