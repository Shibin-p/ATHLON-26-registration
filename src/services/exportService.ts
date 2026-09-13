import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Registration, CollegeSettings } from '../types';

/**
 * Download sample Excel template for student bulk import
 * Columns: Register Number | Student Name
 */
export const downloadSampleStudentExcel = () => {
  const sampleData = [
    { 'Register Number': '10001', 'Student Name': 'Rahul S' },
    { 'Register Number': '10002', 'Student Name': 'Amal Joseph' },
    { 'Register Number': '10003', 'Student Name': 'Arun Kumar' },
    { 'Register Number': '10004', 'Student Name': 'Fathima Noor' },
    { 'Register Number': '10005', 'Student Name': 'Sneha Nair' },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  // Auto-fit column widths
  ws['!cols'] = [{ wch: 18 }, { wch: 25 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, 'ATHLON26_Student_Import_Template.xlsx');
};

/**
 * Export filtered registrations dataset to Excel (.xlsx)
 */
export const exportRegistrationsToExcel = (
  registrations: Registration[],
  filename: string = 'ATHLON26_Registrations.xlsx'
) => {
  const rows = registrations.map((reg, idx) => {
    // Format participants
    let participantsText = '';
    if (reg.participantsSnapshot && reg.participantsSnapshot.length > 0) {
      participantsText = reg.participantsSnapshot
        .map((s) => `${s.name} (${s.registerNumber})`)
        .join(', ');
    } else {
      participantsText = `${reg.participantCount} participant(s)`;
    }

    // Format relay order if applicable
    let relayInfo = '';
    if (reg.relayOrder && reg.relayOrder.length > 0) {
      relayInfo = reg.relayOrder
        .map((r) => `R${r.order}: ${r.studentName} (${r.registerNumber})`)
        .join(' | ');
    }

    const regDate = reg.createdAt?.toDate
      ? reg.createdAt.toDate().toLocaleString()
      : 'N/A';

    return {
      'Sl No': idx + 1,
      'Registration ID': reg.registrationId,
      'Event Name': reg.eventNameSnapshot,
      'Event Type': reg.registrationType.toUpperCase(),
      Year: reg.year,
      Class: reg.class,
      Department: reg.department,
      'Team Name': reg.teamName || 'N/A',
      'Team Captain': reg.captainName || 'N/A',
      'Participants Count': reg.participantCount,
      'Participants List': participantsText,
      'Relay Runner Order': relayInfo || 'N/A',
      'Coordinator Name': reg.coordinatorName,
      'Coordinator Email': reg.coordinatorEmail || 'N/A',
      Status: reg.status.toUpperCase(),
      'Registration Date': regDate,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 22 },
    { wch: 12 },
    { wch: 8 },
    { wch: 10 },
    { wch: 25 },
    { wch: 18 },
    { wch: 18 },
    { wch: 10 },
    { wch: 45 },
    { wch: 30 },
    { wch: 20 },
    { wch: 24 },
    { wch: 12 },
    { wch: 22 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Registrations');
  XLSX.writeFile(wb, filename);
};

/**
 * Export registrations list to professional A4 PDF
 */
export const exportRegistrationsToPDF = (
  registrations: Registration[],
  title: string,
  settings?: CollegeSettings
) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const collegeName = settings?.collegeName || 'College of Engineering & Technology';
  const meetName = settings?.sportsEventName || "ATHLON'26";
  const academicYear = settings?.academicYear || '2025-2026';

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text(meetName + ' — ANNUAL SPORTS & ATHLETICS', 14, 15);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`${collegeName} | Academic Year: ${academicYear}`, 14, 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 28);

  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated on: ${dateStr}`, 240, 28);

  // Table Data
  const tableRows = registrations.map((r, i) => {
    let participantDesc = '';
    if (r.participantsSnapshot && r.participantsSnapshot.length > 0) {
      participantDesc = r.participantsSnapshot
        .map((s) => `${s.name} (${s.registerNumber})`)
        .join(', ');
    } else {
      participantDesc = `${r.participantCount} Participant(s)`;
    }

    if (r.teamName) {
      participantDesc = `Team: ${r.teamName} | Capt: ${r.captainName || 'N/A'}\n` + participantDesc;
    }

    return [
      i + 1,
      r.registrationId,
      r.eventNameSnapshot,
      `${r.year} ${r.class}`,
      r.registrationType.toUpperCase(),
      participantDesc,
      r.coordinatorName,
      r.status.toUpperCase(),
    ];
  });

  autoTable(doc, {
    startY: 32,
    head: [
      [
        '#',
        'Reg ID',
        'Event',
        'Scope',
        'Type',
        'Participants / Team Info',
        'Coordinator',
        'Status',
      ],
    ],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 24 },
      2: { cellWidth: 35 },
      3: { cellWidth: 20 },
      4: { cellWidth: 20 },
      5: { cellWidth: 105 },
      6: { cellWidth: 32 },
      7: { cellWidth: 20 },
    },
    didDrawPage: (data) => {
      // Signature footer on bottom of page
      const pageHeight = doc.internal.pageSize.height || 210;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `ATHLON'26 Official Sports Registration Document — Page ${data.pageNumber}`,
        14,
        pageHeight - 6
      );
    },
  });

  // Save the PDF
  doc.save(`ATHLON26_Registrations_${Date.now()}.pdf`);
};

