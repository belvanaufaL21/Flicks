// ponytail: In-memory release gate auditor and validator; upgrade to persistent audit log table in Postgres/Supabase when multi-environment CI/CD pipeline is connected.

export type QAScenarioId =
  | 'QA-01'
  | 'QA-02'
  | 'QA-03'
  | 'QA-04'
  | 'QA-05'
  | 'QA-06'
  | 'QA-07'
  | 'QA-08'
  | 'QA-09'
  | 'QA-10'
  | 'QA-11'
  | 'QA-12'
  | 'QA-13'
  | 'QA-14';

export const VALID_QA_SCENARIOS: readonly QAScenarioId[] = [
  'QA-01',
  'QA-02',
  'QA-03',
  'QA-04',
  'QA-05',
  'QA-06',
  'QA-07',
  'QA-08',
  'QA-09',
  'QA-10',
  'QA-11',
  'QA-12',
  'QA-13',
  'QA-14',
] as const;

export interface QAScenarioResult {
  id: QAScenarioId;
  status: 'passed' | 'failed';
  executedAt: string;
  summary: string;
  evidence?: Record<string, unknown>;
}

export function evaluateQAScenario(
  id: QAScenarioId,
  input: {
    passed: boolean;
    summary: string;
    evidence?: Record<string, unknown>;
  },
): QAScenarioResult {
  const isRecognized = VALID_QA_SCENARIOS.includes(id as QAScenarioId);
  return {
    id,
    status: isRecognized && input.passed ? 'passed' : 'failed',
    executedAt: new Date().toISOString(),
    summary: input.summary,
    evidence: input.evidence,
  };
}

export interface AiTrialResult {
  trialId: string;
  completed: boolean;
  schemaValid: boolean;
  attempts: number;
}

export interface AiQualityMetrics {
  totalTrials: number;
  completedCount: number;
  completionRatePercent: number;
  meetsCompletionTarget: boolean; // Target: >= 90%
  schemaValidCount: number;
  schemaValidityPercent: number;
  meetsSchemaTarget: boolean; // Target: >= 95%
  overallPass: boolean;
}

export function measureAiQualityTargets(trials: readonly AiTrialResult[]): AiQualityMetrics {
  const totalTrials = trials.length;
  if (totalTrials === 0) {
    return {
      totalTrials: 0,
      completedCount: 0,
      completionRatePercent: 0,
      meetsCompletionTarget: false,
      schemaValidCount: 0,
      schemaValidityPercent: 0,
      meetsSchemaTarget: false,
      overallPass: false,
    };
  }

  const completedCount = trials.filter(t => t.completed).length;
  const schemaValidCount = trials.filter(t => t.schemaValid).length;

  const completionRatePercent = Math.round((completedCount / totalTrials) * 100);
  const schemaValidityPercent = Math.round((schemaValidCount / totalTrials) * 100);

  const meetsCompletionTarget = completionRatePercent >= 90;
  const meetsSchemaTarget = schemaValidityPercent >= 95;

  return {
    totalTrials,
    completedCount,
    completionRatePercent,
    meetsCompletionTarget,
    schemaValidCount,
    schemaValidityPercent,
    meetsSchemaTarget,
    overallPass: meetsCompletionTarget && meetsSchemaTarget,
  };
}

export interface VtoBaselineAttempt {
  attemptId: string;
  tokenId: string;
  productId: string;
  category: 'tops' | 'bottoms' | 'one-pieces';
  status: 'completed' | 'failed';
  geminiCostIdr: number;
  fashnCostIdr: number;
  midtransFeeIdr: number;
  revenueIdr: number;
  hasCostLogged: boolean;
}

export interface VtoQualityBaseline {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  isValidBaselineSize: boolean; // 20 <= N <= 30
  costCoveragePercent: number;
  has100PercentCostCoverage: boolean;
  totalCogsIdr: number;
  averageCogsPerPackageIdr: number;
  averageRevenueIdr: number;
  averageGrossMarginPercent: number;
  overallPass: boolean;
}

