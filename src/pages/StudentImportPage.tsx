import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  Download,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  FileCheck,
  RotateCcw,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { downloadSampleStudentExcel } from '../services/exportService';
import {
  batchImportStudents,
  findExistingRegisterNumbers,
} from '../services/studentService';
import { recordActivity } from '../services/activityLogService';
import { getCollegeSettings } from '../services/settingsService';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import type { AcademicStructure } from '../types';

interface ParsedStudentRow {
  rowNumber: number;
  registerNumber: string;
  name: string;
  isValid: boolean;
  errorReason?: string;
}

export const StudentImportPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [academicStructure, setAcademicStructure] = useState<AcademicStructure>({
    years: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
    classes: [],
    departments: [],
  });

  // Current Step: 1: Scope, 2: Upload, 3: Validation & Preview, 4: Complete
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Target Selections
  const [targetYear, setTargetYear] = useState('S1');
  const [targetClass, setTargetClass] = useState('CSE-A');
  const [targetDept, setTargetDept] = useState('Computer Science & Engineering');

  // File parsing states
  const [fileName, setFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Rows and Summary
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [validRows, setValidRows] = useState<ParsedStudentRow[]>([]);
  const [problematicRows, setProblematicRows] = useState<ParsedStudentRow[]>([]);
  const [activeTab, setActiveTab] = useState<'valid' | 'invalid'>('valid');

  useEffect(() => {
    getCollegeSettings().then((settings) => {
      if (settings.academicStructure) {
        setAcademicStructure(settings.academicStructure);
        if (settings.academicStructure.years.length > 0) {
          setTargetYear(settings.academicStructure.years[0]);
        }
        if (settings.academicStructure.classes.length > 0) {
          setTargetClass(settings.academicStructure.classes[0].name);
        }
        if (settings.academicStructure.departments.length > 0) {
          setTargetDept(settings.academicStructure.departments[0]);
        }
      }
    });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'xlsx' && extension !== 'xls' && extension !== 'csv') {
      showToast('Unsupported File', 'Please upload an Excel spreadsheet (.xlsx, .xls) or CSV.', 'error');
      return;
    }

    setFileName(file.name);
    setIsParsing(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawRows.length === 0) {
        showToast('Empty Sheet', 'The selected spreadsheet contains no data rows.', 'warning');
        setIsParsing(false);
        return;
      }

      // Check existing register numbers in database to detect duplicates
      const extractedRegisterNos = rawRows
        .map((r) => {
          const reg = r['Register Number'] || r['registerNumber'] || r['RegNo'] || r['reg_no'] || '';
          return String(reg).trim().toUpperCase();
        })
        .filter(Boolean);

      const existingSet = await findExistingRegisterNumbers(extractedRegisterNos);

      const parsed: ParsedStudentRow[] = [];
      const valid: ParsedStudentRow[] = [];
      const problem: ParsedStudentRow[] = [];
      const inBatchSeen = new Set<string>();

      rawRows.forEach((row, idx) => {
        const rowNum = idx + 2;
        const regNoRaw = row['Register Number'] || row['registerNumber'] || row['RegNo'] || row['reg_no'] || '';
        const nameRaw = row['Full Name'] || row['name'] || row['Student Name'] || row['student_name'] || '';

        const regNo = String(regNoRaw).trim().toUpperCase();
        const name = String(nameRaw).trim();

        let isValid = true;
        let errorReason = '';

        if (!regNo) {
          isValid = false;
          errorReason = 'Missing register number';
        } else if (!name) {
          isValid = false;
          errorReason = 'Missing student name';
        } else if (inBatchSeen.has(regNo)) {
          isValid = false;
          errorReason = 'Duplicate register number in this file';
        } else if (existingSet.has(regNo)) {
          isValid = false;
          errorReason = 'Already exists in college database';
        }

        if (regNo) {
          inBatchSeen.add(regNo);
        }

        const rowItem: ParsedStudentRow = {
          rowNumber: rowNum,
          registerNumber: regNo,
          name,
          isValid,
          errorReason,
        };

        parsed.push(rowItem);
        if (isValid) {
          valid.push(rowItem);
        } else {
          problem.push(rowItem);
        }
      });

      setParsedRows(parsed);
      setValidRows(valid);
      setProblematicRows(problem);
      setCurrentStep(3); // Progress to Validation & Preview step
      setActiveTab(valid.length > 0 ? 'valid' : 'invalid');

      showToast('File Analyzed', `Found ${valid.length} valid and ${problem.length} problematic rows.`, 'info');
    } catch (err: any) {
      showToast('Parsing Failed', err.message || 'Error processing spreadsheet file.', 'error');
    } finally {
      setIsParsing(false);
    }
  };

  const handleExecuteImport = async () => {
    if (validRows.length === 0) {
      showToast('No Valid Rows', 'There are no valid student rows to import.', 'warning');
      return;
    }

    setIsImporting(true);
    try {
      const recordsToImport = validRows.map((r) => ({
        registerNumber: r.registerNumber,
        name: r.name,
      }));

      const importedCount = await batchImportStudents(
        recordsToImport,
        targetYear,
        targetClass,
        targetDept,
        user?.uid || ''
      );

      if (user) {
        await recordActivity(
          'import_students',
          user.uid,
          user.name,
          user.role,
          'student',
          `${targetYear}-${targetClass}`,
          { details: `Batch imported ${importedCount} student records for ${targetYear} ${targetClass}` }
        );
      }

      showToast('Batch Import Successful', `Imported ${importedCount} students into ${targetYear} ${targetClass}.`, 'success');
      setCurrentStep(4);
    } catch (err: any) {
      showToast('Import Error', err.message || 'Batch commit failed.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setFileName(null);
    setParsedRows([]);
    setValidRows([]);
    setProblematicRows([]);
    setCurrentStep(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '1100px' }}>
      {/* Back Link */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link
          to="/students"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <ArrowLeft size={13} /> Back to Student Database
        </Link>
      </div>

      {/* Page Header */}
      <PageHeader
        title="Import Students"
        subtitle="Upload class spreadsheets to bulk provision students with automatic deduplication"
        actions={
          <button onClick={() => downloadSampleStudentExcel()} className="btn btn-secondary btn-sm">
            <Download size={14} /> Download Sample Template (.xlsx)
          </button>
        }
      />

      {/* Stepper Progress Bar */}
      <div className="stepper-nav">
        <div className={`step-node ${currentStep >= 1 ? (currentStep > 1 ? 'completed' : 'active') : ''}`}>
          <div className="step-circle">{currentStep > 1 ? <Check size={12} /> : '1'}</div>
          <span>1. Target Scope</span>
        </div>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)', margin: '0 8px' }} />

        <div className={`step-node ${currentStep >= 2 ? (currentStep > 2 ? 'completed' : 'active') : ''}`}>
          <div className="step-circle">{currentStep > 2 ? <Check size={12} /> : '2'}</div>
          <span>2. Upload File</span>
        </div>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)', margin: '0 8px' }} />

        <div className={`step-node ${currentStep >= 3 ? (currentStep > 3 ? 'completed' : 'active') : ''}`}>
          <div className="step-circle">{currentStep > 3 ? <Check size={12} /> : '3'}</div>
          <span>3. Validate &amp; Preview</span>
        </div>
        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)', margin: '0 8px' }} />

        <div className={`step-node ${currentStep === 4 ? 'completed' : ''}`}>
          <div className="step-circle">4</div>
          <span>4. Complete</span>
        </div>
      </div>

      {/* Step 1 & 2: Scope Configuration & File Upload */}
      {currentStep < 3 && (
        <div className="grid-2col">
          {/* Step 1 Card: Target Scope */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                <span className="step-circle" style={{ width: 22, height: 22, fontSize: 11, background: 'var(--color-primary)', color: '#fff' }}>1</span>
                Class Cohort Scope
              </h2>
            </div>

            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              All students imported in this batch will be assigned to this cohort.
            </p>

            <div className="form-group">
              <label className="form-label">Cohort Year *</label>
              <select
                className="form-input"
                value={targetYear}
                onChange={(e) => setTargetYear(e.target.value)}
              >
                {academicStructure.years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Class Section *</label>
              <select
                className="form-input"
                value={targetClass}
                onChange={(e) => setTargetClass(e.target.value)}
              >
                {academicStructure.classes.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Department *</label>
              <select
                className="form-input"
                value={targetDept}
                onChange={(e) => setTargetDept(e.target.value)}
              >
                {academicStructure.departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 2 Card: Upload Area */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-header">
              <h2 className="card-title">
                <span className="step-circle" style={{ width: 22, height: 22, fontSize: 11, background: 'var(--color-primary)', color: '#fff' }}>2</span>
                Upload Spreadsheet
              </h2>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1,
                border: '2px dashed var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-6) var(--space-4)',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--bg-surface-elevated)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'border-color 0.15s ease',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-primary-light)',
                  color: '#93c5fd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                }}
              >
                {isParsing ? <div className="spinner" style={{ width: 20, height: 20 }} /> : <UploadCloud size={24} />}
              </div>

              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
                {isParsing ? 'Analyzing spreadsheet rows...' : 'Click to select Excel or CSV file'}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Supports .xlsx, .xls, .csv with &quot;Register Number&quot; and &quot;Full Name&quot; columns
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Validation Results & Preview Table */}
      {currentStep === 3 && (
        <div>
          {/* Summary Metric Cards */}
          <div className="grid-kpi">
            <StatCard
              label="Total Rows Found"
              value={parsedRows.length}
              icon={<FileCheck size={16} />}
              subtitle={`From file: ${fileName}`}
            />
            <StatCard
              label="Valid to Import"
              value={validRows.length}
              icon={<CheckCircle2 size={16} />}
              subtitle="Passed validation & deduplication"
            />
            <StatCard
              label="Duplicates / Invalid"
              value={problematicRows.length}
              icon={<AlertCircle size={16} />}
              subtitle="Will be skipped during import"
            />
          </div>

          {/* Preview Panel with Tabs */}
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="card-header">
              <div>
                <h2 className="card-title">Batch Import Preview</h2>
                <p className="card-subtitle">
                  Destination: <strong>{targetYear} {targetClass}</strong> &bull; {targetDept}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setActiveTab('valid')}
                  className={`btn btn-sm ${activeTab === 'valid' ? 'btn-primary' : 'btn-ghost'}`}
                >
                  Valid Rows ({validRows.length})
                </button>
                <button
                  onClick={() => setActiveTab('invalid')}
                  className={`btn btn-sm ${activeTab === 'invalid' ? 'btn-danger-outline' : 'btn-ghost'}`}
                >
                  Flagged Issues ({problematicRows.length})
                </button>
              </div>
            </div>

            {activeTab === 'valid' ? (
              validRows.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4)' }}>
                  No valid rows available to import.
                </p>
              ) : (
                <div className="table-responsive" style={{ maxHeight: '380px' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Row #</th>
                        <th>Register Number</th>
                        <th>Full Name</th>
                        <th>Target Cohort</th>
                        <th>Target Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 50).map((r) => (
                        <tr key={r.rowNumber}>
                          <td><span className="table-cell-muted">Row {r.rowNumber}</span></td>
                          <td><strong style={{ fontFamily: 'monospace', color: 'var(--text-primary)', fontSize: 'var(--text-xs)' }}>{r.registerNumber}</strong></td>
                          <td>{r.name}</td>
                          <td><span className="badge badge-year">{targetYear}</span></td>
                          <td>{targetClass}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validRows.length > 50 && (
                    <div style={{ padding: '8px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textAlign: 'center', background: 'var(--bg-surface-elevated)' }}>
                      Showing first 50 rows. All {validRows.length} records will be imported.
                    </div>
                  )}
                </div>
              )
            ) : (
              problematicRows.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4)' }}>
                  Zero problematic rows detected!
                </p>
              ) : (
                <div className="table-responsive" style={{ maxHeight: '380px' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Row #</th>
                        <th>Register Number</th>
                        <th>Full Name</th>
                        <th>Reason for Flagging</th>
                      </tr>
                    </thead>
                    <tbody>
                      {problematicRows.map((r) => (
                        <tr key={r.rowNumber}>
                          <td><span className="table-cell-muted">Row {r.rowNumber}</span></td>
                          <td><span style={{ fontFamily: 'monospace', color: '#f87171', fontSize: 'var(--text-xs)' }}>{r.registerNumber || '(Blank)'}</span></td>
                          <td>{r.name || '(Blank)'}</td>
                          <td>
                            <span className="badge" style={{ background: 'var(--color-danger-light)', color: '#fca5a5', border: '1px solid var(--color-danger-border)' }}>
                              {r.errorReason}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={handleReset} className="btn btn-secondary btn-sm">
                <RotateCcw size={13} /> Choose Another File
              </button>

              <button
                onClick={handleExecuteImport}
                disabled={validRows.length === 0 || isImporting}
                className="btn btn-primary btn-md"
              >
                {isImporting ? (
                  <>
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                    <span>Importing {validRows.length} Students...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Import {validRows.length} Valid Students
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Completion Screen */}
      {currentStep === 4 && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)', maxWidth: '640px', margin: '0 auto' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'var(--color-success-light)',
              color: 'var(--color-success)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 'var(--space-4)',
              border: '1px solid var(--color-success-border)',
            }}
          >
            <CheckCircle2 size={30} />
          </div>

          <h2 style={{ fontSize: 'var(--text-2xl)', marginBottom: '8px', color: 'var(--text-primary)' }}>
            Batch Import Complete!
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
            Successfully added <strong>{validRows.length}</strong> students to cohort <strong>{targetYear} {targetClass}</strong> ({targetDept}).
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <Link to="/students" className="btn btn-primary btn-sm">
              View Student Database
            </Link>
            <button onClick={handleReset} className="btn btn-secondary btn-sm">
              Import Another Class
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