/**
 * Export an individual registration receipt / slip to PDF
 */
export const exportSingleRegistrationPDF = (
  reg: Registration,
  settings?: CollegeSettings
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const collegeName = settings?.collegeName || 'College of Engineering & Technology';
  const meetName = settings?.sportsEventName || "ATHLON'26";

  // Header Box
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, 210, 36, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(meetName + ' ANNUAL SPORTS & ATHLETICS', 105, 16, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(190, 205, 230);
  doc.text(collegeName, 105, 24, { align: 'center' });
  doc.text('OFFICIAL REGISTRATION ACKNOWLEDGEMENT SLIP', 105, 30, { align: 'center' });

  // Registration Summary Box
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);

  let curY = 46;
  doc.setFont('helvetica', 'bold');
  doc.text(`Registration ID: ${reg.registrationId}`, 14, curY);
  doc.setFont('helvetica', 'normal');
  const regDate = reg.createdAt?.toDate ? reg.createdAt.toDate().toLocaleString() : 'N/A';
  doc.text(`Registered on: ${regDate}`, 120, curY);

  curY += 7;
  doc.text(`Event: ${reg.eventNameSnapshot}`, 14, curY);
  doc.text(`Event Type: ${reg.registrationType.toUpperCase()}`, 120, curY);

  curY += 7;
  doc.text(`Representing Class: ${reg.year} - ${reg.class}`, 14, curY);
  doc.text(`Department: ${reg.department}`, 120, curY);

  curY += 7;
  doc.text(`Coordinator: ${reg.coordinatorName} (${reg.coordinatorEmail || ''})`, 14, curY);
  doc.text(`Status: ${reg.status.toUpperCase()}`, 120, curY);

  if (reg.teamName) {
    curY += 7;
    doc.text(`Team Name: ${reg.teamName}`, 14, curY);
    doc.text(`Captain: ${reg.captainName || 'N/A'}`, 120, curY);
  }

  // Participants Table
  curY += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('REGISTERED PARTICIPANTS ROSTER', 14, curY);

  const participantRows = (reg.participantsSnapshot || []).map((p, i) => {
    let roleText = 'Player';
    if (reg.registrationType === 'team' && p.studentId === reg.captainId) {
      roleText = 'Captain';
    } else if (reg.registrationType === 'relay' && reg.relayOrder) {
      const runner = reg.relayOrder.find((r) => r.studentId === p.studentId);
      roleText = runner ? `Runner ${runner.order}` : 'Relay Member';
    }

    return [i + 1, p.registerNumber, p.name, p.year, p.class, roleText];
  });

  autoTable(doc, {
    startY: curY + 4,
    head: [['#', 'Register No', 'Student Name', 'Year', 'Class', 'Role / Position']],
    body: participantRows,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8.5,
    },
  });

  // Signature Block at Bottom
  const finalY = (doc as any).lastAutoTable.finalY + 30;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);

  doc.text('_______________________________', 20, finalY);
  doc.text('Year Coordinator Signature', 20, finalY + 5);

  doc.text('_______________________________', 130, finalY);
  doc.text('Sports Committee Verification', 130, finalY + 5);

  doc.save(`${reg.registrationId}_Receipt.pdf`);
};