export function recordVtoQualityBaseline(
  attempts: readonly VtoBaselineAttempt[],
): VtoQualityBaseline {
  const totalAttempts = attempts.length;
  const isValidBaselineSize = totalAttempts >= 20 && totalAttempts <= 30;

  if (totalAttempts === 0) {
    return {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      isValidBaselineSize: false,
      costCoveragePercent: 0,
      has100PercentCostCoverage: false,
      totalCogsIdr: 0,
      averageCogsPerPackageIdr: 0,
      averageRevenueIdr: 0,
      averageGrossMarginPercent: 0,
      overallPass: false,
    };
  }

  const successfulAttempts = attempts.filter(a => a.status === 'completed').length;
  const failedAttempts = totalAttempts - successfulAttempts;
  const loggedCostCount = attempts.filter(a => a.hasCostLogged).length;
  const costCoveragePercent = Math.round((loggedCostCount / totalAttempts) * 100);
  const has100PercentCostCoverage = costCoveragePercent === 100;

  const totalCogsIdr = attempts.reduce(
    (sum, a) => sum + (a.geminiCostIdr + a.fashnCostIdr + a.midtransFeeIdr),
    0,
  );
  const totalRevenueIdr = attempts.reduce((sum, a) => sum + a.revenueIdr, 0);

  const averageCogsPerPackageIdr = Math.round(totalCogsIdr / totalAttempts);
  const averageRevenueIdr = Math.round(totalRevenueIdr / totalAttempts);
  const averageGrossMarginPercent =
    averageRevenueIdr > 0
      ? Math.round(((averageRevenueIdr - averageCogsPerPackageIdr) / averageRevenueIdr) * 1000) / 10
      : 0;

  const overallPass =
    isValidBaselineSize &&
    has100PercentCostCoverage &&
    averageGrossMarginPercent > 0;

  return {
    totalAttempts,
    successfulAttempts,
    failedAttempts,
    isValidBaselineSize,
    costCoveragePercent,
    has100PercentCostCoverage,
    totalCogsIdr,
    averageCogsPerPackageIdr,
    averageRevenueIdr,
    averageGrossMarginPercent,
    overallPass,
  };
}

export type ReleaseGateId =
  | 'gate_1_payment_verification'
  | 'gate_2_duplicate_tokens'
  | 'gate_3_ai_vto_quality'
  | 'gate_4_private_storage'
  | 'gate_5_report_expiry'
  | 'gate_6_refund_recovery_policy'
  | 'gate_7_provider_merchant_rates'
  | 'gate_8_monitoring_and_kill_switch';

export interface ReleaseGateStatus {
  gateId: ReleaseGateId;
  name: string;
  status: 'passed' | 'failed';
  requirement: string;
}

export interface ReleaseGateAuditInput {
  qaScenarios: readonly QAScenarioResult[];
  paymentVerificationEvidence: boolean;
  duplicateTokenEvidence: boolean;
  aiQualityEvidence: boolean;
  privatePhotoEvidence: boolean;
  reportExpiryEvidence: boolean;
  refundRecoveryPolicyEvidence: boolean;
  providerRatesEvidence: boolean;
  monitoringAndKillSwitchEvidence: boolean;
}

export interface ReleaseGateAudit {
  isLaunchPermitted: boolean;
  evaluatedAt: string;
  gates: ReleaseGateStatus[];
  blockingReasons: string[];
  qaSummary: {
    total: number;
    passed: number;
    failed: number;
  };
}

