import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  HelpCircle,
  Lightbulb,
  Loader2,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Sheet,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  ASSESSMENT_COGNITIVE_LEVELS,
  ASSESSMENT_DIFFICULTIES,
  ASSESSMENT_DOMAINS,
  ASSESSMENT_GRADES,
} from '../data/seedAssessments';
import {
  DEFAULT_ASSESSMENT_TAB_NAME,
  exportAssessmentsAsCsv,
} from '../services/assessmentDb';
import {DriveUploadResult} from '../services/driveUpload';
import {
  AssessmentCognitiveLevel,
  AssessmentDifficulty,
  AssessmentQuestion,
  AssessmentQuestionType,
  SpreadsheetTabInfo,
} from '../types/journal';
import {normalizeDriveImageUrl} from '../utils/postFormatting';

interface AssessmentBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: AssessmentQuestion[];
  activeTabName: string;
  availableTabs: SpreadsheetTabInfo[];
  hasRemoteAssessmentTab: boolean;
  spreadsheetId: string;
  spreadsheetTitle?: string;
  isSyncing: boolean;
  syncError: string | null;
  isTeacherAdmin: boolean;
  hasAccessToken: boolean;
  defaultAuthorName?: string;
  onRefreshSync: () => void;
  onSelectAssessmentTab: (tabName: string) => Promise<void>;
  onRequestSheetsAuth: () => Promise<unknown>;
  onSyncSeedToSheet: (tabName: string) => void;
  onSaveQuestion: (
    question: AssessmentQuestion,
    isNew: boolean,
    tabName: string,
    onSaved?: () => void,
  ) => Promise<void>;
  onDeleteQuestion: (question: AssessmentQuestion, tabName: string) => void;
  onUploadDiagramFile?: (
    file: File,
    folderName?: string,
  ) => Promise<DriveUploadResult>;
  onOpenShareQr: (url: string, title: string) => void;
  initialGradeFilter?: string | null;
  initialQuestionId?: string | null;
  onConsumeInitialGrade?: () => void;
  disableEscapeClose?: boolean;
}

type ModalMode = 'practice' | 'manage';
type GradeFilter = '全部年級' | string;
type CognitiveFilter = '全部層次' | AssessmentCognitiveLevel;
type TypeFilter = '全部題型' | AssessmentQuestionType;

interface AttemptRecord {
  selectedOption?: string; // 'A' | 'B' | 'C' | 'D' or text
  constructedDraft?: string;
  selfRating?: 'mastered' | 'partial' | 'retry';
  isSubmitted: boolean;
  isCorrect: boolean | null;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

const createEmptyQuestion = (
  defaultAuthor = 'PesMath 數學領域社群',
): AssessmentQuestion => ({
  id: '',
  academicYear: '113 學年度',
  grade: '四年級',
  domainTopic: '數與量',
  unitTitle: '',
  cognitiveLevel: '概念理解',
  questionType: 'single-choice',
  stem: '',
  options: ['', '', '', ''],
  correctAnswer: 'A',
  explanation: '',
  hint: '',
  imageUrl: '',
  difficulty: '中等',
  author: defaultAuthor,
  isPublished: true,
});

function resolveSingleChoiceCorrectIndex(q: AssessmentQuestion): number {
  const ans = q.correctAnswer.trim();
  const upper = ans.toUpperCase();
  const letterIdx = OPTION_LETTERS.indexOf(
    upper as (typeof OPTION_LETTERS)[number],
  );
  if (letterIdx !== -1 && letterIdx < q.options.length) {
    return letterIdx;
  }
  const exactIdx = q.options.findIndex((o) => o.trim() === ans);
  return exactIdx !== -1 ? exactIdx : 0;
}

export const AssessmentBankModal: React.FC<AssessmentBankModalProps> = ({
  isOpen,
  onClose,
  questions,
  activeTabName,
  availableTabs,
  hasRemoteAssessmentTab,
  spreadsheetId,
  spreadsheetTitle,
  isSyncing,
  syncError,
  isTeacherAdmin,
  hasAccessToken,
  defaultAuthorName,
  onRefreshSync,
  onSelectAssessmentTab,
  onRequestSheetsAuth,
  onSyncSeedToSheet,
  onSaveQuestion,
  onDeleteQuestion,
  onUploadDiagramFile,
  onOpenShareQr,
  initialGradeFilter = null,
  initialQuestionId = null,
  onConsumeInitialGrade,
  disableEscapeClose = false,
}) => {
  const [mode, setMode] = useState<ModalMode>('practice');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('全部年級');
  const [cognitiveFilter, setCognitiveFilter] =
    useState<CognitiveFilter>('全部層次');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('全部題型');
  const [searchQuery, setSearchQuery] = useState('');
  const [wrongOnlyMode, setWrongOnlyMode] = useState(false);

  // Student Practice State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [attempts, setAttempts] = useState<Record<string, AttemptRecord>>({});
  const [showHintMap, setShowHintMap] = useState<Record<string, boolean>>({});
  const [showSummaryReport, setShowSummaryReport] = useState(false);
  const [diagramErrorIds, setDiagramErrorIds] = useState<
    Record<string, boolean>
  >({});

  // Teacher Sheet Tab Selector & Editor State
  const [customTabInput, setCustomTabInput] = useState(
    activeTabName || DEFAULT_ASSESSMENT_TAB_NAME,
  );
  const [isSwitchingTab, setIsSwitchingTab] = useState(false);
  const [manageGradeFilter, setManageGradeFilter] =
    useState<GradeFilter>('全部年級');
  const [manageSearchQuery, setManageSearchQuery] = useState('');
  const [editorState, setEditorState] = useState<{
    isOpen: boolean;
    isNew: boolean;
    draft: AssessmentQuestion;
  }>({
    isOpen: false,
    isNew: true,
    draft: createEmptyQuestion(defaultAuthorName),
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isUploadingDiagram, setIsUploadingDiagram] = useState(false);
  const diagramInputRef = React.useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCustomTabInput(activeTabName || DEFAULT_ASSESSMENT_TAB_NAME);
  }, [activeTabName]);

  useEffect(() => {
    if (!isTeacherAdmin && mode === 'manage') {
      setMode('practice');
      setEditorState((prev) =>
        prev.isOpen ? {...prev, isOpen: false} : prev,
      );
    }
  }, [isTeacherAdmin, mode]);