/**
 * Filter registrations according to export criteria (all, specific event, or specific year)
 */
export const filterRegistrationsForExport = (
  registrations: Registration[],
  scopeType: 'all' | 'event' | 'year',
  filterValue?: string
): Registration[] => {
  let list = registrations.filter((r) => r.status === 'registered');
  if (scopeType === 'event' && filterValue && filterValue !== 'all') {
    list = list.filter((r) => r.eventNameSnapshot.toLowerCase() === filterValue.toLowerCase());
  } else if (scopeType === 'year' && filterValue && filterValue !== 'all') {
    list = list.filter((r) => r.year.toLowerCase() === filterValue.toLowerCase());
  }
  return list;
};

/**
 * Export detailed registered students roster to Excel (.xlsx)
 * Supports whole event-wise, year-wise (team-wise), or all registrations.
 */
export const exportDetailedStudentsToExcel = (
  registrations: Registration[],
  options: {
    scopeType: 'all' | 'event' | 'year';
    filterValue?: string;
    filename?: string;
  }
) => {
  const filtered = filterRegistrationsForExport(
    registrations,
    options.scopeType,
    options.filterValue
  );

  // Flatten every registered student into a detailed row
  const studentRows: any[] = [];
  let studentCounter = 1;

  filtered.forEach((reg) => {
    const regDate = reg.createdAt?.toDate
      ? reg.createdAt.toDate().toLocaleString()
      : 'N/A';

    const participants = reg.participantsSnapshot && reg.participantsSnapshot.length > 0
      ? reg.participantsSnapshot
      : reg.participantIds.map((id) => ({
          studentId: id,
          name: 'Athlete',
          registerNumber: id,
          year: reg.year,
          class: reg.class,
          department: reg.department,
        }));

    participants.forEach((p) => {
      let role = 'Player';
      if (reg.registrationType === 'team' && p.studentId === reg.captainId) {
        role = 'Team Captain';
      } else if (reg.registrationType === 'relay' && reg.relayOrder) {
        const relayLeg = reg.relayOrder.find((r) => r.studentId === p.studentId);
        role = relayLeg ? `Runner (Leg ${relayLeg.order})` : 'Relay Runner';
      } else if (reg.registrationType === 'individual') {
        role = 'Individual Athlete';
      }

      studentRows.push({
        'Sl No': studentCounter++,
        'Event Name': reg.eventNameSnapshot,
        'Event Type': reg.registrationType.toUpperCase(),
        'Academic Year': reg.year,
        'Class / Section': p.class || reg.class,
        'Department': p.department || reg.department,
        'Team Name': reg.teamName || (reg.registrationType === 'individual' ? 'Individual' : 'N/A'),
        'Role': role,
        'Student Name': p.name,
        'Register Number': p.registerNumber,
        'Coordinator': reg.coordinatorName,
        'Coordinator Email': reg.coordinatorEmail || 'N/A',
        'Registration ID': reg.registrationId,
        'Status': reg.status.toUpperCase(),
        'Registration Date': regDate,
      });
    });
  });

  // Summary sheet data
  const summaryRows = filtered.map((reg, idx) => ({
    'Sl No': idx + 1,
    'Event Name': reg.eventNameSnapshot,
    'Academic Year': reg.year,
    'Class': reg.class,
    'Department': reg.department,
    'Team Name': reg.teamName || 'N/A',
    'Captain': reg.captainName || 'N/A',
    'Athletes Count': reg.participantCount,
    'Coordinator': reg.coordinatorName,
    'Registration ID': reg.registrationId,
    'Status': reg.status.toUpperCase(),
  }));

  const wb = XLSX.utils.book_new();

  // 1. Athletes Roster Sheet
  const wsStudents = XLSX.utils.json_to_sheet(studentRows);
  wsStudents['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 24 },
    { wch: 16 },
    { wch: 20 },
    { wch: 24 },
    { wch: 16 },
    { wch: 12 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Registered Athletes');

  // 2. Teams & Events Summary Sheet
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 20 },
    { wch: 20 },
    { wch: 14 },
    { wch: 20 },
    { wch: 16 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Team & Event Summary');

  let defaultName = 'ATHLON26_Registered_Students_Report.xlsx';
  if (options.scopeType === 'event' && options.filterValue) {
    defaultName = `ATHLON26_Event_${options.filterValue.replace(/\s+/g, '_')}_Students.xlsx`;
  } else if (options.scopeType === 'year' && options.filterValue) {
    defaultName = `ATHLON26_Year_${options.filterValue.replace(/\s+/g, '_')}_Students.xlsx`;
  }

  XLSX.writeFile(wb, options.filename || defaultName);
};

/**
 * Export detailed registered students roster to PDF
 * Supports whole event-wise, year-wise (team-wise), or all registrations.
 */
export const exportDetailedStudentsToPDF = (
  registrations: Registration[],
  options: {
    scopeType: 'all' | 'event' | 'year';
    filterValue?: string;
    settings?: CollegeSettings;
    filename?: string;
  }
) => {
  const filtered = filterRegistrationsForExport(
    registrations,
    options.scopeType,
    options.filterValue
  );

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const collegeName = options.settings?.collegeName || 'College of Engineering & Technology';
  const meetName = options.settings?.sportsEventName || "ATHLON'26";

  let subtitleText = 'OFFICIAL REGISTERED ATHLETES ROSTER - ALL COMPETITIONS';
  if (options.scopeType === 'event' && options.filterValue) {
    subtitleText = `OFFICIAL ATHLETES ROSTER — EVENT: ${options.filterValue.toUpperCase()}`;
  } else if (options.scopeType === 'year' && options.filterValue) {
    subtitleText = `OFFICIAL ATHLETES ROSTER — ACADEMIC YEAR: ${options.filterValue.toUpperCase()}`;
  }

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 297, 26, 'F');

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(meetName + ' ANNUAL SPORTS & ATHLETICS MEET', 148, 10, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(190, 205, 230);
  doc.text(collegeName + ' | ' + subtitleText, 148, 17, { align: 'center' });

  // Flatten rows
  const tableRows: any[] = [];
  let counter = 1;

  filtered.forEach((reg) => {
    const participants = reg.participantsSnapshot && reg.participantsSnapshot.length > 0
      ? reg.participantsSnapshot
      : reg.participantIds.map((id) => ({
          studentId: id,
          name: 'Athlete',
          registerNumber: id,
          year: reg.year,
          class: reg.class,
          department: reg.department,
        }));

    participants.forEach((p) => {
      let role = 'Player';
      if (reg.registrationType === 'team' && p.studentId === reg.captainId) {
        role = 'Captain';
      } else if (reg.registrationType === 'relay' && reg.relayOrder) {
        const relayLeg = reg.relayOrder.find((r) => r.studentId === p.studentId);
        role = relayLeg ? `Leg ${relayLeg.order}` : 'Relay';
      } else if (reg.registrationType === 'individual') {
        role = 'Individual';
      }

      tableRows.push([
        counter++,
        p.name,
        p.registerNumber,
        reg.eventNameSnapshot,
        reg.year,
        p.class || reg.class,
        reg.teamName || (reg.registrationType === 'individual' ? '—' : 'N/A'),
        role,
        reg.coordinatorName,
        reg.registrationId,
      ]);
    });
  });

  // Render Table
  autoTable(doc, {
    startY: 30,
    head: [[
      '#',
      'Athlete Name',
      'Register No',
      'Event',
      'Year',
      'Class',
      'Team Name',
      'Role',
      'Coordinator',
      'Ref ID',
    ]],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: 255,
      fontSize: 8,
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 42 },
      2: { cellWidth: 26 },
      3: { cellWidth: 38 },
      4: { cellWidth: 20 },
      5: { cellWidth: 20 },
      6: { cellWidth: 35 },
      7: { cellWidth: 24 },
      8: { cellWidth: 35 },
      9: { cellWidth: 28 },
    },
  });

  let defaultName = 'ATHLON26_Registered_Students.pdf';
  if (options.scopeType === 'event' && options.filterValue) {
    defaultName = `ATHLON26_${options.filterValue.replace(/\s+/g, '_')}_Students.pdf`;
  } else if (options.scopeType === 'year' && options.filterValue) {
    defaultName = `ATHLON26_${options.filterValue.replace(/\s+/g, '_')}_Students.pdf`;
  }

  doc.save(options.filename || defaultName);
};