export function evaluateReleaseGates(input: ReleaseGateAuditInput): ReleaseGateAudit {
  const blockingReasons: string[] = [];

  const qaPassedCount = input.qaScenarios.filter(q => q.status === 'passed').length;
  const all14QAPassed =
    input.qaScenarios.length === VALID_QA_SCENARIOS.length &&
    qaPassedCount === VALID_QA_SCENARIOS.length;

  if (!all14QAPassed) {
    blockingReasons.push(
      `QA Matrix incomplete: ${qaPassedCount}/${VALID_QA_SCENARIOS.length} scenarios passed`,
    );
  }

  const gates: ReleaseGateStatus[] = [
    {
      gateId: 'gate_1_payment_verification',
      name: 'Server-side payment verification',
      status: input.paymentVerificationEvidence ? 'passed' : 'failed',
      requirement: 'Midtrans signature verification and query check active; browser claim rejected',
    },
    {
      gateId: 'gate_2_duplicate_tokens',
      name: 'Duplicate-safe webhook and token handling',
      status: input.duplicateTokenEvidence ? 'passed' : 'failed',
      requirement: '0 duplicate tokens minted under concurrent webhooks; atomic reservation enforced',
    },
    {
      gateId: 'gate_3_ai_vto_quality',
      name: 'Internal AI and VTO quality baseline',
      status: input.aiQualityEvidence ? 'passed' : 'failed',
      requirement: '>=90% AI completion, >=95% schema validity, and 20-30 attempt VTO baseline verified',
    },
    {
      gateId: 'gate_4_private_storage',
      name: 'Private photo storage and automated deletion',
      status: input.privatePhotoEvidence ? 'passed' : 'failed',
      requirement: 'Private bucket, RLS, no public read access, automated 72h cleanup active',
    },
    {
      gateId: 'gate_5_report_expiry',
      name: 'Exact 72-hour report expiry',
      status: input.reportExpiryEvidence ? 'passed' : 'failed',
      requirement: '100% rejection rate after 72 hours with HTTP 410 Gone and no-store caching',
    },
    {
      gateId: 'gate_6_refund_recovery_policy',
      name: 'Token recovery and refund policy',
      status: input.refundRecoveryPolicyEvidence ? 'passed' : 'failed',
      requirement: 'Retryable failures keep tokens unconsumed; max 3 VTO attempts; admin recovery ready',
    },
    {
      gateId: 'gate_7_provider_merchant_rates',
      name: 'Verified provider and merchant rates',
      status: input.providerRatesEvidence ? 'passed' : 'failed',
      requirement: '100% of tokens have logged actual costs; positive gross margin verified',
    },
    {
      gateId: 'gate_8_monitoring_and_kill_switch',
      name: 'Error monitoring and emergency kill switch',
      status: input.monitoringAndKillSwitchEvidence ? 'passed' : 'failed',
      requirement: 'Structured JSON logs stdout + webhook alerts and operator kill switch active',
    },
  ];

  gates.forEach(gate => {
    if (gate.status === 'failed') {
      if (gate.gateId === 'gate_1_payment_verification') {
        blockingReasons.push('Gate 1: Payment verification must be server-side and signature-validated');
      } else if (gate.gateId === 'gate_2_duplicate_tokens') {
        blockingReasons.push('Gate 2: Webhooks must be duplicate-safe and tokens atomically reserved');
      } else if (gate.gateId === 'gate_3_ai_vto_quality') {
        blockingReasons.push('Gate 3: AI completion, schema validity, and VTO baseline must meet PRD targets');
      } else if (gate.gateId === 'gate_4_private_storage') {
        blockingReasons.push('Gate 4: Photo storage must be strictly private with automated 72h cleanup');
      } else if (gate.gateId === 'gate_5_report_expiry') {
        blockingReasons.push('Gate 5: Private reports must return HTTP 410 Gone after 72 hours');
      } else if (gate.gateId === 'gate_6_refund_recovery_policy') {
        blockingReasons.push('Gate 6: Token recovery policy and unconsumed retry mechanism must be verified');
      } else if (gate.gateId === 'gate_7_provider_merchant_rates') {
        blockingReasons.push('Gate 7: Provider rates and 100% token cost coverage must be verified');
      } else if (gate.gateId === 'gate_8_monitoring_and_kill_switch') {
        blockingReasons.push('Gate 8: Error monitoring and operator emergency stop must be active and tested');
      }
    }
  });

  const isLaunchPermitted = blockingReasons.length === 0;

  return {
    isLaunchPermitted,
    evaluatedAt: new Date().toISOString(),
    gates,
    blockingReasons,
    qaSummary: {
      total: input.qaScenarios.length,
      passed: qaPassedCount,
      failed: input.qaScenarios.length - qaPassedCount,
    },
  };
}