  useEffect(() => {
    if (!isOpen || (!initialGradeFilter && !initialQuestionId)) return;
    setMode('practice');
    const targetGrade = initialGradeFilter || '全部年級';
    setGradeFilter(targetGrade);
    setCognitiveFilter('全部層次');
    setTypeFilter('全部題型');
    setWrongOnlyMode(false);
    setShowSummaryReport(false);
    if (initialQuestionId) {
      const pool = questions.filter(
        (item) =>
          item.isPublished &&
          (targetGrade === '全部年級' || item.grade === targetGrade),
      );
      const foundIdx = pool.findIndex((item) => item.id === initialQuestionId);
      setCurrentIdx(foundIdx >= 0 ? foundIdx : 0);
    } else {
      setCurrentIdx(0);
    }
    onConsumeInitialGrade?.();
  }, [
    isOpen,
    initialGradeFilter,
    initialQuestionId,
    questions,
    onConsumeInitialGrade,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (disableEscapeClose) return;
        if (editorState.isOpen) {
          setEditorState((prev) => ({...prev, isOpen: false}));
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, disableEscapeClose, editorState.isOpen, onClose]);

  const publishedQuestions = useMemo(
    () => questions.filter((q) => q.isPublished),
    [questions],
  );

  const availableGradesInBank = useMemo(() => {
    const order = [...ASSESSMENT_GRADES] as string[];
    const set = new Set<string>(publishedQuestions.map((q) => q.grade));
    return Array.from(set).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b, 'zh-Hant');
    });
  }, [publishedQuestions]);

  const wrongQuestionIds = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(attempts).forEach(([qId, rec]) => {
      if (rec.isSubmitted && rec.isCorrect === false) {
        ids.add(qId);
      }
    });
    return ids;
  }, [attempts]);

  const practiceQuestions = useMemo(() => {
    const qLower = searchQuery.trim().toLowerCase();
    return publishedQuestions.filter((item) => {
      if (wrongOnlyMode && !wrongQuestionIds.has(item.id)) return false;
      if (gradeFilter !== '全部年級' && item.grade !== gradeFilter) return false;
      if (
        cognitiveFilter !== '全部層次' &&
        item.cognitiveLevel !== cognitiveFilter
      ) {
        return false;
      }
      if (typeFilter !== '全部題型' && item.questionType !== typeFilter) {
        return false;
      }
      if (qLower) {
        const hay = [
          item.grade,
          item.academicYear,
          item.domainTopic,
          item.unitTitle,
          item.cognitiveLevel,
          item.stem,
          item.author,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
  }, [
    publishedQuestions,
    wrongOnlyMode,
    wrongQuestionIds,
    gradeFilter,
    cognitiveFilter,
    typeFilter,
    searchQuery,
  ]);

  useEffect(() => {
    if (currentIdx >= practiceQuestions.length && practiceQuestions.length > 0) {
      setCurrentIdx(0);
    }
  }, [currentIdx, practiceQuestions.length]);

  const activeQuestion = practiceQuestions[currentIdx] ?? null;
  const activeAttempt = activeQuestion
    ? attempts[activeQuestion.id]
    : undefined;

  // Overall Practice Stats for the current filtered set
  const practiceStats = useMemo(() => {
    let answered = 0;
    let correct = 0;
    let streak = 0;
    let bestStreak = 0;
    const byCognitive: Record<
      AssessmentCognitiveLevel,
      {total: number; answered: number; correct: number}
    > = {
      概念理解: {total: 0, answered: 0, correct: 0},
      程序執行: {total: 0, answered: 0, correct: 0},
      情境應用: {total: 0, answered: 0, correct: 0},
    };

    for (const q of practiceQuestions) {
      const bucket = byCognitive[q.cognitiveLevel];
      if (bucket) bucket.total += 1;
      const rec = attempts[q.id];
      if (rec?.isSubmitted) {
        answered += 1;
        if (bucket) bucket.answered += 1;
        if (rec.isCorrect) {
          correct += 1;
          if (bucket) bucket.correct += 1;
          streak += 1;
          if (streak > bestStreak) bestStreak = streak;
        } else {
          streak = 0;
        }
      }
    }

    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    return {
      total: practiceQuestions.length,
      answered,
      correct,
      wrong: answered - correct,
      accuracy,
      streak,
      bestStreak,
      byCognitive,
    };
  }, [practiceQuestions, attempts]);

  const handleSelectSingleChoiceOption = useCallback(
    (q: AssessmentQuestion, letter: string) => {
      setAttempts((prev) => {
        const existing = prev[q.id];
        if (existing?.isSubmitted) return prev;
        return {
          ...prev,
          [q.id]: {
            ...existing,
            selectedOption: letter,
            isSubmitted: false,
            isCorrect: null,
          },
        };
      });
    },
    [],
  );

  const handleSubmitSingleChoice = useCallback((q: AssessmentQuestion) => {
    setAttempts((prev) => {
      const existing = prev[q.id];
      if (!existing?.selectedOption || existing.isSubmitted) return prev;
      const correctIdx = resolveSingleChoiceCorrectIndex(q);
      const correctLetter = OPTION_LETTERS[correctIdx] || 'A';
      const isCorrect = existing.selectedOption === correctLetter;
      return {
        ...prev,
        [q.id]: {
          ...existing,
          isSubmitted: true,
          isCorrect,
        },
      };
    });
  }, []);

  const handleSubmitConstructed = useCallback((q: AssessmentQuestion) => {
    setAttempts((prev) => {
      const existing = prev[q.id];
      return {
        ...prev,
        [q.id]: {
          ...existing,
          constructedDraft: existing?.constructedDraft || '',
          isSubmitted: true,
          isCorrect:
            existing?.selfRating === 'mastered'
              ? true
              : existing?.selfRating === 'retry'
                ? false
                : existing?.isCorrect ?? null,
        },
      };
    });
  }, []);

  const handleRateConstructed = useCallback(
    (q: AssessmentQuestion, rating: 'mastered' | 'partial' | 'retry') => {
      setAttempts((prev) => {
        const existing = prev[q.id];
        return {
          ...prev,
          [q.id]: {
            ...existing,
            isSubmitted: true,
            selfRating: rating,
            isCorrect: rating === 'mastered',
          },
        };
      });
    },
    [],
  );

  // Keyboard shortcuts for student practice
  useEffect(() => {
    if (!isOpen || mode !== 'practice' || editorState.isOpen || showSummaryReport) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (!activeQuestion) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIdx((idx) =>
          Math.min(practiceQuestions.length - 1, idx + 1),
        );
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIdx((idx) => Math.max(0, idx - 1));
      } else if (activeQuestion.questionType === 'single-choice') {
        const upper = e.key.toUpperCase();
        const numMap: Record<string, string> = {
          '1': 'A',
          '2': 'B',
          '3': 'C',
          '4': 'D',
        };
        const mappedLetter = numMap[e.key] || upper;
        const letterIdx = OPTION_LETTERS.indexOf(
          mappedLetter as (typeof OPTION_LETTERS)[number],
        );
        if (letterIdx !== -1 && letterIdx < activeQuestion.options.length) {
          handleSelectSingleChoiceOption(activeQuestion, mappedLetter);
        } else if (e.key === 'Enter' && activeAttempt?.selectedOption) {
          e.preventDefault();
          if (!activeAttempt.isSubmitted) {
            handleSubmitSingleChoice(activeQuestion);
          } else if (currentIdx < practiceQuestions.length - 1) {
            setCurrentIdx((idx) => idx + 1);
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isOpen,
    mode,
    editorState.isOpen,
    showSummaryReport,
    activeQuestion,
    activeAttempt,
    currentIdx,
    practiceQuestions.length,
    handleSelectSingleChoiceOption,
    handleSubmitSingleChoice,
  ]);

  const managedQuestions = useMemo(() => {
    const qLower = manageSearchQuery.trim().toLowerCase();
    return questions.filter((item) => {
      if (manageGradeFilter !== '全部年級' && item.grade !== manageGradeFilter) {
        return false;
      }
      if (qLower) {
        const hay = [
          item.id,
          item.grade,
          item.academicYear,
          item.domainTopic,
          item.unitTitle,
          item.stem,
          item.author,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
  }, [questions, manageGradeFilter, manageSearchQuery]);

  if (!isOpen) return null;

  const assessmentShareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}${
          spreadsheetId
            ? `?sheet=${encodeURIComponent(spreadsheetId)}&tab=assessment`
            : '?tab=assessment'
        }`
      : '';

  const handleOpenCreateModal = () => {
    setFormError(null);
    setEditorState({
      isOpen: true,
      isNew: true,
      draft: createEmptyQuestion(defaultAuthorName || 'PesMath 數學領域社群'),
    });
  };

  const handleOpenEditModal = (q: AssessmentQuestion) => {
    setFormError(null);
    const paddedOptions = [
      q.options[0] ?? '',
      q.options[1] ?? '',
      q.options[2] ?? '',
      q.options[3] ?? '',
    ];
    setEditorState({
      isOpen: true,
      isNew: false,
      draft: {
        ...q,
        options: paddedOptions,
        hint: q.hint || '',
        imageUrl: q.imageUrl || '',
      },
    });
  };

  const handleOpenDuplicateModal = (q: AssessmentQuestion) => {
    setFormError(null);
    const paddedOptions = [
      q.options[0] ?? '',
      q.options[1] ?? '',
      q.options[2] ?? '',
      q.options[3] ?? '',
    ];
    setEditorState({
      isOpen: true,
      isNew: true,
      draft: {
        ...q,
        id: '',
        rowIndex: undefined,
        unitTitle: `${q.unitTitle}（複本）`,
        options: paddedOptions,
        hint: q.hint || '',
        imageUrl: q.imageUrl || '',
      },
    });
  };

  const handleUploadDiagram = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadDiagramFile) return;
    setFormError(null);
    setIsUploadingDiagram(true);
    try {
      const uploaded = await onUploadDiagramFile(
        file,
        `學力檢測題庫_${editorState.draft.grade}`,
      );
      setEditorState((prev) => ({
        ...prev,
        draft: {
          ...prev.draft,
          imageUrl: normalizeDriveImageUrl(uploaded.webViewLink),
        },
      }));
    } catch (err: any) {
      setFormError(err?.message || '上傳試題附圖失敗。');
    } finally {
      setIsUploadingDiagram(false);
    }
  };

  const handleSubmitQuestionForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const d = editorState.draft;
    const cleanStem = d.stem.trim();
    if (!cleanStem) {
      setFormError('請填寫題幹內容。');
      return;
    }
    const cleanUnit = d.unitTitle.trim();
    if (!cleanUnit) {
      setFormError('請填寫單元名稱（例如：分數除法、四捨五入）。');
      return;
    }

    let cleanedOptions: string[] = [];
    let cleanAnswer = d.correctAnswer.trim();

    if (d.questionType === 'single-choice') {
      cleanedOptions = d.options.map((o) => o.trim()).filter(Boolean);
      if (cleanedOptions.length < 2) {
        setFormError('單選題請至少填寫 2 個選項（建議填滿 A～D 4 個選項）。');
        return;
      }
      const chosenIdx = OPTION_LETTERS.indexOf(
        cleanAnswer.toUpperCase() as (typeof OPTION_LETTERS)[number],
      );
      if (chosenIdx === -1 || chosenIdx >= cleanedOptions.length) {
        cleanAnswer = 'A';
      } else {
        cleanAnswer = cleanAnswer.toUpperCase();
      }
    } else if (!cleanAnswer) {
      setFormError('建構反應題請填寫「參考解答與評分重點」，以提供學生即時自我檢核。');
      return;
    }

    const cleanExplanation = d.explanation.trim();
    if (!cleanExplanation) {
      setFormError('請填寫「詳解與迷思概念診斷」，學生作答後即可獲得即時教學回饋。');
      return;
    }

    const targetTab = customTabInput.trim() || activeTabName || DEFAULT_ASSESSMENT_TAB_NAME;
    const payload: AssessmentQuestion = {
      ...d,
      id: d.id.trim() || `aq-${Date.now().toString(36)}`,
      unitTitle: cleanUnit,
      stem: cleanStem,
      options: cleanedOptions,
      correctAnswer: cleanAnswer,
      explanation: cleanExplanation,
      hint: d.hint?.trim() || '',
      imageUrl: d.imageUrl?.trim() ? normalizeDriveImageUrl(d.imageUrl.trim()) : '',
      author: d.author.trim() || defaultAuthorName || 'PesMath 數學領域社群',
    };

    setIsSavingDraft(true);
    try {
      await onSaveQuestion(payload, editorState.isNew, targetTab, () => {
        setEditorState((prev) => ({...prev, isOpen: false}));
      });
    } catch (err: any) {
      setFormError(err?.message || '儲存試題失敗，請再試一次。');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSwitchOrLoadTab = async () => {
    const clean = customTabInput.trim() || DEFAULT_ASSESSMENT_TAB_NAME;
    setIsSwitchingTab(true);
    try {
      await onSelectAssessmentTab(clean);
    } finally {
      setIsSwitchingTab(false);
    }
  };

  const handleExportCsv = () => {
    const csv = exportAssessmentsAsCsv(questions);
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pesmath-assessment-${activeTabName || DEFAULT_ASSESSMENT_TAB_NAME}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleResetPractice = () => {
    setAttempts({});
    setShowHintMap({});
    setWrongOnlyMode(false);
    setShowSummaryReport(false);
    setCurrentIdx(0);
  };

  return (
    <div
      className="fixed inset-0 z-[45] bg-[#FBF9F5] flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="學力檢測互動題庫"
    >
      {/* Top Bar: Clean 3-Zone Header */}
      <header className="bg-white border-b border-stone-200 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">返回期刊首頁</span>
              <span className="sm:hidden">返回</span>
            </button>
            <h1 className="font-editorial text-base sm:text-xl font-bold text-stone-950 truncate">
              學力檢測互動題庫
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Segmented Mode Switch (Teacher Manage Tab visible only when signed in as teacher) */}
            {isTeacherAdmin && (
              <div
                className="inline-flex p-0.5 rounded-lg bg-[#F7F4EE] border border-stone-200"
                role="tablist"
                aria-label="題庫模式切換"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'practice'}
                  onClick={() => setMode('practice')}
                  className={`px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'practice'
                      ? 'bg-white text-[#1E3A8A] shadow-2xs'
                      : 'text-stone-600 hover:text-stone-950'
                  }`}
                >
                  學生練習
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'manage'}
                  onClick={() => setMode('manage')}
                  className={`px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'manage'
                      ? 'bg-white text-[#1E3A8A] shadow-2xs'
                      : 'text-stone-600 hover:text-stone-950'
                  }`}
                >
                  教師題庫管理
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                onOpenShareQr(assessmentShareUrl, '學力檢測互動題庫')
              }
              title="顯示題庫練習 QR Code"
              aria-label="顯示題庫練習 QR Code"
              className="min-h-[36px] min-w-[36px] p-2 text-stone-700 bg-white border border-stone-200 rounded-lg hover:border-[#1E3A8A]/40 hover:text-[#1E3A8A] inline-flex items-center justify-center transition-colors shrink-0"
            >
              <QrCode className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onRefreshSync}
              disabled={isSyncing}
              title="從 Google Sheet 同步最新題庫"
              aria-label="重新同步題庫"
              className="min-h-[36px] min-w-[36px] p-2 text-stone-700 bg-white border border-stone-200 rounded-lg hover:border-[#1E3A8A]/40 hover:text-[#1E3A8A] inline-flex items-center justify-center transition-colors disabled:opacity-50 shrink-0"
            >
              <RefreshCw
                className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
              />
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="關閉學力檢測題庫"
              className="min-h-[36px] min-w-[36px] p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg inline-flex items-center justify-center transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Scrollable Workspace */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-6">
          {syncError && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-900 flex flex-wrap items-center justify-between gap-2"
            >
              <span>{syncError}</span>
              <button
                type="button"
                onClick={onRefreshSync}
                className="font-semibold text-red-800 underline underline-offset-2 whitespace-nowrap"
              >
                重試同步
              </button>
            </div>
          )}

          {!isTeacherAdmin || mode === 'practice' ? (
            <>
              {/* Practice Filter Bar + Live KPI Score Strip */}
              <section className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentIdx(0);
                        setShowSummaryReport(false);
                      }}
                      placeholder="搜尋數學單元、題目關鍵字或學年度（例如：分數、四捨五入、折扣）..."
                      className="w-full h-10 pl-9 pr-3 text-sm text-stone-900 bg-[#FBF9F5] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:bg-white"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {wrongQuestionIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setWrongOnlyMode((prev) => !prev);
                          setCurrentIdx(0);
                          setShowSummaryReport(false);
                        }}
                        className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                          wrongOnlyMode
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100'
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>
                          {wrongOnlyMode
                            ? '返回全部題目'
                            : `只練錯題 (${wrongQuestionIds.size})`}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowSummaryReport((prev) => !prev)}
                      disabled={practiceStats.answered === 0}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 transition-colors disabled:opacity-45 whitespace-nowrap shrink-0"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      <span>
                        {showSummaryReport ? '回到題目練習' : '檢視診斷報告'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetPractice}
                      disabled={Object.keys(attempts).length === 0}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 transition-colors disabled:opacity-45 whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>重設練習</span>
                    </button>
                  </div>
                </div>

                {/* Filter Controls Row */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-3 border-t border-stone-100">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-stone-500 mr-1">年級：</span>
                    {['全部年級', ...availableGradesInBank].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          setGradeFilter(g);
                          setCurrentIdx(0);
                          setShowSummaryReport(false);
                        }}
                        className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                          gradeFilter === g
                            ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                            : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {(['全部層次', ...ASSESSMENT_COGNITIVE_LEVELS] as CognitiveFilter[]).map(
                        (lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => {
                              setCognitiveFilter(lvl);
                              setCurrentIdx(0);
                              setShowSummaryReport(false);
                            }}
                            className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                              cognitiveFilter === lvl
                                ? 'bg-stone-900 text-white border-stone-900'
                                : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                            }`}
                          >
                            {lvl}
                          </button>
                        ),
                      )}
                    </div>

                    <select
                      aria-label="篩選題型"
                      value={typeFilter}
                      onChange={(e) => {
                        setTypeFilter(e.target.value as TypeFilter);
                        setCurrentIdx(0);
                        setShowSummaryReport(false);
                      }}
                      className="h-8 px-2.5 text-xs font-medium text-stone-800 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                    >
                      <option value="全部題型">全部題型</option>
                      <option value="single-choice">單選題</option>
                      <option value="constructed-response">建構反應題</option>
                    </select>
                  </div>
                </div>

                {/* Live Tabular Practice Strip */}
                <div className="pt-3 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-stone-500">篩選題庫總數</div>
                    <div className="font-mono-tabular text-lg font-semibold text-stone-950 mt-0.5">
                      {practiceStats.answered} / {practiceStats.total} 題已作答
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500">答對題數</div>
                    <div className="font-mono-tabular text-lg font-semibold text-emerald-700 mt-0.5">
                      {practiceStats.correct} 題
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500">即時正確率</div>
                    <div className="font-mono-tabular text-lg font-semibold text-[#1E3A8A] mt-0.5">
                      {practiceStats.answered > 0
                        ? `${practiceStats.accuracy}%`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-stone-500">
                      題庫來源分頁
                    </div>
                    <div className="text-xs sm:text-sm font-medium text-stone-800 mt-1 truncate">
                      {hasRemoteAssessmentTab
                        ? `Google Sheet · ${activeTabName}`
                        : '內建示範題庫（可由教師同步分頁）'}
                    </div>
                  </div>
                </div>
              </section>

              {/* Two-Zone Interactive Practice Workspace */}
              {practiceQuestions.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center space-y-3">
                  <BookOpen className="w-8 h-8 text-stone-400 mx-auto" />
                  <h2 className="font-editorial text-lg font-bold text-stone-900">
                    目前篩選條件下沒有符合的學力檢測試題
                  </h2>
                  <p className="text-sm text-stone-500">
                    請調整年級、認知層次或清除搜尋關鍵字。
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setGradeFilter('全部年級');
                      setCognitiveFilter('全部層次');
                      setTypeFilter('全部題型');
                      setSearchQuery('');
                      setWrongOnlyMode(false);
                    }}
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554]"
                  >
                    顯示全部題目
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left / Main Interactive Stage (8 cols) */}
                  <div className="lg:col-span-8 min-w-0">
                    {showSummaryReport ? (
                      <section className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-7 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200">
                          <div>
                            <div className="text-xs font-semibold text-[#1E3A8A]">
                              學力檢測即時診斷報告
                            </div>
                            <h2 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950 mt-0.5">
                              本次練習表現與認知層次分析
                            </h2>
                          </div>
                          <div className="font-mono-tabular text-right">
                            <div className="text-2xl sm:text-3xl font-bold text-[#1E3A8A]">
                              {practiceStats.accuracy}%
                            </div>
                            <div className="text-xs text-stone-500">
                              答對 {practiceStats.correct} /{' '}
                              {practiceStats.answered} 題
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h3 className="text-sm font-bold text-stone-900">
                            各認知層次作答表現
                          </h3>
                          <div className="space-y-3">
                            {ASSESSMENT_COGNITIVE_LEVELS.map((lvl) => {
                              const bucket = practiceStats.byCognitive[lvl];
                              const pct =
                                bucket.answered > 0
                                  ? Math.round(
                                      (bucket.correct / bucket.answered) * 100,
                                    )
                                  : 0;
                              return (
                                <div key={lvl} className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-stone-800">
                                      {lvl}
                                    </span>
                                    <span className="font-mono-tabular text-stone-600">
                                      {bucket.answered > 0
                                        ? `答對 ${bucket.correct} / ${bucket.answered} 題（${pct}%）`
                                        : `尚未作答（共 ${bucket.total} 題）`}
                                    </span>
                                  </div>
                                  <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        pct >= 80
                                          ? 'bg-emerald-600'
                                          : pct >= 50
                                            ? 'bg-amber-500'
                                            : bucket.answered > 0
                                              ? 'bg-red-600'
                                              : 'bg-stone-300'
                                      }`}
                                      style={{
                                        width: `${bucket.answered > 0 ? Math.max(pct, 6) : 0}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="pt-4 border-t border-stone-200 flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => setShowSummaryReport(false)}
                            className="min-h-[42px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] transition-colors whitespace-nowrap"
                          >
                            回到作答畫面
                          </button>
                          {wrongQuestionIds.size > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setWrongOnlyMode(true);
                                setShowSummaryReport(false);
                                setCurrentIdx(0);
                              }}
                              className="min-h-[42px] px-4 py-2 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap"
                            >
                              針對錯題再練習（{wrongQuestionIds.size} 題）
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleResetPractice}
                            className="min-h-[42px] px-4 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors whitespace-nowrap"
                          >
                            全部重新作答
                          </button>
                        </div>
                      </section>
                    ) : (
                      activeQuestion && (
                        <article className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-7 space-y-5">
                          {/* Quiet Unboxed Editorial Metadata Header */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-stone-500">
                              <span className="font-mono-tabular font-bold text-[#1E3A8A]">
                                第 {currentIdx + 1} / {practiceQuestions.length}{' '}
                                題
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="text-stone-900 font-semibold">
                                {activeQuestion.grade}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{activeQuestion.domainTopic}</span>
                              <span aria-hidden="true">·</span>
                              <span className="text-stone-800">
                                {activeQuestion.unitTitle}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{activeQuestion.cognitiveLevel}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {activeQuestion.questionType ===
                                'single-choice'
                                  ? '單選題'
                                  : '建構反應題'}
                              </span>
                            </div>

                            {activeQuestion.hint && (
                              <button
                                type="button"
                                onClick={() =>
                                  setShowHintMap((prev) => ({
                                    ...prev,
                                    [activeQuestion.id]: !prev[activeQuestion.id],
                                  }))
                                }
                                className="px-2.5 py-1 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                              >
                                <Lightbulb className="w-3.5 h-3.5" />
                                <span>
                                  {showHintMap[activeQuestion.id]
                                    ? '收起提示'
                                    : '解題提示'}
                                </span>
                              </button>
                            )}
                          </div>

                          {/* Question Stem */}
                          <div className="space-y-4">
                            <p className="text-base sm:text-lg font-medium text-stone-950 leading-relaxed whitespace-pre-line">
                              {activeQuestion.stem}
                            </p>

                            {activeQuestion.imageUrl &&
                              !diagramErrorIds[activeQuestion.id] && (
                                <div className="bg-[#FBF9F5] border border-stone-200 rounded-xl p-3 max-w-lg">
                                  <img
                                    src={activeQuestion.imageUrl}
                                    alt={`${activeQuestion.unitTitle} 題目附圖`}
                                    referrerPolicy="no-referrer"
                                    onError={() =>
                                      setDiagramErrorIds((prev) => ({
                                        ...prev,
                                        [activeQuestion.id]: true,
                                      }))
                                    }
                                    className="max-h-72 w-auto mx-auto rounded-lg object-contain"
                                  />
                                </div>
                              )}

                            {activeQuestion.hint &&
                              showHintMap[activeQuestion.id] && (
                                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs sm:text-sm text-amber-950 leading-relaxed flex items-start gap-2">
                                  <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-semibold">
                                      思考提示：
                                    </span>
                                    {activeQuestion.hint}
                                  </div>
                                </div>
                              )}
                          </div>

                          {/* Interactive Response Area */}
                          {activeQuestion.questionType === 'single-choice' ? (
                            <div className="space-y-2.5">
                              {activeQuestion.options.map((optText, optIdx) => {
                                const letter = OPTION_LETTERS[optIdx] || 'A';
                                const isSelected =
                                  activeAttempt?.selectedOption === letter;
                                const isSubmitted = Boolean(
                                  activeAttempt?.isSubmitted,
                                );
                                const correctIdx =
                                  resolveSingleChoiceCorrectIndex(
                                    activeQuestion,
                                  );
                                const isCorrectOption = optIdx === correctIdx;

                                let cardClasses =
                                  'bg-white border-stone-200 hover:border-[#1E3A8A]/60 hover:bg-[#FBF9F5] text-stone-900';
                                let badgeClasses =
                                  'bg-[#F7F4EE] text-stone-700 border-stone-200';

                                if (isSubmitted) {
                                  if (isCorrectOption) {
                                    cardClasses =
                                      'bg-emerald-50 border-emerald-500 text-emerald-950';
                                    badgeClasses =
                                      'bg-emerald-700 text-white border-emerald-700';
                                  } else if (isSelected && !isCorrectOption) {
                                    cardClasses =
                                      'bg-red-50 border-red-400 text-red-950';
                                    badgeClasses =
                                      'bg-red-600 text-white border-red-600';
                                  } else {
                                    cardClasses =
                                      'bg-stone-50/70 border-stone-200 text-stone-500';
                                  }
                                } else if (isSelected) {
                                  cardClasses =
                                    'bg-[#1E3A8A]/6 border-[#1E3A8A] text-stone-950 ring-1 ring-[#1E3A8A]';
                                  badgeClasses =
                                    'bg-[#1E3A8A] text-white border-[#1E3A8A]';
                                }

                                return (
                                  <button
                                    key={letter}
                                    type="button"
                                    disabled={isSubmitted}
                                    onClick={() =>
                                      handleSelectSingleChoiceOption(
                                        activeQuestion,
                                        letter,
                                      )
                                    }
                                    className={`w-full min-h-[52px] px-4 py-3 border rounded-xl text-left flex items-center justify-between gap-3 transition-all ${cardClasses}`}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <span
                                        className={`w-7 h-7 rounded-lg border font-mono-tabular text-xs font-bold flex items-center justify-center shrink-0 ${badgeClasses}`}
                                      >
                                        {letter}
                                      </span>
                                      <span className="text-sm sm:text-base font-medium leading-snug break-words">
                                        {optText}
                                      </span>
                                    </div>

                                    {isSubmitted && isCorrectOption && (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 shrink-0 whitespace-nowrap">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>正確答案</span>
                                      </span>
                                    )}
                                    {isSubmitted &&
                                      isSelected &&
                                      !isCorrectOption && (
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 shrink-0 whitespace-nowrap">
                                          <XCircle className="w-4 h-4" />
                                          <span>你的選擇</span>
                                        </span>
                                      )}
                                  </button>
                                );
                              })}

                              {!activeAttempt?.isSubmitted && (
                                <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                                  <span className="text-xs text-stone-500">
                                    點選選項後按「送出作答」，即可獲得即時回饋與迷思診斷
                                  </span>
                                  <button
                                    type="button"
                                    disabled={!activeAttempt?.selectedOption}
                                    onClick={() =>
                                      handleSubmitSingleChoice(activeQuestion)
                                    }
                                    className="min-h-[42px] px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] rounded-xl hover:bg-[#172554] disabled:opacity-45 transition-colors whitespace-nowrap"
                                  >
                                    送出作答並看解析
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <label className="block space-y-1.5">
                                <span className="text-xs font-semibold text-stone-700">
                                  你的算式與想法（建構反應作答區）：
                                </span>
                                <textarea
                                  rows={4}
                                  value={activeAttempt?.constructedDraft ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setAttempts((prev) => ({
                                      ...prev,
                                      [activeQuestion.id]: {
                                        ...prev[activeQuestion.id],
                                        constructedDraft: val,
                                        isSubmitted:
                                          prev[activeQuestion.id]?.isSubmitted ??
                                          false,
                                        isCorrect:
                                          prev[activeQuestion.id]?.isCorrect ??
                                          null,
                                      },
                                    }));
                                  }}
                                  placeholder="請先試著寫下你的算式、步驟或理由，再對照參考解答..."
                                  className="w-full px-3.5 py-2.5 text-sm text-stone-900 bg-[#FBF9F5] border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:bg-white"
                                />
                              </label>

                              {!activeAttempt?.isSubmitted && (
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSubmitConstructed(activeQuestion)
                                    }
                                    className="min-h-[42px] px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] rounded-xl hover:bg-[#172554] transition-colors whitespace-nowrap"
                                  >
                                    提交想法並對照參考解答
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Immediate Diagnostic Feedback Panel */}
                          {activeAttempt?.isSubmitted && (
                            <div
                              className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                                activeQuestion.questionType === 'single-choice'
                                  ? activeAttempt.isCorrect
                                    ? 'bg-emerald-50/70 border-emerald-200'
                                    : 'bg-red-50/70 border-red-200'
                                  : 'bg-[#F7F4EE] border-stone-200'
                              }`}
                            >
                              {activeQuestion.questionType ===
                              'single-choice' ? (
                                <div className="flex items-center justify-between gap-2">
                                  <div
                                    className={`inline-flex items-center gap-2 text-sm font-bold ${
                                      activeAttempt.isCorrect
                                        ? 'text-emerald-900'
                                        : 'text-red-900'
                                    }`}
                                  >
                                    {activeAttempt.isCorrect ? (
                                      <>
                                        <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                                        <span>答對了！概念掌握很清楚</span>
                                      </>
                                    ) : (
                                      <>
                                        <XCircle className="w-5 h-5 text-red-700 shrink-0" />
                                        <span>
                                          再想一想！正確答案是選項{' '}
                                          {OPTION_LETTERS[
                                            resolveSingleChoiceCorrectIndex(
                                              activeQuestion,
                                            )
                                          ] || 'A'}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="text-xs font-bold text-[#1E3A8A]">
                                    參考解答與評分思考脈絡
                                  </div>
                                  <div className="p-3 bg-white border border-stone-200 rounded-xl text-sm text-stone-900 leading-relaxed whitespace-pre-line">
                                    {activeQuestion.correctAnswer}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="text-xs font-semibold text-stone-700">
                                      自我檢核掌握度：
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRateConstructed(
                                          activeQuestion,
                                          'mastered',
                                        )
                                      }
                                      className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg border inline-flex items-center gap-1 transition-colors ${
                                        activeAttempt.selfRating === 'mastered'
                                          ? 'bg-emerald-700 text-white border-emerald-700'
                                          : 'bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-50'
                                      }`}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>完全掌握</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRateConstructed(
                                          activeQuestion,
                                          'partial',
                                        )
                                      }
                                      className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                                        activeAttempt.selfRating === 'partial'
                                          ? 'bg-amber-600 text-white border-amber-600'
                                          : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-50'
                                      }`}
                                    >
                                      部分正確
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRateConstructed(
                                          activeQuestion,
                                          'retry',
                                        )
                                      }
                                      className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg border inline-flex items-center gap-1 transition-colors ${
                                        activeAttempt.selfRating === 'retry'
                                          ? 'bg-red-600 text-white border-red-600'
                                          : 'bg-white text-red-900 border-red-300 hover:bg-red-50'
                                      }`}
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>列入錯題再練</span>
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div className="pt-2 border-t border-stone-200/70 space-y-1">
                                <div className="text-xs font-bold text-stone-800">
                                  詳解與迷思概念診斷
                                </div>
                                <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-line">
                                  {activeQuestion.explanation}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Bottom Question Navigation */}
                          <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              disabled={currentIdx === 0}
                              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 inline-flex items-center gap-1.5 disabled:opacity-40 transition-colors"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                              <span>上一題</span>
                            </button>

                            <div className="flex items-center gap-2">
                              {currentIdx === practiceQuestions.length - 1 ? (
                                <button
                                  type="button"
                                  onClick={() => setShowSummaryReport(true)}
                                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-xl hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors"
                                >
                                  <ClipboardCheck className="w-3.5 h-3.5" />
                                  <span>完成並檢視診斷報告</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCurrentIdx((i) =>
                                      Math.min(practiceQuestions.length - 1, i + 1),
                                    )
                                  }
                                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-xl hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors"
                                >
                                  <span>下一題</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      )
                    )}
                  </div>

                  {/* Right / Sidebar Navigator & Diagnostic Deck (4 cols) */}
                  <aside className="lg:col-span-4 space-y-4">
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-stone-950">
                          題目導覽（{practiceQuestions.length} 題）
                        </h3>
                        <span className="font-mono-tabular text-xs text-stone-500">
                          {practiceStats.answered}/{practiceStats.total}
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-2">
                        {practiceQuestions.map((q, idx) => {
                          const rec = attempts[q.id];
                          const isCurrent = idx === currentIdx && !showSummaryReport;
                          let btnStyle =
                            'bg-[#FBF9F5] text-stone-700 border-stone-200 hover:border-[#1E3A8A]/50';
                          if (rec?.isSubmitted) {
                            btnStyle = rec.isCorrect
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-400 font-bold'
                              : 'bg-red-50 text-red-900 border-red-400 font-bold';
                          }
                          if (isCurrent) {
                            btnStyle += ' ring-2 ring-[#1E3A8A] border-[#1E3A8A]';
                          }
                          return (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => {
                                setCurrentIdx(idx);
                                setShowSummaryReport(false);
                              }}
                              title={`第 ${idx + 1} 題：${q.grade} ${q.unitTitle}`}
                              className={`h-10 rounded-lg border font-mono-tabular text-xs flex items-center justify-center gap-0.5 transition-all ${btnStyle}`}
                            >
                              <span>{idx + 1}</span>
                              {rec?.isSubmitted &&
                                (rec.isCorrect ? (
                                  <Check className="w-3 h-3 text-emerald-700" />
                                ) : (
                                  <X className="w-3 h-3 text-red-700" />
                                ))}
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                        <span className="inline-flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-700" />
                          <span>答對</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <X className="w-3 h-3 text-red-700" />
                          <span>待訂正</span>
                        </span>
                        <span>鍵盤支援 A–D / 1–4 與左右方向鍵</span>
                      </div>
                    </div>

                    <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-3">
                      <h3 className="text-sm font-bold text-stone-950">
                        認知層次即時分布
                      </h3>
                      <div className="space-y-2.5">
                        {ASSESSMENT_COGNITIVE_LEVELS.map((lvl) => {
                          const bucket = practiceStats.byCognitive[lvl];
                          const pct =
                            bucket.answered > 0
                              ? Math.round(
                                  (bucket.correct / bucket.answered) * 100,
                                )
                              : 0;
                          return (
                            <div key={lvl} className="space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-stone-800">
                                  {lvl}
                                </span>
                                <span className="font-mono-tabular text-stone-500">
                                  {bucket.answered > 0
                                    ? `${bucket.correct}/${bucket.answered} (${pct}%)`
                                    : `${bucket.total} 題`}
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[#1E3A8A] transition-all"
                                  style={{
                                    width: `${bucket.answered > 0 ? Math.max(pct, 6) : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </aside>
                </div>
              )}
            </>
          ) : (
            /* Teacher Google Sheet Question Bank Management Mode */
            <div className="space-y-5">
              {/* Google Sheet Specific Tab Connection Panel */}
              <section className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#1E3A8A]">
                      <FileSpreadsheet className="w-4 h-4 shrink-0" />
                      <span>Google Sheet 題庫分頁管理</span>
                      {spreadsheetTitle && (
                        <span className="text-stone-500 font-normal">
                          · {spreadsheetTitle}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      教師可指定試算表內的特定分頁（預設為{' '}
                      <code className="px-1 py-0.5 bg-[#F7F4EE] border border-stone-200 rounded font-mono-tabular">
                        {DEFAULT_ASSESSMENT_TAB_NAME}
                      </code>
                      ，也可自訂分頁名稱或切換至既有分頁）進行新增、編輯與刪除，儲存後學生端即同步更新。
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {spreadsheetId && (
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(
                          spreadsheetId,
                        )}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-stone-700 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Sheet className="w-3.5 h-3.5 text-[#1E3A8A]" />
                        <span>開啟 Google Sheet</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={handleExportCsv}
                      disabled={questions.length === 0}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 disabled:opacity-45 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>匯出 CSV</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenCreateModal}
                      className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>新增試題</span>
                    </button>
                  </div>
                </div>

                {/* Tab Selector & Custom Tab Binding Row */}
                <div className="pt-3 border-t border-stone-100 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                  <div className="flex flex-wrap items-end gap-2 flex-1 min-w-0">
                    {availableTabs.length > 0 && (
                      <label className="space-y-1 min-w-[180px]">
                        <span className="block text-[11px] font-semibold text-stone-600">
                          選擇試算表既有分頁
                        </span>
                        <select
                          value={
                            availableTabs.some(
                              (t) =>
                                t.title.toLowerCase() ===
                                customTabInput.trim().toLowerCase(),
                            )
                              ? availableTabs.find(
                                  (t) =>
                                    t.title.toLowerCase() ===
                                    customTabInput.trim().toLowerCase(),
                                )?.title
                              : ''
                          }
                          onChange={(e) => {
                            if (e.target.value) {
                              setCustomTabInput(e.target.value);
                            }
                          }}
                          className="h-9 px-2.5 text-xs font-medium text-stone-900 bg-[#FBF9F5] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                        >
                          <option value="">-- 自訂分頁名稱 --</option>
                          {availableTabs.map((t) => (
                            <option key={t.sheetId} value={t.title}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="space-y-1 flex-1 min-w-[200px] max-w-xs">
                      <span className="block text-[11px] font-semibold text-stone-600">
                        目標題庫分頁名稱（可輸入既有或新分頁）
                      </span>
                      <input
                        type="text"
                        value={customTabInput}
                        onChange={(e) => setCustomTabInput(e.target.value)}
                        placeholder={DEFAULT_ASSESSMENT_TAB_NAME}
                        className="w-full h-9 px-3 text-xs font-mono-tabular text-stone-900 bg-[#FBF9F5] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:bg-white"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={isSwitchingTab || isSyncing}
                      onClick={handleSwitchOrLoadTab}
                      className="h-9 px-3.5 text-xs font-semibold text-[#1E3A8A] bg-[#F7F4EE] border border-[#1E3A8A]/25 rounded-lg hover:bg-[#1E3A8A] hover:text-white transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      {isSwitchingTab ? '載入中...' : '切換 / 載入分頁'}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!hasAccessToken ? (
                      <button
                        type="button"
                        onClick={() => {
                          void onRequestSheetsAuth();
                        }}
                        className="h-9 px-3.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>授權 Google Sheets 寫入權限</span>
                      </button>
                    ) : (
                      (!hasRemoteAssessmentTab || questions.length === 0) && (
                        <button
                          type="button"
                          onClick={() =>
                            onSyncSeedToSheet(
                              customTabInput.trim() ||
                                activeTabName ||
                                DEFAULT_ASSESSMENT_TAB_NAME,
                            )
                          }
                          disabled={isSyncing}
                          className="h-9 px-3.5 text-xs font-semibold text-emerald-950 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                          <span>建立分頁並寫入 10 題示範題庫</span>
                        </button>
                      )
                    )}
                  </div>
                </div>

                {!isTeacherAdmin && (
                  <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                    提示：寫入或刪除雲端試算表需使用具備該 Google Sheet 編輯權限的教師帳號授權登入。
                  </div>
                )}
              </section>

              {/* Teacher Question Bank List */}
              <section className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 bg-[#F7F4EE] border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-stone-950">
                    <span>分頁「{activeTabName}」題庫清單</span>
                    <span className="font-mono-tabular text-xs font-medium text-stone-500">
                      （共 {managedQuestions.length} 題）
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="search"
                      value={manageSearchQuery}
                      onChange={(e) => setManageSearchQuery(e.target.value)}
                      placeholder="搜尋題號、單元或題幹..."
                      className="h-8 px-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                    />
                    <select
                      aria-label="篩選管理年級"
                      value={manageGradeFilter}
                      onChange={(e) => setManageGradeFilter(e.target.value)}
                      className="h-8 px-2 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                    >
                      <option value="全部年級">全部年級</option>
                      {ASSESSMENT_GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {managedQuestions.length === 0 ? (
                  <div className="p-8 text-center space-y-2 text-xs text-stone-500">
                    <p>此條件或分頁目前沒有題目。</p>
                    <button
                      type="button"
                      onClick={handleOpenCreateModal}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554]"
                    >
                      新增第一題學力檢測試題
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-100">
                    {managedQuestions.map((q, idx) => (
                      <div
                        key={q.id}
                        className="px-4 sm:px-5 py-3.5 hover:bg-[#FBF9F5] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
                            <span className="font-mono-tabular font-bold text-[#1E3A8A]">
                              #{idx + 1}
                            </span>
                            {q.rowIndex && (
                              <span className="font-mono-tabular text-[11px] text-stone-400">
                                列 {q.rowIndex}
                              </span>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-stone-900">
                              {q.grade}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{q.unitTitle}</span>
                            <span aria-hidden="true">·</span>
                            <span>{q.cognitiveLevel}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {q.questionType === 'single-choice'
                                ? `單選（正解 ${q.correctAnswer}）`
                                : '建構反應題'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                q.isPublished
                                  ? 'text-emerald-800 font-semibold'
                                  : 'text-amber-800 font-semibold'
                              }
                            >
                              {q.isPublished ? '已發布' : '草稿（學生不可見）'}
                            </span>
                          </div>
                          <p className="text-sm text-stone-900 line-clamp-2 leading-snug">
                            {q.stem}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(q)}
                            className="min-h-[34px] px-2.5 py-1 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>編輯</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDuplicateModal(q)}
                            title="複製並新增類似題"
                            className="min-h-[34px] px-2.5 py-1 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>複製</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onDeleteQuestion(
                                q,
                                customTabInput.trim() ||
                                  activeTabName ||
                                  DEFAULT_ASSESSMENT_TAB_NAME,
                              )
                            }
                            className="min-h-[34px] min-w-[34px] p-1.5 text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center justify-center"
                            aria-label={`刪除試題 ${q.unitTitle}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Assessment Question Sub-Modal */}
      {editorState.isOpen && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={editorState.isNew ? '新增學力檢測試題' : '編輯學力檢測試題'}
          onClick={() => setEditorState((prev) => ({...prev, isOpen: false}))}
        >
          <div
            className="bg-white border border-stone-200 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between shrink-0">
              <h2 className="font-editorial text-lg font-bold text-stone-950">
                {editorState.isNew
                  ? `新增試題至「${customTabInput.trim() || activeTabName}」分頁`
                  : `編輯試題（${editorState.draft.id}）`}
              </h2>
              <button
                type="button"
                onClick={() =>
                  setEditorState((prev) => ({...prev, isOpen: false}))
                }
                className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg"
                aria-label="關閉編輯視窗"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitQuestionForm}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-stone-700">適用年級</span>
                  <select
                    value={editorState.draft.grade}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, grade: e.target.value},
                      }))
                    }
                    className="w-full h-9 px-2.5 bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                  >
                    {ASSESSMENT_GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-stone-700">領域主題</span>
                  <select
                    value={editorState.draft.domainTopic}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, domainTopic: e.target.value},
                      }))
                    }
                    className="w-full h-9 px-2.5 bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                  >
                    {ASSESSMENT_DOMAINS.map((dom) => (
                      <option key={dom} value={dom}>
                        {dom}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-stone-700">學年度</span>
                  <input
                    type="text"
                    value={editorState.draft.academicYear}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, academicYear: e.target.value},
                      }))
                    }
                    placeholder="113 學年度"
                    className="w-full h-9 px-2.5 bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1 text-xs sm:col-span-1">
                  <span className="font-semibold text-stone-700">
                    單元名稱 *
                  </span>
                  <input
                    type="text"
                    required
                    value={editorState.draft.unitTitle}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, unitTitle: e.target.value},
                      }))
                    }
                    placeholder="例如：分數除法"
                    className="w-full h-9 px-2.5 bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                  />
                </label>

                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-stone-700">認知層次</span>
                  <select
                    value={editorState.draft.cognitiveLevel}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {
                          ...prev.draft,
                          cognitiveLevel: e.target
                            .value as AssessmentCognitiveLevel,
                        },
                      }))
                    }
                    className="w-full h-9 px-2.5 bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                  >
                    {ASSESSMENT_COGNITIVE_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-stone-700">題型</span>
                  <select
                    value={editorState.draft.questionType}
                    onChange={(e) => {
                      const nextType = e.target.value as AssessmentQuestionType;
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {
                          ...prev.draft,
                          questionType: nextType,
                          correctAnswer:
                            nextType === 'single-choice' ? 'A' : '',
                        },
                      }));
                    }}
                    className="w-full h-9 px-2.5 bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                  >
                    <option value="single-choice">單選題（自動批改）</option>
                    <option value="constructed-response">
                      建構反應題（參考解答對照）
                    </option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1 text-xs">
                <span className="font-semibold text-stone-700">
                  題幹內容 *
                </span>
                <textarea
                  rows={3}
                  required
                  value={editorState.draft.stem}
                  onChange={(e) =>
                    setEditorState((prev) => ({
                      ...prev,
                      draft: {...prev.draft, stem: e.target.value},
                    }))
                  }
                  placeholder="輸入完整題目敘述..."
                  className="w-full px-3 py-2 text-sm bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                />
              </label>

              {editorState.draft.questionType === 'single-choice' ? (
                <div className="space-y-2.5 p-3.5 bg-[#FBF9F5] border border-stone-200 rounded-xl">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-800">
                      選擇題選項（A～D）
                    </span>
                    <label className="inline-flex items-center gap-1.5">
                      <span className="font-semibold text-stone-700">
                        正解：
                      </span>
                      <select
                        value={editorState.draft.correctAnswer || 'A'}
                        onChange={(e) =>
                          setEditorState((prev) => ({
                            ...prev,
                            draft: {
                              ...prev.draft,
                              correctAnswer: e.target.value,
                            },
                          }))
                        }
                        className="h-8 px-2 bg-white border border-stone-200 rounded-lg font-mono-tabular font-bold text-[#1E3A8A]"
                      >
                        {OPTION_LETTERS.map((l) => (
                          <option key={l} value={l}>
                            選項 {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {OPTION_LETTERS.map((letter, idx) => (
                      <label
                        key={letter}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="w-6 h-6 rounded bg-white border border-stone-200 font-mono-tabular font-bold text-stone-700 flex items-center justify-center shrink-0">
                          {letter}
                        </span>
                        <input
                          type="text"
                          value={editorState.draft.options[idx] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditorState((prev) => {
                              const nextOpts = [...prev.draft.options];
                              nextOpts[idx] = val;
                              return {
                                ...prev,
                                draft: {...prev.draft, options: nextOpts},
                              };
                            });
                          }}
                          placeholder={`選項 ${letter} 內容`}
                          className="flex-1 h-9 px-2.5 bg-white border border-stone-200 rounded-lg text-stone-900"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <label className="block space-y-1 text-xs">
                  <span className="font-semibold text-stone-700">
                    參考解答與思考脈絡 *
                  </span>
                  <textarea
                    rows={3}
                    required
                    value={editorState.draft.correctAnswer}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, correctAnswer: e.target.value},
                      }))
                    }
                    placeholder="學生提交後即可對照的參考算式與標準解答..."
                    className="w-full px-3 py-2 text-sm bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                  />
                </label>
              )}

              <label className="block space-y-1 text-xs">
                <span className="font-semibold text-stone-700">
                  詳解與迷思概念診斷 *（學生答題後即時顯示）
                </span>
                <textarea
                  rows={3}
                  required
                  value={editorState.draft.explanation}
                  onChange={(e) =>
                    setEditorState((prev) => ({
                      ...prev,
                      draft: {...prev.draft, explanation: e.target.value},
                    }))
                  }
                  placeholder="說明正確解題流程，並補充學生常見錯誤迷思..."
                  className="w-full px-3 py-2 text-sm bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-stone-700">
                    解題提示（選填）
                  </span>
                  <input
                    type="text"
                    value={editorState.draft.hint || ''}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, hint: e.target.value},
                      }))
                    }
                    placeholder="學生卡住時可點開的小提示"
                    className="w-full h-9 px-2.5 bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                  />
                </label>

                <div className="space-y-1 text-xs">
                  <span className="block font-semibold text-stone-700">
                    試題附圖網址（選填）
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editorState.draft.imageUrl || ''}
                      onChange={(e) =>
                        setEditorState((prev) => ({
                          ...prev,
                          draft: {...prev.draft, imageUrl: e.target.value},
                        }))
                      }
                      placeholder="https://... 或上傳圖片"
                      className="flex-1 h-9 px-2.5 bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900 min-w-0"
                    />
                    {onUploadDiagramFile && (
                      <>
                        <input
                          ref={diagramInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleUploadDiagram}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={isUploadingDiagram}
                          onClick={() => diagramInputRef.current?.click()}
                          className="h-9 px-2.5 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 text-stone-700 inline-flex items-center gap-1 shrink-0"
                          title="上傳圖檔至 Google Drive"
                        >
                          {isUploadingDiagram ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>上傳</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pt-1">
                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-stone-700">難易度</span>
                  <select
                    value={editorState.draft.difficulty}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {
                          ...prev.draft,
                          difficulty: e.target.value as AssessmentDifficulty,
                        },
                      }))
                    }
                    className="w-full h-9 px-2.5 bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                  >
                    {ASSESSMENT_DIFFICULTIES.map((df) => (
                      <option key={df} value={df}>
                        {df}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-stone-700">命題者</span>
                  <input
                    type="text"
                    value={editorState.draft.author}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, author: e.target.value},
                      }))
                    }
                    className="w-full h-9 px-2.5 bg-[#FBF9F5] border border-stone-200 rounded-lg text-stone-900"
                  />
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editorState.draft.isPublished}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, isPublished: e.target.checked},
                      }))
                    }
                    className="w-4 h-4 rounded border-stone-300 text-[#1E3A8A]"
                  />
                  <span>立即公開給學生練習</span>
                </label>
              </div>

              <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditorState((prev) => ({...prev, isOpen: false}))
                  }
                  className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSavingDraft}
                  className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingDraft && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>
                    {editorState.isNew ? '儲存並寫入題庫' : '確認更新試題'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
